const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('tex__TimeAttendance')) || ctx.pages()[0];
  let frame = null;
  for (const f of page.frames()) { try { if (await f.locator('tr.timesheet-pc-main-content-timesheet-daily-row').count() > 0) { frame = f; break; } } catch (e) {} }
  for (let k=0;k<5;k++){ const b=frame.locator('button:has-text("キャンセル"), button:has-text("閉じる")'); const c=await b.count(); let acted=false; for(let i=0;i<c;i++){ if(await b.nth(i).isVisible().catch(()=>0)){await b.nth(i).click({timeout:1200}).catch(()=>{});acted=true;await sleep(300);} } await page.keyboard.press('Escape').catch(()=>{}); if(!acted)break; }
  await sleep(800);

  const rows = await frame.locator('tr.timesheet-pc-main-content-timesheet-daily-row').all();
  let target=null; for (const r of rows){ const em=await r.locator('.timesheet-pc-main-content-timesheet-daily-row__col-date em').textContent().catch(()=>null); if(em&&em.trim()==='24'){target=r;break;} }
  await target.locator('[data-testid="timesheet-pc__daily-summary-button"]').click({timeout:6000});
  await sleep(3500);

  const jobRowCount = await frame.locator('[class*="TaskRowWrapper"]', { hasText: '44866719_客先業務' }).count();
  log('jobRowCount', jobRowCount);
  const cellSel = '.task__extended__item-list__item.task-hierarchy .container';
  const nCells = await frame.locator('[class*="TaskRowWrapper"]', { hasText: '44866719_客先業務' }).first().locator(cellSel).count();
  log('hierarchy cells in job row:', nCells);

  for (let i=0;i<nCells;i++){
    const jr = frame.locator('[class*="TaskRowWrapper"]', { hasText: '44866719_客先業務' }).first();
    await jr.locator(cellSel).nth(i).click({timeout:4000}).catch(e=>log('  cell',i,'clickerr',e.message));
    await sleep(1200);
    const dcount = await frame.locator('[class*="ExtendedItemHierarchyDialog"]').count();
    let title='';
    if (dcount) title = (await frame.locator('[class*="ExtendedItemHierarchyDialog"] [class*="Header"]').first().textContent().catch(()=>''))||'';
    log(`  cell ${i}: dialogOpen=${dcount>0} title="${title.trim().slice(0,20)}"`);
    await frame.locator('button:has-text("キャンセル")').last().click({timeout:1500}).catch(()=>{});
    await sleep(700);
  }

  const jr = frame.locator('[class*="TaskRowWrapper"]', { hasText: '44866719_客先業務' }).first();
  const inputsInfo = await jr.evaluate(el => [...el.querySelectorAll('input')].map(i=>({cls:(i.getAttribute('class')||'').slice(0,55),val:i.value,ph:i.placeholder})));
  log('JOBROW_INPUTS:', JSON.stringify(inputsInfo));

  for (let k=0;k<4;k++){ const b=frame.locator('button:has-text("キャンセル"), button:has-text("閉じる")'); const c=await b.count(); let acted=false; for(let i=0;i<c;i++){ if(await b.nth(i).isVisible().catch(()=>0)){await b.nth(i).click({timeout:1200}).catch(()=>{});acted=true;await sleep(300);} } if(!acted)break; }
  await browser.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
