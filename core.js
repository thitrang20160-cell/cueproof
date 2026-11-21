'use strict';

const CueProof = (() => {
  function milliseconds(text, vtt) {
    const match = /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)([.,])(\d{3})$/.exec(text);
    if (!match || (vtt ? match[4] !== '.' : !match[1])) return null;
    const value = (+match[1] || 0) * 3600000 + +match[2] * 60000 + +match[3] * 1000 + +match[5];
    return Number.isSafeInteger(value) && value <= 3599999999 ? value : null;
  }

  function parse(input) {
    const lines = input.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
    const vtt = /^WEBVTT(?:[\t ].*)?$/.test(lines[0]);
    if (vtt && lines[0].includes('-->')) throw new Error('WebVTT header cannot contain a cue.');
    const cues = [];
    const errors = [];
    const timingPattern = /^([^\s]+)[\t ]+-->[\t ]+([^\s]+)(?:[\t ]+([^\n]+))?$/;
    let index = 0;
    if (vtt) {
      while (index < lines.length && lines[index].trim()) {
        if (index > 0 && lines[index].includes('-->')) {
          throw new Error('Add a blank line after the WebVTT header.');
        }
        index++;
      }
    }
    while (index < lines.length) {
      if (!lines[index].trim()) { index++; continue; }
      const startLine = index;
      while (index < lines.length && lines[index].trim()) index++;
      const block = lines.slice(startLine, index);
      if (vtt && /^(?:NOTE(?:[\t ]|$)|STYLE$|REGION$)/.test(block[0].trim())) continue;
      const hasIdentifier = vtt ? !block[0].includes('-->') : /^\d+$/.test(block[0].trim());
      const timingIndex = Number(hasIdentifier);
      const line = startLine + timingIndex + 1;
      const timing = timingPattern.exec(block[timingIndex]?.trim() ?? '');
      const start = timing ? milliseconds(timing[1], vtt) : null;
      const end = timing ? milliseconds(timing[2], vtt) : null;
      if (start === null || end === null || end <= start || (!vtt && timing?.[3])) {
        errors.push({ line: Math.min(line, startLine + block.length), message: 'Invalid or reversed cue time. Check the timestamp format and order.' });
        continue;
      }
      const payload = block.slice(timingIndex + 1);
      if (payload.some(row => timingPattern.test(row.trim()) && /^\d/.test(row.trim()))) {
        errors.push({ line, message: 'More than one timestamp in this block. Separate cues with a blank line.' });
        continue;
      }
      const text = payload.join(' ').replace(/<[^>]+>/g, '').replace(/&(?:nbsp|lrm|rlm|zwnj|zwj);/g, '');
      if (/[\S]/u.test(text.replace(/[\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069]/g, ''))) {
        cues.push({ start, end });
      }
    }
    return { format: vtt ? 'VTT' : 'SRT', cues, errors };
  }

  function merge(cues, offset) {
    const ordered = cues.map(({ start, end }) => ({ start: Math.max(0, start + offset), end: end + offset }))
      .filter(({ end }) => end > 0).sort((a, b) => a.start - b.start || a.end - b.end);
    const union = [];
    for (const range of ordered) {
      const previous = union.at(-1);
      if (previous && range.start <= previous.end) {
        previous.end = Math.max(previous.end, range.end);
      } else {
        union.push(range);
      }
    }
    return union;
  }

  function difference(left, right) {
    const result = [];
    let firstPossible = 0;
    for (const { start, end } of left) {
      let cursor = start;
      while (firstPossible < right.length && right[firstPossible].end <= start) firstPossible++;
      for (let i = firstPossible; i < right.length && right[i].start < end; i++) {
        const peer = right[i];
        if (peer.start > cursor) result.push({ start: cursor, end: peer.start });
        cursor = Math.max(cursor, peer.end);
        if (cursor >= end) break;
      }
      if (cursor < end) result.push({ start: cursor, end });
    }
    return result;
  }

  const total = ranges => ranges.reduce((sum, { start, end }) => sum + end - start, 0);

  function compare(reference, delivery, options = {}) {
    const { minimum = 250, offset = 0 } = options;
    if (![minimum, offset].every(Number.isInteger) || minimum < 0 || minimum > 10000 || Math.abs(offset) > 600000) {
      throw new Error('Minimum gap must be 0–10,000 ms. Offset must be within ±600,000 ms.');
    }
    if (reference.errors.length || delivery.errors.length) throw new Error('Fix the file errors before comparing tracks.');
    if (!reference.cues.length) throw new Error('The reference file has no visible subtitle cues.');
    const source = merge(reference.cues, 0);
    const target = merge(delivery.cues, offset);
    const missing = difference(source, target);
    const extra = difference(target, source);
    const findings = [
      ...missing.map(range => ({ kind: 'missing', ...range })),
      ...extra.map(range => ({ kind: 'extra', ...range })),
    ].filter(range => range.end - range.start >= minimum)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const sourceMs = total(source);
    const missingMs = total(missing);
    return {
      source, target, sourceMs, targetMs: total(target), matchedMs: sourceMs - missingMs,
      missingMs, extraMs: total(extra), minimum, offset, findings,
      hiddenCount: missing.length + extra.length - findings.length,
      end: Math.max(source.at(-1).end, target.at(-1)?.end ?? 0),
    };
  }

  function time(ms) {
    const hours = Math.floor(ms / 3600000);
    const pad = (n, places = 2) => String(n).padStart(places, '0');
    return (hours ? pad(hours) + ':' : '') + pad(Math.floor(ms / 60000) % 60) + ':' +
      pad(Math.floor(ms / 1000) % 60) + '.' + pad(ms % 1000, 3);
  }

  function csv(report) {
    return 'type,start_ms,end_ms,duration_ms,delivery_offset_ms,minimum_gap_ms\n' +
      report.findings.map(({ kind, start, end }) =>
        [kind, start, end, end - start, report.offset, report.minimum].join(',')).join('\n') +
      (report.findings.length ? '\n' : '');
  }

  return { parse, compare, time, csv };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = CueProof;
