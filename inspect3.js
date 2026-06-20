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
  if (!frame) { console.log('no frame'); await browser.close(); return; }

  const rows = await frame.locator('tr.timesheet-pc-main-content-timesheet-daily-row').all();
  let target = null;
  for (const r of rows) {
    const em = await r.locator('.timesheet-pc-main-content-timesheet-daily-row__col-date em').textContent().catch(()=>null);
    if (em && em.trim() === '24') { target = r; break; }
  }
  if (!target) { console.log('row 24 not found; total rows', rows.length); await browser.close(); return; }
  console.log('clicking start-time cell of day 24');
  await target.locator('.timesheet-pc-main-content-timesheet-daily-row__col-start-time').click({ timeout: 5000 }).catch(e=>console.log('click err', e.message));
  await sleep(2500);

  const dump = await frame.evaluate(() => {
    let node = [...document.querySelectorAll('*')].find(e => /勤務時間入力/.test(e.textContent||'') && e.querySelectorAll('input').length>=2 && e.offsetWidth>300);
    if (!node) return { found:false };
    let modal = node;
    for (let i=0;i<6 && modal.parentElement;i++){ if (modal.querySelectorAll('button').length>=2 && modal.querySelectorAll('input').length>=2) break; modal = modal.parentElement; }
    const inputs = [...modal.querySelectorAll('input,textarea')].map(i=>({tag:i.tagName,type:i.type,ph:i.placeholder,val:i.value,testid:i.getAttribute('data-testid'),cls:(i.className||'').slice(0,70)}));
    const buttons = [...modal.querySelectorAll('button')].map(b=>({text:(b.textContent||'').trim().slice(0,20),testid:b.getAttribute('data-testid'),cls:(b.className||'').slice(0,50)}));
    const labels = [...modal.querySelectorAll('label, th, .label, dt')].map(l=>(l.textContent||'').trim()).filter(Boolean).slice(0,20);
    return { found:true, inputs, buttons, labels };
  });
  console.log('DIALOG_DUMP:', JSON.stringify(dump, null, 1));

  await frame.locator('button:has-text("キャンセル")').first().click({timeout:2000}).catch(()=>{});
  await page.keyboard.press('Escape').catch(()=>{});
  await browser.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
