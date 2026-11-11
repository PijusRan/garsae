// Faust candidates for listening tests: drum kits (faust/dsp/kit_*.dsp) and voices, compiled before the compare page
// or smoke test switches any tile on (prepareFaust), so they can be created synchronously like the tiles' own.
import type { Voice } from '../drums/voices';
import { compile, FaustNode, loadProcessor, VoicePool } from '../faust/node';
import type { FaustModel } from '../faust/types';
import type { HitAlternate, ModelVoice, NoteAlternate } from '../models/host';
import { clamp } from '../random';
import { midiToFreq } from '../theory';

type Compiled = Awaited<ReturnType<typeof compile>>;
const compiled = new Map<FaustModel, Compiled>();

/** Loads the worklet and compiles these models for this context. */
export async function prepareFaust(ctx: BaseAudioContext, models: FaustModel[]): Promise<void> {
  await loadProcessor(ctx);
  for (const m of models) compiled.set(m, await compile(m));
}

function ready(model: FaustModel): Compiled {
  const c = compiled.get(model);
  if (!c) throw new Error('Faust alternates are not prepared: await prepareAlternates() first');
  return c;
}

/**
 * A Faust drum kit. `slots` lists the kit's voices in the order of its controls (gate0, vel0, tone0, decay0, ...);
 * a voice with several slots (the hand drums' two congas) takes them in turn. The kit's three outputs are left, right
 * and its echo send. `trim` matches its loudness to the tile's own kit.
 */
export function faustKit(label: string, model: FaustModel, slots: Voice[], trim: number): HitAlternate {
  return {
    kind: 'hits',
    label,
    create(core, main, echo) {
      const { ctx } = core;
      const fx = new FaustNode(ctx, ready(model));
      const split = new ChannelSplitterNode(ctx, { numberOfOutputs: 3 });
      const merge = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
      const level = new GainNode(ctx, { gain: trim });
      fx.node.connect(split);
      split.connect(merge, 0, 0);
      split.connect(merge, 1, 1);
      merge.connect(level).connect(main);
      if (echo) split.connect(new GainNode(ctx, { gain: trim }), 2).connect(echo);
      const turns = new Map<Voice, number>();
      return {
        hit(voice, t, vel, opts) {
          const mine = slots.flatMap((v, i) => (v === voice ? [i] : []));
          if (!mine.length) return;
          const turn = turns.get(voice) ?? 0;
          turns.set(voice, turn + 1);
          // Velocities above 1 (a track's gain) are kept: the kit's voices scale with them, like the synth kit's.
          fx.strike(mine[turn % mine.length], t, { vel, tone: opts?.tone ?? 1, decay: opts?.decay ?? 1 });
        },
      };
    },
  };
}

/**
 * A Faust voice for a melodic tile: notes held from t for their hold (the model's gate), `size` voices taken in turn,
 * each ringing on for `tail` after its note. `extra` adds controls per note.
 */
export function faustVoice(
  label: string,
  model: FaustModel,
  size: number,
  tail: number,
  trim: number,
  extra: (midi: number) => Record<string, number> = () => ({}),
): NoteAlternate {
  return {
    kind: 'notes',
    label,
    create(core, dest): ModelVoice {
      const fx = new FaustNode(core.ctx, ready(model));
      const output = new GainNode(core.ctx, { gain: trim });
      fx.node.connect(output).connect(dest);
      const pool = new VoicePool(size);
      return {
        output,
        note(t, midi, hold, vel) {
          const until = t + Math.max(hold, 0.02);
          const v = pool.take(t, midi, until, tail);
          // "len" is the hold, for models that shape their decay by it (the 808); the others have no such control.
          fx.hold(v.voice, t, until, { freq: midiToFreq(midi), vel: clamp(vel, 0, 1), len: hold, ...extra(midi) }, false);
        },
      };
    },
  };
}
