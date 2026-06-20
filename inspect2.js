const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('tex__TimeAttendance')) || ctx.pages()[0];
  await sleep(1500);

  let frame = null;
  for (const f of page.frames()) {
    try {
      const n = await f.locator('[data-testid="timesheet-pc__daily-summary-button__plus-button"]').count();
      if (n > 0) { frame = f; break; }
    } catch (e) {}
  }
  if (!frame) { console.log('grid frame not found'); console.log('FRAMES', page.frames().map(f=>f.url().slice(0,60))); await browser.close(); return; }
  console.log('GRID FRAME', frame.url().slice(0, 80));

  const data = await frame.evaluate(() => {
    const out = {};
    const ids = new Set();
    document.querySelectorAll('[data-testid]').forEach(e => ids.add(e.getAttribute('data-testid')));
    out.allTestids = [...ids];
    const btn = document.querySelector('[data-testid="timesheet-pc__daily-summary-button__plus-button"]');
    let row = btn;
    for (let i = 0; i < 12 && row; i++) {
      if (row.tagName === 'TR' || (row.getAttribute && row.getAttribute('role') === 'row')) break;
      if (row.innerText && /\b\d{1,2}\b/.test(row.innerText) && row.querySelectorAll('input,button,img').length > 3 && row.innerText.length < 200) break;
      row = row.parentElement;
    }
    out.rowTag = row ? row.tagName : null;
    out.rowText = row ? row.innerText.slice(0, 150) : null;
    out.rowHTML = row ? row.outerHTML.slice(0, 4500) : null;
    return out;
  });
  console.log('ALL_TESTIDS:', JSON.stringify(data.allTestids));
  console.log('ROW_TAG:', data.rowTag);
  console.log('ROW_TEXT:', JSON.stringify(data.rowText));
  console.log('ROW_HTML_START');
  console.log(data.rowHTML);
  console.log('ROW_HTML_END');
  await browser.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
