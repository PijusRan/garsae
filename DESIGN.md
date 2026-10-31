# Garsae: Design Decisions

Name: **Garsae**. A modern background-noise / focus-music app where the user picks instruments and the app generates endless, non-repeating music around them.

Guiding principle: it is a **background player, never a distractor.** All changes must be gentle.

## Project
- **Platform:** web app / PWA built on the Web Audio API. Desktop and phone, installable.
- **Hosting:** GitHub Pages (any static host works), no backend.
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
| Pads | warm chord pad, glass bells / sparse notes, soft arpeggio, drone, electric piano, choir |
| Bass | sub bass, warm walking bass, pulse bass, glide bass, FM bass, rolling bass |
| Drums | one tile per genre (see Drums) |
| Texture | vinyl crackle, wind / air, room hum / machine, brown / pink / green noise (rain dropped for v1) |
| Effects | amplitude modulation, tape wobble (they shape the whole mix and make no sound alone) |

### Pads / melodies
- **Each instrument defines its own generator**; there is no single global method. For example, the chord pad drifts between chords, the bells play sparse notes, and the arpeggio arpeggiates.

### Focus-aid tiles
- **Noise colours**: brown / pink / green noise variants (Texture).
- **Amplitude modulation**: gentle pulsing applied to the mix, beta range (~12-20 Hz). This tile is the v1 test bed for the later Focus feature, which replaces it (see Focus method).
- The Experimental category (binaural and isochronic tones, granular cloud) was removed: the beat tones had weak evidence and the granular cloud didn't earn its place next to the pads.

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
- Genres: **Lo-fi hip hop, Minimal techno/house, Dub/downtempo, Ambient pulse, Breakbeat** (amen / scatter-break flavour), **Brushes** (soft jazz swing). Six per category, so each fits one row on desktop.

### Mutation rules (all genres except breakbeat)
- Every few bars, a pattern may: add/remove a ghost hit, shift a hit by one step, swap in a small fill on the last bar, or change the velocity/accent pattern.
- **Core hits stay fixed** (kick, main snare); only soft hits (ghost notes, hats, fills) mutate.
- Evolution scales how often and how much.

### Breakbeat
- A full, authentic busy break, **tight like electronic music** (near-quantized, compressed, bright), with occasional 32nd-note snare rolls into phrase ends; **no automatic thinning**. The user controls its volume, and it defaults to soft and low in the mix so it stays in the background.
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
A compact mix panel, then the tiles, then the sound settings. No hero: the page opens straight onto the instrument.
- One **transport** holds playback: the mark and wordmark, a labelled **Play / Pause** pill (an icon-only circle on phones), chord with key and tempo, master volume (after the limiter), the session timer, Mixes, Share and About. Share lives only here, as one icon button, at every width. On wide screens it is a glass bar as wide as the page, stuck to the top; on phones it floats at the bottom, in thumb reach.
- Picking a whole mix (a starter, Surprise me or a saved mix) while stopped also starts playback. Play with nothing on says "Pick a sound first" instead of playing silence.
- Under it, the **Mix** panel: Surprise me and Mixes, then compact rows: **On now** (active tile names; tap to jump to the tile, plus Clear) and **Starters** (on a first visit, or when nothing is on), shown as small secondary pills because they are actions.
- Tiles are **grouped by category** under bracketed micro labels (`[ PADS ]`) with a hairline rule and an "N on" count: tap to toggle, slider for level. The page is up to 1240px wide, so most categories fit on one row.
- Below the tiles, the **Sound** panel: Evolution, tempo and key, which most mixes leave alone. On wide screens they share one row; on phones tempo and key go behind a "Tempo and key" disclosure.
- Media keys and OS media overlays work through the Media Session API. Space toggles playback unless a keyboard user is on a button.

## Visual language
The goal is a calm, cinematic instrument: black ground, warm light, very little chrome. The look follows a cinematic landing page, compressed into a dense app layout. `src/styles.css` implements these rules; check new UI against them.

**Colour**
- Ground is pure black (`--bg`). Surfaces are white at low alpha (2.5-10%) over near-black, so the background light shows through them. Edges are white hairlines at 8% and 14%.
- Text is warm cream `--text` `#f9f7e9`, then `--text-2` `#c4c1b5` and grey `--text-3` `#8e8e8e`.
- **Light is the accent**: peach `--accent` `#ffc5a8`, coral `--coral` `#fa7641` for glows, ember `--ember` for the deepest note. It marks only: on state (the light rising in on tiles, "N on" counts), focus rings, the active timer, the current mix, the play button while playing, and the first-press invite ring around Play (a first visit or an opened share link; still, not pulsing, under reduced motion). No other hues, except the category marks and the sliders, which follow the background.
- Category marks keep one lightness and chroma, varying hue only. They appear only as 6px dots (mix fingerprints in the Mixes sheet).

**Type**
- Bricolage Grotesque (variable with the optical-size axis, self-hosted through `@fontsource-variable/bricolage-grotesque/opsz.css`, so it works offline). Chosen over Inter, which felt generic; it keeps the same optical-size setup, so small text stays plain and large text gets its more characterful display shapes.
- Display text is weight 500 with tight tracking: sheet titles and the wordmark -0.03em, tile and mix names -0.02em. Body 13-15px.
- **Micro labels** are the only uppercase: 11px, +0.06em tracking, grey, optionally in brackets (`.micro`, `.bracket`). Used for section labels, scale ends, footer text and links, and Undo.
- Tabular numerals for anything that counts.

**Surfaces and glass**
- Glass is for layers that float (the transport, sheets and the toast) and for the tiles. Tiles are frosted: a 42% dark tint over a 16px backdrop blur, a diagonal sheen that catches the light at the top left, a lit top edge and a shaded bottom edge (`--tile-edge`). Without backdrop-filter they fall back to a near-opaque tint. Never glass inside other glass, such as glass tiles inside the Sound panel.
- The background is **Grainient** from React Bits (`src/ui/Grainient.tsx`, vendored with its MIT + Commons Clause notice; wrapped by `src/ui/Background.tsx`): a slow, domain-warped grainy gradient whose colours come from the mix (`src/ui/palette.ts`), always near-black at the bottom and lit towards the top. **Key sets the hue**, walked around the circle of fifths so related keys get neighbouring hues (C is cobalt, G violet, A crimson, A♭ green); **tempo sets the vividness** (slow mixes deeper and muted, fast ones more saturated and a little brighter); **evolution sets the hue spread** across the gradient (a static mix is one hue, a shifting one sweeps across its neighbours). Colours are built in OKLCH and fitted into sRGB by lowering chroma, so no key clips. A new mix glides to its colours over a few seconds (instantly under reduced motion). Sliders take the same colours (`--slider-mid`, `--slider-end`, cream into the two brightest stops, registered with `@property` so they glide too) rather than the peach accent. Paused, it is dimmer (75% opacity) and barely flows; while music plays it brightens over a couple of seconds and flows faster with the mix's loudness (read from an analyser after the limiter, so the volume knob doesn't change it). Pointer stirring and click swirls are off, and its grain is static: the background never reacts to the pointer. It renders at 1x pixel ratio (the gradient field at half of that) and at about 30 fps, mounts after the first paint so the shaders never delay the UI, fades in on load, creates a fresh canvas on every mount (a lost WebGL context never comes back, and StrictMode mounts twice in development), and stands still under reduced motion.
- Film grain (an SVG noise overlay) sits over everything.

**Shape and depth**
- Buttons, the segmented control, selects, the save field and the toast are pills. Surfaces are small-radius rectangles: 6 (icon buttons), 8 (tiles, transport), 12 (panel, sheets).
- **Primary** (`.btn.black` / `.btn.primary`): black pill, faint white hairline, a 4px glass halo, and a warm glow on hover. **Secondary**: a dark vertical gradient pill with a hairline. Ghost for the rest. Press scales to 0.97. Nothing lifts on hover; the idle Play button only gains a soft glow.
- On tiles keep the glass and add a peach rim, light rising from the bottom edge (a radial coral glow plus a 1px cream line), and a soft coral shadow beneath.
- Sliders: a 2px track lit cream into the background's two brightest colours up to the value, and a cream thumb with a black ring that glows on hover. 44px tall on touch.
- Tiles show only their name, centred. On hover or keyboard focus the name rises and the description slides in beneath it (transforms only, so tiles never resize); touch screens, which cannot hover, show names only. The effect mark sits beside the name.

**Icons and controls**
- One SVG icon set (`src/ui/icons.tsx`): 20px grid, 1.5px stroke, round caps. The mark (`MarkIcon`) is the eclipse setting over the horizon; the app icon matches it, and the browser tab shows the mark itself (`public/favicon.svg`), black on light themes and `--text` on dark. No emoji or unicode glyphs as icons.

**Motion**
- `cubic-bezier(.2,.8,.2,1)`. 120ms for press and toggle, 200ms for hover, 320ms for sheets. Everything respects `prefers-reduced-motion`.
- **Tile on/off:** turning a tile on, the coral glow swells up from below its bottom edge and the cream line opens out from the centre (520ms), then the slider fades up into place just behind it. Turning off runs the light back down and the line closes to the centre, quicker (280ms). A pressed tile dips to 98.5%. These are transitions, not keyframes, so tiles already on when the page loads don't animate.

## PWA details
- **Offline:** user-controlled. An in-app "download for offline use" option caches the app (it's small, since all audio is synthesized). Not forced by default.
- **Updates:** auto-update on next launch; never interrupts playing music.
- **Install:** standalone window via the browser menu, with a small unobtrusive install button. No install nagging.
- **Storage:** browser storage only (saved mixes and settings). Clearing site data loses them; no export/import in v1.

## Stack
- **TypeScript + Vite + Preact** (through its React compatibility layer, so the code imports from `react`). Chosen over React for the bundle size: about 4 KB instead of 45 KB gzipped.
- Audio engine: **raw Web Audio API**, no audio library. It is a plain TypeScript module with no UI framework inside; the UI only sends commands (e.g. `setInstrumentVolume`). An AudioWorklet can be added later for individual experimental instruments that need it.
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
- Binaural beats are not offered; the evidence is mixed and they need headphones.

## Open questions
- **Mutation timing:** what "every few bars" means exactly, and how the Evolution slider maps to mutation rate and size.
- **Generators:** how each pad / bass / arp generator works in detail (note choice, rhythm, density).
- **Drum genres:** what defines "Ambient pulse" musically.
- **"Surprise me" guardrails:** e.g. max number of active tiles, volume balance rules, whether to avoid stacking busy drum genres.
- **Focus presets:** what Light vs Strong mean in modulation depth and rate.
