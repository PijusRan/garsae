// The background's colours, derived from the mix: every mix gets its own light.
//   key       -> hue of the light, walked around the circle of fifths, so related keys get neighbouring hues
//                (C is cobalt). The hues skip the olive and mustard band, which turns muddy when dark.
//   tempo     -> vividness: slow mixes are deeper and muted, fast ones more saturated and a little brighter
//   evolution -> how far the shadows sweep: the light keeps the key's hue and the darker stops drift towards
//                indigo, like dusk (gold over crimson and plum, green over teal and navy), further when it shifts
// Colours are OKLab triplets [L, a, b], the space Grainient's shader blends in.

import { BPM_MAX, BPM_MIN } from '../state/mix';

export type Lab = [number, number, number];

/** Lightness and chroma per stop, bottom to top, at a middling tempo. Mostly dark, so text keeps contrast. */
const STOPS: [number, number][] = [
  [0.1, 0.03],
  [0.18, 0.07],
  [0.27, 0.11],
  [0.38, 0.14],
  [0.54, 0.16],
  [0.73, 0.13],
];

/** Hue of the light per step round the circle of fifths from C (C G D A E B F# C# Ab Eb Bb F). */
const HUES = [265, 292, 322, 352, 20, 44, 66, 152, 176, 198, 220, 242];
const SHADOW_HUE = 285; // indigo, which the shadows drift towards

export function mixPalette(key: number, bpm: number, evolution: number): Lab[] {
  const fifths = (((key * 7) % 12) + 12) % 12;
  const hue = HUES[fifths];
  const t = clamp01((bpm - BPM_MIN) / (BPM_MAX - BPM_MIN));
  const vivid = 0.75 + 0.45 * t;
  // Drift the short way round towards indigo, further for hues far from it (warm ones brown otherwise).
  const delta = ((SHADOW_HUE - hue + 540) % 360) - 180;
  const sweep = Math.sign(delta || 1) * (45 + 40 * clamp01(evolution)) * (0.7 + (0.6 * Math.abs(delta)) / 180);
  return STOPS.map(([L, C], i) => {
    const top = i === STOPS.length - 1;
    const h = hue + sweep * (1 - i / (STOPS.length - 1)) ** 0.8;
    return toGamut(top ? L + 0.06 * (t - 0.5) : L, C * vivid, h);
  });
}

/** OKLab to a CSS hex colour (for the slider tokens). */
export function labToHex(lab: Lab): string {
  return '#' + linearRgb(lab).map((c) => Math.round(encode(c) * 255).toString(16).padStart(2, '0')).join('');
}

/** OKLCH to OKLab, lowering chroma until the colour fits sRGB so no hue gets clipped. */
function toGamut(L: number, C: number, hueDeg: number): Lab {
  const h = (hueDeg * Math.PI) / 180;
  let c = C;
  for (let i = 0; i < 40; i++) {
    const lab: Lab = [L, c * Math.cos(h), c * Math.sin(h)];
    if (linearRgb(lab).every((v) => v >= -1e-4 && v <= 1 + 1e-4)) return lab;
    c *= 0.95;
  }
  return [L, 0, 0];
}

function linearRgb([L, a, b]: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function encode(c: number): number {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
