// Node(tesseract.js) によるローカルOCR。Python不要・完全自己完結。
// 別勤怠システムのスクショから 日(day)・出勤・退勤 を抽出する。
const path = require('path');

const TIME_RE = /([0-2]?\d)[:：.](\d{2})/g;
const WEEKDAY_DAY_RE = /([0-3]?\d)\s*[（(]?\s*[月火水木金土日]/;

function normTime(h, m) { return String(+h).padStart(2, '0') + ':' + m; }

function detectDay(txt) {
  const wd = txt.match(WEEKDAY_DAY_RE);
  if (wd) { const d = +wd[1]; if (d >= 1 && d <= 31) return d; }
  const cleaned = txt.replace(/([0-2]?\d)[:：.](\d{2})/g, ' ');
  const m = cleaned.match(/(?<!\d)([0-3]?\d)(?!\d)/);
  if (m) { const d = +m[1]; if (d >= 1 && d <= 31) return d; }
  return null;
}

function timesIn(txt) {
  const out = []; let m; TIME_RE.lastIndex = 0;
  while ((m = TIME_RE.exec(txt))) out.push(normTime(m[1], m[2]));
  return out;
}

// words: [{x,y,text}] -> [{day,start,end}]
function extract(words) {
  const items = words.filter(w => w.text && w.text.trim()).map(w => ({ x: w.x, y: w.y, text: w.text.trim() }));
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = []; let cur = []; let lastY = null; const tol = 14;
  for (const it of items) {
    if (lastY === null || Math.abs(it.y - lastY) <= tol) cur.push(it);
    else { rows.push(cur); cur = [it]; }
    lastY = it.y;
  }
  if (cur.length) rows.push(cur);

  const data = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    const txt = row.map(i => i.text).join(' ');
    const times = timesIn(txt);
    if (times.length >= 2) {
      const y = row.reduce((s, i) => s + i.y, 0) / row.length;
      data.push({ y, ocrDay: detectDay(txt), start: times[0], end: times[1] });
    }
  }
  if (!data.length) return [];
  data.sort((a, b) => a.y - b.y);
  const ys = data.map(d => d.y);
  const diffs = [];
  for (let i = 1; i < ys.length; i++) { const d = ys[i] - ys[i - 1]; if (d > 5) diffs.push(d); }
  diffs.sort((a, b) => a - b);
  const rowH = diffs.length ? diffs[0] : 1;
  const anchor = data.find(d => d.ocrDay && d.ocrDay >= 1 && d.ocrDay <= 9) || data[0];
  const aDay = anchor.ocrDay || 1, aY = anchor.y;
  const out = []; const seen = new Set();
  for (const d of data) {
    let day = aDay + Math.round((d.y - aY) / rowH);
    if (day < 1 || day > 31) day = d.ocrDay || day;
    if (seen.has(day) || day < 1 || day > 31) continue;
    seen.add(day); out.push({ day, start: d.start, end: d.end });
  }
  return out;
}

function collectWords(data) {
  if (data && data.words && data.words.length) return data.words;
  const ws = [];
  (data.blocks || []).forEach(b => (b.paragraphs || []).forEach(p => (p.lines || []).forEach(l => (l.words || []).forEach(w => ws.push(w)))));
  return ws;
}

async function ocrImage(imagePath, opts = {}) {
  const { createWorker } = require('tesseract.js');
  const onProgress = opts.onProgress || (() => {});
  const wopts = { logger: m => { if (m && m.status) onProgress(`${m.status} ${Math.round((m.progress || 0) * 100)}%`); } };
  if (opts.langPath) wopts.langPath = opts.langPath;
  if (opts.corePath) wopts.corePath = opts.corePath;
  if (opts.workerPath) wopts.workerPath = opts.workerPath;
  if (opts.cachePath) wopts.cachePath = opts.cachePath;
  if (opts.gzip !== undefined) wopts.gzip = opts.gzip;
  const worker = await createWorker(['jpn', 'eng'], 1, wopts);
  try {
    const { data } = await worker.recognize(imagePath, {}, { blocks: true });
    const raw = collectWords(data);
    const words = raw.map(w => ({ x: (w.bbox.x0 + w.bbox.x1) / 2, y: (w.bbox.y0 + w.bbox.y1) / 2, text: w.text }));
    return { days: extract(words), engine: 'tesseract.js', error: null, rawWords: words.length };
  } finally {
    await worker.terminate();
  }
}

module.exports = { ocrImage, extract, detectDay, timesIn };
