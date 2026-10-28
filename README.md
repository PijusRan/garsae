# Garsae

Endless, generative focus music in the browser. Toggle instrument tiles, mix their levels, and let it run in the background. Every sound is synthesized live with the Web Audio API, so nothing repeats. See [DESIGN.md](DESIGN.md) for the full design.

> **Disclaimer:** all of the code in this repository was written by AI (Claude, through Claude Code). The design decisions and direction are human; the implementation is not.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm run preview    # serve the build locally
```

Deploy `dist/` to any static host (Vercel, Netlify, Cloudflare Pages). There is no backend. The build uses relative paths, so it also works from a sub-folder.

## Checks

```bash
npm test                       # unit tests: harmony, chord engine, drum mutation, share links, Surprise me
npm run typecheck
npm run smoke                  # renders every tile offline in headless Chromium and prints loudness, peaks, clipping
npm run smoke -- --wavs        # also writes listening WAVs to smoke-output/
npm run build && npm run ui-check   # drives the built app: play, toggle, share link, phone layout, screenshots
```

`smoke` and `ui-check` need Chromium. Set `CHROME_PATH` if it is not at `/usr/bin/chromium-browser`.

## Layout

```
src/
  tiles.ts                 tile catalogue (names, categories, default volumes, loudness levels)
  engine/                  audio engine: plain TypeScript, no React
    engine.ts              public commands: start, stop, setTile, setTileVolume, setEvolution, setBpm, setKey, setModulation
    scheduler.ts           0.8 s look-ahead scheduler, ticked by clock.worker.ts
    chords.ts, theory.ts   hidden chord engine (Dorian) and melodic scale (minor pentatonic)
    evolution.ts           how the Evolution slider maps to mutation, chord swaps, movement and density
    master.ts              mix bus, reverb, tape wobble, amplitude modulation, limiter
    params.ts              glide() helper (no direct .value writes), envelopes
    instruments/           pads, bass, atmosphere, experimental tiles
    drums/                 synthesized drum voices, genre patterns and mutation rules
  state/mix.ts             mix model, share-link encoding, saved mixes, Surprise me
  App.tsx, ui/             React UI and PWA helpers
public/sw.js               service worker, only used after "Download for offline"
```

## Decisions on the open questions

- **Mutation timing.** Drums consider a mutation every 8 bars at low Evolution and every 2 bars at full Evolution. The chance rises from 30% to 100%, and one mutation makes 1 to 3 small edits. At Evolution 0 nothing mutates and chords never change. A soft track that drifts far from its base pattern is pulled back over time. A fill can replace the last beat of each 4-bar phrase.
- **Chord swaps.** After each pass of the 4-chord loop, one chord may be swapped. The chance goes from 10% to 100% across the slider. Distance is measured by shared notes, so low Evolution only picks chords that share 3 of 4 notes. The home chord in slot 1 moves rarely, and the diminished vi chord is never used.
- **Generators.** The chord pad holds close voicings for the whole chord with slow attack and release. Bells play sparse FM notes that move step-wise in the pentatonic scale. The arpeggio plays chord tones snapped to the pentatonic as eighths, with a dotted-eighth echo. Sub bass holds the chord root. Walking bass plays quarter notes and approaches the next root by a scale step. Pulse bass plays steady eighths.
- **Ambient pulse.** It is a soft heartbeat: a muffled low thump on beats 1 and 3, a breathy shaker on the eighths, and an occasional soft tom. It has no snare.
- **Surprise me guardrails.** Every surprise mix has a harmonic bed, picked evenly from warm pad, drone, or a soft arpeggio or glass bells over a bass, and at most 6 tiles. It picks at most one extra melodic layer, one bass, one drum genre, one atmosphere and one noise colour. Breakbeat and techno are rarer and quieter. Effect and beat-tone tiles are never picked, and Evolution stays between 0.15 and 0.5.
- **Binaural vs isochronic.** Both ship as separate tiles at a 14 Hz beta beat, tuned to the key root.
- **Focus presets.** These are not built yet, because the design puts them after the prototype. The engine already exposes amplitude modulation rate and depth through `setModulation`, and the AM tile uses it at 16 Hz.
- **Generative textures.** These are split into two tiles. Granular cloud scatters short pentatonic grains, and Tape wobble adds gentle wow and flutter to the whole mix. Drones already have their own tile.
- **Volume curve.** Sliders map to gain as volume squared. Each tile also has a loudness level, calibrated with `npm run smoke` so that tiles sound roughly equally loud at the same slider position.
- **Last mix.** The current mix is remembered in browser storage and restored on the next visit. A share link takes priority over it.
