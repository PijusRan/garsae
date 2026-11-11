// Dev-only comparison page (compare.html, or npm run compare): the tiles that have a physical model, played through
// the engine in A/B mode, so the synth voice and the model play the very same notes and switching is instant.
import { Engine } from './engine/engine';
import { MODEL_TILES } from './engine/models/host';
import { TILE_BY_ID, type TileId } from './tiles';

const MODELLED = Object.keys(MODEL_TILES) as TileId[];
const BACKING: TileId[] = ['pad', 'sub', 'lofi', 'brown'];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const on = new Set<TileId>(['flute']);
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
    };
    container.append(b);
  }
}

/** Volumes a little under each tile's default, with the backing quieter still, so nothing hits the limiter. */
function apply() {
  if (!engine) return;
  for (const id of MODELLED) engine.setTile(id, on.has(id), TILE_BY_ID[id].defaultVolume);
  for (const id of BACKING) engine.setTile(id, backing.has(id), TILE_BY_ID[id].defaultVolume * 0.7);
}

function labels() {
  const blind = $<HTMLInputElement>('blind').checked;
  const names = swapped ? ['Physical model', 'Synth'] : ['Synth', 'Physical model'];
  $('a').innerHTML = `A<small>${blind ? '?' : names[0]}</small>`;
  $('b').innerHTML = `B<small>${blind ? '?' : names[1]}</small>`;
  $('a').setAttribute('aria-pressed', String(side === 0));
  $('b').setAttribute('aria-pressed', String(side === 1));
}

function hear(next: number) {
  side = next;
  // The model is heard when B is picked, unless blind mode swapped the sides.
  engine?.setModelMix((side === 1) !== swapped ? 1 : 0);
  labels();
}

async function togglePlay() {
  const play = $<HTMLButtonElement>('play');
  if (!engine) {
    play.disabled = true;
    $('status').textContent = 'Loading the models…';
    engine = new Engine(undefined, { voices: 'ab' });
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

toggles($('tiles'), MODELLED, on);
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
  $('reveal-out').textContent = swapped ? 'A was the physical model, B the synth.' : 'A was the synth, B the physical model.';
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
