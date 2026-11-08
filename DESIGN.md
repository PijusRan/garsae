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
| Pads | warm chord pad, glass bells / sparse notes, soft arpeggio, drone, electric piano, choir, felt piano, string ensemble, vibraphone, tape flute |
| Bass | sub bass, warm walking bass, pulse bass, glide bass, FM bass, rolling bass, Reese bass, fretless bass, 808 bass, muted bass |
| Drums | one tile per genre (see Drums) |
| Texture | vinyl crackle, wind / air, room hum / machine, brown / pink / green noise (rain dropped for v1) |
| Effects | amplitude modulation, tape wobble (they shape the whole mix and make no sound alone) |

### Pads / melodies
- **Each instrument defines its own generator**; there is no single global method. For example, the chord pad drifts between chords, the bells play sparse notes, and the arpeggio arpeggiates.
- Acoustic instruments copy the physics that makes them recognisable rather than a general synth patch: the felt piano's partials follow the stiff-string formula, the vibraphone's bars are tuned 1:4:10 with a motor tremolo, the string ensemble uses three detuned paths per note like the first string machines.

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
- Genres: **Lo-fi hip hop, Minimal techno/house, Dub/downtempo, Ambient pulse, Breakbeat** (amen / scatter-break flavour), **Brushes** (soft jazz swing), **Deep house, Trip hop, Liquid drum and bass** (the two-step at double time), **Bossa nova**. Ten per category, in two rows of five on desktop. Hats, shakers and rims sit a little off centre (`KIT_PAN` in `drums/genres.ts`); kick, snare and clap stay in the middle.

### Mutation rules (all genres except breakbeat)
- Every few bars, a pattern may: add/remove a ghost hit, shift a hit by one step, swap in a small fill on the last bar, or change the velocity/accent pattern.
- **Core hits stay fixed** (kick, main snare); only soft hits (ghost notes, hats, fills) mutate.
- Evolution scales how often and how much.

### Breakbeat
- The **Amen break**, the most sampled drum break there is: G. C. Coleman's four bars from The Winstons' "Amen, Brother" (1969), as recorded, tight and compressed. It is the one tile that never mutates, whatever Evolution says, because its value is that people recognise it. The original runs at about 136 BPM, just above the tempo slider's 130.

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

## Language
- English and Lithuanian. English is the source (`src/i18n/en.ts`, with tile and starter names read from `src/tiles.ts` and `src/state/presets.ts`); `src/i18n/lt.ts` must match its shape, so a missing translation doesn't compile.
- The app follows the browser's language until someone picks one, on the welcome screen or in About. That choice is kept in `garsae.lang`. Languages are named in themselves (English, Lietuvių).
- A saved mix keeps the name it was saved with. Note names, chord symbols and "bpm" are not translated.
- Avoid wording that needs Lithuanian plural forms: "Įjungta: 3" rather than a counted noun.
- Keep tile names short enough for one line at the 164px minimum tile width.
- The web app manifest is a static file, so the installed app's name and description stay as they are.

## Playback
- v1: tab open is fine. Background/lock-screen playback is deferred (it needs the Media Session API and throttle-proof timing later).

## UI
The app is **one screen**: the page never scrolls, and adding sounds shouldn't need layout work. From 900px wide, a **sidebar** holds everything you control and the rest of the window is the instrument. No hero: the page opens straight onto the instrument. A first visit opens once on a full-screen **welcome** instead, and share links skip it: the live background, the mark drawing itself, large display type and the five starters as tile-like cards with their descriptions, plus a way to build your own. Hovering or focusing a starter glides the background to that starter's colours, and picking one plays it in that key while the welcome fades and the instrument comes up underneath. This is the one exception to the rule against a hero, because a first-time visitor has no mix to come back to.
- The **sidebar**, top to bottom: the living mark and wordmark with Share and About beside them, a large labelled **Play / Pause**, chord with key and tempo, master volume (after the limiter), the session timer, the mix actions, then the sound settings. Each action lives in one place. One set of markup serves every width: under 900px `.sidebar` and its contents dissolve into the page, and the same **transport** becomes a glass bar, along the top on tablets and at the bottom on phones, in thumb reach, with Play an icon-only circle there.
- Picking a whole mix (a starter, Surprise me or a saved mix) while stopped also starts playback. Play with nothing on says "Pick a sound first" instead of playing silence.
- The **mix actions** are Surprise me, **Save mix** and Mixes, plus Clear. Save mix saves in one click under the suggested name, with Undo; it shows Saved when the current mix is already kept, and renaming stays in the Mixes sheet. **Starters** appear above the tiles when nothing is on, and are always in the Mixes sheet. Phones show the mark and wordmark above the actions, because their transport is at the bottom.
- Tiles are **grouped by category** into rows sharing the height, under a bracketed micro label (`[ PADS ]`) with an "N on" count: tile height tops out around 100px, with clear space between them (14px across, more between rows on tall windows). Tap to toggle, slider for level. A new category is one more row, and a seventh tile wraps. If rows ever outgrow the window they scroll inside `.stage`.
- The **sound settings** (Evolution, tempo and key) sit in the sidebar with no surface of their own, since it is already glass.
- Under 1280px wide six tiles no longer fit, so **tabs** show one category at a time, each with a count of what is on. Under 900px the sound settings are a tab too. Only CSS decides all this. Below 540px tall the tiles scroll with the rest of the page area, and the sidebar scrolls on its own, so browser zoom loses nothing.
- Media keys and OS media overlays work through the Media Session API. Space toggles playback unless a keyboard user is on a button.

## Visual language
The goal is a calm, cinematic instrument: black ground, warm light, very little chrome. The look follows a cinematic landing page, compressed into a dense app layout. `src/styles.css` implements these rules; check new UI against them.

**Colour**
- Ground is pure black (`--bg`). Surfaces are white at low alpha (2.5-10%) over near-black, so the background light shows through them. Edges are white hairlines at 8% and 14%.
- Text is warm cream `--text` `#f9f7e9`, then `--text-2` `#c4c1b5` and grey `--text-3` `#8e8e8e`.
- **One accent**: peach `--accent` `#ffc5a8`. It marks only: on state (the light rising in on tiles, "N on" counts), focus rings, the active timer, the current mix, the play button while playing, and the first-press invite ring around Play (a first visit or an opened share link; still, not pulsing, under reduced motion). No other hues, except the category colours and the sliders, which follow the background.
- **Category colours** (`--cat-*`) keep one lightness and chroma with hues spread apart: pads amber, bass blue, drums rose, texture green, effects violet. Each has a deep twin (`--cat-*-deep`) for fills. They colour the category labels, a 3px edge on every tile (dim at rest, full when on), the fill of a tile that is on, its slider and its wave, and the dots in mix fingerprints.

**Type**
- IBM Plex Sans (variable weight, self-hosted through `@fontsource-variable/ibm-plex-sans/wght.css`, so it works offline). A plain, engineered face that suits an instrument panel; it replaced Bricolage Grotesque, which read as a trendy landing-page pick. It covers Lithuanian.
- Display text is weight 500 with slight tracking: sheet titles and the wordmark -0.015em, tile and mix names -0.01em. Body 13-15px, untracked.
- **No uppercase, no brackets, no letter-spaced labels.** Section labels (`.micro`) are 13px, weight 500, sentence case, in `--text-2`. Clear is a plain underlined text button; Undo in the toast is an accent text button.
- Tabular numerals for anything that counts.

**Surfaces and glass**
- **No glass, sheen or glow.** Surfaces are opaque, flat warm near-blacks (`--panel`, `--panel-2` for hover and on, `--panel-3`) with a hairline edge. Nothing blurs what is behind it. Only layers that float over the page, sheets and the toast, cast a plain shadow.
- The background (`src/ui/Background.tsx`) is six **flat horizontal bands**, darkest at the bottom, whose colours come from the mix (`src/ui/palette.ts`). **Key sets the hue**, walked around the circle of fifths so related keys get neighbouring hues (C is cobalt, G violet, A crimson, A♭ green); **tempo sets the vividness** (slow mixes deeper and muted, fast ones more saturated); **evolution sets how far the hue walks** from band to band (a static mix is one hue, a shifting one sweeps across its neighbours). The bands stay dark (OKLCH lightness 0.10 to 0.31) so cream text reads on every one. Colours are built in OKLCH and fitted into sRGB by lowering chroma, so no key clips. A new mix glides to its colours over a couple of seconds (`@property --band-*`; instantly under reduced motion). Sliders take a brighter ramp in the same hues (`--slider-mid`, `--slider-end`) rather than the peach accent. Paused, it is dimmer (70% opacity); it brightens over a couple of seconds when music starts. Nothing else moves: no gradient mesh, no grain, no pointer or loudness reaction.

**Shape and depth**
- Buttons, the segmented control, selects, the save field and the toast are pills. Surfaces are small-radius rectangles: 6 (icon buttons), 8 (tiles, transport), 12 (panel, sheets).
- **Primary** (`.btn.black` / `.btn.primary`): black pill with a hairline. **Secondary**: a flat `--panel-2` pill with a hairline. Ghost for the rest. Press scales to 0.97. Nothing lifts or glows on hover; fills step one shade lighter.
- The Play button is a solid cream pill, solid peach while playing. No halo.
- **Tile waves:** a tile that is on and playing draws its own sound as a soft frequency silhouette rising from the bottom edge, in its category colour at low opacity behind the name (`src/ui/TileWave.tsx`). It is a shape, not a meter: smoothed, one shared 24 fps loop, normalised to the tile's own peak and scaled by its slider. It falls flat on pause, stops with the tab hidden, and is absent under reduced motion. Effect tiles make no sound of their own, so they have none.
- Sliders: a 2px track lit cream into the background's two brightest colours up to the value, and a cream thumb with a black ring that turns white on hover. 44px tall on touch.
- Tiles show their name with the description always beneath it, on touch screens too; only very short windows (`.shorter`) drop the description. The effect mark sits beside the name.

**Icons and controls**
- One SVG icon set (`src/ui/icons.tsx`): 20px grid, 1.5px stroke, round caps. The mark (`MarkIcon`) is the eclipse setting over the horizon; the app icon matches it, and the browser tab shows the mark itself (`public/favicon.svg`), black on light themes and `--text` on dark. No emoji or unicode glyphs as icons.
- **The living mark** (`src/ui/LiveMark.tsx`) is the brand's signature: at rest it is exactly the logo. When music starts the eclipse rises clear of its horizon over a couple of seconds and glows with the loudness; when music stops it sets again, and over the timer's last 30 seconds it sets with the fade. Share links unfurl with `public/og.png`, cut from the README banner.

**Motion**
- `cubic-bezier(.2,.8,.2,1)`. 120ms for press and toggle, 200ms for hover, 320ms for sheets. Everything respects `prefers-reduced-motion`.
- **Tile on/off:** the fill and edge change at press speed, then the slider fades up into place. A pressed tile dips to 98.5%. These are transitions, not keyframes, so tiles already on when the page loads don't animate.

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
- **Mastered output.** The chain in `master.ts`: a subsonic filter, a Linkwitz-Riley crossover that makes everything below 120 Hz mono without touching the stereo image above it, a shallow tone curve, a slow glue compressor, a limiter and a 4x-oversampled soft clip at -1 dBFS. Typical mixes land around -17 LUFS with peaks under -1 dBTP, and everything at full volume never passes that ceiling.
- **Tone by measurement.** Typical mixes should track a gentle downward tilt of about 3 dB per octave up to 4 kHz, and fall away a little faster above that, because this plays for hours. Lowpass filters are the easiest way to make everything sound cheap: an instrument dark enough to feel "warm" alone reads as muffled in a mix.
- **Dynamics by measurement.** A steady tone in a mix should move less than about 2 dB. If the limiter is working on every kick, the kit is out of balance; fix the kit, not the limiter.
- **Level by measurement.** `npm run smoke` reports BS.1770 loudness and true peak for every tile and scene, against a reference tone. Set a new tile's `level` against its category's neighbours there, not by RMS. Sparse tiles read noisily over a short render.
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
