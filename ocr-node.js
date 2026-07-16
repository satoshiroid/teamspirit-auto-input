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

// 実労働時間の表記（例: 9h 57m）。行の最初の一致 = 実労働時間列。
const DUR_RE = /(\d{1,2})h\s*(\d{2})m/;
function toMinN(t) { const m = /^(\d{1,2}):(\d{2})$/.exec(t); return m ? (+m[1]) * 60 + (+m[2]) : null; }
function fmtMin(min) { min = ((min % 1440) + 1440) % 1440; return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }
// 実労働 = (退勤-出勤) - 休憩枠(12:00-13:00)との重なり
function workOf(s, e, bs = 720, be = 780) { return (e - s) - Math.max(0, Math.min(e, be) - Math.max(s, bs)); }
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

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
  const partials = []; // 時刻が1つしか読めなかった行（出勤列の文字化け等）
  const startXs = [], endXs = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    const txt = row.map(i => i.text).join(' ');
    // 時刻をx座標付きで収集（どの列の時刻かの判定に使う）
    const tws = [];
    for (const it of row) { let m; TIME_RE.lastIndex = 0; while ((m = TIME_RE.exec(it.text))) tws.push({ t: normTime(m[1], m[2]), x: it.x }); }
    const y = row.reduce((s, i) => s + i.y, 0) / row.length;
    if (tws.length >= 2) {
      data.push({ y, ocrDay: detectDay(txt), start: tws[0].t, end: tws[1].t });
      startXs.push(tws[0].x); endXs.push(tws[1].x);
    } else if (tws.length === 1) {
      const dm = txt.match(DUR_RE);
      if (dm) partials.push({ y, ocrDay: detectDay(txt), time: tws[0].t, x: tws[0].x, dur: (+dm[1]) * 60 + (+dm[2]) });
    }
  }
  // 片方の時刻が文字化けした行を「読めた時刻 ± 実労働時間(＋休憩)」で復元する。
  // 読めた時刻が出勤か退勤かは正常行の列位置(x)で判定（正常行が無ければ退勤とみなす）。
  // 復元値は workOf での検算に一致した場合のみ採用（誤読の混入を防ぐ）。
  const sx = median(startXs), ex = median(endXs);
  for (const p of partials) {
    if (!p.dur || p.dur <= 0) continue;
    const t = toMinN(p.time);
    if (t == null) continue;
    const isEnd = (sx == null || ex == null) ? true : Math.abs(p.x - ex) <= Math.abs(p.x - sx);
    let start = null, end = null;
    if (isEnd) {
      for (const cand of [t - p.dur, t - p.dur - 60]) {
        if (cand >= 0 && workOf(cand, t) === p.dur) { start = fmtMin(cand); end = p.time; break; }
      }
    } else {
      for (const cand of [t + p.dur, t + p.dur + 60]) {
        if (cand < 1440 && workOf(t, cand) === p.dur) { start = p.time; end = fmtMin(cand); break; }
      }
    }
    if (start && end) data.push({ y: p.y, ocrDay: p.ocrDay, start, end });
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
