# Garsae: Design Decisions

Name: **Garsae**. A modern background-noise / focus-music app where the user picks instruments and the app generates endless, non-repeating music around them.

Guiding principle: it is a **background player, never a distractor.** All changes must be gentle.

## Project
- **Platform:** web app / PWA built on the Web Audio API. Desktop and phone, installable.
- **Hosting:** free static host (Vercel / Netlify / Cloudflare Pages), no backend.
- **Audience:** just the author first, maybe public later.
- **First milestone:** playable prototype with one pad, drums and a noise bed, plus mixer tiles, to prove the sound feels good.
- **Prototype success test:** pass if the author can **work with it for 1 hour without noticing it** (no fatigue, no distraction).

## Core interaction
- UI works like a background-noise selector: **toggle instruments as tiles, then mix their levels**.
- User controls are limited to: instrument tiles with volumes, drum genre tiles, optional **BPM** and **key**, and the **Evolution slider**. Everything else stays simple.
- Everything not chosen by the user is **random/generative**: drum pattern details, pad melodies, rhythms, chord movement.
- The **Evolution slider** (static to constantly shifting) scales:
  - how often drum patterns mutate and how much
  - how often and how far the chords wander
  - filter / texture movement
  - note density

## Sound source
- **Fully synthesized in real time.** No sample library. Small app, infinite variation.

## Instruments (v1)
Each instrument is a tile. Pads, bass and arps read from a shared hidden chord engine (see Harmony) so everything fits.

| Category | Tiles |
|---|---|
| Pads | warm chord pad, glass bells / sparse notes, soft arpeggio, drone |
| Bass | sub bass, warm walking bass, pulse bass |
| Drums | one tile per genre (see Drums) |
| Texture | vinyl crackle, wind / air, room hum / machine, brown / pink / green noise (rain dropped for v1) |
| Effects | amplitude modulation, tape wobble (they shape the whole mix and make no sound alone) |
| Experimental | binaural / isochronic tones, granular cloud |

### Pads / melodies
- **Each instrument defines its own generator**; there is no single global method. For example, the chord pad drifts between chords, the bells play sparse notes, and the arpeggio arpeggiates.

### Experimental tiles
Sounds that might aid focus. No claims are made in v1.
- **Binaural / isochronic tones**: binaural needs headphones; the evidence is mixed.
- **Noise colours**: brown / pink / green noise variants.
- **Amplitude modulation**: gentle pulsing applied to the mix, beta range (~12-20 Hz). This tile is the v1 test bed for the later Focus feature, which replaces it (see Focus method).
- **Generative textures**: granular clouds, drones, tape wobble.

## Harmony
- **Key:** user picks the **root note**; the scale is fixed and mellow so random notes never clash:
  - the chord engine uses **Dorian**
  - melodic notes (bells, arps, sparse notes) are limited to **minor pentatonic** on the same root
- **Chord engine:** a slow loop of **4 chords, each lasting 2-4 bars**. Every so often, **one chord in the loop is swapped** for another chord in the scale. Evolution controls how often this happens and how far the new chord is from the old one.

## Tempo
- Manual BPM range: **60-130**.
- If BPM/key are not set: **random on start within the calm range 60-90 BPM** and a random key. "Surprise me" re-rolls them in the same range.
- All instruments and drum genres follow the single global BPM.

## Drums
- Each **drum genre is its own tile with its own volume**. Several genres can be on at once and **layer** together.
- v1 genres: **Lo-fi hip hop, Minimal techno/house, Dub/downtempo, Ambient pulse, Breakbeat** (amen / scatter-break flavour).

### Mutation rules (all genres except breakbeat)
- Every few bars, a pattern may: add/remove a ghost hit, shift a hit by one step, swap in a small fill on the last bar, or change the velocity/accent pattern.
- **Core hits stay fixed** (kick, main snare); only soft hits (ghost notes, hats, fills) mutate.
- Evolution scales how often and how much.

### Breakbeat
- A full, authentic busy break; **no automatic thinning**. The user controls its volume, and it defaults to soft and low in the mix so it stays in the background.
- It mutates **more freely** than other genres, like real break programming: slices are rearranged and scattered, core hits included. Evolution still scales how often and how much.

## Session features (v1)
- **Save/load mixes** locally (browser storage, no account).
- **"Surprise me"**: random instruments, drum genres, volumes, BPM and key, with guardrails for a balanced, calm result.
- **Share by link**: mix state is encoded in the URL, with no backend.
- Saved mixes and share links store **settings only, never a random seed**, so the music is different on every play. Stored settings:
  - instrument tiles on/off and their volumes
  - drum genre tiles on/off and their volumes
  - Evolution setting
  - Focus preset (once that feature exists)
  - BPM and key, **only if the user set them**. If they were left random, they stay random when the link is opened.
- **Starter mixes**: five curated presets, offered on the first visit and in the Mixes sheet.
- **Session timer**: 25 / 50 / 90 min. It fades out over the last 30 s, then stops. Pausing cancels it.
- **Undo** instead of confirmations: Surprise me, loading a mix or link, Clear, and deleting or overwriting a saved mix all show an Undo toast.

## Playback
- v1: tab open is fine. Background/lock-screen playback is deferred (it needs the Media Session API and throttle-proof timing later).

## UI
- **Dark, minimal, glassy.** Soft glows, large rounded tiles.
- Tiles are **grouped by category**: tap to toggle, drag/slider for volume.
- Optional BPM and key controls, the Evolution slider, and a "Surprise me" button. On phones, tempo and key sit behind a "Tempo & key" disclosure.
- A master volume (after the limiter) next to the play button.
- An "On now" strip lists the active tiles. A compact player bar appears once the main play button scrolls away.
- Media keys and OS media overlays work through the Media Session API. Space toggles playback unless a keyboard user is on a button.

## PWA details
- **Offline:** user-controlled. An in-app "download for offline use" option caches the app (it's small, since all audio is synthesized). Not forced by default.
- **Updates:** auto-update on next launch; never interrupts playing music.
- **Install:** standalone window via the browser menu, with a small unobtrusive install button. No install nagging.
- **Storage:** browser storage only (saved mixes and settings). Clearing site data loses them; no export/import in v1.

## Stack
- **TypeScript + Vite + React.**
- Audio engine: **raw Web Audio API**, no audio library. It is a plain TypeScript module with no React inside; the UI only sends commands (e.g. `setInstrumentVolume`). An AudioWorklet can be added later for individual experimental instruments that need it.
- The engine needs: a look-ahead scheduler, envelope helpers, reverb and noise generators.

### Engine rules
- **Scheduler clock in a Web Worker.** Only the timer tick runs in the Worker; scheduling stays on the main thread. This avoids background-tab timer throttling and is groundwork for later background playback.
- **Large look-ahead (~0.5-1 s).** Nothing needs fast reaction, so a deep buffer makes playback resilient to hiccups. Toggling a tile fades it in or out with gain instead of cancelling notes already scheduled.
- **Master limiter.** A `DynamicsCompressorNode` set up as a limiter sits on the output, and each tile keeps some headroom, so layered tiles never clip or jump in loudness.
- **No direct `.value` writes.** Every parameter change (volume, filter, Evolution) goes through `setTargetAtTime` or ramps via one helper, to avoid clicks.
- **iOS from day one:**
  - set `navigator.audioSession.type = "playback"` (Safari 16.4+) so the ringer switch doesn't mute audio
  - resume the `AudioContext` from a user tap
  - audio stops when the screen locks; accepted for v1 (see Playback)

## "Brain function" angle
- **v1: just good focus music.** No science claims.
- **Later:** adopt a proven focus method. The engine should expose noise colour, tempo, modulation rate and stereo/oscillator control as parameters, so a "focus profile" can be added as a preset layer without a rewrite.
- Engineering cost of adding it later is low. The real work is choosing a method with credible evidence.

### Research: brain-function methods (2026-10-26)
Evidence ranking, strongest first. This was a quick web search only and the primary papers were not read, so treat these as leads.
1. **Instrumental only, no lyrics.** The most robust finding: lyrics hurt reading, memory and verbal tasks, while instrumental music is roughly neutral. Garsae already satisfies this.
2. **Amplitude-modulated music (beta range, ~12-20 Hz).** A 2023 *Communications Biology* paper (McMahon et al.) found improved sustained attention compared with pink noise and control music, with the largest effect in people with high ADHD symptoms. Caveat: the music came from Brain.fm, which is commercial, so independent replication is needed.
3. **Binaural beats.** A 22-study meta-analysis reports a medium effect (g = 0.45), but other reviews are mixed or contradictory (14 studies: 5 for, 8 against, 1 mixed). Needs headphones. Exposure before the task may matter more than during it.
4. **Noise colours (pink/brown/white).** Popular, but no strong head-to-head evidence was found. Useful mainly for masking.
5. **Tempo.** One small study found that fast tempo helped recall; preliminary only.
6. **Task difficulty / personality:** background music tends to hurt difficult tasks and introverts more.

Sources: [binaural meta-analysis](https://pubmed.ncbi.nlm.nih.gov/35842538/), [Southampton](https://eprints.soton.ac.uk/488754), [ADDitude on AM study](https://www.additudemag.com/background-music-amplitude-modulation-adhd-study/), [Northeastern](https://news.northeastern.edu/2025/01/14/music-for-adhd-focus/), [lyrics study](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10162369/), [background music review](https://livrepository.liverpool.ac.uk/3166444/), [tempo study](https://link.springer.com/article/10.1007/s41809-024-00144-8).

### Focus method (decided)
- After the v1 prototype, adopt **amplitude modulation** (beta range, ~12-20 Hz) applied to pads and noise. This replaces the experimental AM tile.
- UI: a single **Focus toggle with presets (Off / Light / Strong)**. No numbers are shown.
- Binaural beats stay available as an experimental tile only; they are not the main method.

## Open questions
- **Mutation timing:** what "every few bars" means exactly, and how the Evolution slider maps to mutation rate and size.
- **Generators:** how each pad / bass / arp generator works in detail (note choice, rhythm, density).
- **Drum genres:** what defines "Ambient pulse" musically.
- **"Surprise me" guardrails:** e.g. max number of active tiles, volume balance rules, whether to avoid stacking busy drum genres.
- **Binaural vs isochronic:** whether to ship one or both as tiles.
- **Focus presets:** what Light vs Strong mean in modulation depth and rate.
