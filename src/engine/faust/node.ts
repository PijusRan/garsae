// Runs compiled Faust models (see processor.ts) and schedules notes on them.
import { MAX_PARAMS, PROCESSOR_NAME, PROCESSOR_SOURCE } from './processor';
import type { FaustModel } from './types';

const processors = new WeakMap<BaseAudioContext, Promise<void>>();

/** Adds the worklet processor to a context, once. */
export function loadProcessor(ctx: BaseAudioContext): Promise<void> {
  let p = processors.get(ctx);
  if (!p) {
    const url = URL.createObjectURL(new Blob([PROCESSOR_SOURCE], { type: 'text/javascript' }));
    p = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    processors.set(ctx, p);
  }
  return p;
}

interface Compiled {
  model: FaustModel;
  bytes: ArrayBuffer;
  module: WebAssembly.Module;
}

const compiled = new WeakMap<FaustModel, Promise<Compiled>>();

/** Decodes and compiles a model off the audio thread, once. */
export function compile(model: FaustModel): Promise<Compiled> {
  let p = compiled.get(model);
  if (!p) {
    const bytes = Uint8Array.from(atob(model.wasm), (c) => c.charCodeAt(0)).buffer;
    p = WebAssembly.compile(bytes).then((module) => ({ model, bytes, module }));
    compiled.set(model, p);
  }
  return p;
}

/** One Faust model running in an AudioWorkletNode, its controls exposed as AudioParams by label. */
export class FaustNode {
  readonly node: AudioWorkletNode;
  private params = new Map<string, AudioParam>();

  constructor(ctx: BaseAudioContext, { model, bytes, module }: Compiled) {
    if (model.params.length > MAX_PARAMS) throw new Error('too many Faust controls');
    const index = model.params.map((p) => p.index);
    const gates = model.params.flatMap((p, k) => (p.label.startsWith('gate') ? [k] : []));
    const base = {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [model.outputs],
      parameterData: Object.fromEntries(model.params.map((p, k) => [`p${k}`, p.init])),
    };
    const options = { outputs: model.outputs, size: model.size, index, gates };
    try {
      // A compiled module is cheap to hand over; browsers that can't clone one get the bytes instead.
      this.node = new AudioWorkletNode(ctx, PROCESSOR_NAME, { ...base, processorOptions: { ...options, module } });
    } catch {
      this.node = new AudioWorkletNode(ctx, PROCESSOR_NAME, { ...base, processorOptions: { ...options, bytes } });
    }
    model.params.forEach((p, k) => this.params.set(p.label, this.node.parameters.get(`p${k}`)!));
  }

  param(label: string): AudioParam {
    const p = this.params.get(label);
    if (!p) throw new Error(`no Faust control ${label}`);
    return p;
  }

  /** Sets controls of voice i (labels without the index) at time t. Controls the model doesn't use are skipped. */
  set(i: number, t: number, values: Record<string, number>): void {
    for (const [label, v] of Object.entries(values)) this.params.get(`${label}${i}`)?.setValueAtTime(v, t);
  }

  /** A struck note: the gate's rising edge is the hit. */
  strike(i: number, t: number, values: Record<string, number>): void {
    this.set(i, t, values);
    const gate = this.param(`gate${i}`);
    gate.setValueAtTime(1, t);
    gate.setValueAtTime(0, t + 0.003);
  }

  /**
   * A held note from t to `until`. The voice's previous note, if it is still held, is let go just before (so the new
   * one starts afresh); a legato note instead keeps the gate open and only moves the pitch.
   */
  hold(i: number, t: number, until: number, values: Record<string, number>, legato: boolean): void {
    const gate = this.param(`gate${i}`);
    gate.cancelScheduledValues(t - 0.03);
    if (!legato) gate.setValueAtTime(0, t - 0.003);
    this.set(i, t, values);
    gate.setValueAtTime(1, t);
    gate.setValueAtTime(0, until);
  }
}

/**
 * Hands out a model's voices. A voice is busy until its note has rung out; when every voice is busy the one that
 * will be free soonest is taken. Held notes can continue legato from a note ending just as they start.
 */
export class VoicePool {
  private free: number[];
  private ends: number[];
  private midi: number[];

  constructor(readonly size: number) {
    this.free = new Array(size).fill(0);
    this.ends = new Array(size).fill(-1);
    this.midi = new Array(size).fill(0);
  }

  /** A voice for a note at t, held until `until` and ringing on for `tail` seconds. */
  take(t: number, midi: number, until: number, tail: number, legato = false): { voice: number; legato: boolean } {
    let voice = -1;
    let joined = false;
    if (legato) {
      // The closest voice whose note ends right now, so lines move by the smallest step.
      let best = Infinity;
      for (let i = 0; i < this.size; i++) {
        const d = Math.abs(this.midi[i] - midi);
        if (Math.abs(this.ends[i] - t) < 0.03 && d < best) {
          best = d;
          voice = i;
        }
      }
      joined = voice >= 0;
    }
    if (voice < 0) {
      // Free the longest, or else the one closest to finishing.
      let soonest = Infinity;
      for (let i = 0; i < this.size; i++) {
        if (this.free[i] < soonest) {
          soonest = this.free[i];
          voice = i;
        }
      }
    }
    this.free[voice] = until + tail;
    this.ends[voice] = until;
    this.midi[voice] = midi;
    return { voice, legato: joined };
  }
}
