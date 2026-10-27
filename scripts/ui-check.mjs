// Drives the built app in headless Chromium: screenshots at desktop and phone
// width, presses play, toggles a tile and checks for errors.
// Usage: npm run build && npm run ui-check
import { mkdirSync } from 'node:fs';
import { preview } from 'vite';
import puppeteer from 'puppeteer-core';

const server = await preview({ preview: { port: 5198, strictPort: false }, logLevel: 'error' });
const url = server.resolvedUrls.local[0];
mkdirSync('smoke-output', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium-browser',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
});
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(url);
  await page.waitForSelector('.tile');
  await page.screenshot({ path: 'smoke-output/desktop.png', fullPage: true });
  // A fresh browser counts as a first visit, so starter mixes are offered.
  const startersShown = (await page.$('.starters')) !== null;

  // Play, then check the audio clock is running.
  await page.click('.play');
  await new Promise((r) => setTimeout(r, 1500));
  const playing = await page.$eval('.play', (b) => b.classList.contains('playing'));

  // Toggle the bells tile on and read its pressed state.
  const bells = await page.$$('.tile-toggle');
  await bells[1].click();
  await new Promise((r) => setTimeout(r, 300));
  const bellsOn = await page.$$eval('.tile-toggle', (els) => els[1].getAttribute('aria-pressed'));
  const status = await page.$eval('.status', (el) => el.textContent);
  await page.screenshot({ path: 'smoke-output/desktop-playing.png' });

  // Scrolled to the bottom, the player is still reachable.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise((r) => setTimeout(r, 700));
  // The transport stays on screen while scrolling.
  const barVisible = await page.$eval('.transport', (el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0;
  });

  // After clicking a tile, Space pauses the music and does not toggle the tile.
  const before = await page.$$eval('.tile.on', (els) => els.length);
  await page.$eval('#tile-lofi', (el) => el.scrollIntoView({ block: 'center' }));
  await page.click('#tile-lofi .tile-toggle');
  await page.keyboard.press('Space');
  await new Promise((r) => setTimeout(r, 400));
  const afterSpace = await page.$eval('.play', (b) => b.classList.contains('playing'));
  const tilesAfter = await page.$$eval('.tile.on', (els) => els.length);

  // Surprise me can be undone.
  await page.evaluate(() => window.scrollTo(0, 0));
  const onBefore = await page.$$eval('.tile.on .tile-name', (els) => els.map((e) => e.textContent).join());
  await page.evaluate(() => [...document.querySelectorAll('.actions .btn')].find((b) => b.textContent === 'Surprise me').click());
  await page.waitForSelector('.toast-undo');
  await page.click('.toast-undo');
  await new Promise((r) => setTimeout(r, 200));
  const onRestored = await page.$$eval('.tile.on .tile-name', (els) => els.map((e) => e.textContent).join());

  // The mixes dialog closes on Escape and gives focus back.
  await page.evaluate(() => [...document.querySelectorAll('.actions .btn')].find((b) => b.textContent.startsWith('Mixes')).click());
  await page.waitForSelector('[role=dialog]');
  await page.keyboard.press('Escape');
  await new Promise((r) => setTimeout(r, 200));
  const dialogGone = (await page.$('[role=dialog]')) === null;

  // A starter replaces the mix.
  await page.evaluate(() => [...document.querySelectorAll('.starters .token')].find((b) => b.textContent === 'Brown noise').click());
  await new Promise((r) => setTimeout(r, 200));
  const afterStarter = await page.$$eval('.tile.on .tile-name', (els) => els.map((e) => e.textContent).join());

  // Saving shows the mix as current, with one fingerprint dot per tile.
  await page.evaluate(() => [...document.querySelectorAll('.actions .btn')].find((b) => b.textContent.startsWith('Mixes')).click());
  await page.waitForSelector('[role=dialog]');
  await page.click('.save-row button[type=submit]');
  await new Promise((r) => setTimeout(r, 200));
  const savedRow = await page.$eval('.mix-list .mix-load', (b) => ({ name: b.querySelector('.mix-name').textContent, current: b.classList.contains('current'), dots: b.querySelectorAll('.mark').length }));
  await page.keyboard.press('Escape');

  // The session timer starts a countdown; master volume is remembered.
  await page.select('.timer select', '25');
  await new Promise((r) => setTimeout(r, 1200));
  const timerText = await page.$eval('.timer-text', (el) => el.textContent);
  await page.$eval('.t-volume input', (el) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, '40');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 200));
  const storedVolume = await page.evaluate(() => localStorage.getItem('garsae.volume'));
  await page.screenshot({ path: 'smoke-output/desktop-phase3.png' });

  // Jump the page clock to the end of the session: the timer fades, then stops playback.
  await page.evaluate(() => {
    const real = Date.now;
    Date.now = () => real() + 24.8 * 60_000;
  });
  await new Promise((r) => setTimeout(r, 1300));
  const stillPlayingDuringFade = await page.$eval('.play', (b) => b.classList.contains('playing'));
  await page.evaluate(() => {
    const real = Date.now;
    Date.now = () => real() + 60_000;
  });
  await new Promise((r) => setTimeout(r, 1300));
  const timerStopped = await page.$eval('.play', (b) => !b.classList.contains('playing'));
  const timerToast = await page.$eval('.toast', (el) => el.textContent);
  // Start again for the checks below.
  await page.click('.play');
  await new Promise((r) => setTimeout(r, 500));

  // A share link round-trips through the URL hash.
  await page.goto(`${url}#t=drone.50,dub.40,wind.30&e=60&b=100&k=2`);
  await page.waitForSelector('.tile');
  const fromLink = await page.$$eval('.tile.on .tile-name', (els) => els.map((e) => e.textContent));
  const bpmShown = await page.$eval('output.field-value', (el) => el.textContent);

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto(url);
  await page.waitForSelector('.tile');
  await page.screenshot({ path: 'smoke-output/phone.png', fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

  console.log({ stillPlayingDuringFade, timerStopped, timerToast, startersShown, afterStarter, savedRow, timerText, storedVolume, barVisible, tileToggledBySpace: tilesAfter !== before + 1, pausedBySpace: !afterSpace, undoRestores: onBefore === onRestored, dialogGone, playing, bellsOn, status, fromLink, bpmShown, horizontalOverflowOnPhone: overflow, errors });
  const phase3Ok = startersShown && afterStarter === 'Brown noise' && savedRow.current && savedRow.dots === 1 && /\d:\d\d/.test(timerText) && storedVolume === '0.4' && stillPlayingDuringFade && timerStopped;
  if (!phase3Ok || !playing || bellsOn !== 'true' || !barVisible || afterSpace || onBefore !== onRestored || !dialogGone || overflow || errors.length) process.exitCode = 1;
} finally {
  await browser.close();
  server.httpServer.close();
}
