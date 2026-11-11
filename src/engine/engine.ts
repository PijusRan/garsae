// The Garsae audio engine. A plain TypeScript module with no React inside:
// the UI only sends commands such as setTile / setTileVolume / setEvolution.
import { TILES, TILE_BY_ID, type TileId } from '../tiles';
import { ChordEngine } from './chords';
import { createAmbientPulse, createBossa, createBreakbeat, createDnb, createDub, createHandDrums, createHouse, createLofi, createTechno, createTripHop } from './drums/genres';
import { create808, createFmBass, createFretless, createGlide, createMuted, createPulse, createReese, createRolling, createSub, createWalk } from './instruments/bass';
import { createChoir, createEPiano, createFeltPiano, createStrings, createTapeFlute, createVibes } from './instruments/keys';
import { createCrackle, createHum, createNoise, createWind } from './instruments/atmosphere';
import { createAmplitudeMod, createWobble } from './instruments/effects';
import { HANDOVER_GRACE_LOOPS, handoverChance, handoverCooldownBars } from './evolution';
import { chance, pick } from './random';
import { createArp, createBells, createDrone, createPad } from './instruments/pads';
import { Master, type ModulationSettings } from './master';
import type { Models } from './models/host';
import { NoiseBank } from './noise';
import { Scheduler } from './scheduler';
import { Tile } from './tile';
import { chordInfo } from './theory';
import type { Core, InstrumentFactory, StepInfo } from './types';

const FACTORIES: Record<TileId, InstrumentFactory> = {
  pad: createPad,
  bells: createBells,
  arp: createArp,
  drone: createDrone,
  epiano: createEPiano,
  choir: createChoir,
  piano: createFeltPiano,
  strings: createStrings,
  vibes: createVibes,
  flute: createTapeFlute,
  sub: createSub,
  walk: createWalk,
  pulse: createPulse,
  glide: createGlide,
  fm: createFmBass,
  rolling: createRolling,
  reese: createReese,
  fretless: createFretless,
  b808: create808,
  muted: createMuted,
  lofi: createLofi,
  techno: createTechno,
  dub: createDub,
  ambient: createAmbientPulse,
  breaks: createBreakbeat,
  hands: createHandDrums,
  house: createHouse,
  triphop: createTripHop,
  dnb: createDnb,
  bossa: createBossa,
  crackle: createCrackle,
  wind: createWind,
  hum: createHum,
  brown: createNoise('brown'),
  pink: createNoise('pink'),
  green: createNoise('green'),
  am: createAmplitudeMod,
  wobble: createWobble,
};

export interface EngineStatus {
  playing: boolean;
  chord: string;
}

interface AudioSessionNavigator {
  audioSession?: { type: string };
}

export class Engine {
  readonly ctx: BaseAudioContext;
  readonly master: Master;
  readonly chords = new ChordEngine();
  private core: Core;
  private tiles = new Map<TileId, Tile>();
  private scheduler: Scheduler;
  private stopTimer?: ReturnType<typeof setTimeout>;
  playing = false;
  /** Called (on the main thread) with the chord heard right now. */
  onChord?: (name: string) => void;
  /** Called when Evolution hands one tile over to another; the new tile has taken the old one's settings. */
  onHandover?: (from: TileId, to: TileId) => void;
  /** Chord loops played so far, and when each tile last came on, counted in loops. */
  private loops = 0;
  private onSince = new Map<TileId, number>();
  private quietUntilLoop = HANDOVER_GRACE_LOOPS;
  private lastHandoverBar = -Infinity;
  /** Resolves once the physical models have loaded (offline renders wait for it before switching tiles on). */
  readonly ready: Promise<void>;

  /** Starts fetching the physical models' code early, before any engine exists (no audio is touched). */
  static preload(): void {
    void import('./models/bank');
  }

  constructor(ctx?: BaseAudioContext) {
    this.ctx = ctx ?? new AudioContext({ latencyHint: 'playback' });
    this.master = new Master(this.ctx);
    const models: Models = { host: null, ready: import('./models/bank').then(({ createModelHost }) => createModelHost(this.ctx)) };
    models.ready.then((host) => (models.host = host), (e) => console.error('physical models failed to load', e));
    this.core = {
      ctx: this.ctx,
      noise: new NoiseBank(this.ctx),
      master: this.master,
      root: 9,
      bpm: 75,
      evolution: 0.3,
      models,
    };
    this.ready = models.ready.then(() => {});
    this.scheduler = new Scheduler(this.ctx, (step, time) => this.onStep(step, time), () => this.stepDur);
  }

  private get stepDur(): number {
    return 60 / this.core.bpm / 4;
  }

  /** Must be called from a user tap (iOS and autoplay rules). */
  async start(): Promise<void> {
    clearTimeout(this.stopTimer);
    const nav = navigator as Navigator & AudioSessionNavigator;
    // Safari 16.4+: play even when the ringer switch is on silent.
    if (nav.audioSession) nav.audioSession.type = 'playback';
    if (this.ctx instanceof AudioContext && this.ctx.state !== 'running') await this.ctx.resume();
    this.playing = true;
    this.quietUntilLoop = this.loops + HANDOVER_GRACE_LOOPS;
    this.scheduler.start();
    this.master.setOutput(1, 0.6);
  }

  stop(): void {
    this.playing = false;
    this.master.setOutput(0, 0.35);
    this.scheduler.stop();
    clearTimeout(this.stopTimer);
    this.stopTimer = setTimeout(() => {
      if (!this.playing && this.ctx instanceof AudioContext) void this.ctx.suspend();
    }, 2000);
  }

  /** Slowly fades the whole app out over about `seconds`, without stopping. Used by the session timer. */
  fadeOut(seconds: number): void {
    // setTargetAtTime reaches ~99% after 5 time constants.
    this.master.setOutput(0, seconds / 5);
  }

  /** Brings the sound back after fadeOut, e.g. when the timer is cancelled mid-fade. */
  fadeIn(): void {
    if (this.playing) this.master.setOutput(1, 0.6);
  }

  setMasterVolume(v: number): void {
    this.master.setVolume(v);
  }

  private tile(id: TileId): Tile {
    let t = this.tiles.get(id);
    if (!t) {
      t = new Tile(this.core, TILE_BY_ID[id], FACTORIES[id](this.core));
      this.tiles.set(id, t);
    }
    return t;
  }

  setTile(id: TileId, on: boolean, volume?: number): void {
    if (!on && !this.tiles.has(id)) return;
    const t = this.tile(id);
    if (volume !== undefined) t.setVolume(volume, !this.playing);
    if (on && !t.on) this.onSince.set(id, this.loops);
    t.setOn(on, !this.playing);
  }

  /** What a tile is playing, for visuals. Null until it has been switched on, and for effect tiles. */
  tileMeter(id: TileId): AnalyserNode | null {
    return this.tiles.get(id)?.meter ?? null;
  }

  setTileVolume(id: TileId, volume: number): void {
    this.tile(id).setVolume(volume, !this.playing);
  }

  setEvolution(e: number): void {
    this.core.evolution = e;
    for (const t of this.tiles.values()) t.mixEvolutionChanged();
  }

  /** A tile's own Evolution; null makes it follow the mix again. */
  setTileEvolution(id: TileId, e: number | null): void {
    if (e === null && !this.tiles.has(id)) return;
    this.tile(id).setOwnEvolution(e);
  }

  setBpm(bpm: number): void {
    this.core.bpm = bpm;
    for (const t of this.tiles.values()) t.instrument.setTempo?.(bpm);
  }

  setKey(root: number): void {
    this.core.root = ((root % 12) + 12) % 12;
    for (const t of this.tiles.values()) t.instrument.setKey?.(this.core.root);
  }

  /** Focus groundwork: amplitude modulation on the mix. */
  setModulation(m: ModulationSettings): void {
    this.master.setModulation(m);
  }

  get bpm(): number {
    return this.core.bpm;
  }

  get root(): number {
    return this.core.root;
  }

  private onStep(step: number, time: number): void {
    const { root, evolution, bpm } = this.core;
    const stepInBar = step % 16;
    const bar = Math.floor(step / 16);
    const chordChanged = stepInBar === 0 ? this.chords.advanceBar(evolution) : false;
    if (stepInBar === 0 && this.chords.wrapped) {
      this.loops++;
      this.maybeHandover(bar, time);
    }
    const chord = chordInfo(root, this.chords.current.degree);
    const info: StepInfo = {
      step,
      stepInBar,
      bar,
      time,
      stepDur: this.stepDur,
      barDur: this.stepDur * 16,
      bpm,
      root,
      evolution,
      chord,
      nextChord: chordInfo(root, this.chords.next.degree),
      chordChanged,
      barsLeftInChord: this.chords.barsLeft,
    };
    for (const t of this.tiles.values()) t.step(info);
    if (chordChanged && this.onChord && typeof setTimeout === 'function' && this.ctx instanceof AudioContext) {
      const delay = Math.max(0, (time - this.ctx.currentTime) * 1000);
      const cb = this.onChord;
      setTimeout(() => cb(chord.name), delay);
    }
  }

  /**
   * Evolution's slowest move: as the chord loop comes round, one tile may hand over to an off sibling
   * of the same family (a pad to another pad), keeping its volume and own Evolution. The two
   * crossfade over a bar or two from the downbeat. Drums overlap for less, so two grooves never clash for long.
   */
  private maybeHandover(bar: number, time: number): void {
    if (this.loops < this.quietUntilLoop) return;
    if (bar - this.lastHandoverBar < handoverCooldownBars(this.core.evolution)) return;
    const ready = [...this.tiles.values()].filter(
      (t) => t.on && t.meta.family && this.loops - (this.onSince.get(t.meta.id) ?? 0) >= HANDOVER_GRACE_LOOPS,
    );
    // Shuffled, so no tile always gets the first roll.
    for (let i = ready.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ready[i], ready[j]] = [ready[j], ready[i]];
    }
    for (const from of ready) {
      if (!chance(handoverChance(from.evolution))) continue;
      const pool = TILES.filter((m) => m.family === from.meta.family && !this.tiles.get(m.id)?.on);
      if (pool.length === 0) continue;
      const to = this.tile(pick(pool).id);
      const bars = from.meta.category === 'drums' ? 1 : 2;
      const barDur = this.stepDur * 16;
      to.setVolume(from.volume, true);
      to.setOwnEvolution(from.ownEvolution);
      to.crossfade(true, time, (barDur * bars) / 4);
      from.crossfade(false, time, (barDur * bars) / 4, time + barDur * bars);
      this.onSince.set(to.meta.id, this.loops);
      this.lastHandoverBar = bar;
      this.onHandover?.(from.meta.id, to.meta.id);
      return;
    }
  }

  /** Offline rendering helper (tests): schedules everything up to `seconds` ahead. */
  renderUntil(seconds: number): void {
    this.playing = true;
    this.master.setOutput(1, 0.05);
    if (this.scheduler.step === 0 && this.scheduler.nextTime === 0) this.scheduler.nextTime = 0.1;
    this.scheduler.renderUntil(seconds);
  }

  dispose(): void {
    this.scheduler.dispose();
    if (this.ctx instanceof AudioContext) void this.ctx.close();
  }
}
