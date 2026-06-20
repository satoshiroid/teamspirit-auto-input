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
  await target.locator('[data-testid="timesheet-pc__daily-summary-button"]').click({ timeout: 5000 }).catch(e=>console.log('clickerr',e.message));
  await sleep(3500);

  const out = await frame.evaluate(() => {
    const all = [...document.querySelectorAll('tr, [class*="row" i]')];
    const jobRow = all.find(e => /44866719_客先業務/.test(e.textContent||'') && e.querySelectorAll('button,input').length>=3);
    const dialogButtons = [...document.querySelectorAll('button')].filter(b=>/保存して閉じる|保存|キャンセル|閉じる/.test(b.textContent||'')).map(b=>(b.textContent||'').trim()).slice(0,8);
    return {
      jobRowTag: jobRow ? jobRow.tagName : null,
      jobRowCls: jobRow ? (jobRow.getAttribute('class')||'').slice(0,80) : null,
      jobRowHTML: jobRow ? jobRow.outerHTML.slice(0,4500) : null,
      dialogButtons
    };
  });
  console.log('DIALOG_BUTTONS:', JSON.stringify(out.dialogButtons));
  console.log('JOBROW_TAG:', out.jobRowTag, 'CLS:', out.jobRowCls);
  console.log('JOBROW_HTML_START');
  console.log(out.jobRowHTML);
  console.log('JOBROW_HTML_END');
  await frame.locator('button:has-text("キャンセル")').first().click({timeout:2000}).catch(()=>{});
  await browser.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
