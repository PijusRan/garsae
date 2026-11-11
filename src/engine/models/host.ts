// Physical-model voices for the acoustic tiles (Faust models running in an AudioWorklet, see ../faust).
// A tile's generator still decides what to play; this only decides which voice plays it:
// - synth: the Web Audio voices, as always (the default; nothing here is loaded)
// - model: the physical model instead
// - ab: both play the same notes, and one control crossfades between them, for comparing by ear
import type { Core } from '../types';

export type VoiceMode = 'synth' | 'model' | 'ab';
export type ModelName = 'flute' | 'strings' | 'choir' | 'piano' | 'vibes' | 'arp' | 'bells' | 'walk' | 'congas';
export type Stroke = 'open' | 'slap' | 'mute';

/** The tiles that have a physical model, and which model. */
export const MODEL_TILES = {
  flute: 'flute',
  strings: 'strings',
  choir: 'choir',
  piano: 'piano',
  vibes: 'vibes',
  arp: 'arp',
  bells: 'bells',
  walk: 'walk',
  hands: 'congas',
} as const;

export interface ModelVoice {
  output: AudioNode;
  /** A note at t held for `hold` seconds (struck models ignore the hold). Congas take a stroke. */
  note(t: number, midi: number, hold: number, vel: number, stroke?: Stroke): void;
  /** The choir's vowel. */
  setVowel?(vowel: 'oo' | 'oh' | 'ah', t: number): void;
}

export interface ModelHost {
  mode: Exclude<VoiceMode, 'synth'>;
  create(name: ModelName): ModelVoice;
  /** 0 hears the synth voices, 1 the models (A/B mode). */
  ab: AudioNode;
}

export interface Voices {
  /** Where the synth voice's notes connect. */
  synth: AudioNode;
  /** False when only the model plays: skip building synth notes at all. */
  synthOn: boolean;
  model: ModelVoice | null;
}

/** Sets up a tile's voices: synth notes go to `synthDest`, the model's output to `modelDest`. */
export function voices(core: Core, name: ModelName, synthDest: AudioNode, modelDest: AudioNode = synthDest): Voices {
  const host = core.models;
  if (!host) return { synth: synthDest, synthOn: true, model: null };
  const model = host.create(name);
  if (host.mode === 'model') {
    model.output.connect(modelDest);
    return { synth: synthDest, synthOn: false, model };
  }
  const { ctx } = core;
  const synthGain = new GainNode(ctx, { gain: 1 });
  const modelGain = new GainNode(ctx, { gain: 0 });
  const invert = new GainNode(ctx, { gain: -1 });
  host.ab.connect(modelGain.gain);
  host.ab.connect(invert).connect(synthGain.gain);
  synthGain.connect(synthDest);
  model.output.connect(modelGain).connect(modelDest);
  return { synth: synthGain, synthOn: true, model };
}
