'use strict';

const byId = id => document.getElementById(id);
let currentReport;
let visibleFindings = 0;
const kindLabel = { missing: '缺少覆盖', extra: '多出覆盖' };
const names = { source: '原稿', delivery: '交付稿' };
const times = CueProof.time;

const demo = {
  source: '1\n00:00:01,000 --> 00:00:05,000\n先把零件放在桌面。\n\n2\n00:00:07,000 --> 00:00:09,000\n核对数量。\n\n3\n00:00:11,000 --> 00:00:13,000\n检查说明书。',
  delivery: 'WEBVTT\n\n00:01.000 --> 00:02.500\nSet the parts\n\n00:02.500 --> 00:05.000\non the table first.\n\n00:07.300 --> 00:09.000\nCheck the quantity.\n\n00:14.000 --> 00:15.000\nNext step.',
};

function status(message, error = false) {
  byId('status').textContent = message;
  byId('status').dataset.error = String(error);
}

async function fileText(file, name) {
  if (file.size > 4 * 1024 * 1024) throw new Error(name + '超过 4 MiB 上限。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let encoding = 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
  let value;
  try {
    value = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    if (value.includes('\0')) throw new Error('Unexpected NUL');
  } catch {
    throw new Error(name + '的文本编码无法读取，请另存为 UTF-8 后重试。');
  }
  if (/\.vtt$/i.test(file.name) && !/^WEBVTT(?:[\t \r\n]|$)/.test(value)) {
    throw new Error(name + '缺少 WEBVTT 文件标记。');
  }
  return value;
}

function track(id, segments, end, color) {
  const canvas = byId(id);
  const paint = canvas.getContext('2d');
  if (!paint) return;
  paint.clearRect(0, 0, canvas.width, canvas.height);
  paint.fillStyle = color;
  const scale = canvas.width / end;
  for (const segment of segments) {
    paint.fillRect(segment.start * scale, 0, (segment.end - segment.start) * scale, canvas.height);
  }
}

function more() {
  const findings = currentReport.findings;
  const next = findings.slice(visibleFindings, visibleFindings + 100);
  for (const item of next) {
    const row = document.createElement('tr');
    row.className = item.kind;
    for (const value of [kindLabel[item.kind], times(item.start), times(item.end), (item.end - item.start) + ' ms']) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    byId('findings').append(row);
  }
  visibleFindings += next.length;
  byId('more').hidden = visibleFindings === findings.length;
  byId('more').textContent = '显示更多（剩余 ' + (findings.length - visibleFindings) + ' 项）';
}

function show(report, example) {
  currentReport = report;
  visibleFindings = 0;
  byId('result-title').textContent = example ? '样例核对结果' : '核对结果';
  const percentage = (100 * report.matchedMs / report.sourceMs).toFixed(1);
  byId('covered').textContent = percentage === '100.0' && report.missingMs ? '>99.9%' : percentage + '%';
  byId('missing').textContent = (report.missingMs / 1000).toFixed(3) + ' s';
  byId('extra').textContent = (report.extraMs / 1000).toFixed(3) + ' s';
  const notes = ['列出时长 ≥ ' + report.minimum + ' ms 的差异。'];
  if (report.hiddenCount) notes.push('有 ' + report.hiddenCount + ' 处短差异仍计入上方统计。');
  if (report.offset) notes.push('交付稿在预览中偏移 ' + report.offset + ' ms。');
  if (!report.findings.length) notes.push('没有达到提示阈值的差异。');
  byId('threshold').textContent = notes.join('');
  byId('track-end').textContent = times(report.end);
  track('source-track', report.source, report.end, '#81e5d2');
  track('delivery-track', report.target, report.end, '#a9bafe');
  byId('findings').replaceChildren();
  more();
  byId('report').hidden = false;
  byId('report').focus({ preventScroll: true });
  byId('report').scrollIntoView({ block: 'nearest' });
}

function compareTexts(input, options, example) {
  const parses = Object.fromEntries(Object.entries(input).map(([side, value]) => [side, CueProof.parse(value)]));
  const problems = Object.entries(parses).flatMap(([side, parsed]) =>
    parsed.errors.map(issue => names[side] + '第 ' + issue.line + ' 行：时间码或分隔符格式有误。'));
  if (problems.length) {
    const list = byId('errors');
    list.replaceChildren(...problems.slice(0, 30).map(problem => {
      const li = document.createElement('li');
      li.textContent = problem;
      return li;
    }));
    list.hidden = false;
    status('发现 ' + problems.length + ' 处格式问题。请修正后重新核对。', true);
    return;
  }
  show(CueProof.compare(parses.source, parses.delivery, options), example);
}

async function run(example) {
  const compare = byId('compare');
  const sample = byId('sample');
  const sourceInput = byId('source');
  const deliveryInput = byId('delivery');
  const options = example ? {} : { minimum: byId('minimum').valueAsNumber, offset: byId('offset').valueAsNumber };
  const controls = [compare, sample, sourceInput, deliveryInput, byId('minimum'), byId('offset')];
  for (const control of controls) control.disabled = true;
  byId('report').hidden = true;
  byId('errors').hidden = true;
  currentReport = undefined;
  status('');
  try {
    if (example) {
      compareTexts(demo, options, true);
      return;
    }
    const [original] = sourceInput.files;
    const [candidate] = deliveryInput.files;
    if (!original || !candidate) throw new Error('请选择原稿和待交付字幕。');
    if (!Number.isInteger(options.minimum) || options.minimum < 0 || options.minimum > 10000 ||
        !Number.isInteger(options.offset) || Math.abs(options.offset) > 600000) {
      throw new Error('提示阈值请输入 0–10,000 毫秒，偏移请输入 ±600,000 毫秒内的整数。');
    }
    const [source, delivery] = await Promise.all([fileText(original, '原稿'), fileText(candidate, '交付稿')]);
    compareTexts({ source, delivery }, options, false);
  } catch (error) {
    status(error.message === 'The reference file has no visible subtitle cues.' ? '原稿里没有可见字幕，无法作为核对基准。' :
      error.message, true);
  } finally {
    for (const control of controls) control.disabled = false;
  }
}

byId('sample').addEventListener('click', () => run(true));
byId('compare').addEventListener('click', () => run(false));
for (const id of ['source', 'delivery', 'minimum', 'offset']) {
  const input = byId(id);
  input.addEventListener(input.type === 'file' ? 'change' : 'input', () => {
    currentReport = undefined;
    byId('report').hidden = true;
    byId('errors').hidden = true;
    status('');
  });
}
byId('more').addEventListener('click', more);
byId('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([CueProof.csv(currentReport)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'cueproof-timing-report.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
