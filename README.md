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

Pushes to `main` deploy to GitHub Pages through `.github/workflows/deploy.yml`, once Settings → Pages → Source is set to GitHub Actions. `dist/` also works on any other static host (Vercel, Netlify, Cloudflare Pages). There is no backend. The build uses relative paths, so it also works from a sub-folder.

## Checks

```bash
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
    synth.ts               shared sound design: ensemble chorus, analog pitch drift, saturation
    instruments/           pads, keys, bass, atmosphere and noise colours, effect tiles
    drums/                 synthesized drum voices, genre patterns and mutation rules
  state/mix.ts             mix model, share-link encoding, saved mixes, Surprise me
  App.tsx, ui/             React UI and PWA helpers
public/sw.js               service worker, only used after "Download for offline"
```

## Decisions on the open questions

- **Mutation timing.** Drums consider a mutation every 8 bars at low Evolution and every 2 bars at full Evolution. The chance rises from 30% to 100%, and one mutation makes 1 to 3 small edits. At Evolution 0 nothing mutates and chords never change. A soft track that drifts far from its base pattern is pulled back over time. A fill can replace the last beat of each 4-bar phrase.
- **Chord swaps.** After each pass of the 4-chord loop, one chord may be swapped. The chance goes from 10% to 100% across the slider. Distance is measured by shared notes, so low Evolution only picks chords that share 3 of 4 notes. The home chord in slot 1 moves rarely, and the diminished vi chord is never used.
- **Generators.** The chord pad holds close voicings for the whole chord with slow attack and release. Bells play sparse struck-bar notes that move step-wise in the pentatonic scale. The soft arpeggio plays one short broken-chord phrase per bar (chord tones snapped to the pentatonic, between G3 and D5), on calm rhythms from quarters and dotted quarters to a few eighths. Each phrase rises, falls or arches, starts near where the last one ended and fades towards its end, and some bars rest; Evolution allows busier rhythms and fewer rests. A quiet, dark dotted-quarter echo trails behind it. Sub bass holds the chord root. Walking bass plays quarter notes and approaches the next root by a scale step. Pulse bass plays steady eighths. The electric piano comps rolled chord voicings (sometimes rootless) on downbeats and sparse offbeats. The choir holds the chord in four voices and changes vowel (oo, oh, ah) on some chord changes. Glide bass is one monophonic line per bar that slides between root, fifth and octave and steps into the next chord. FM bass plays a relaxed two-feel: long notes on 1 and 3 (beat 3 sometimes rests or takes the fifth), with an occasional short octave or fifth on the "and" of 2 or 4, and a step into the next chord's root. Rolling bass repeats one of four syncopated one-bar riffs on root, octave and fifth, and Evolution swaps the riff.
- **Brushes.** Played beat by beat like a trio drummer, not from a 16th grid. The swung skip note falls at the tempo's swing ratio (about 2.6:1 at 60 bpm, flattening to 2.1:1 at 130, as measured jazz ride players do). Each limb has its own feel: the ride pushes about 6 ms ahead, the snare hand lays back about 12 ms, plus a few ms of looseness and level variation on every hit. The ride plays "ding, DING-a" accented on 2 and 4, with an occasional extra skip or triplet. The left hand sweeps a circle through every beat, alternating direction. There are brush pats and the hi-hat foot on 2 and 4, a feathered kick on all four beats with an occasional bomb, sparse snare chatter on swung offbeats, and triplet fills at phrase ends.
- **Breakbeat.** Tight, as electronic music uses breaks: near-quantized (2% swing, ±1 ms), a short punchy kick, a crisp snare, 16th hats with an open hat on the turnaround, then a fast bus compressor and saturation, left bright. The last beat of a 4-bar phrase may become a 32nd-note snare roll rising into the downbeat (more often with Evolution).
- **Ambient pulse.** It is a soft heartbeat: a muffled low thump on beats 1 and 3, a breathy shaker on the eighths, and an occasional soft tom. It has no snare.
- **Surprise me guardrails.** Every surprise mix has a harmonic bed, picked evenly from warm pad, drone, choir, or a soft arpeggio, glass bells or electric piano over a bass, and at most 6 tiles. It picks at most one extra melodic layer, one bass, one drum genre, one atmosphere and one noise colour. Breakbeat and techno are rarer and quieter. Effect tiles are never picked, and Evolution stays between 0.15 and 0.5.
- **Focus presets.** These are not built yet, because the design puts them after the prototype. The engine already exposes amplitude modulation rate and depth through `setModulation`, and the AM tile uses it at 16 Hz.
- **Generative textures.** Tape wobble adds gentle wow and flutter to the whole mix, and drones have their own tile. The Experimental category (binaural, isochronic, granular cloud) was removed.
- **Sound design.** Plain oscillators sound like an old game, so every voice borrows a standard studio-synth recipe. The electric piano is DX7-style FM (algorithm 5: a body pair and a 14:1 tine pair that fades fast) with a suitcase tremolo, and the choir sings detuned saws with delayed vibrato and breath through vowel formants. The glide bass runs through two cascaded lowpasses (24 dB, Moog-like), and the FM bass is the DX7 electric-bass recipe: a sine with a 1:1 modulator whose index drops quickly after each note. Brushes are swept and slapped filtered noise. The warm pad stacks three detuned, drifting saws per note through a filter that opens with the swell and a Juno-style ensemble chorus. Glass bells are additive struck bars (partials at 1, 2.76 and 5.40 times the fundamental, with a slowly beating twin and a mallet tick). The arpeggio is a felt-mallet marimba (partials at 1, 4 and 9.8 times the fundamental, low notes ringing longer, a soft wooden knock), and the drone also drifts and runs through the chorus. The walking bass is an upright-style pluck with a pitch settle and finger thump, and the pulse bass is two detuned saws, gently saturated. The kick has a beater click and soft drive, the snare has two shell modes plus wires, and the hats use the TR-808's six square-wave metal cluster. All of it is plain Web Audio nodes, with no AudioWorklet or samples.
- **Volume curve.** Sliders map to gain as volume squared. Each tile also has a loudness level, calibrated with `npm run smoke` so that tiles sound roughly equally loud at the same slider position.
- **Last mix.** The current mix is remembered in browser storage and restored on the next visit. A share link takes priority over it.
