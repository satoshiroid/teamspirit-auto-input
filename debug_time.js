const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('tex__TimeAttendance')) || ctx.pages()[0];
  let frame=null; for (const f of page.frames()){ try{ if(await f.locator('tr.timesheet-pc-main-content-timesheet-daily-row').count()>0){frame=f;break;} }catch(e){} }
  for(let k=0;k<5;k++){const b=frame.locator('button:has-text("キャンセル"), button:has-text("閉じる")');const c=await b.count();let acted=false;for(let i=0;i<c;i++){if(await b.nth(i).isVisible().catch(()=>0)){await b.nth(i).click({timeout:1200}).catch(()=>{});acted=true;await sleep(300);}}await page.keyboard.press('Escape').catch(()=>{});if(!acted)break;}
  await sleep(800);
  const rows = await frame.locator('tr.timesheet-pc-main-content-timesheet-daily-row').all();
  let target=null; for (const r of rows){ const em=await r.locator('.timesheet-pc-main-content-timesheet-daily-row__col-date em').textContent().catch(()=>null); if(em&&em.trim()==='23'){target=r;break;} }
  await target.locator('[data-testid="timesheet-pc__daily-summary-button"]').click({timeout:6000});
  await sleep(3500);
  const jobSel = ['[class*="TaskRowWrapper"]', { hasText: '44866719_客先業務' }];
  const jr = frame.locator(...jobSel).first();

  const info = await jr.evaluate(el => {
    const cs=[...el.querySelectorAll('.Combobox__Input, input[class*="Combobox"]')].map(i=>({val:i.value,ph:i.placeholder,vis:i.offsetWidth>0&&i.offsetHeight>0,ro:i.readOnly}));
    const allInputs=[...el.querySelectorAll('input')].map(i=>({cls:(i.getAttribute('class')||'').slice(0,40),val:i.value,vis:i.offsetWidth>0}));
    return {comboCount:cs.length, cs, allInputs};
  });
  log('COMBO_INFO:', JSON.stringify(info));

  const combo = jr.locator('.Combobox__Input').first();
  log('combo count(locator):', await combo.count(), 'visible:', await combo.isVisible().catch(()=>false));
  try {
    await combo.scrollIntoViewIfNeeded({timeout:4000});
    await combo.click({timeout:4000});
    await combo.fill('08:00');
    await combo.press('Tab');
    await sleep(800);
    const v = await combo.inputValue().catch(()=>'?');
    log('AFTER_FILL value:', v);
  } catch(e){ log('FILL ERR', e.message); }
  await page.screenshot({path:__dirname+'/time_check.png'}).catch(()=>{});
  log('done');
  await browser.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
