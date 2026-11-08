// English is the source language: every other dictionary must match this shape, so a missing key won't compile.
// Tile, category and starter names live with their definitions, and are read from there.
import { PRESETS, type PresetId } from '../state/presets';
import { CATEGORIES, TILES, type Category, type TileId } from '../tiles';

interface Named {
  name: string;
  hint: string;
}

export const en = {
  locale: 'en',
  languageLabel: 'Language',

  tiles: Object.fromEntries(TILES.map((t) => [t.id, { name: t.name, hint: t.hint }])) as Record<TileId, Named>,
  presets: Object.fromEntries(PRESETS.map((p) => [p.id, { name: p.name, hint: p.hint }])) as Record<PresetId, Named>,
  categories: Object.fromEntries(CATEGORIES.map((c) => [c.id, { name: c.name, note: c.note }])) as Record<
    Category,
    { name: string; note?: string }
  >,

  description: 'Endless generative focus music. Pick instruments, mix them, and work.',
  mediaArtist: 'Generative focus music',

  player: 'Player',
  play: 'Play',
  pause: 'Pause',
  starting: 'Starting',
  paused: 'Paused',
  pickSound: 'Pick a sound',
  pressPlay: 'Press play',
  detail: (note: string, bpm: number) => `Key of ${note} · ${bpm} bpm`,
  masterVolume: 'Master volume',
  mixes: 'Mixes',
  shareLink: 'Share link',
  aboutAndOffline: 'About & offline',

  sessionTimer: 'Session timer',
  timer: 'Timer',
  timerLeftAria: (left: string) => `Session timer, ${left} left`,
  timerLeft: (left: string) => `${left} left`,
  noTimer: 'No timer',
  cancelTimer: 'Cancel timer',
  timerChoice: (minutes: number) => `${minutes} min, then fade out`,

  mix: 'Mix',
  saveMix: 'Save mix',
  mixSaved: 'Saved',
  clear: 'Clear',
  starters: 'Starters',
  starterMixes: 'Starter mixes',
  surpriseMe: 'Surprise me',
  countOn: (count: number) => `${count} on`,

  effect: 'Effect',
  tileAmount: (name: string) => `${name} amount`,
  tileVolume: (name: string) => `${name} volume`,

  sound: 'Sound',
  evolution: 'Evolution',
  evolutionSteady: 'completely steady',
  evolutionMostlySteady: 'mostly steady',
  evolutionGentle: 'gently changing',
  evolutionShifting: 'constantly shifting',
  tempo: 'Tempo',
  tempoMode: 'Tempo mode',
  auto: 'Auto',
  setManually: 'Set',
  key: 'Key',

  undo: 'Undo',
  undone: 'Undone',
  restored: 'Restored',
  sharedMixLoaded: 'Shared mix loaded. Press play to listen.',
  mixFromLink: 'Mix loaded from link',
  audioFailed: 'Couldn’t start audio. Tap play again.',
  sessionFinished: 'Session finished',
  timerOff: 'Timer off',
  fadingOutIn: (minutes: number) => `Fading out in ${minutes} min`,
  pickSoundFirst: 'Pick a sound first',
  surpriseMix: 'Surprise mix',
  allTilesOff: 'All tiles off',
  loaded: (name: string) => `Loaded “${name}”`,
  shareTitle: 'Garsæ mix',
  linkCopied: 'Link copied',
  offlineRemoved: 'Offline copy removed',
  offlineReady: 'Ready for offline use',
  offlineFailed: 'Could not change offline mode',

  saveName: 'Name for the current mix',
  save: 'Save',
  saved: 'Saved',
  noSavedMixes: 'No saved mixes yet. They are kept in this browser only.',
  untitledMix: 'Untitled mix',
  renamed: 'Renamed',
  savedName: (name: string) => `Saved “${name}”`,
  updatedName: (name: string) => `Updated “${name}”`,
  deletedName: (name: string) => `Deleted “${name}”`,
  newNameFor: (name: string) => `New name for ${name}`,
  loadMix: (name: string, tiles: string, current: boolean) => `Load ${name}: ${tiles}${current ? ' (current)' : ''}`,
  current: 'Current',
  rename: 'Rename',
  renameName: (name: string) => `Rename ${name}`,
  replaceWithCurrent: 'Replace with current mix',
  replaceName: (name: string) => `Replace ${name} with the current mix`,
  delete: 'Delete',
  deleteName: (name: string) => `Delete ${name}`,

  shareTitleSheet: 'Share this mix',
  shareNote: 'Anyone with this link hears the same tiles and settings, played fresh.',
  copied: 'Copied',
  copy: 'Copy',
  copyHelp: 'If Copy does nothing, select the link and press Ctrl+C (⌘C on Mac).',

  aboutText:
    'Turn on a few tiles, set their levels, and leave Garsæ running while you work. Each tile is a small synthesizer playing over the same slowly changing chords, so nothing loops.',
  offlineUse: 'Offline use',
  offlineAvailable: 'Available offline on this device.',
  working: 'Working…',
  offlineNotSaved: 'Not saved on this device yet.',
  removeOffline: 'Remove offline copy',
  makeOffline: 'Make available offline',
  install: 'Install',
  installNote: 'Open Garsæ in its own window.',
  installApp: 'Install app',
  storedHere: 'Mixes and settings stay in this browser.',
  sourceLink: 'The source code is on GitHub.',

  welcomeTitle: 'Choose something to work to',
  welcomeSub: 'Every sound is synthesized in your browser as it plays, so a mix can run all day.',
  welcomeBuild: 'Build my own',
  welcomeBuildHint: 'Start with nothing on',
};

export type Strings = typeof en;
