// The tile catalogue, shared by the engine and the UI. No React or audio here.

export type Category = 'pads' | 'bass' | 'drums' | 'texture' | 'effects';

export const TILE_IDS = [
  // pads / melodies
  'pad', 'bells', 'arp', 'drone', 'epiano', 'choir',
  // bass
  'sub', 'walk', 'pulse', 'glide', 'fm', 'rolling',
  // drums (one tile per genre)
  'lofi', 'techno', 'dub', 'ambient', 'breaks', 'brushes',
  // texture (room sounds and noise colours)
  'crackle', 'wind', 'hum',
  'brown', 'pink', 'green',
  // effects (shape the whole mix)
  'am', 'wobble',
] as const;

export type TileId = (typeof TILE_IDS)[number];

export interface TileMeta {
  id: TileId;
  category: Category;
  name: string;
  hint: string;
  /** Volume (0-1) when first switched on. */
  defaultVolume: number;
  /** Gain at full volume. Gives each tile headroom and balances loudness between tiles. */
  level: number;
  /** Reverb send amount. */
  reverb: number;
  /** Effect tiles change the whole mix instead of adding a sound. */
  effect?: boolean;
}

export const TILES: TileMeta[] = [
  { id: 'pad', category: 'pads', name: 'Warm pad', hint: 'Drifting chords', defaultVolume: 0.65, level: 0.86, reverb: 0.45 },
  { id: 'bells', category: 'pads', name: 'Glass bells', hint: 'Sparse notes', defaultVolume: 0.5, level: 2.4, reverb: 0.7 },
  { id: 'arp', category: 'pads', name: 'Soft arpeggio', hint: 'Soft mallet phrases', defaultVolume: 0.5, level: 2.8, reverb: 0.4 },
  { id: 'drone', category: 'pads', name: 'Drone', hint: 'Steady root and fifth', defaultVolume: 0.5, level: 0.59, reverb: 0.3 },
  { id: 'epiano', category: 'pads', name: 'Electric piano', hint: 'Mellow chord comping', defaultVolume: 0.5, level: 1.45, reverb: 0.3 },
  { id: 'choir', category: 'pads', name: 'Choir', hint: 'Soft, wordless voices', defaultVolume: 0.5, level: 2.2, reverb: 0.55 },

  { id: 'sub', category: 'bass', name: 'Sub bass', hint: 'Deep chord roots', defaultVolume: 0.55, level: 0.3, reverb: 0 },
  { id: 'walk', category: 'bass', name: 'Walking bass', hint: 'Warm, wandering', defaultVolume: 0.55, level: 0.72, reverb: 0.05 },
  { id: 'pulse', category: 'bass', name: 'Pulse bass', hint: 'Steady eighths', defaultVolume: 0.45, level: 0.35, reverb: 0.05 },
  { id: 'glide', category: 'bass', name: 'Glide bass', hint: 'Slides between notes', defaultVolume: 0.5, level: 0.32, reverb: 0.05 },
  { id: 'fm', category: 'bass', name: 'FM bass', hint: 'Round, rubbery notes', defaultVolume: 0.5, level: 0.9, reverb: 0.05 },
  { id: 'rolling', category: 'bass', name: 'Rolling bass', hint: 'Round, syncopated', defaultVolume: 0.5, level: 0.6, reverb: 0.05 },

  { id: 'lofi', category: 'drums', name: 'Lo-fi hip hop', hint: 'Dusty, swung', defaultVolume: 0.5, level: 0.46, reverb: 0.08 },
  { id: 'techno', category: 'drums', name: 'Minimal techno', hint: 'Four on the floor', defaultVolume: 0.45, level: 0.51, reverb: 0.08 },
  { id: 'dub', category: 'drums', name: 'Dub', hint: 'One drop, echoes', defaultVolume: 0.5, level: 0.64, reverb: 0.15 },
  { id: 'ambient', category: 'drums', name: 'Ambient pulse', hint: 'A soft heartbeat', defaultVolume: 0.5, level: 0.42, reverb: 0.35 },
  { id: 'breaks', category: 'drums', name: 'Breakbeat', hint: 'Busy, kept low', defaultVolume: 0.4, level: 0.52, reverb: 0.06 },
  { id: 'brushes', category: 'drums', name: 'Brushes', hint: 'Soft jazz swing', defaultVolume: 0.5, level: 1.75, reverb: 0.12 },

  { id: 'crackle', category: 'texture', name: 'Vinyl crackle', hint: 'Dust and pops', defaultVolume: 0.4, level: 1.4, reverb: 0 },
  { id: 'wind', category: 'texture', name: 'Wind', hint: 'Moving air', defaultVolume: 0.4, level: 0.6, reverb: 0.1 },
  { id: 'hum', category: 'texture', name: 'Room hum', hint: 'Distant machine', defaultVolume: 0.35, level: 0.24, reverb: 0 },

  { id: 'brown', category: 'texture', name: 'Brown noise', hint: 'Deep rumble', defaultVolume: 0.35, level: 0.27, reverb: 0 },
  { id: 'pink', category: 'texture', name: 'Pink noise', hint: 'Even, soft hiss', defaultVolume: 0.3, level: 0.22, reverb: 0 },
  { id: 'green', category: 'texture', name: 'Green noise', hint: 'Mid-range, natural', defaultVolume: 0.3, level: 0.24, reverb: 0 },
  { id: 'am', category: 'effects', name: 'Amplitude mod', hint: 'Gentle pulsing on mix', defaultVolume: 0.4, level: 1, reverb: 0, effect: true },
  { id: 'wobble', category: 'effects', name: 'Tape wobble', hint: 'Warps the whole mix', defaultVolume: 0.4, level: 1, reverb: 0, effect: true },
];

export const TILE_BY_ID: Record<TileId, TileMeta> = Object.fromEntries(
  TILES.map((t) => [t.id, t]),
) as Record<TileId, TileMeta>;

export const CATEGORIES: { id: Category; name: string; note?: string }[] = [
  { id: 'pads', name: 'Pads' },
  { id: 'bass', name: 'Bass' },
  { id: 'drums', name: 'Drums' },
  { id: 'texture', name: 'Texture' },
  { id: 'effects', name: 'Effects', note: 'These shape the whole mix rather than add a sound.' },
];

export const isTileId = (s: string): s is TileId => (TILE_IDS as readonly string[]).includes(s);
