// Launch a dedicated Chrome (real Chrome channel) with a persistent profile and
// an open CDP port, then navigate to TeamSpirit and stay alive.
// The user logs in ONCE in this window; the profile persists the session.
const { chromium } = require('playwright');
const path = require('path');
const os = require('os');

const URL = 'https://meitecgroup.lightning.force.com/lightning/n/tex__TimeAttendance';
const PROFILE = path.join(os.homedir(), 'teamspirit-automation', 'chrome-profile');

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    channel: 'chrome',
    viewport: null,
    args: ['--remote-debugging-port=9222', '--start-maximized'],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(URL, { waitUntil: 'domcontentloaded' }).catch(e => console.log('goto:', e.message));
  console.log('LAUNCHED. CDP on http://localhost:9222');
  console.log('TITLE:', await page.title().catch(() => '?'));
  // Stay alive so other scripts can attach via CDP.
  await new Promise(() => {});
})();
