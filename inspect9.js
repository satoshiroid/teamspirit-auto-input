const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('tex__TimeAttendance')) || ctx.pages()[0];
  await sleep(1000);
  let frame = null;
  for (const f of page.frames()) {
    try { if (await f.locator('tr.timesheet-pc-main-content-timesheet-daily-row').count() > 0) { frame = f; break; } } catch (e) {}
  }
  const rows = await frame.locator('tr.timesheet-pc-main-content-timesheet-daily-row').all();
  let target = null;
  for (const r of rows) {
    const em = await r.locator('.timesheet-pc-main-content-timesheet-daily-row__col-date em').textContent().catch(()=>null);
    if (em && em.trim() === '24') { target = r; break; }
  }
  await target.locator('[data-testid="timesheet-pc__daily-summary-button"]').click({ timeout: 5000 }).catch(()=>{});
  await sleep(3500);

  const out = await frame.evaluate(() => {
    const all = [...document.querySelectorAll('[class*="TaskRowWrapper"]')];
    const jobRow = all.find(e => /44866719_客先業務/.test(e.textContent||''));
    const hierCells = jobRow ? [...jobRow.querySelectorAll('.task__extended__item-list__item.task-hierarchy')].length : 0;
    const rowInputs = jobRow ? [...jobRow.querySelectorAll('input')].map(i=>({ph:i.placeholder,cls:(i.getAttribute('class')||'').slice(0,60),val:i.value})) : [];
    const rowSelects = jobRow ? [...jobRow.querySelectorAll('select')].length : 0;
    const footer = [...document.querySelectorAll('button')].map(b=>(b.textContent||'').trim()).filter(t=>/閉じる|キャンセル|決定|保存して/.test(t));
    return { hierCells, rowInputs, rowSelects, footer:[...new Set(footer)] };
  });
  console.log('HIER_CELLS:', out.hierCells, 'SELECTS:', out.rowSelects);
  console.log('ROW_INPUTS:', JSON.stringify(out.rowInputs));
  console.log('FOOTER_BTNS:', JSON.stringify(out.footer));
  await frame.locator('button:has-text("キャンセル")').first().click({timeout:2000}).catch(()=>{});
  await browser.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
