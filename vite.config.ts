import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';

/** Files from /public that the offline cache must also hold. */
const PUBLIC_FILES = ['manifest.webmanifest', 'favicon.svg', 'icon.svg', 'icon-192.png', 'icon-512.png'];

/**
 * Emits precache.json: the list of every built file. The in-app
 * "download for offline use" button reads it and stores those files in the
 * service worker cache. Nothing is cached unless the user asks for it.
 */
function precacheList(): Plugin {
  return {
    name: 'garsae-precache-list',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = ['./', ...Object.keys(bundle).filter((f) => !f.endsWith('.map')), ...PUBLIC_FILES];
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify(files) });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [preact(), precacheList()],
});
