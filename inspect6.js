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
  await target.locator('.timesheet-pc-main-content-timesheet-daily-row__col-start-time').click({ timeout: 5000 }).catch(()=>{});
  await sleep(2500);

  const out = await frame.evaluate(() => {
    const els = [...document.querySelectorAll('[class*="ModalDialog"]')];
    const summary = els.map(e => ({
      cls: (e.getAttribute('class')||'').slice(0,70),
      timeInputs: e.querySelectorAll('input.commons-fields-att-time-3-digit-hour-field').length,
      buttons: e.querySelectorAll('button').length,
      hasTitle: /勤務時間入力/.test(e.textContent||''),
      w: e.offsetWidth
    })).filter(s => s.w>100);
    return { count: els.length, summary };
  });
  console.log(JSON.stringify(out, null, 1));
  await frame.locator('button:has-text("キャンセル")').first().click({timeout:2000}).catch(()=>{});
  await browser.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
