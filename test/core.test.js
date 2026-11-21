'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { parse, compare, csv, time } = require('../core');
const entry = (start, end) => ({ start, end });
const raw = (...cues) => ({ cues, errors: [] });
const srt = '1\r\n00:00:01,000 --> 00:00:05,000\r\nNormal caption\r\n\r\n2\r\n00:00:07,000 --> 00:00:09,000\r\nSecond caption';
const vtt = '\uFEFFWEBVTT\n\nNOTE Example comment\n\nsection one\n00:01.000 --> 00:02.500 line:80%\nSet the parts\n\n00:02.500 --> 00:05.000\non the table.\n\n00:07.300 --> 00:09.000\nCheck the count.\n\n00:14.000 --> 00:15.000\nNext step.';

test('compare SRT and WebVTT by the union of visible cues, including a 1-to-2 split', () => {
  const a = parse(srt);
  const b = parse(vtt);
  assert.equal(a.format, 'SRT');
  assert.equal(b.format, 'VTT');
  assert.deepEqual(a.errors, []);
  assert.deepEqual(b.errors, []);
  const report = compare(a, b);
  assert.equal(report.sourceMs, 6000);
  assert.equal(report.matchedMs, 5700);
  assert.equal(report.missingMs, 300);
  assert.equal(report.extraMs, 1000);
  assert.deepEqual(report.findings, [
    { kind: 'missing', start: 7000, end: 7300 }, { kind: 'extra', start: 14000, end: 15000 },
  ]);
  assert.equal(compare(a, b, { minimum: 301 }).hiddenCount, 1);
  assert.equal(compare(a, b, { minimum: 301 }).missingMs, 300);
});

test('reject malformed cues and keep empty delivery tracks distinct from format problems', () => {
  const invalid = '1\n00:00:02,000 --> 00:00:01,000\nReversed\n\n2\nnot a time code\n...';
  const parsed = parse(invalid);
  assert.deepEqual(parsed.errors.map(item => item.line), [2, 6]);
  assert.throws(() => compare(parse(srt), parsed), /Fix the file errors/);
  assert.throws(() => parse('WEBVTT\n00:01.000 --> 00:01.200\nText'), /blank line/);
  assert.throws(() => compare(parse('WEBVTT\n'), parse(vtt)), /no visible/);
  const empty = parse('WEBVTT\n\n00:01.000 --> 00:05.000\n<i>&nbsp;</i>\n\n00:06.000 --> 00:08.000\n');
  assert.deepEqual(empty.cues, []);
  assert.equal(compare(parse(srt), empty).missingMs, 6000);
});

test('merge overlaps and clips negative delivery offsets at the media start', () => {
  const a = raw(entry(0, 1000), entry(800, 2000));
  const b = raw(entry(0, 1500), entry(1400, 2300));
  const report = compare(a, b, { minimum: 0, offset: -300 });
  assert.equal(report.sourceMs, 2000);
  assert.equal(report.targetMs, 2000);
  assert.deepEqual(report.findings, []);
  assert.throws(() => compare(a, b, { offset: -600001 }), /Offset/);
  assert.equal(time(3600001), '01:00:00.001');
});

test('integer timelines agree with an independent millisecond coverage model', () => {
  let seed = 271828;
  const random = (max) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor(seed / 2 ** 32 * max);
  };
  const ranges = () => Array.from({ length: random(7) + 1 }, () => {
    const start = random(40);
    return entry(start, start + random(10) + 1);
  });
  for (let i = 0; i < 500; i++) {
    const left = ranges();
    const right = ranges();
    const offset = random(15) - 7;
    const found = compare(raw(...left), raw(...right), { offset, minimum: 0 });
    for (let ms = 0; ms < 80; ms++) {
      const before = left.some(range => range.start <= ms && ms < range.end);
      const after = right.some(range => range.start + offset <= ms && ms < range.end + offset);
      const expected = before === after ? undefined : before ? 'missing' : 'extra';
      assert.equal(found.findings.find(range => range.start <= ms && ms < range.end)?.kind, expected);
    }
  }
});

test('CSV uses raw milliseconds and contains no names, cue text or formulas', () => {
  const report = compare(parse(srt), parse(vtt));
  assert.equal(csv(report), 'type,start_ms,end_ms,duration_ms,delivery_offset_ms,minimum_gap_ms\n' +
    'missing,7000,7300,300,0,250\nextra,14000,15000,1000,0,250\n');
});
