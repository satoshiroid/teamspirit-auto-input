// TeamSpirit 勤務表 自動入力 (Playwright, CDP接続)
// 事前に launch.js でChromeを起動&ログイン済みであること。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function getFrame(page) {
  for (let i = 0; i < 20; i++) {
    for (const f of page.frames()) {
      try { if (await f.locator('tr.timesheet-pc-main-content-timesheet-daily-row').count() > 0) return f; } catch (e) {}
    }
    await sleep(1000);
  }
  throw new Error('grid frame not found');
}

async function findRow(frame, dayNum) {
  const rows = await frame.locator('tr.timesheet-pc-main-content-timesheet-daily-row').all();
  for (const r of rows) {
    const em = await r.locator('.timesheet-pc-main-content-timesheet-daily-row__col-date em').textContent().catch(() => null);
    if (em && em.trim() === String(dayNum)) return r;
  }
  return null;
}

async function cleanupAll(frame, page) {
  for (let k = 0; k < 5; k++) {
    let acted = false;
    for (const t of ['キャンセル', '閉じる']) {
      const b = frame.locator(`button:has-text("${t}")`);
      const c = await b.count();
      for (let i = 0; i < c; i++) {
        if (await b.nth(i).isVisible().catch(() => false)) { await b.nth(i).click({ timeout: 1500 }).catch(() => {}); acted = true; await sleep(350); }
      }
    }
    await page.keyboard.press('Escape').catch(() => {});
    if (!acted) break;
    await sleep(350);
  }
}

async function cancelHierModal(frame) {
  const c = frame.locator('[class*="ExtendedItemHierarchyDialog"] button:has-text("キャンセル")');
  if (await c.count()) await c.last().click({ timeout: 2000 }).catch(() => {});
  await sleep(600);
}

async function hierTitle(frame) {
  return await frame.evaluate(() => {
    const els = [...document.querySelectorAll('*')];
    const t = els.find(e => e.children.length === 0 && /選択$/.test((e.textContent || '').trim()) && (e.textContent || '').trim().length <= 16);
    return t ? t.textContent.trim() : '';
  }).catch(() => '');
}

async function doAttendance(frame, row, day) {
  await row.locator('.timesheet-pc-main-content-timesheet-daily-row__col-start-time').click({ timeout: 6000 });
  const dlg = frame.locator('[class*="ModalDialog__Dialog"]').filter({ hasText: '勤務時間入力' }).last();
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  const times = dlg.locator('input.commons-fields-att-time-field');
  await times.nth(0).fill(day.start);
  await times.nth(1).fill(day.end);
  await dlg.locator('button:text-is("保存")').click({ timeout: 6000 });
  await sleep(2500);
  log(`  出退勤 saved: ${day.start}-${day.end}`);
}

async function pickFavorite(frame, key, code) {
  // 1つだけ開いている選択モーダル前提でフレーム直下を操作
  await frame.locator('button:has-text("お気に入りから検索")').last().click({ timeout: 4000 }).catch(() => {});
  await sleep(900);
  const search = frame.locator('input[placeholder*="Enter"]');
  if (await search.count()) { await search.last().fill(code).catch(() => {}); await search.last().press('Enter').catch(() => {}); await sleep(1000); }
  let result = frame.locator('[class*="ResultBody"]').getByText(code, { exact: false }).first();
  if (!(await result.count())) result = frame.locator('[class*="FavoriteHierarchy"]').getByText(code, { exact: false }).first();
  if (!(await result.count())) result = frame.getByText(code, { exact: false }).last();
  await result.click({ timeout: 5000 });
  await sleep(400);
  await frame.locator('[class*="ExtendedItemHierarchyDialog__Ok"]').last().click({ timeout: 5000 });
  await sleep(1000);
  log(`    ${key}=${code} OK`);
}

async function doKousu(frame, row, day) {
  await row.locator('[data-testid="timesheet-pc__daily-summary-button"]').click({ timeout: 6000 });
  await sleep(3500);
  const jobSel = ['[class*="TaskRowWrapper"]', { hasText: cfg.kousu.jobMatch }];
  await frame.locator(...jobSel).first().waitFor({ state: 'visible', timeout: 8000 });
  const cellSel = '.task__extended__item-list__item.task-hierarchy .container';
  const nCells = await frame.locator(...jobSel).first().locator(cellSel).count();
  const favs = cfg.kousu.favorites;
  for (let i = 0; i < nCells; i++) {
    await frame.locator(...jobSel).first().locator(cellSel).nth(i).click({ timeout: 5000 }).catch(() => {});
    await sleep(1200);
    if (!(await frame.locator('[class*="ExtendedItemHierarchyDialog"]').count())) continue;
    const title = await hierTitle(frame);
    const key = title.replace(/選択$/, '');
    if (favs[key]) { try { await pickFavorite(frame, key, favs[key]); } catch (e) { log(`    ${key} pick ERR ${e.message}`); await cancelHierModal(frame); } }
    else { log(`    skip cell ${i} (title="${title}")`); await cancelHierModal(frame); }
  }
  // 知識/技能 などのピックリスト(select)。列順: 知識=0, 技能=1
  const pk = cfg.kousu.picklists || {};
  const pkKeys = Object.keys(pk);
  const sel = frame.locator(...jobSel).first().locator('select');
  const sc = await sel.count();
  for (let i = 0; i < sc && i < pkKeys.length; i++) {
    const v = pk[pkKeys[i]];
    if (v) { await sel.nth(i).selectOption(v).catch(e => log(`    ${pkKeys[i]} sel ERR ${e.message}`)); log(`    ${pkKeys[i]}=${v}`); }
  }
  const t = frame.locator(...jobSel).first().locator('[class*="Combobox__Input"]').first();
  await t.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await t.click({ timeout: 5000 }).catch(() => {});
  await t.fill(day.kousu);
  await t.press('Tab').catch(() => {});
  await sleep(900);
  const tv = await t.inputValue().catch(() => '?');
  log(`    工数実績=${day.kousu} (now=${tv})`);
  await frame.locator('button:has-text("保存して閉じる")').last().click({ timeout: 6000 });
  await sleep(3000);
  log('  工数 saved & closed');
}

// ---- 行レベル(勤務場所/業務内容) + 行保存 ----
async function doRowFields(frame, page, row, day) {
  const base = '.timesheet-pc-main-content-timesheet-display-field-layout-item-row';
  if (cfg.constants.gyomuNaiyo) {
    const txt = row.locator(`${base}__text input`).first();
    await txt.fill(cfg.constants.gyomuNaiyo).catch(e => log('  業務内容 ERR', e.message));
  }
  if (cfg.constants.kinmuBasho) {
    await row.locator(`${base}__dropdown [class*="DropdownButton__Button"]`).first().click({ timeout: 5000 }).catch(() => {});
    await sleep(900);
    const kb = cfg.constants.kinmuBasho;
    let opt = frame.locator('[class*="Option"], [role="option"], li').filter({ hasText: new RegExp('^' + kb + '$') });
    if (!(await opt.count())) opt = frame.getByText(kb, { exact: true });
    await opt.last().click({ timeout: 4000 }).catch(e => log('  勤務場所 ERR', e.message));
    await sleep(600);
  }
  log(`    勤務場所=${cfg.constants.kinmuBasho} / 業務内容=set`);
  await row.locator(`${base}__button button`).first().click({ timeout: 5000 }).catch(e => log('  行保存 ERR', e.message));
  await sleep(2500);
  log('  行保存 done');
}

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('tex__TimeAttendance')) || ctx.pages()[0];
  const frame = await getFrame(page);
  log('connected. cleanup leftover dialogs...');
  await cleanupAll(frame, page);
  await sleep(800);
  log('processing', cfg.days.length, 'day(s)');

  for (const day of cfg.days) {
    const dayNum = parseInt(day.date.slice(8, 10), 10);
    log(`== ${day.date} (day ${dayNum}) ==`);
    let row = await findRow(frame, dayNum);
    if (!row) { log('  ROW NOT FOUND, skip'); continue; }
    try { await doAttendance(frame, row, day); } catch (e) { log('  ATT ERR', e.message); await cleanupAll(frame, page); }
    row = await findRow(frame, dayNum);
    try { await doKousu(frame, row, day); } catch (e) { log('  KOUSU ERR', e.message); await cleanupAll(frame, page); }
    row = await findRow(frame, dayNum);
    try { await doRowFields(frame, page, row, day); } catch (e) { log('  ROWFIELDS ERR', e.message); await cleanupAll(frame, page); }
  }
  await page.screenshot({ path: path.join(__dirname, 'result.png') }).catch(() => {});
  log('DONE (screenshot: result.png)');
  await browser.close();
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
