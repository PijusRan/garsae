// A Faust drum kit (faust/dsp/kit_*.dsp) taking a genre's hits: used by the app's own kits and by listening tests.
import type { HitOpts, Voice } from '../drums/voices';
import { FaustNode, type compile } from './node';

type Compiled = Awaited<ReturnType<typeof compile>>;

export interface DrumKit {
  /** One hit. `echo` marks a track that goes to the genre's echo; Faust kits send their own voices there. */
  hit(voice: Voice, t: number, vel: number, opts?: HitOpts, echo?: boolean): void;
}

/**
 * Runs a kit. `slots` lists its voices in the order of its controls (gate0, vel0, tone0, decay0, ...); a voice with
 * several slots (the hand drums' two congas) takes them in turn. The kit's three outputs are left and right, into
 * `main`, and its echo send, into `echo`. `trim` sets its loudness.
 */
export function createKit(ctx: BaseAudioContext, c: Compiled, slots: Voice[], trim: number, main: AudioNode, echo: AudioNode | null): DrumKit {
  const fx = new FaustNode(ctx, c);
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
      // Velocities above 1 (a track's gain) are kept: the voices scale with them, like the synth kit's.
      fx.strike(mine[turn % mine.length], t, { vel, tone: opts?.tone ?? 1, decay: opts?.decay ?? 1 });
    },
  };
}
