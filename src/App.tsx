import { useCallback, useEffect, useRef, useState } from 'react';
import { Engine } from './engine/engine';
import { NOTE_NAMES } from './engine/theory';
import {
  BPM_MAX,
  BPM_MIN,
  decodeMix,
  defaultMix,
  encodeMix,
  loadLast,
  loadSavedMixes,
  rememberLast,
  rollBpm,
  rollKey,
  surpriseMix,
  type MixState,
  type SavedMix,
} from './state/mix';
import { CATEGORIES, TILES, TILE_IDS, type TileId } from './tiles';
import { MixesPanel } from './ui/MixesPanel';
import { TileCard } from './ui/TileCard';
import { disableOffline, enableOffline, isOfflineEnabled, offlineSupported, useInstallPrompt } from './ui/pwa';

/** Sends only what changed to the engine. The UI never touches audio directly. */
function applyMix(engine: Engine, mix: MixState, prev: MixState | null, bpm: number, key: number): void {
  if (engine.bpm !== bpm) engine.setBpm(bpm);
  if (engine.root !== key) engine.setKey(key);
  if (!prev || prev.evolution !== mix.evolution) engine.setEvolution(mix.evolution);
  for (const id of TILE_IDS) {
    const s = mix.tiles[id];
    const p = prev?.tiles[id];
    if (!p || p.on !== s.on || p.volume !== s.volume) engine.setTile(id, s.on, s.volume);
  }
}

function initialMix(): MixState {
  const fromLink = decodeMix(window.location.hash);
  if (fromLink) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    return fromLink;
  }
  return loadLast() ?? defaultMix();
}

function PlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
      <rect x="6.5" y="5" width="4" height="14" rx="1.5" fill="currentColor" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.5" fill="currentColor" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" />
    </svg>
  );
}

export function App() {
  const [mix, setMix] = useState<MixState>(initialMix);
  // Random BPM and key used whenever the user left them on Auto.
  const [rolled, setRolled] = useState(() => ({ bpm: rollBpm(), key: rollKey() }));
  const [playing, setPlaying] = useState(false);
  const [chord, setChord] = useState('');
  const [saved, setSaved] = useState<SavedMix[]>(loadSavedMixes);
  const [showMixes, setShowMixes] = useState(false);
  const [toast, setToast] = useState('');
  const [offline, setOffline] = useState<'off' | 'busy' | 'on'>(isOfflineEnabled() ? 'on' : 'off');
  const install = useInstallPrompt();
  const engineRef = useRef<Engine | null>(null);
  const appliedRef = useRef<MixState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const bpm = mix.bpm ?? rolled.bpm;
  const key = mix.key ?? rolled.key;

  const say = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  useEffect(() => {
    rememberLast(mix);
    const engine = engineRef.current;
    if (!engine) return;
    applyMix(engine, mix, appliedRef.current, bpm, key);
    appliedRef.current = mix;
  }, [mix, bpm, key]);

  // Opening a share link while the app is already open.
  useEffect(() => {
    const onHash = () => {
      const m = decodeMix(window.location.hash);
      if (!m) return;
      history.replaceState(null, '', window.location.pathname + window.location.search);
      setMix(m);
      say('Mix loaded from link');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [say]);

  const togglePlay = useCallback(async () => {
    let engine = engineRef.current;
    if (!engine) {
      // Created inside the tap so iOS lets the AudioContext start.
      engine = new Engine();
      engine.onChord = setChord;
      applyMix(engine, mix, null, bpm, key);
      appliedRef.current = mix;
      engineRef.current = engine;
    }
    if (engine.playing) {
      engine.stop();
      setPlaying(false);
    } else {
      await engine.start();
      setPlaying(true);
    }
  }, [mix, bpm, key]);

  // Space bar toggles playback (unless typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.code !== 'Space' || el.closest('input, textarea, select, button')) return;
      e.preventDefault();
      void togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay]);

  const setTile = (id: TileId, patch: Partial<MixState['tiles'][TileId]>) =>
    setMix((m) => ({ ...m, tiles: { ...m.tiles, [id]: { ...m.tiles[id], ...patch } } }));

  const surprise = () => {
    setMix(surpriseMix());
    setRolled({ bpm: rollBpm(), key: rollKey() });
    say('Surprise mix');
  };

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${encodeMix(mix)}`;
    try {
      await navigator.clipboard.writeText(url);
      say('Link copied');
    } catch {
      window.prompt('Copy this link', url);
    }
  };

  const toggleOffline = async () => {
    const was = offline;
    setOffline('busy');
    try {
      if (was === 'on') {
        await disableOffline();
        setOffline('off');
        say('Offline copy removed');
      } else {
        await enableOffline();
        setOffline('on');
        say('Ready for offline use');
      }
    } catch {
      setOffline(was);
      say('Could not change offline mode');
    }
  };

  const activeCount = TILE_IDS.filter((id) => mix.tiles[id].on).length;

  return (
    <div className="app">
      <div className="aura" aria-hidden="true" />
      <header className="hero">
        <h1 className="wordmark">Garsae</h1>
        <button
          type="button"
          className={`play${playing ? ' playing' : ''}`}
          onClick={() => void togglePlay()}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          <PlayIcon playing={playing} />
        </button>
        <p className="status">
          <span>{NOTE_NAMES[key]} dorian</span>
          <span aria-hidden="true">·</span>
          <span>{bpm} bpm</span>
          {playing && chord && (
            <>
              <span aria-hidden="true">·</span>
              <span className="chord">{chord}</span>
            </>
          )}
        </p>
      </header>

      <section className="controls glass" aria-label="Global controls">
        <div className="control evolution">
          <label htmlFor="evolution">Evolution</label>
          <input
            id="evolution"
            type="range"
            min={0}
            max={100}
            value={Math.round(mix.evolution * 100)}
            onChange={(e) => setMix((m) => ({ ...m, evolution: Number(e.target.value) / 100 }))}
          />
          <div className="scale-labels" aria-hidden="true">
            <span>Static</span>
            <span>Shifting</span>
          </div>
        </div>

        <div className="control">
          <label htmlFor="bpm">Tempo</label>
          <div className="inline">
            <button
              type="button"
              className={`chip${mix.bpm === null ? ' active' : ''}`}
              onClick={() => setMix((m) => ({ ...m, bpm: null }))}
              aria-pressed={mix.bpm === null}
            >
              Auto
            </button>
            <input
              id="bpm"
              type="range"
              min={BPM_MIN}
              max={BPM_MAX}
              value={bpm}
              onChange={(e) => setMix((m) => ({ ...m, bpm: Number(e.target.value) }))}
            />
            <output htmlFor="bpm" className="value">
              {bpm}
            </output>
          </div>
        </div>

        <div className="control">
          <label htmlFor="key">Key</label>
          <select
            id="key"
            value={mix.key === null ? 'auto' : String(mix.key)}
            onChange={(e) => setMix((m) => ({ ...m, key: e.target.value === 'auto' ? null : Number(e.target.value) }))}
          >
            <option value="auto">Auto ({NOTE_NAMES[rolled.key]})</option>
            {NOTE_NAMES.map((n, i) => (
              <option key={n} value={i}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <button type="button" className="pill primary surprise" onClick={surprise}>
          Surprise me
        </button>
      </section>

      <main>
        {CATEGORIES.map((cat) => (
          <section key={cat.id} className="category" aria-labelledby={`cat-${cat.id}`}>
            <h2 id={`cat-${cat.id}`}>{cat.name}</h2>
            <div className="tiles">
              {TILES.filter((t) => t.category === cat.id).map((t) => (
                <TileCard
                  key={t.id}
                  meta={t}
                  setting={mix.tiles[t.id]}
                  onToggle={() => setTile(t.id, { on: !mix.tiles[t.id].on })}
                  onVolume={(v) => setTile(t.id, { volume: v })}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      <footer className="footer">
        <button type="button" className="pill" onClick={() => setShowMixes(true)}>
          Mixes{saved.length ? ` (${saved.length})` : ''}
        </button>
        <button type="button" className="pill" onClick={() => void share()} disabled={activeCount === 0}>
          Share link
        </button>
        {offlineSupported() && (
          <button type="button" className="pill" onClick={() => void toggleOffline()} disabled={offline === 'busy'}>
            {offline === 'on' ? 'Offline ready ✓' : offline === 'busy' ? 'Saving…' : 'Download for offline'}
          </button>
        )}
        {install && (
          <button type="button" className="pill subtle" onClick={() => void install()}>
            Install
          </button>
        )}
      </footer>
      <p className="fineprint">
        All sound is synthesized live and never repeats. Experimental tiles make no health claims; binaural needs headphones.
      </p>

      {showMixes && (
        <MixesPanel
          mix={mix}
          saved={saved}
          onChange={(list, message) => {
            setSaved(list);
            say(message);
          }}
          onLoad={(m) => {
            const decoded = decodeMix(m.mix);
            if (decoded) setMix(decoded);
            setShowMixes(false);
            say(`Loaded “${m.name}”`);
          }}
          onClose={() => setShowMixes(false)}
        />
      )}

      <div className={`toast${toast ? ' show' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
