// Renders every tile offline in headless Chromium and prints audio stats.
// Usage: npm run smoke [-- --wavs] [-- --compare]   (needs Chromium; set CHROME_PATH if it is not /usr/bin/chromium-browser)
// --compare renders only the tiles with an alternate voice (src/engine/alternates), against their own voices.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const wantWavs = process.argv.includes('--wavs');
const wantCompare = process.argv.includes('--compare');
const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium-browser',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
  // Every tile and scene renders in one call, which takes minutes.
  protocolTimeout: 900_000,
});
let failed = false;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => {
    failed = true;
    console.error('PAGE ERROR', e.message);
  });
  await page.goto(`${url}smoke.html`);
  await page.waitForFunction(() => typeof window.runSmoke === 'function');
  const result = await page.evaluate((w, c) => window.runSmoke({ wavs: w, compare: c }), wantWavs, wantCompare);
  console.log(`\nMeter reference (997 Hz, 0 dBFS, one channel): ${result.reference} LUFS, should be about -3.0`);
  if (Math.abs(result.reference + 3.01) > 0.2) {
    failed = true;
    console.error('FAIL the loudness meter is out of calibration');
  }
  if (wantCompare) {
    console.log('\nAlternate voices, solo at a low volume, against the tiles\' own voices:');
    console.table(result.compare);
  } else {
    console.log('\nSolo tiles at full volume (stats after the fade-in):');
    console.table(result.solo);
    console.log('\nScenes:');
    console.table(result.scenes);
  }
  for (const s of [...result.solo, ...result.scenes, ...(result.compare ?? [])]) {
    if (s.nans > 0 || s.clipped > 0) {
      failed = true;
      console.error(`FAIL ${s.name}: ${s.nans} invalid samples, ${s.clipped} clipped samples`);
    }
  }
  if (wantWavs) {
    mkdirSync('smoke-output', { recursive: true });
    for (const [name, b64] of Object.entries(result.wavs)) {
      const file = `smoke-output/${name.replace(/[^a-z0-9]+/gi, '-')}.wav`;
      writeFileSync(file, Buffer.from(b64, 'base64'));
      console.log('wrote', file);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
