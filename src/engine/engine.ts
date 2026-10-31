// The Garsae audio engine. A plain TypeScript module with no React inside:
// the UI only sends commands such as setTile / setTileVolume / setEvolution.
import { TILE_BY_ID, type TileId } from '../tiles';
import { ChordEngine } from './chords';
import { createAmbientPulse, createBreakbeat, createBrushes, createDub, createLofi, createTechno } from './drums/genres';
import { createFmBass, createGlide, createPulse, createRolling, createSub, createWalk } from './instruments/bass';
import { createChoir, createEPiano } from './instruments/keys';
import { createCrackle, createHum, createNoise, createWind } from './instruments/atmosphere';
import { createAmplitudeMod, createWobble } from './instruments/effects';
import { createArp, createBells, createDrone, createPad } from './instruments/pads';
import { Master, type ModulationSettings } from './master';
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
  sub: createSub,
  walk: createWalk,
  pulse: createPulse,
  glide: createGlide,
  fm: createFmBass,
  rolling: createRolling,
  lofi: createLofi,
  techno: createTechno,
  dub: createDub,
  ambient: createAmbientPulse,
  breaks: createBreakbeat,
  brushes: createBrushes,
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

  constructor(ctx?: BaseAudioContext) {
    this.ctx = ctx ?? new AudioContext({ latencyHint: 'playback' });
    this.master = new Master(this.ctx);
    this.core = {
      ctx: this.ctx,
      noise: new NoiseBank(this.ctx),
      master: this.master,
      root: 9,
      bpm: 75,
      evolution: 0.3,
    };
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
    t.setOn(on, !this.playing);
  }

  setTileVolume(id: TileId, volume: number): void {
    this.tile(id).setVolume(volume, !this.playing);
  }

  setEvolution(e: number): void {
    this.core.evolution = e;
    for (const t of this.tiles.values()) t.instrument.setEvolution?.(e);
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
