import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
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
  loadVolume,
  rememberLast,
  restoreMixes,
  rollBpm,
  rollKey,
  saveVolume,
  surpriseMix,
  type MixState,
  type SavedMix,
} from './state/mix';
import { PRESETS, presetMix, type Preset } from './state/presets';
import { CATEGORIES, TILES, TILE_IDS, type TileId } from './tiles';
import { AboutSheet } from './ui/AboutSheet';
import { Background, levelReader, type AudioLevels } from './ui/Background';
import { useMediaSession } from './ui/mediaSession';
import { MixesPanel } from './ui/MixesPanel';
import { ChevronIcon, CloseIcon, MarkIcon, MixesIcon, ShuffleIcon } from './ui/icons';
import { ShareSheet } from './ui/ShareSheet';
import { Transport } from './ui/Transport';
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

/** How the app opened. Worked out once, because reading a share link also clears it from the URL. */
let boot: { mix: MixState; fromLink: boolean; firstVisit: boolean } | null = null;

function getBoot() {
  if (boot) return boot;
  const fromLink = decodeMix(window.location.hash);
  if (fromLink) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    boot = { mix: fromLink, fromLink: true, firstVisit: false };
  } else {
    const last = loadLast();
    boot = { mix: last ?? defaultMix(), fromLink: false, firstVisit: last === null };
  }
  return boot;
}

const initialMix = (): MixState => getBoot().mix;

/** The session timer starts fading this long before it ends. */
const TIMER_FADE_MS = 30_000;

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
  const [sheet, setSheet] = useState<'mixes' | 'about' | 'share' | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [volume, setVolume] = useState(loadVolume);
  const [timerEnd, setTimerEnd] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [showStarters, setShowStarters] = useState(() => getBoot().firstVisit);
  const [invitePlay, setInvitePlay] = useState(() => getBoot().fromLink);
  const [toast, setToast] = useState<Toast | null>(null);
  const [offline, setOffline] = useState<'off' | 'busy' | 'on'>(isOfflineEnabled() ? 'on' : 'off');
  const [showTempoKey, setShowTempoKey] = useState(false);
  const install = useInstallPrompt();
  const engineRef = useRef<Engine | null>(null);
  const appliedRef = useRef<MixState | null>(null);
  const pointerFocus = useRef(false);
  const fadingRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const levelsRef = useRef<(() => AudioLevels) | null>(null);
  const getLevels = useCallback(() => levelsRef.current?.() ?? null, []);

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
    if (getBoot().fromLink) say('Shared mix loaded. Press play to listen.');
  }, [say]);

  useEffect(() => {
    saveVolume(volume);
    engineRef.current?.setMasterVolume(volume);
  }, [volume]);

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

  const togglePlay = useCallback(async () => {
    let engine = engineRef.current;
    if (!engine) {
      // Created inside the tap so iOS lets the AudioContext start.
      engine = new Engine();
      engine.onChord = setChord;
      engine.setMasterVolume(volume);
      applyMix(engine, mix, null, bpm, key);
      appliedRef.current = mix;
      engineRef.current = engine;
      levelsRef.current = levelReader(engine.master.analyser);
    }
    if (engine.playing) {
      engine.stop();
      setPlaying(false);
      // A session timer only runs while music plays.
      setTimerEnd(null);
      fadingRef.current = false;
      return;
    }
    setInvitePlay(false);
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
  }, [mix, bpm, key, say, volume]);

  const play = useCallback(() => {
    if (!engineRef.current?.playing) void togglePlay();
  }, [togglePlay]);
  const pause = useCallback(() => {
    if (engineRef.current?.playing) void togglePlay();
  }, [togglePlay]);

  // Session timer: tick once a second, fade out over the last 30 s, then stop.
  useEffect(() => {
    if (timerEnd === null) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const engine = engineRef.current;
      if (!engine) return;
      const left = timerEnd - t;
      if (left <= 0) {
        fadingRef.current = false;
        engine.stop();
        setPlaying(false);
        setTimerEnd(null);
        say('Session finished');
      } else if (left <= TIMER_FADE_MS && !fadingRef.current) {
        fadingRef.current = true;
        engine.fadeOut(left / 1000);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timerEnd, say]);

  const setTimer = (minutes: number | null) => {
    if (fadingRef.current) {
      fadingRef.current = false;
      engineRef.current?.fadeIn();
    }
    if (minutes === null) {
      setTimerEnd(null);
      say('Timer off');
      return;
    }
    setTimerEnd(Date.now() + minutes * 60_000);
    setNow(Date.now());
    if (!engineRef.current?.playing) void togglePlay();
    say(`Fading out in ${minutes} min`);
  };

  const timerLeft = timerEnd === null ? null : Math.max(0, timerEnd - now);

  const activeIds = TILE_IDS.filter((id) => mix.tiles[id].on);
  const activeCount = activeIds.length;
  const onIn = (cat: string) => activeIds.filter((id) => TILES.find((t) => t.id === id)!.category === cat).length;

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

  const loadPreset = (p: Preset) => {
    replaceMix(presetMix(p), `Loaded “${p.name}”`);
    setShowStarters(false);
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
        await navigator.share({ title: 'Garsæ mix', url });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      say('Link copied');
    } catch {
      setShareUrl(url);
      setSheet('share');
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

  const fill = (pct: number) => ({ '--fill': `${pct}%` }) as CSSProperties;
  const evoPct = Math.round(mix.evolution * 100);
  const bpmPct = Math.round(((bpm - BPM_MIN) / (BPM_MAX - BPM_MIN)) * 100);

  const detail = `Key of ${NOTE_NAMES[key]} · ${bpm} bpm`;

  // What is playing leads the mix panel; with nothing on, the starters take its place.
  const onNowRow = (
    <div className="panel-row" role="group" aria-label="On now">
      <h2 className="micro bracket">On now</h2>
      <ul className="name-list">
        {activeIds.map((id) => {
          const t = TILES.find((x) => x.id === id)!;
          return (
            <li key={id}>
              <button type="button" className="name" onClick={() => jumpToTile(id)}>
                {t.name}
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="micro-link" onClick={clearAll}>
        Clear
      </button>
    </div>
  );
  const startersRow = (
    <div className="panel-row" role="group" aria-label="Starter mixes">
      <h2 className="micro bracket">Starters</h2>
      <ul className="name-list">
        {PRESETS.map((p) => (
          <li key={p.id}>
            <button type="button" className="name" title={p.hint} onClick={() => loadPreset(p)}>
              {p.name}
            </button>
          </li>
        ))}
      </ul>
      {showStarters && activeCount > 0 && (
        <button type="button" className="icon-btn small" aria-label="Hide starters" onClick={() => setShowStarters(false)}>
          <CloseIcon size={16} />
        </button>
      )}
    </div>
  );

  return (
    <div className={`app${playing ? ' is-playing' : ''}`}>
      <Background playing={playing} getLevels={getLevels} musicKey={key} bpm={bpm} evolution={mix.evolution} />
      <Transport
        playing={playing}
        starting={starting}
        invite={invitePlay}
        chord={chord}
        detail={detail}
        activeCount={activeCount}
        volume={volume}
        timerLeft={timerLeft}
        onToggle={() => void togglePlay()}
        onVolume={setVolume}
        onTimer={setTimer}
        onMixes={() => setSheet('mixes')}
        onShare={() => void share()}
        onMore={() => setSheet('about')}
      />

      <div className="page" id="top">
        <h1 className="sr-only">Garsæ</h1>
        <section className="mix-panel panel" aria-label="Mix">
          <div className="mix-head">
            {activeCount > 0 ? onNowRow : startersRow}
            <div className="actions">
              <button type="button" className="btn black" onClick={surprise}>
                <ShuffleIcon size={16} />
                Surprise me
              </button>
              <button type="button" className="btn" onClick={() => setSheet('mixes')}>
                <MixesIcon size={16} />
                Mixes
                {saved.length > 0 && <span className="btn-count">{saved.length}</span>}
              </button>
            </div>
          </div>
          {activeCount > 0 && showStarters && startersRow}
        </section>

        <main>
          {CATEGORIES.map((cat) => (
            <section
              key={cat.id}
              className="category"
              aria-labelledby={`cat-${cat.id}`}
              aria-describedby={cat.note ? `note-${cat.id}` : undefined}
            >
              <div className="category-head">
                <h2 id={`cat-${cat.id}`} className="micro bracket">
                  {cat.name}
                </h2>
                {cat.note && (
                  <span id={`note-${cat.id}`} className="category-note">
                    {cat.note}
                  </span>
                )}
                <span className="rule" aria-hidden="true" />
                <span className="micro count">{onIn(cat.id) ? `${onIn(cat.id)} on` : ''}</span>
              </div>
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

        {/* Settings most mixes leave alone, below the tiles. */}
        <section className="sound panel" aria-label="Sound">
          <div className="field evolution">
            <div className="field-head">
              <label htmlFor="evolution">Evolution</label>
              <span className="field-value">{evolutionText(mix.evolution)}</span>
            </div>
            <input
              id="evolution"
              type="range"
              min={0}
              max={100}
              value={evoPct}
              style={fill(evoPct)}
              aria-valuetext={`${evoPct}%, ${evolutionText(mix.evolution)}`}
              onChange={(e) => setMix((m) => ({ ...m, evolution: Number(e.target.value) / 100 }))}
            />
          </div>

          <button
            type="button"
            className="tk-toggle btn ghost"
            aria-expanded={showTempoKey}
            onClick={() => setShowTempoKey((v) => !v)}
          >
            Tempo and key
            <ChevronIcon size={16} className={showTempoKey ? 'flip' : undefined} />
          </button>

          <div className={`tk${showTempoKey ? ' open' : ''}`}>
            <div className="field">
              <div className="field-head">
                <label htmlFor="bpm">Tempo</label>
                <output htmlFor="bpm" className="field-value">
                  {bpm} bpm
                </output>
              </div>
              <div className="inline">
                <div className="segmented" role="group" aria-label="Tempo mode">
                  <button
                    type="button"
                    aria-pressed={mix.bpm === null}
                    onClick={() => setMix((m) => ({ ...m, bpm: null }))}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    aria-pressed={mix.bpm !== null}
                    onClick={() => setMix((m) => ({ ...m, bpm }))}
                  >
                    Set
                  </button>
                </div>
                <input
                  id="bpm"
                  type="range"
                  min={BPM_MIN}
                  max={BPM_MAX}
                  value={bpm}
                  style={fill(bpmPct)}
                  onChange={(e) => setMix((m) => ({ ...m, bpm: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="field">
              <div className="field-head">
                <label htmlFor="key">Key</label>
              </div>
              <div className="select">
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
                <ChevronIcon size={16} />
              </div>
            </div>
          </div>
        </section>

        <footer className="footer">
          <span className="footer-brand">
            <MarkIcon size={18} />
            Garsæ
          </span>
          <button type="button" className="micro-link" onClick={() => setSheet('about')}>
            About and offline use
          </button>
        </footer>
      </div>

      {sheet === 'mixes' && (
        <MixesPanel
          mix={mix}
          saved={saved}
          onChange={(list, message, undo) => {
            setSaved(list);
            say(
              message,
              undo
                ? () => {
                    setSaved(restoreMixes(undo));
                    say('Restored');
                  }
                : undefined,
            );
          }}
          onLoad={(m) => {
            const decoded = decodeMix(m.mix);
            if (decoded) replaceMix(decoded, `Loaded “${m.name}”`);
            setSheet(null);
          }}
          onPreset={(p) => {
            loadPreset(p);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'share' && <ShareSheet url={shareUrl} onClose={() => setSheet(null)} />}
      {sheet === 'about' && (
        <AboutSheet
          offlineSupported={offlineSupported()}
          offline={offline}
          onToggleOffline={() => void toggleOffline()}
          onInstall={install ? () => void install() : null}
          onClose={() => setSheet(null)}
        />
      )}

      <div className={`toast glass${toast ? ' show' : ''}`} role="status" aria-live="polite">
        <span>{toast?.msg}</span>
        {toast?.undo && (
          <button type="button" className="toast-undo" onClick={() => toast.undo?.()}>
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
