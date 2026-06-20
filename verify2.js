const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('tex__TimeAttendance')) || ctx.pages()[0];
  let frame=null; for (const f of page.frames()){ try{ if(await f.locator('tr.timesheet-pc-main-content-timesheet-daily-row').count()>0){frame=f;break;} }catch(e){} }
  for(let k=0;k<4;k++){const b=frame.locator('button:has-text("キャンセル"), button:has-text("閉じる")');const c=await b.count();let acted=false;for(let i=0;i<c;i++){if(await b.nth(i).isVisible().catch(()=>0)){await b.nth(i).click({timeout:1000}).catch(()=>{});acted=true;await sleep(250);}}await page.keyboard.press('Escape').catch(()=>{});if(!acted)break;}
  await sleep(1500);
  const rows = await frame.locator('tr.timesheet-pc-main-content-timesheet-daily-row').all();
  let target=null; for (const r of rows){ const em=await r.locator('.timesheet-pc-main-content-timesheet-daily-row__col-date em').textContent().catch(()=>null); if(em&&em.trim()==='23'){target=r;break;} }
  const info = await target.evaluate(el => {
    const q = s => el.querySelector(s);
    const base='.timesheet-pc-main-content-timesheet-display-field-layout-item-row';
    return {
      date: (q('.timesheet-pc-main-content-timesheet-daily-row__col-date')?.innerText||'').trim(),
      start: (q('.timesheet-pc-main-content-timesheet-daily-row__col-start-time')?.innerText||'').trim(),
      end: (q('.timesheet-pc-main-content-timesheet-daily-row__col-end-time')?.innerText||'').trim(),
      kousu: (q('[data-testid="timesheet-pc__daily-summary-button__task-time"]')?.innerText||'').trim(),
      kinmuBasho: (q(`${base}__dropdown [class*="DropdownButton__Label"]`)?.innerText||'').trim(),
      gyomu: (q(`${base}__text input`)?.value||'').trim(),
      status: (q('.timesheet-pc-main-content-timesheet-request-button-with-status img')?.getAttribute('alt')||'').trim()
    };
  });
  log('ROW23_FIELDS:', JSON.stringify(info, null, 1));
  await page.screenshot({path:__dirname+'/verify2.png'}).catch(()=>{});
  await browser.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
