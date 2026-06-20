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
    const header = [...document.querySelectorAll('[class*="ModalDialog__Header"]')].find(e => /勤務時間入力/.test(e.textContent||''));
    if (!header) return { found:false };
    let root = header;
    for (let i=0;i<8 && root.parentElement;i++){
      root = root.parentElement;
      const hasTime = root.querySelector('input.commons-fields-att-time-3-digit-hour-field');
      const hasSave = [...root.querySelectorAll('button')].some(b=>/保存/.test(b.textContent||''));
      if (hasTime && hasSave) break;
    }
    const within = sel => [...root.querySelectorAll(sel)];
    const timeInputs = within('input.commons-fields-att-time-3-digit-hour-field').map((i,idx)=>({idx,ph:i.placeholder,val:i.value}));
    const buttons = within('button').map(b=>({text:(b.textContent||'').trim().slice(0,16),cls:(b.className||'').slice(0,36)}));
    const textareas = within('textarea').length;
    const rowLabels = within('th, label, dt').map(l=>(l.textContent||'').trim()).filter(Boolean).slice(0,12);
    return { found:true, rootCls:(root.className||'').slice(0,90), timeInputsCount:timeInputs.length, timeInputs, buttons, textareas, rowLabels };
  });
  console.log(JSON.stringify(out, null, 1));
  await frame.locator('button:has-text("キャンセル")').first().click({timeout:2000}).catch(()=>{});
  await browser.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
