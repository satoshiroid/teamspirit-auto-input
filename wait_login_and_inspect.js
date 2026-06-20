// Connect to the running Chrome via CDP, wait until the user has logged in and the
// TeamSpirit timesheet (Visualforce iframe) is present, then dump selector hints.
const { chromium } = require('playwright');
const URL = 'https://meitecgroup.lightning.force.com/lightning/n/tex__TimeAttendance';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const ctx = browser.contexts()[0];
  let page = ctx.pages().find(p => p.url().includes('lightning')) || ctx.pages()[0];

  // Poll for login completion (up to 15 min).
  let loggedIn = false;
  for (let i = 0; i < 300; i++) {
    page = ctx.pages().find(p => p.url().includes('tex__TimeAttendance'))
        || ctx.pages().find(p => p.url().includes('lightning'))
        || ctx.pages()[0];
    const url = page.url();
    const title = await page.title().catch(() => '');
    const onLogin = /login|auth/i.test(url) || /ログイン/.test(title);
    const hasFrame = page.frames().some(f => /vf|visual/i.test(f.name() + f.url()));
    if (!onLogin && hasFrame) { loggedIn = true; break; }
    if (i % 5 === 0) console.log(`waiting login... title="${title}" url=${url.slice(0,70)}`);
    await sleep(3000);
  }
  if (!loggedIn) { console.log('TIMEOUT waiting for login'); await browser.close(); return; }

  if (!page.url().includes('tex__TimeAttendance')) {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
  }
  await sleep(4000);

  const frame = page.frames().find(f => /vf|visual/i.test(f.name() + f.url()));
  console.log('LOGGED_IN');
  console.log('FRAME name=', frame.name(), 'url=', frame.url().slice(0, 90));

  const info = await frame.evaluate(() => {
    const out = {};
    const testids = new Set();
    document.querySelectorAll('[data-testid]').forEach(e => testids.add(e.getAttribute('data-testid')));
    out.testidsSample = [...testids].slice(0, 120);
    out.plusButtons = [...document.querySelectorAll('img[class*="plus-button"], [class*="plus-button"]')]
      .slice(0, 5).map(e => ({ tag: e.tagName, cls: e.className.slice(0, 80), testid: e.getAttribute('data-testid') }));
    out.bodyLen = document.body.innerText.length;
    return out;
  });
  console.log('TESTIDS:', JSON.stringify(info.testidsSample));
  console.log('PLUS:', JSON.stringify(info.plusButtons));
  console.log('BODYLEN:', info.bodyLen);
  await browser.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
