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
    const dlg = document.querySelector('[class*="ModalDialog__Dialog"]');
    if (!dlg) return { found:false };
    const inputs = [...dlg.querySelectorAll('input,textarea')].map((i,idx)=>({idx,tag:i.tagName,type:i.type,ph:i.placeholder,val:(i.value||'').slice(0,24),testid:i.getAttribute('data-testid'),cls:(i.getAttribute('class')||'').slice(0,70)}));
    const buttons = [...dlg.querySelectorAll('button')].map(b=>({text:(b.textContent||'').trim().slice(0,16),cls:(b.getAttribute('class')||'').slice(0,36)}));
    const content = dlg.querySelector('[class*="ModalDialog__Content"]');
    return { found:true, inputs, buttons, contentHTML: content ? content.innerHTML.slice(0,3500) : null };
  });
  console.log('INPUTS:', JSON.stringify(out.inputs));
  console.log('BUTTONS:', JSON.stringify(out.buttons));
  console.log('CONTENT_HTML_START');
  console.log(out.contentHTML);
  console.log('CONTENT_HTML_END');
  await frame.locator('button:has-text("キャンセル")').first().click({timeout:2000}).catch(()=>{});
  await browser.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
