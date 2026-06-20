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
  const cellSel = '.task__extended__item-list__item.task-hierarchy .container';
  await frame.locator(...jobSel).first().locator(cellSel).nth(0).click({timeout:5000});
  await sleep(1500);
  log('modal title:', await frame.evaluate(()=>{const t=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&/選択$/.test((e.textContent||'').trim())&&(e.textContent||'').trim().length<=16);return t?t.textContent.trim():'';}));
  await frame.locator('button:has-text("お気に入りから検索")').last().click({timeout:4000}).catch(e=>log('favtab err',e.message));
  await sleep(900);
  const search = frame.locator('input[placeholder*="Enter"]');
  if (await search.count()){ await search.last().fill('631002'); await search.last().press('Enter'); await sleep(1000); }
  const favDump = await frame.evaluate(()=>{
    const rb=document.querySelector('[class*="ResultBody"]')||document.querySelector('[class*="FavoriteHierarchy"]');
    return rb?{cls:(rb.getAttribute('class')||'').slice(0,40),text:(rb.innerText||'').slice(0,120)}:null;
  });
  log('FAV_AREA:', JSON.stringify(favDump));
  let result = frame.locator('[class*="ResultBody"]').getByText('631002',{exact:false}).first();
  if(!(await result.count())) result = frame.getByText('631002',{exact:false}).last();
  log('result count:', await result.count());
  await result.click({timeout:5000}).catch(e=>log('result click err',e.message));
  await sleep(600);
  const okInfo = await frame.evaluate(()=>{const o=document.querySelector('[class*="ExtendedItemHierarchyDialog__Ok"]');return o?{disabled:o.disabled,text:(o.textContent||'').trim()}:null;});
  log('OK_BTN:', JSON.stringify(okInfo));
  await frame.locator('[class*="ExtendedItemHierarchyDialog__Ok"]').last().click({timeout:5000}).catch(e=>log('ok err',e.message));
  await sleep(1500);
  const cellVal = await frame.locator(...jobSel).first().locator(cellSel).nth(0).innerText().catch(()=>'?');
  log('CELL0_AFTER:', JSON.stringify(cellVal));
  await page.screenshot({path:__dirname+'/pick_check.png'}).catch(()=>{});
  log('screenshot pick_check.png');
  await browser.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
