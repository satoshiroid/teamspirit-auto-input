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
  await target.locator('[data-testid="timesheet-pc__daily-summary-button"]').click({ timeout: 5000 }).catch(()=>{});
  await sleep(3500);
  const jobRow = frame.locator('[class*="TaskRowWrapper"]', { hasText: '44866719_客先業務' }).first();
  await jobRow.locator('.task__extended__item-list__item.task-hierarchy .container').first().click({ timeout: 5000 }).catch(e=>console.log('cellclick', e.message));
  await sleep(2500);

  const m1 = await frame.evaluate(() => {
    const titleEl = [...document.querySelectorAll('*')].find(e => /選択$/.test((e.textContent||'').trim()) && (e.textContent||'').trim().length<14 && e.children.length===0);
    const tabs = [...document.querySelectorAll('button, [role="tab"], a')].map(b=>(b.textContent||'').trim()).filter(t=>/カテゴリー|お気に入り|決定|キャンセル/.test(t));
    return { title: titleEl ? titleEl.textContent.trim() : null, tabs:[...new Set(tabs)] };
  });
  console.log('MODAL_TITLE:', m1.title, 'TABS:', JSON.stringify(m1.tabs));

  await frame.locator('button:has-text("お気に入りから検索"), [role="tab"]:has-text("お気に入り")').first().click({timeout:3000}).catch(e=>console.log('favtab',e.message));
  await sleep(1500);
  const m2 = await frame.evaluate(() => {
    const results = [...document.querySelectorAll('*')].filter(e => /^\d{6}/.test((e.textContent||'').trim()) && e.querySelectorAll('*').length<6);
    const sample = results.slice(0,4).map(e => ({ text:(e.textContent||'').trim().slice(0,30), cls:(e.getAttribute('class')||'').slice(0,50) }));
    const decide = [...document.querySelectorAll('button')].find(b=>/決定/.test(b.textContent||''));
    return { resultCount: results.length, sample, decideCls: decide ? (decide.getAttribute('class')||'').slice(0,50) : null, decideDisabled: decide ? decide.disabled : null };
  });
  console.log('FAV_RESULTS:', JSON.stringify(m2));
  await frame.locator('button:has-text("キャンセル")').first().click({timeout:2000}).catch(()=>{});
  await sleep(800);
  await frame.locator('button:has-text("キャンセル")').first().click({timeout:2000}).catch(()=>{});
  await browser.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
