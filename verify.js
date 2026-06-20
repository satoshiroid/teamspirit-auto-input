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
  const gridText = (await target.innerText().catch(()=>'')).replace(/\s+/g,' ').trim();
  log('GRID_ROW_23:', JSON.stringify(gridText.slice(0,80)));
  await target.locator('[data-testid="timesheet-pc__daily-summary-button"]').click({timeout:6000});
  await sleep(3500);
  const jr = frame.locator('[class*="TaskRowWrapper"]', { hasText: '44866719_客先業務' }).first();
  const cells = await jr.locator('.task__extended__item-list__item.task-hierarchy .container').allInnerTexts().catch(()=>[]);
  const selects = await jr.evaluate(el => [...el.querySelectorAll('select')].map(s=>s.value));
  const time = await jr.locator('[class*="Combobox__Input"]').first().inputValue().catch(()=>'?');
  const summary = await frame.evaluate(()=>{
    const t=document.body.innerText.match(/工数実績時間[^\d]*([\d:]+)/);
    const w=document.body.innerText.match(/実労働時間[^\d]*([\d:]+)/);
    return {kousuJikan:t?t[1]:'?', jitsuRodo:w?w[1]:'?'};
  });
  log('HIER_CELLS:', JSON.stringify(cells.map(c=>c.replace(/\n/g,' ').trim()).filter(Boolean)));
  log('SELECTS(知識,技能):', JSON.stringify(selects));
  log('工数実績(input):', time);
  log('SUMMARY:', JSON.stringify(summary));
  await page.screenshot({path:__dirname+'/verify.png'}).catch(()=>{});
  for(let k=0;k<3;k++){const b=frame.locator('button:has-text("キャンセル"), button:has-text("閉じる")');const c=await b.count();let acted=false;for(let i=0;i<c;i++){if(await b.nth(i).isVisible().catch(()=>0)){await b.nth(i).click({timeout:1200}).catch(()=>{});acted=true;await sleep(300);}}if(!acted)break;}
  await browser.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
