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

  // A share link round-trips through the URL hash.
  await page.goto(`${url}#t=drone.50,dub.40,wind.30&e=60&b=100&k=2`);
  await page.waitForSelector('.tile');
  const fromLink = await page.$$eval('.tile.on .tile-name', (els) => els.map((e) => e.textContent));
  const bpmShown = await page.$eval('output.value', (el) => el.textContent);

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto(url);
  await page.waitForSelector('.tile');
  await page.screenshot({ path: 'smoke-output/phone.png', fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

  console.log({ playing, bellsOn, status, fromLink, bpmShown, horizontalOverflowOnPhone: overflow, errors });
  if (!playing || bellsOn !== 'true' || overflow || errors.length) process.exitCode = 1;
} finally {
  await browser.close();
  server.httpServer.close();
}
