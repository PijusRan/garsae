// Dev-only comparison page (compare.html, or npm run compare): each tile with alternates (src/engine/alternates) plays
// its own voice (A) and every alternate (B, C, ...) side by side, so switching is instant. Voice and kit alternates
// take the very same notes; generator alternates write their own. Tiles are grouped by listening round, the newest
// first and marked as the one to test, the earlier ones folded away. A round can also test Surprise me: then each
// voice is a generator of whole mixes (MIX_ALTERNATES), and each button plays the mix its generator last rolled.
import {
  ALTERNATE_TILES,
  ALTERNATES,
  CURRENT_ROUND,
  MIX_ALTERNATES,
  MIX_CURRENT,
  ROUNDS,
  prepareAlternates,
  roundOf,
  slotLabels,
} from './engine/alternates';
import { Engine } from './engine/engine';
import { NOTE_NAMES } from './engine/theory';
import type { SurpriseRoll } from './state/surprise';
import { TILE_BY_ID, TILE_IDS, type TileId } from './tiles';

const BACKING: TileId[] = ['pad', 'sub', 'lofi', 'brown'];
const LETTERS = 'ABCDEFG';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const on = new Set<TileId>(ALTERNATE_TILES.filter((id) => roundOf(id) === CURRENT_ROUND));
const backing = new Set<TileId>();
/** The round whose Surprise me generators are being compared, or null when comparing tiles. */
let mixRound: number | null = MIX_ALTERNATES.some((a) => a.round === CURRENT_ROUND) ? CURRENT_ROUND : null;
/** The generators of the mix round, A first, and what each rolled last. */
let mixGens: { label: string; next: () => SurpriseRoll }[] = [];
let rolls: SurpriseRoll[] = [];
/** Brings every toggle button in line with the state. */
const syncs: (() => void)[] = [];
let engine: Engine | null = null;
/** The button picked (0 = A). */
let picked = 0;
/** Which voice each button plays: in order, or shuffled in blind mode. */
let order: number[] = [0];

function toggle(id: TileId, set: Set<TileId>): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = TILE_BY_ID[id].name;
  syncs.push(() => b.setAttribute('aria-pressed', String(mixRound === null && set.has(id))));
  b.onclick = () => {
    // Picking a tile leaves Surprise me, with the tiles that were on before it.
    if (mixRound !== null) {
      setMixRound(null);
      set.add(id);
    } else if (set.has(id)) set.delete(id);
    else set.add(id);
    refresh();
  };
  return b;
}

/** The button that compares a round's Surprise me generators instead of tiles. */
function mixToggle(round: number): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = 'Surprise me';
  syncs.push(() => b.setAttribute('aria-pressed', String(mixRound === round)));
  b.onclick = () => {
    setMixRound(mixRound === round ? null : round);
    refresh();
  };
  return b;
}

function setMixRound(round: number | null) {
  mixRound = round;
  mixGens =
    round === null
      ? []
      : [MIX_CURRENT, ...MIX_ALTERNATES.filter((a) => a.round === round)].map((a) => ({ label: a.label, next: a.create() }));
  rolls = mixGens.map((g) => g.next());
  order = [];
}

/** A new mix from every generator. */
function rollAgain() {
  rolls = mixGens.map((g) => g.next());
  apply();
  slots();
}

function refresh() {
  for (const sync of syncs) sync();
  $('roll').hidden = mixRound === null;
  // Slots first: they rebuild the order of the voices, which the mix to play is looked up in.
  slots();
  apply();
}

/** The tiles with alternates, by round: the current round first and open, the earlier ones folded. */
function tileButtons() {
  const earlier = document.createElement('details');
  earlier.className = 'earlier';
  const summary = document.createElement('summary');
  summary.textContent = 'Earlier rounds';
  earlier.append(summary);
  for (const r of [...ROUNDS].reverse()) {
    const ids = ALTERNATE_TILES.filter((id) => roundOf(id) === r.round);
    const mixes = MIX_ALTERNATES.some((a) => a.round === r.round);
    if (!ids.length && !mixes) continue;
    const current = r.round === CURRENT_ROUND;
    const group = document.createElement('section');
    group.className = current ? 'round current' : 'round';
    const h = document.createElement('h3');
    // The newest round is marked to test, or as shipped once it is decided, so a finished round never asks for a test.
    const badge = !current ? '' : r.shipped ? ' <span class="badge done">Shipped, nothing new to test</span>' : ' <span class="badge">Test this</span>';
    h.innerHTML = `<span class="num">Round ${r.round}</span> ${r.title}${badge}`;
    const note = document.createElement('p');
    note.className = 'listen';
    note.textContent = r.listen;
    const row = document.createElement('div');
    row.className = 'row';
    if (mixes) row.append(mixToggle(r.round));
    for (const id of ids) row.append(toggle(id, on));
    group.append(h, note, row);
    (current ? $('tiles') : earlier).append(group);
  }
  if (earlier.children.length > 1) $('tiles').append(earlier);
}

/** Volumes at each tile's default, the backing quieter, so nothing hits the limiter. In Surprise me, the picked mix. */
function apply() {
  if (!engine) return;
  if (mixRound !== null) return playRoll(engine, rolls[order[picked]]);
  for (const id of TILE_IDS) {
    engine.setTileEvolution(id, null);
    if (!ALTERNATES[id] && !BACKING.includes(id)) engine.setTile(id, false);
  }
  for (const id of ALTERNATE_TILES) engine.setTile(id, on.has(id), TILE_BY_ID[id].defaultVolume);
  for (const id of BACKING) if (!ALTERNATES[id]) engine.setTile(id, backing.has(id), TILE_BY_ID[id].defaultVolume * 0.7);
}

/** Plays a rolled mix as the app would, on the tiles' own voices, and shows its settings on the sliders. */
function playRoll(engine: Engine, roll: SurpriseRoll) {
  engine.setCompareChoice(0);
  engine.setBpm(roll.bpm);
  engine.setKey(roll.key);
  engine.setEvolution(roll.mix.evolution);
  for (const id of TILE_IDS) {
    const s = roll.mix.tiles[id];
    engine.setTile(id, s.on, s.volume);
    engine.setTileEvolution(id, s.evolution);
  }
  $<HTMLInputElement>('bpm').value = String(roll.bpm);
  $('bpm-out').textContent = String(roll.bpm);
  $<HTMLInputElement>('evolution').value = String(Math.round(roll.mix.evolution * 100));
}

/** What the picked mix is, unless blind. */
function describeRoll(): string {
  if (mixRound === null || blind()) return '';
  const roll = rolls[order[picked]];
  const tiles = TILE_IDS.filter((id) => roll.mix.tiles[id].on).map((id) => {
    const own = roll.mix.tiles[id].evolution;
    return TILE_BY_ID[id].name + (own === null ? '' : ` (own Evolution ${Math.round(own * 100)})`);
  });
  return `${roll.style}: ${tiles.join(', ')}. ${roll.bpm} bpm in ${NOTE_NAMES[roll.key]}.`;
}

/** What voice k is, for the tiles switched on. */
function slotName(k: number): string {
  if (mixRound !== null) return mixGens[k]?.label ?? 'Current';
  const names = new Set([...on].map((id) => slotLabels(id)[k]).filter(Boolean));
  return names.size === 1 ? [...names][0] : names.size ? [...names].join(' / ') : 'Current';
}

function blind(): boolean {
  return $<HTMLInputElement>('blind').checked;
}

/** One button per voice the switched-on tiles have. */
function slots() {
  const count = mixRound !== null ? mixGens.length : Math.max(1, ...[...on].map((id) => slotLabels(id).length));
  if (order.length !== count) {
    order = Array.from({ length: count }, (_, i) => i);
    if (blind()) shuffle();
    picked = Math.min(picked, count - 1);
  }
  const box = $('slots');
  box.replaceChildren();
  order.forEach((voice, i) => {
    const b = document.createElement('button');
    b.innerHTML = `${LETTERS[i]}<small>${blind() ? '?' : slotName(voice)}</small>`;
    b.setAttribute('aria-pressed', String(i === picked));
    b.onclick = () => hear(i);
    box.append(b);
  });
  if (engine && !$('status').textContent?.startsWith('Loading')) $('status').textContent = describeRoll();
}

function shuffle() {
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
}

function hear(i: number) {
  picked = i;
  if (mixRound !== null) apply();
  else engine?.setCompareChoice(order[i]);
  slots();
}

async function togglePlay() {
  const play = $<HTMLButtonElement>('play');
  if (!engine) {
    play.disabled = true;
    $('status').textContent = 'Loading…';
    engine = new Engine(undefined, { alternates: ALTERNATES });
    engine.setBpm(Number($<HTMLInputElement>('bpm').value));
    engine.setEvolution(Number($<HTMLInputElement>('evolution').value) / 100);
    await Promise.all([engine.ready, prepareAlternates(engine.ctx)]);
    play.disabled = false;
    $('status').textContent = '';
    hear(picked);
    apply();
  }
  if (engine.playing) {
    engine.stop();
    play.textContent = 'Play';
  } else {
    await engine.start();
    play.textContent = 'Stop';
  }
}

tileButtons();
for (const id of BACKING) if (!ALTERNATES[id]) $('backing').append(toggle(id, backing));
setMixRound(mixRound);
refresh();

$('play').onclick = () => void togglePlay();
$('roll').onclick = rollAgain;
$<HTMLInputElement>('blind').onchange = () => {
  order = order.map((_, i) => i);
  if (blind()) shuffle();
  $('reveal').hidden = !blind();
  $('reveal-out').textContent = '';
  hear(picked);
};
$('reveal').onclick = () => {
  $('reveal-out').textContent = order.map((voice, i) => `${LETTERS[i]} was ${slotName(voice).toLowerCase()}`).join(', ') + '.';
};
$<HTMLInputElement>('evolution').oninput = (e) => engine?.setEvolution(Number((e.target as HTMLInputElement).value) / 100);
$<HTMLInputElement>('bpm').oninput = (e) => {
  const bpm = Number((e.target as HTMLInputElement).value);
  $('bpm-out').textContent = String(bpm);
  engine?.setBpm(bpm);
};
document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
  const letter = LETTERS.indexOf(e.key.toUpperCase());
  if (e.key === ' ') {
    e.preventDefault();
    hear((picked + 1) % order.length);
  } else if (letter >= 0 && letter < order.length) hear(letter);
  else if (e.key === 'p' || e.key === 'P') void togglePlay();
  else if ((e.key === 'r' || e.key === 'R') && mixRound !== null) rollAgain();
});
