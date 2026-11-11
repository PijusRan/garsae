// Dev-only comparison page (compare.html, or npm run compare): each tile with alternates (src/engine/alternates) plays
// its own voice (A) and every alternate (B, C, ...) on the very same notes, so switching is instant and only the
// voice changes.
import { ALTERNATE_TILES, ALTERNATES, prepareAlternates, slotLabels } from './engine/alternates';
import { Engine } from './engine/engine';
import { CATEGORIES, TILE_BY_ID, type TileId } from './tiles';

const BACKING: TileId[] = ['pad', 'sub', 'lofi', 'brown'];
const LETTERS = 'ABCDEFG';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const on = new Set<TileId>(ALTERNATE_TILES.slice(0, 1));
const backing = new Set<TileId>();
let engine: Engine | null = null;
/** The button picked (0 = A). */
let picked = 0;
/** Which voice each button plays: in order, or shuffled in blind mode. */
let order: number[] = [0];

function toggle(id: TileId, set: Set<TileId>): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = TILE_BY_ID[id].name;
  b.setAttribute('aria-pressed', String(set.has(id)));
  b.onclick = () => {
    if (set.has(id)) set.delete(id);
    else set.add(id);
    b.setAttribute('aria-pressed', String(set.has(id)));
    apply();
    slots();
  };
  return b;
}

/** The tiles with alternates, by category. */
function tileButtons() {
  for (const cat of CATEGORIES) {
    const ids = ALTERNATE_TILES.filter((id) => TILE_BY_ID[id].category === cat.id);
    if (!ids.length) continue;
    const group = document.createElement('div');
    group.className = 'group';
    const h = document.createElement('h3');
    h.textContent = cat.name;
    const row = document.createElement('div');
    row.className = 'row';
    for (const id of ids) row.append(toggle(id, on));
    group.append(h, row);
    $('tiles').append(group);
  }
}

/** Volumes at each tile's default, the backing quieter, so nothing hits the limiter. */
function apply() {
  if (!engine) return;
  for (const id of ALTERNATE_TILES) engine.setTile(id, on.has(id), TILE_BY_ID[id].defaultVolume);
  for (const id of BACKING) if (!ALTERNATES[id]) engine.setTile(id, backing.has(id), TILE_BY_ID[id].defaultVolume * 0.7);
}

/** What voice k is, for the tiles switched on. */
function slotName(k: number): string {
  const names = new Set([...on].map((id) => slotLabels(id)[k]).filter(Boolean));
  return names.size === 1 ? [...names][0] : names.size ? [...names].join(' / ') : 'Current';
}

function blind(): boolean {
  return $<HTMLInputElement>('blind').checked;
}

/** One button per voice the switched-on tiles have. */
function slots() {
  const count = Math.max(1, ...[...on].map((id) => slotLabels(id).length));
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
}

function shuffle() {
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
}

function hear(i: number) {
  picked = i;
  engine?.setCompareChoice(order[i]);
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
    hear(picked);
    apply();
    play.disabled = false;
    $('status').textContent = '';
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
slots();

$('play').onclick = () => void togglePlay();
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
});
