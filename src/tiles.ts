// The tile catalogue, shared by the engine and the UI. No React or audio here.

export type Category = 'pads' | 'bass' | 'drums' | 'texture' | 'effects';

export const TILE_IDS = [
  // pads / melodies
  'pad', 'bells', 'arp', 'drone', 'epiano', 'choir', 'piano', 'strings', 'vibes', 'flute',
  // bass
  'sub', 'walk', 'pulse', 'glide', 'fm', 'rolling', 'reese', 'fretless', 'b808', 'muted',
  // drums (one tile per genre)
  'lofi', 'techno', 'dub', 'ambient', 'breaks', 'hands', 'motorik', 'triphop', 'dnb', 'bossa',
  // texture (room sounds and noise colours)
  'crackle', 'wind', 'hum',
  'brown', 'pink', 'green',
  // effects (shape the whole mix)
  'am', 'wobble', 'width', 'orbit', 'hall',
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
  /** Its sound ignores Evolution, so it gets no Evolution of its own. */
  steady?: boolean;
  /** Evolution may hand this tile over to another off tile of the same family. None: it never swaps. */
  family?: Family;
}

/** Tiles close enough in role that one can quietly take over from another. */
export type Family = 'sustained' | 'melodic' | 'deep' | 'moving' | 'calm' | 'driving';

export const TILES: TileMeta[] = [
  { id: 'pad', category: 'pads', name: 'Warm pad', hint: 'Drifting chords', defaultVolume: 0.5, level: 0.894, reverb: 0.45, family: 'sustained' },
  { id: 'bells', category: 'pads', name: 'Glass bells', hint: 'Sparse notes', defaultVolume: 0.5, level: 3.46, reverb: 0.7, family: 'melodic' },
  { id: 'arp', category: 'pads', name: 'Soft arpeggio', hint: 'Soft mallet phrases', defaultVolume: 0.5, level: 4.18, reverb: 0.4, family: 'melodic' },
  { id: 'drone', category: 'pads', name: 'Drone', hint: 'Steady root and fifth', defaultVolume: 0.5, level: 0.492, reverb: 0.3, family: 'sustained' },
  { id: 'epiano', category: 'pads', name: 'Electric piano', hint: 'Mellow chord comping', defaultVolume: 0.5, level: 1.82, reverb: 0.3, family: 'melodic' },
  { id: 'choir', category: 'pads', name: 'Choir', hint: 'Soft, wordless voices', defaultVolume: 0.5, level: 2.4, reverb: 0.55, family: 'sustained' },
  { id: 'piano', category: 'pads', name: 'Felt piano', hint: 'Quiet hammers, sparse notes', defaultVolume: 0.5, level: 1.37, reverb: 0.4, family: 'melodic' },
  { id: 'strings', category: 'pads', name: 'String ensemble', hint: 'Wide, slow swells', defaultVolume: 0.5, level: 0.647, reverb: 0.45, family: 'sustained' },
  { id: 'vibes', category: 'pads', name: 'Vibraphone', hint: 'Soft mallets, slow shimmer', defaultVolume: 0.5, level: 1.73, reverb: 0.4, family: 'melodic' },
  { id: 'flute', category: 'pads', name: 'Tape flute', hint: 'Long, breathy notes', defaultVolume: 0.45, level: 0.919, reverb: 0.4, family: 'sustained' },

  { id: 'sub', category: 'bass', name: 'Sub bass', hint: 'Deep chord roots', defaultVolume: 0.5, level: 0.287, reverb: 0, family: 'deep' },
  { id: 'walk', category: 'bass', name: 'Walking bass', hint: 'Warm, wandering', defaultVolume: 0.5, level: 0.392, reverb: 0.05, family: 'moving' },
  { id: 'pulse', category: 'bass', name: 'Pulse bass', hint: 'Steady eighths', defaultVolume: 0.5, level: 0.367, reverb: 0.05, family: 'moving' },
  { id: 'glide', category: 'bass', name: 'Glide bass', hint: 'Slides between notes', defaultVolume: 0.5, level: 0.286, reverb: 0.05, family: 'deep' },
  { id: 'fm', category: 'bass', name: 'FM bass', hint: 'Round, rubbery notes', defaultVolume: 0.5, level: 0.811, reverb: 0.05, family: 'moving' },
  { id: 'rolling', category: 'bass', name: 'Rolling bass', hint: 'Round, syncopated', defaultVolume: 0.5, level: 0.532, reverb: 0.05, family: 'moving' },
  { id: 'reese', category: 'bass', name: 'Reese bass', hint: 'Dark, slowly turning', defaultVolume: 0.5, level: 0.274, reverb: 0.05, family: 'deep' },
  { id: 'fretless', category: 'bass', name: 'Fretless bass', hint: 'Singing slides', defaultVolume: 0.5, level: 0.436, reverb: 0.1, family: 'moving' },
  { id: 'b808', category: 'bass', name: '808 bass', hint: 'Long, deep booms', defaultVolume: 0.5, level: 0.156, reverb: 0, family: 'deep' },
  { id: 'muted', category: 'bass', name: 'Muted bass', hint: 'Short, round, warm', defaultVolume: 0.5, level: 0.354, reverb: 0.05, family: 'moving' },

  { id: 'lofi', category: 'drums', name: 'Lo-fi hip hop', hint: 'Dusty, swung', defaultVolume: 0.5, level: 0.828, reverb: 0.08, family: 'calm' },
  { id: 'techno', category: 'drums', name: 'Minimal techno', hint: 'Four on the floor', defaultVolume: 0.5, level: 1.47, reverb: 0.08, family: 'driving' },
  { id: 'dub', category: 'drums', name: 'Dub', hint: 'One drop, echoes', defaultVolume: 0.5, level: 1.16, reverb: 0.15, family: 'calm' },
  { id: 'ambient', category: 'drums', name: 'Ambient pulse', hint: 'A soft heartbeat', defaultVolume: 0.5, level: 0.925, reverb: 0.35, family: 'calm' },
  { id: 'breaks', category: 'drums', name: 'Breakbeat', hint: 'Fast, tight breaks', defaultVolume: 0.5, level: 0.374, reverb: 0.06 },
  { id: 'hands', category: 'drums', name: 'Hand drums', hint: 'Congas and a soft shaker', defaultVolume: 0.5, level: 0.984, reverb: 0.2, family: 'calm' },
  { id: 'motorik', category: 'drums', name: 'Motorik', hint: 'Steady, hypnotic eighths', defaultVolume: 0.5, level: 0.698, reverb: 0.08, family: 'driving' },
  { id: 'triphop', category: 'drums', name: 'Trip hop', hint: 'Slow, heavy, dusty', defaultVolume: 0.5, level: 0.556, reverb: 0.15, family: 'calm' },
  { id: 'dnb', category: 'drums', name: 'Liquid DnB', hint: 'Fast, light two-step', defaultVolume: 0.5, level: 0.726, reverb: 0.08, family: 'driving' },
  { id: 'bossa', category: 'drums', name: 'Bossa nova', hint: 'Clave and a soft pulse', defaultVolume: 0.5, level: 1.02, reverb: 0.12, family: 'calm' },

  { id: 'crackle', category: 'texture', name: 'Vinyl crackle', hint: 'Dust and pops', defaultVolume: 0.5, level: 4.47, reverb: 0, steady: true },
  { id: 'wind', category: 'texture', name: 'Wind', hint: 'Moving air', defaultVolume: 0.5, level: 0.678, reverb: 0.1 },
  { id: 'hum', category: 'texture', name: 'Room hum', hint: 'Distant machine', defaultVolume: 0.5, level: 0.321, reverb: 0, steady: true },

  { id: 'brown', category: 'texture', name: 'Brown noise', hint: 'Deep rumble', defaultVolume: 0.5, level: 0.288, reverb: 0, steady: true },
  { id: 'pink', category: 'texture', name: 'Pink noise', hint: 'Even, soft hiss', defaultVolume: 0.5, level: 0.262, reverb: 0, steady: true },
  { id: 'green', category: 'texture', name: 'Green noise', hint: 'Mid-range, natural', defaultVolume: 0.5, level: 0.233, reverb: 0, steady: true },
  { id: 'am', category: 'effects', name: 'Amplitude mod', hint: 'Gentle pulsing on mix', defaultVolume: 0.4, level: 1, reverb: 0, effect: true, steady: true },
  { id: 'wobble', category: 'effects', name: 'Tape wobble', hint: 'Warps the whole mix', defaultVolume: 0.4, level: 1, reverb: 0, effect: true, steady: true },
  { id: 'width', category: 'effects', name: 'Stereo width', hint: 'Spreads the mix wider', defaultVolume: 0.5, level: 1, reverb: 0, effect: true, steady: true },
  { id: 'orbit', category: 'effects', name: 'Orbit', hint: 'Mix drifts slowly around you', defaultVolume: 0.4, level: 1, reverb: 0, effect: true, steady: true },
  { id: 'hall', category: 'effects', name: 'Large hall', hint: 'Mix plays in a big, far room', defaultVolume: 0.4, level: 1, reverb: 0, effect: true, steady: true },
];

export const TILE_BY_ID: Record<TileId, TileMeta> = Object.fromEntries(
  TILES.map((t) => [t.id, t]),
) as Record<TileId, TileMeta>;

export const CATEGORIES: { id: Category; name: string; note?: string }[] = [
  { id: 'pads', name: 'Pads' },
  { id: 'bass', name: 'Bass' },
  { id: 'drums', name: 'Drums' },
  { id: 'texture', name: 'Texture' },
  { id: 'effects', name: 'Effects', note: 'Change the whole mix instead of adding a sound' },
];

export const isTileId = (s: string): s is TileId => (TILE_IDS as readonly string[]).includes(s);
