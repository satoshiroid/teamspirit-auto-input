// TeamSpirit 自動入力コアモジュール（Electronから利用）
const { chromium } = require('playwright');

const URL = 'https://meitecgroup.lightning.force.com/lightning/n/tex__TimeAttendance';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function normTime(s) {
  s = String(s || '').trim().replace('：', ':');
  if (/^\d{1,2}:\d{2}$/.test(s)) { const [h, m] = s.split(':'); return String(+h).padStart(2, '0') + ':' + m; }
  const d = s.replace(/\D/g, '');
  if (d.length === 3) return '0' + d[0] + ':' + d.slice(1);
  if (d.length === 4) return d.slice(0, 2) + ':' + d.slice(2);
  return s;
}
function toMin(t) { const m = /^(\d{1,2}):(\d{2})$/.exec(normTime(t)); return m ? (+m[1]) * 60 + (+m[2]) : null; }
function computeWork(start, end, brk) {
  const s = toMin(start), e = toMin(end);
  if (s == null || e == null) return '';
  let work = e - s;
  if (work < 0) work += 24 * 60;
  let bmin = 60;
  if (brk) { const bs = toMin(brk.start), be = toMin(brk.end); if (bs != null && be != null) bmin = Math.max(0, be - bs); }
  work = Math.max(0, work - bmin);
  return String(Math.floor(work / 60)).padStart(2, '0') + ':' + String(work % 60).padStart(2, '0');
}

async function launchBrowser(userDataDir) {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chrome',
    viewport: null,
    args: ['--start-maximized'],
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  return { context, page };
}

async function isLoggedIn(page) {
  const url = page.url();
  const title = await page.title().catch(() => '');
  const onLogin = /login|auth/i.test(url) || /ログイン/.test(title);
  const hasFrame = page.frames().some(f => /vf|visual/i.test(f.name() + f.url()));
  return !onLogin && hasFrame;
}

async function getFrame(page) {
  for (let i = 0; i < 20; i++) {
    for (const f of page.frames()) {
      try { if (await f.locator('tr.timesheet-pc-main-content-timesheet-daily-row').count() > 0) return f; } catch (e) {}
    }
    await sleep(1000);
  }
  throw new Error('勤務表が見つかりません（ログイン状態を確認してください）');
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

async function doAttendance(frame, row, day, log) {
  await row.locator('.timesheet-pc-main-content-timesheet-daily-row__col-start-time').click({ timeout: 6000 });
  const dlg = frame.locator('[class*="ModalDialog__Dialog"]').filter({ hasText: '勤務時間入力' }).last();
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  const st = normTime(day.start), en = normTime(day.end);
  // 出勤を入れて Tab で確定 → 退勤を入れて Tab で確定（最後の欄が未確定で保存される問題を防ぐ）
  let times = dlg.locator('input.commons-fields-att-time-field');
  await times.nth(0).click({ timeout: 5000 });
  await times.nth(0).fill(st);
  await times.nth(0).press('Tab');
  await sleep(400);
  times = dlg.locator('input.commons-fields-att-time-field');
  await times.nth(1).click({ timeout: 5000 });
  await times.nth(1).fill(en);
  await times.nth(1).press('Tab');
  await sleep(400);
  const v1 = await dlg.locator('input.commons-fields-att-time-field').nth(1).inputValue().catch(() => '');
  if (!/\d/.test(v1)) {
    await dlg.locator('input.commons-fields-att-time-field').nth(1).fill(en).catch(() => {});
    await dlg.locator('input.commons-fields-att-time-field').nth(1).press('Tab').catch(() => {});
    await sleep(400);
  }
  await dlg.locator('button:text-is("保存")').click({ timeout: 6000 });
  await sleep(2500);
  log(`  出退勤 ${st}-${en} 保存`);
}

async function pickFavorite(frame, key, code, log) {
  await frame.locator('button:has-text("お気に入りから検索")').last().click({ timeout: 4000 }).catch(() => {});
  await sleep(900);
  const search = frame.locator('input[placeholder*="Enter"]');
  if (await search.count()) { await search.last().fill(code).catch(() => {}); await search.last().press('Enter').catch(() => {}); await sleep(1000); }
  let result = frame.locator('[class*="ResultBody"]').getByText(code, { exact: false }).first();
  if (!(await result.count())) result = frame.getByText(code, { exact: false }).last();
  await result.click({ timeout: 5000 });
  await sleep(400);
  await frame.locator('[class*="ExtendedItemHierarchyDialog__Ok"]').last().click({ timeout: 5000 });
  await sleep(1000);
  log(`    ${key}=${code}`);
}

async function doKousu(frame, row, day, cfg, log) {
  await row.locator('[data-testid="timesheet-pc__daily-summary-button"]').click({ timeout: 6000 });
  await sleep(3500);
  const jobSel = ['[class*="TaskRowWrapper"]', { hasText: cfg.kousu.jobMatch }];
  await frame.locator(...jobSel).first().waitFor({ state: 'visible', timeout: 8000 });
  const cellSel = '.task__extended__item-list__item.task-hierarchy .container';
  const nCells = await frame.locator(...jobSel).first().locator(cellSel).count();
  const favs = cfg.kousu.favorites || {};
  for (let i = 0; i < nCells; i++) {
    await frame.locator(...jobSel).first().locator(cellSel).nth(i).click({ timeout: 5000 }).catch(() => {});
    await sleep(1200);
    if (!(await frame.locator('[class*="ExtendedItemHierarchyDialog"]').count())) continue;
    const title = await hierTitle(frame);
    const k = title.replace(/選択$/, '');
    if (favs[k]) { try { await pickFavorite(frame, k, favs[k], log); } catch (e) { log(`    ${k} ERR ${e.message}`); await cancelHierModal(frame); } }
    else { await cancelHierModal(frame); }
  }
  const pk = cfg.kousu.picklists || {};
  const pkKeys = Object.keys(pk);
  const sel = frame.locator(...jobSel).first().locator('select');
  const sc = await sel.count();
  for (let i = 0; i < sc && i < pkKeys.length; i++) {
    const v = pk[pkKeys[i]];
    if (v) { await sel.nth(i).selectOption(v).catch(() => {}); log(`    ${pkKeys[i]}=${v}`); }
  }
  let kousu = day.kousu;
  if (!kousu || !/\d/.test(String(kousu))) {
    const m = await frame.evaluate(() => { const w = document.body.innerText.match(/実労働時間[^\d]*(\d{1,2}:\d{2})/); return w ? w[1] : ''; }).catch(() => '');
    if (m && /\d/.test(m)) kousu = m;
  }
  if ((!kousu || !/\d/.test(String(kousu))) && day.start && day.end) {
    kousu = computeWork(day.start, day.end, cfg.constants && cfg.constants.breakDefault);
  }
  const setTime = async () => {
    const t = frame.locator(...jobSel).first().locator('[class*="Combobox__Input"]').first();
    await t.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    await t.click({ timeout: 5000 }).catch(() => {});
    await t.fill('').catch(() => {});
    await t.fill(String(kousu)).catch(() => {});
    await t.press('Tab').catch(() => {});
    await sleep(700);
    return await t.inputValue().catch(() => '');
  };
  if (!kousu || !/\d/.test(String(kousu))) {
    log('    工数実績の時間を特定できずスキップ（手動で確認してください）');
  } else {
    let v = '';
    for (let i = 0; i < 3; i++) { v = await setTime(); if (/\d/.test(v) && v !== '00:00') break; }
    log(`    工数実績=${kousu} (反映=${v})`);
  }
  // 保存して閉じる。「作業時間が登録されていない」警告が出たらキャンセルして時間を入れ直す
  for (let attempt = 0; attempt < 3; attempt++) {
    await frame.locator('button:has-text("保存して閉じる")').last().click({ timeout: 6000 }).catch(() => {});
    await sleep(1600);
    const warn = frame.getByText('作業時間が登録されていない', { exact: false });
    if (!(await warn.count())) break;
    log('    警告「作業時間未登録」→ キャンセルして工数実績を再入力');
    await frame.locator('button:has-text("キャンセル")').last().click({ timeout: 3000 }).catch(() => {});
    await sleep(900);
    if (kousu && /\d/.test(String(kousu))) await setTime();
  }
  await sleep(1500);
  log('  工数 保存');
}

async function doRowFields(frame, page, row, cfg, log) {
  const base = '.timesheet-pc-main-content-timesheet-display-field-layout-item-row';
  if (cfg.constants.gyomuNaiyo) {
    await row.locator(`${base}__text input`).first().fill(cfg.constants.gyomuNaiyo).catch(() => {});
  }
  if (cfg.constants.kinmuBasho) {
    await row.locator(`${base}__dropdown [class*="DropdownButton__Button"]`).first().click({ timeout: 5000 }).catch(() => {});
    await sleep(900);
    const kb = cfg.constants.kinmuBasho;
    let opt = frame.locator('[class*="Option"], [role="option"], li').filter({ hasText: new RegExp('^' + kb + '$') });
    if (!(await opt.count())) opt = frame.getByText(kb, { exact: true });
    await opt.last().click({ timeout: 4000 }).catch(() => {});
    await sleep(600);
  }
  await row.locator(`${base}__button button`).first().click({ timeout: 5000 }).catch(() => {});
  await sleep(2500);
  log(`  勤務場所=${cfg.constants.kinmuBasho} / 業務内容 / 行保存`);
}

async function processDays(page, days, cfg, log) {
  const frame = await getFrame(page);
  await cleanupAll(frame, page);
  await sleep(800);
  const results = [];
  for (const day of days) {
    const dayNum = parseInt(String(day.date).slice(8, 10), 10);
    log(`== ${day.date} ==`);
    let row = await findRow(frame, dayNum);
    if (!row) { log('  行が見つかりません（対象月か確認）'); results.push({ date: day.date, ok: false }); continue; }
    let ok = true;
    try { await doAttendance(frame, row, day, log); } catch (e) { log('  出退勤ERR ' + e.message); await cleanupAll(frame, page); ok = false; }
    row = await findRow(frame, dayNum);
    try { await doKousu(frame, row, day, cfg, log); } catch (e) { log('  工数ERR ' + e.message); await cleanupAll(frame, page); ok = false; }
    row = await findRow(frame, dayNum);
    try { await doRowFields(frame, page, row, cfg, log); } catch (e) { log('  行入力ERR ' + e.message); await cleanupAll(frame, page); ok = false; }
    results.push({ date: day.date, ok });
  }
  log('完了');
  return results;
}

async function readCurrentSettings(page, cfg, log = () => {}) {
  const frame = await getFrame(page);
  await cleanupAll(frame, page);
  const rows = await frame.locator('tr.timesheet-pc-main-content-timesheet-daily-row').all();
  for (const r of rows) {
    const hasKousu = await r.locator('[data-testid="timesheet-pc__daily-summary-button__task-time"]').count();
    if (!hasKousu) continue;
    await r.locator('[data-testid="timesheet-pc__daily-summary-button"]').click({ timeout: 6000 }).catch(() => {});
    await sleep(3500);
    const jr = frame.locator('[class*="TaskRowWrapper"]').first();
    const jobText = (await jr.locator('[class*="TaskRow__Job"]').first().innerText().catch(() => '')).replace(/\n/g, ' ').trim();
    const cells = await jr.locator('.task__extended__item-list__item.task-hierarchy .container').allInnerTexts().catch(() => []);
    const selects = await jr.evaluate(el => [...el.querySelectorAll('select')].map(s => s.value)).catch(() => []);
    await cleanupAll(frame, page);
    if (cells.some(c => /\d{6}/.test(c))) {
      const codes = cells.map(c => (c.match(/(\d{6})/) || [])[1] || '');
      return { jobText, codes, selects };
    }
  }
  return null;
}

module.exports = { launchBrowser, isLoggedIn, getFrame, processDays, readCurrentSettings, URL };
