// Dev-only comparison page (compare.html, or npm run compare): each tile that has an alternate voice
// (src/engine/alternates), played with both its own voice (A) and the alternate (B) on the very same notes,
// so switching is instant and only the voice changes.
import { ALTERNATES, ALTERNATE_TILES } from './engine/alternates';
import { Engine } from './engine/engine';
import { TILE_BY_ID, type TileId } from './tiles';

const COMPARED: TileId[] = ALTERNATE_TILES;
const BACKING: TileId[] = ['pad', 'sub', 'lofi', 'brown'];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const on = new Set<TileId>(COMPARED.slice(0, 1));
const backing = new Set<TileId>();
let engine: Engine | null = null;
/** Which side is heard: 0 = A, 1 = B. */
let side = 0;
/** Blind mode swaps the sides at random, so A is not always the synth. */
let swapped = false;

function toggles(container: HTMLElement, ids: TileId[], set: Set<TileId>) {
  for (const id of ids) {
    const b = document.createElement('button');
    b.textContent = TILE_BY_ID[id].name;
    b.setAttribute('aria-pressed', String(set.has(id)));
    b.onclick = () => {
      if (set.has(id)) set.delete(id);
      else set.add(id);
      b.setAttribute('aria-pressed', String(set.has(id)));
      apply();
      labels();
    };
    container.append(b);
  }
}

/** Volumes a little under each tile's default, with the backing quieter still, so nothing hits the limiter. */
function apply() {
  if (!engine) return;
  for (const id of COMPARED) engine.setTile(id, on.has(id), TILE_BY_ID[id].defaultVolume);
  for (const id of BACKING) engine.setTile(id, backing.has(id), TILE_BY_ID[id].defaultVolume * 0.7);
}

/** What B is, for the tiles switched on. */
function alternateName(): string {
  const names = new Set([...on].map((id) => ALTERNATES[id as keyof typeof ALTERNATES]?.label ?? 'Alternate'));
  return names.size === 1 ? [...names][0] : 'Alternates';
}

function labels() {
  const blind = $<HTMLInputElement>('blind').checked;
  const names = swapped ? [alternateName(), 'Current'] : ['Current', alternateName()];
  $('a').innerHTML = `A<small>${blind ? '?' : names[0]}</small>`;
  $('b').innerHTML = `B<small>${blind ? '?' : names[1]}</small>`;
  $('a').setAttribute('aria-pressed', String(side === 0));
  $('b').setAttribute('aria-pressed', String(side === 1));
}

function hear(next: number) {
  side = next;
  // The alternate is heard when B is picked, unless blind mode swapped the sides.
  engine?.setCompareMix((side === 1) !== swapped ? 1 : 0);
  labels();
}

async function togglePlay() {
  const play = $<HTMLButtonElement>('play');
  if (!engine) {
    play.disabled = true;
    $('status').textContent = 'Loading…';
    engine = new Engine(undefined, { alternates: ALTERNATES });
    engine.setBpm(Number($<HTMLInputElement>('bpm').value));
    engine.setEvolution(Number($<HTMLInputElement>('evolution').value) / 100);
    await engine.ready;
    hear(side);
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

toggles($('tiles'), COMPARED, on);
toggles($('backing'), BACKING, backing);
labels();

$('play').onclick = () => void togglePlay();
$('a').onclick = () => hear(0);
$('b').onclick = () => hear(1);
$<HTMLInputElement>('blind').onchange = (e) => {
  const blind = (e.target as HTMLInputElement).checked;
  swapped = blind && Math.random() < 0.5;
  $('reveal').hidden = !blind;
  $('reveal-out').textContent = '';
  hear(side);
};
$('reveal').onclick = () => {
  const alt = alternateName().toLowerCase();
  $('reveal-out').textContent = swapped ? `A was the ${alt}, B the current voice.` : `A was the current voice, B the ${alt}.`;
};
$<HTMLInputElement>('evolution').oninput = (e) => engine?.setEvolution(Number((e.target as HTMLInputElement).value) / 100);
$<HTMLInputElement>('bpm').oninput = (e) => {
  const bpm = Number((e.target as HTMLInputElement).value);
  $('bpm-out').textContent = String(bpm);
  engine?.setBpm(bpm);
};
document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
  if (e.key === ' ') {
    e.preventDefault();
    hear(1 - side);
  } else if (e.key === 'a' || e.key === 'A') hear(0);
  else if (e.key === 'b' || e.key === 'B') hear(1);
  else if (e.key === 'p' || e.key === 'P') void togglePlay();
});
