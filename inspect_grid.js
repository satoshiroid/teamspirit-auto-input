const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('tex__TimeAttendance')) || ctx.pages()[0];
  let frame=null; for (const f of page.frames()){ try{ if(await f.locator('tr.timesheet-pc-main-content-timesheet-daily-row').count()>0){frame=f;break;} }catch(e){} }
  for(let k=0;k<5;k++){const b=frame.locator('button:has-text("キャンセル"), button:has-text("閉じる")');const c=await b.count();let acted=false;for(let i=0;i<c;i++){if(await b.nth(i).isVisible().catch(()=>0)){await b.nth(i).click({timeout:1200}).catch(()=>{});acted=true;await sleep(300);}}await page.keyboard.press('Escape').catch(()=>{});if(!acted)break;}
  await sleep(600);
  const rows = await frame.locator('tr.timesheet-pc-main-content-timesheet-daily-row').all();
  let target=null; for (const r of rows){ const em=await r.locator('.timesheet-pc-main-content-timesheet-daily-row__col-date em').textContent().catch(()=>null); if(em&&em.trim()==='24'){target=r;break;} }

  const dump = await target.evaluate(el => {
    const tds = [...el.querySelectorAll('td')].map(td => {
      const cls=(td.getAttribute('class')||'').split(' ').find(c=>/__col|__button|__time|__dropdown/.test(c))||'(td)';
      return { cls, inputs: td.querySelectorAll('input,textarea').length, dropdown: !!td.querySelector('[class*="DropdownButton"]'), btn: (td.querySelector('button')?.textContent||'').trim().slice(0,8), text:(td.innerText||'').trim().slice(0,16) };
    });
    const texts=[...el.querySelectorAll('input[class*="ts-text-field"], input[class*="slds-input"], textarea')].map(i=>({cls:(i.getAttribute('class')||'').slice(0,40), val:i.value, parentTd:(i.closest('td')?.getAttribute('class')||'').split(' ').find(c=>/__/.test(c))||''}));
    return { tds, texts };
  });
  log('TDS:', JSON.stringify(dump.tds));
  log('TEXTS:', JSON.stringify(dump.texts));

  const dd = target.locator('[class*="DropdownButton__Button"]').first();
  log('dropdown count:', await dd.count());
  await dd.click({timeout:4000}).catch(e=>log('dd err',e.message));
  await sleep(1000);
  const opts = await frame.evaluate(()=>{
    const items=[...document.querySelectorAll('[role="option"], li')].map(o=>(o.textContent||'').trim()).filter(t=>t&&t.length<12).slice(0,12);
    return items;
  });
  log('DROPDOWN_OPTIONS:', JSON.stringify(opts));
  await page.keyboard.press('Escape').catch(()=>{});
  await browser.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
