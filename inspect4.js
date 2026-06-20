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
    const cands = [...document.querySelectorAll('[role="dialog"],[aria-modal="true"],[class*="modal" i],[class*="dialog" i]')]
      .filter(e => e.offsetWidth > 200 && /勤務時間入力/.test(e.textContent||''));
    const pick = cands.sort((a,b)=> (a.textContent.length-b.textContent.length))[0];
    if (!pick) return { found:false, candCount: cands.length };
    const within = sel => [...pick.querySelectorAll(sel)];
    const timeInputs = within('input.commons-fields-att-time-3-digit-hour-field').map(i=>({ph:i.placeholder,val:i.value}));
    const allInputs = within('input,textarea').map((i,idx)=>({idx,type:i.type,ph:i.placeholder,val:(i.value||'').slice(0,20),cls:(i.className||'').slice(0,60)}));
    const buttons = within('button').map(b=>({text:(b.textContent||'').trim().slice(0,16),cls:(b.className||'').slice(0,40)}));
    return { found:true, rootTag:pick.tagName, rootCls:(pick.className||'').slice(0,120), role:pick.getAttribute('role'), timeInputsCount:timeInputs.length, timeInputs, allInputs, buttons };
  });
  console.log(JSON.stringify(out, null, 1));
  await frame.locator('button:has-text("キャンセル")').first().click({timeout:2000}).catch(()=>{});
  await browser.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
