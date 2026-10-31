// Curated starting points, stored in the share-link format. Like share links,
// they hold settings only, so BPM and key stay random unless a preset sets them.
import { decodeMix, type MixState } from './mix';

export type PresetId = 'deep' | 'lofi' | 'night' | 'brown' | 'groove';

export interface Preset {
  id: PresetId;
  name: string;
  hint: string;
  mix: string;
  /** The key it opens in from the welcome screen, which also sets its colours there. */
  welcomeKey: number;
}

export const PRESETS: Preset[] = [
  { id: 'deep', name: 'Deep focus', hint: 'Warm chords over a low rumble', mix: 't=pad.60,drone.35,sub.40,brown.25&e=20', welcomeKey: 0 },
  { id: 'lofi', name: 'Lo-fi study', hint: 'Dusty beat, bells, walking bass', mix: 't=pad.55,bells.35,walk.45,lofi.45,crackle.30&e=35', welcomeKey: 9 },
  { id: 'night', name: 'Night drone', hint: 'Slow drone, choir and air', mix: 't=drone.65,choir.35,wind.30&e=25', welcomeKey: 7 },
  { id: 'brown', name: 'Brown noise', hint: 'Just a deep, even rumble', mix: 't=brown.55&e=0', welcomeKey: 3 },
  { id: 'groove', name: 'Soft groove', hint: 'Arpeggio, pulse bass and dub', mix: 't=pad.55,arp.40,pulse.40,dub.40,hum.20&e=40', welcomeKey: 8 },
];

export const presetMix = (p: Preset): MixState => decodeMix(p.mix)!;
