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
  restoreMixes,
  rollBpm,
  rollKey,
  surpriseMix,
  type MixState,
  type SavedMix,
} from './state/mix';
import { CATEGORIES, TILES, TILE_IDS, type TileId } from './tiles';
import { AboutSheet } from './ui/AboutSheet';
import { useMediaSession } from './ui/mediaSession';
import { MixesPanel } from './ui/MixesPanel';
import { PlayerBar } from './ui/PlayerBar';
import { PlayIcon } from './ui/PlayIcon';
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

function evolutionText(v: number): string {
  if (v < 0.15) return 'completely steady';
  if (v < 0.4) return 'mostly steady';
  if (v < 0.7) return 'gently changing';
  return 'constantly shifting';
}

interface Toast {
  msg: string;
  undo?: () => void;
}

export function App() {
  const [mix, setMix] = useState<MixState>(initialMix);
  // Random BPM and key used whenever the user left them on Auto.
  const [rolled, setRolled] = useState(() => ({ bpm: rollBpm(), key: rollKey() }));
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [chord, setChord] = useState('');
  const [saved, setSaved] = useState<SavedMix[]>(loadSavedMixes);
  const [sheet, setSheet] = useState<'mixes' | 'about' | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [offline, setOffline] = useState<'off' | 'busy' | 'on'>(isOfflineEnabled() ? 'on' : 'off');
  const [heroVisible, setHeroVisible] = useState(true);
  const [showTempoKey, setShowTempoKey] = useState(false);
  const install = useInstallPrompt();
  const engineRef = useRef<Engine | null>(null);
  const appliedRef = useRef<MixState | null>(null);
  const heroRef = useRef<HTMLElement>(null);
  const pointerFocus = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const bpm = mix.bpm ?? rolled.bpm;
  const key = mix.key ?? rolled.key;

  const say = useCallback((msg: string, undo?: () => void) => {
    setToast({ msg, undo });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), undo ? 6500 : 2600);
  }, []);

  /** Replaces the whole mix, with an Undo that puts the previous one back. */
  const replaceMix = useCallback(
    (next: MixState, msg: string) => {
      const prev = mix;
      setMix(next);
      say(msg, () => {
        setMix(prev);
        say('Undone');
      });
    },
    [mix, say],
  );

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
      replaceMix(m, 'Mix loaded from link');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [replaceMix]);

  // Show the compact player once the main play button has scrolled away.
  useEffect(() => {
    const el = heroRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setHeroVisible(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
      return;
    }
    setStarting(true);
    try {
      await engine.start();
      setPlaying(true);
    } catch {
      engine.playing = false;
      say('Couldn’t start audio. Tap play again.');
    } finally {
      setStarting(false);
    }
  }, [mix, bpm, key, say]);

  const play = useCallback(() => {
    if (!engineRef.current?.playing) void togglePlay();
  }, [togglePlay]);
  const pause = useCallback(() => {
    if (engineRef.current?.playing) void togglePlay();
  }, [togglePlay]);

  const activeIds = TILE_IDS.filter((id) => mix.tiles[id].on);
  const activeCount = activeIds.length;

  useMediaSession({
    playing,
    subtitle: activeIds.map((id) => TILES.find((t) => t.id === id)!.name).join(', '),
    play,
    pause,
  });

  // Space bar toggles playback, except where Space already means something.
  useEffect(() => {
    // :focus-visible turns on as soon as a key is pressed, so remember how focus got there instead.
    const onPointer = () => {
      pointerFocus.current = true;
    };
    const ownsSpace = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.code !== 'Space' || !el || !el.closest) return true;
      if (el.closest('input[type="text"], textarea, select, [role="dialog"]')) return true;
      // A button the keyboard user tabbed to keeps its normal behaviour; one that was just clicked does not.
      return !!el.closest('button') && !pointerFocus.current;
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') pointerFocus.current = false;
      if (ownsSpace(e)) return;
      e.preventDefault();
      if (!e.repeat) void togglePlay();
    };
    // Firefox activates a focused button on keyup, so block that too.
    const onUp = (e: KeyboardEvent) => {
      if (!ownsSpace(e)) e.preventDefault();
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [togglePlay]);

  const setTile = (id: TileId, patch: Partial<MixState['tiles'][TileId]>) =>
    setMix((m) => ({ ...m, tiles: { ...m.tiles, [id]: { ...m.tiles[id], ...patch } } }));

  const toggleTile = (id: TileId) => {
    const turningOn = !mix.tiles[id].on;
    setTile(id, { on: turningOn });
    // Picking a sound while stopped means "play this".
    if (turningOn && !playing && !starting) void togglePlay();
  };

  const surprise = () => {
    replaceMix(surpriseMix(), 'Surprise mix');
    setRolled({ bpm: rollBpm(), key: rollKey() });
  };

  const clearAll = () => {
    const tiles = { ...mix.tiles };
    for (const id of TILE_IDS) tiles[id] = { ...tiles[id], on: false };
    replaceMix({ ...mix, tiles }, 'All tiles off');
  };

  const jumpToTile = (id: TileId) => {
    const el = document.getElementById(`tile-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  };

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${encodeMix(mix)}`;
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: 'Garsae mix', url });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
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

  const statusText = `Key of ${NOTE_NAMES[key]} · ${bpm} bpm${playing && chord ? ` · ${chord}` : ''}`;

  return (
    <div className="app">
      <div className="aura" aria-hidden="true" />
      <header className="hero" ref={heroRef}>
        <h1 className="wordmark">Garsae</h1>
        <button
          type="button"
          className={`play${playing ? ' playing' : ''}`}
          onClick={() => void togglePlay()}
          aria-label={playing ? 'Pause' : 'Play'}
          aria-busy={starting}
        >
          <PlayIcon playing={playing} />
        </button>
        <p className="status" title={`${NOTE_NAMES[key]} Dorian`}>
          <span>Key of {NOTE_NAMES[key]}</span>
          <span aria-hidden="true">·</span>
          <span>{bpm} bpm</span>
          {playing && chord && (
            <>
              <span aria-hidden="true">·</span>
              <span className="chord">{chord}</span>
            </>
          )}
        </p>
        {!playing && activeCount > 0 && <p className="hint">Press play, or tap any tile to start.</p>}
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
            aria-valuetext={`${Math.round(mix.evolution * 100)}%, ${evolutionText(mix.evolution)}`}
            onChange={(e) => setMix((m) => ({ ...m, evolution: Number(e.target.value) / 100 }))}
          />
          <div className="scale-labels">
            <span>Static</span>
            <span className="muted">{evolutionText(mix.evolution)}</span>
            <span>Shifting</span>
          </div>
        </div>

        <button
          type="button"
          className="tk-toggle chip"
          aria-expanded={showTempoKey}
          onClick={() => setShowTempoKey((v) => !v)}
        >
          Tempo & key {showTempoKey ? '▴' : '▾'}
        </button>

        <div className={`tk${showTempoKey ? ' open' : ''}`}>
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
        </div>

        <div className="actions">
          <button type="button" className="pill primary" onClick={surprise}>
            Surprise me
          </button>
          <button type="button" className="pill" onClick={() => setSheet('mixes')}>
            Mixes{saved.length ? ` (${saved.length})` : ''}
          </button>
          <button type="button" className="pill" onClick={() => void share()} disabled={activeCount === 0}>
            Share link
          </button>
        </div>

        <div className="nowplaying">
          <span className="np-label">On now</span>
          {activeCount === 0 ? (
            <span className="muted">Nothing yet. Tap a tile below.</span>
          ) : (
            <>
              <ul className="np-list">
                {activeIds.map((id) => {
                  const t = TILES.find((x) => x.id === id)!;
                  return (
                    <li key={id}>
                      <button type="button" className={`np-chip cat-${t.category}`} onClick={() => jumpToTile(id)}>
                        <span className="np-dot" aria-hidden="true" />
                        {t.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button type="button" className="chip" onClick={clearAll}>
                Clear
              </button>
            </>
          )}
        </div>
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
                  onToggle={() => toggleTile(t.id)}
                  onVolume={(v) => setTile(t.id, { volume: v })}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      <footer className="footer">
        <button type="button" className="linklike" onClick={() => setSheet('about')}>
          About & offline
        </button>
      </footer>

      <PlayerBar
        visible={!heroVisible}
        playing={playing}
        starting={starting}
        status={statusText}
        activeCount={activeCount}
        onToggle={() => void togglePlay()}
        onMixes={() => setSheet('mixes')}
        onShare={() => void share()}
      />

      {sheet === 'mixes' && (
        <MixesPanel
          mix={mix}
          saved={saved}
          onChange={(list, message, undo) => {
            setSaved(list);
            say(message, undo ? () => {
              setSaved(restoreMixes(undo));
              say('Restored');
            } : undefined);
          }}
          onLoad={(m) => {
            const decoded = decodeMix(m.mix);
            if (decoded) replaceMix(decoded, `Loaded “${m.name}”`);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'about' && (
        <AboutSheet
          offlineSupported={offlineSupported()}
          offline={offline}
          onToggleOffline={() => void toggleOffline()}
          onInstall={install ? () => void install() : null}
          onClose={() => setSheet(null)}
        />
      )}

      <div className={`toast${toast ? ' show' : ''}`} role="status" aria-live="polite">
        <span>{toast?.msg}</span>
        {toast?.undo && (
          <button
            type="button"
            className="toast-undo"
            onClick={() => {
              toast.undo?.();
            }}
          >
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
