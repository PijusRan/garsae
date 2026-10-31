// Harmony rules from DESIGN.md:
// - the chord engine uses Dorian on the user's root
// - melodic notes (bells, arps, sparse notes) use minor pentatonic on the same root

export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const;

export const DORIAN = [0, 2, 3, 5, 7, 9, 10] as const;
export const MINOR_PENTATONIC = [0, 3, 5, 7, 10] as const;

/** Dorian degrees the chord engine may use. vi° (half-diminished) is left out: it is not mellow. */
export const CHORD_DEGREES = [0, 1, 2, 3, 4, 6] as const;

const ROMAN = ['i', 'ii', '♭III', 'IV', 'v', 'vi°', '♭VII'];
const SUFFIX = ['m7', 'm7', 'maj7', 'add9', 'm7', 'm7♭5', 'maj7'];

/** Scale steps stacked on each degree. IV uses add9 instead of a dominant 7th to stay soft. */
function stackFor(degree: number): number[] {
  return degree === 3 ? [0, 2, 4, 8] : [0, 2, 4, 6];
}

export const midiToFreq = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** Semitone offsets of a Dorian chord above the key root, lowest first (may exceed 12). */
export function chordTones(degree: number): number[] {
  return stackFor(degree).map((s) => {
    const idx = degree + s;
    return DORIAN[idx % 7] + 12 * Math.floor(idx / 7);
  });
}

export interface ChordInfo {
  degree: number;
  /** Absolute pitch classes (0-11), chord root first. */
  pcs: number[];
  rootPc: number;
  name: string;
  roman: string;
}

const chordCache = new Map<string, ChordInfo>();

export function chordInfo(root: number, degree: number): ChordInfo {
  const key = `${root}:${degree}`;
  let info = chordCache.get(key);
  if (!info) {
    const pcs = chordTones(degree).map((t) => (root + t) % 12);
    info = {
      degree,
      pcs,
      rootPc: pcs[0],
      name: NOTE_NAMES[pcs[0]] + SUFFIX[degree],
      roman: ROMAN[degree],
    };
    chordCache.set(key, info);
  }
  return info;
}

/** Number of pitch classes two chords have in common (0-4). */
export function sharedTones(a: number, b: number): number {
  const pa = new Set(chordTones(a).map((t) => t % 12));
  return chordTones(b).filter((t) => pa.has(t % 12)).length;
}

/** Harmonic distance between two degrees: 0 (same) to 4 (nothing in common). */
export const chordDistance = (a: number, b: number): number => 4 - sharedTones(a, b);

/** All MIDI notes of a pitch-class set within [lo, hi]. */
export function notesInRange(pcs: readonly number[], lo: number, hi: number): number[] {
  const set = new Set(pcs.map((p) => ((p % 12) + 12) % 12));
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (set.has(m % 12)) out.push(m);
  return out;
}

export function pentatonicPcs(root: number): number[] {
  return MINOR_PENTATONIC.map((i) => (root + i) % 12);
}

export function pentatonicNotes(root: number, lo: number, hi: number): number[] {
  return notesInRange(pentatonicPcs(root), lo, hi);
}

/** Puts a pitch class in the octave that lands in [lo, lo + 12). */
export function placeInRange(pc: number, lo: number): number {
  const m = lo + ((((pc - lo) % 12) + 12) % 12);
  return m;
}

/** Chord pitch classes snapped to the minor pentatonic, so melodic parts never clash. */
export function chordInPentatonic(root: number, chord: ChordInfo): number[] {
  const pent = pentatonicPcs(root);
  const out: number[] = [];
  for (const pc of chord.pcs) {
    let best = pent[0];
    let bestD = 99;
    for (const p of pent) {
      const d = Math.min((pc - p + 12) % 12, (p - pc + 12) % 12);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!out.includes(best)) out.push(best);
  }
  return out;
}
