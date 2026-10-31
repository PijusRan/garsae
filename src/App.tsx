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
  saveMix,
  saveVolume,
  suggestName,
  surpriseMix,
  type MixState,
  type SavedMix,
} from './state/mix';
import { PRESETS, presetMix, type Preset } from './state/presets';
import { CATEGORIES, TILES, TILE_IDS, type Category, type TileId } from './tiles';
import { useT } from './i18n';
import type { Strings } from './i18n/en';
import { AboutSheet } from './ui/AboutSheet';
import { Welcome } from './ui/Welcome';
import { Background, levelReader, type AudioLevels } from './ui/Background';
import { useMediaSession } from './ui/mediaSession';
import { MixesPanel } from './ui/MixesPanel';
import { CheckIcon, ChevronIcon, MixesIcon, SaveIcon, ShuffleIcon } from './ui/icons';
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

/** Matches the .welcome transition in styles.css. */
const WELCOME_LEAVE_MS = 500;

/** The session timer starts fading this long before it ends. */
const TIMER_FADE_MS = 30_000;

function evolutionText(v: number, t: Strings): string {
  if (v < 0.15) return t.evolutionSteady;
  if (v < 0.4) return t.evolutionMostlySteady;
  if (v < 0.7) return t.evolutionGentle;
  return t.evolutionShifting;
}

interface Toast {
  msg: string;
  undo?: () => void;
}

export function App() {
  const t = useT();
  // For callbacks and effects that must not rerun when the language changes.
  const tRef = useRef(t);
  tRef.current = t;
  const [mix, setMix] = useState<MixState>(initialMix);
  // Random BPM and key used whenever the user left them on Auto.
  const [rolled, setRolled] = useState(() => ({ bpm: rollBpm(), key: rollKey() }));
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [chord, setChord] = useState('');
  const [saved, setSaved] = useState<SavedMix[]>(loadSavedMixes);
  const [sheet, setSheet] = useState<'mixes' | 'about' | 'share' | null>(null);
  const [welcome, setWelcome] = useState<'open' | 'leaving' | null>(() => (getBoot().firstVisit ? 'open' : null));
  const [previewKey, setPreviewKey] = useState<number | null>(() => (getBoot().firstVisit ? PRESETS[0].welcomeKey : null));
  const [shareUrl, setShareUrl] = useState('');
  const [volume, setVolume] = useState(loadVolume);
  const [timerEnd, setTimerEnd] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [invitePlay, setInvitePlay] = useState(() => getBoot().fromLink || getBoot().firstVisit);
  const [toast, setToast] = useState<Toast | null>(null);
  const [offline, setOffline] = useState<'off' | 'busy' | 'on'>(isOfflineEnabled() ? 'on' : 'off');
  // Under 900px one category shows at a time, or the sound settings. Wider, all of them show (styles.css).
  const [tab, setTab] = useState<Category | 'sound'>('pads');
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
        say(tRef.current.undone);
      });
    },
    [mix, say],
  );

  useEffect(() => {
    if (getBoot().fromLink) say(tRef.current.sharedMixLoaded);
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
      replaceMix(m, tRef.current.mixFromLink);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [replaceMix]);

  const togglePlay = useCallback(async (next?: { mix: MixState; bpm: number; key: number }) => {
    const useMix = next?.mix ?? mix;
    let engine = engineRef.current;
    if (!engine) {
      // Created inside the tap so iOS lets the AudioContext start.
      engine = new Engine();
      engine.onChord = setChord;
      engine.setMasterVolume(volume);
      applyMix(engine, useMix, null, next?.bpm ?? bpm, next?.key ?? key);
      appliedRef.current = useMix;
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
      say(tRef.current.audioFailed);
    } finally {
      setStarting(false);
    }
  }, [mix, bpm, key, say, volume]);

  /** Picking a whole mix while stopped means "play this". Undo keeps whatever state playback is in. */
  const startWith = (next: MixState, nextRolled = rolled) => {
    if (engineRef.current?.playing || starting) return;
    void togglePlay({ mix: next, bpm: next.bpm ?? nextRolled.bpm, key: next.key ?? nextRolled.key });
  };

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
        say(tRef.current.sessionFinished);
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
      say(t.timerOff);
      return;
    }
    setTimerEnd(Date.now() + minutes * 60_000);
    setNow(Date.now());
    if (!engineRef.current?.playing) void togglePlay();
    say(t.fadingOutIn(minutes));
  };

  const timerLeft = timerEnd === null ? null : Math.max(0, timerEnd - now);

  const activeIds = TILE_IDS.filter((id) => mix.tiles[id].on);
  const activeCount = activeIds.length;

  /** Play button and Space: starting an empty mix would only play silence. */
  const pressPlay = useCallback(() => {
    if (!engineRef.current?.playing && activeCount === 0) {
      say(tRef.current.pickSoundFirst);
      return;
    }
    void togglePlay();
  }, [activeCount, say, togglePlay]);
  const onIn = (cat: string) => activeIds.filter((id) => TILES.find((t) => t.id === id)!.category === cat).length;

  useMediaSession({
    playing,
    subtitle: activeIds.map((id) => t.tiles[id].name).join(', '),
    fallback: t.mediaArtist,
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
      if (!e.repeat) pressPlay();
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
  }, [pressPlay]);

  const setTile = (id: TileId, patch: Partial<MixState['tiles'][TileId]>) =>
    setMix((m) => ({ ...m, tiles: { ...m.tiles, [id]: { ...m.tiles[id], ...patch } } }));

  const toggleTile = (id: TileId) => {
    const turningOn = !mix.tiles[id].on;
    setTile(id, { on: turningOn });
    // Picking a sound while stopped means "play this".
    if (turningOn && !playing && !starting) void togglePlay();
  };

  const surprise = () => {
    const next = surpriseMix();
    const nextRolled = { bpm: rollBpm(), key: rollKey() };
    replaceMix(next, t.surpriseMix);
    setRolled(nextRolled);
    startWith(next, nextRolled);
  };

  const loadPreset = (p: Preset) => {
    const next = presetMix(p);
    replaceMix(next, t.loaded(t.presets[p.id].name));
    startWith(next);
  };

  const pickWelcome = (p: Preset) => {
    const next = presetMix(p);
    const nextRolled = { ...rolled, key: p.welcomeKey };
    setRolled(nextRolled);
    replaceMix(next, t.loaded(t.presets[p.id].name));
    startWith(next, nextRolled);
    setWelcome('leaving');
  };

  const leaveWelcome = () => setWelcome((w) => (w ? 'leaving' : w));

  // The welcome screen fades out over the instrument, then goes. The background keeps a picked key,
  // and glides back to the mix's own colours otherwise.
  useEffect(() => {
    if (welcome !== 'leaving') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const id = setTimeout(() => {
      setWelcome(null);
      setPreviewKey(null);
    }, reduced ? 0 : WELCOME_LEAVE_MS);
    return () => clearTimeout(id);
  }, [welcome]);

  const isSaved = saved.some((m) => m.mix === encodeMix(mix));

  /** One click: it takes the suggested name, and the Mixes sheet can rename it later. */
  const saveCurrent = () => {
    const name = suggestName(mix, (id) => t.tiles[id].name, t.untitledMix);
    const before = saved;
    setSaved(saveMix(name, mix));
    say(t.savedName(name), () => {
      setSaved(restoreMixes(before));
      say(t.restored);
    });
  };

  const clearAll = () => {
    const tiles = { ...mix.tiles };
    for (const id of TILE_IDS) tiles[id] = { ...tiles[id], on: false };
    replaceMix({ ...mix, tiles }, t.allTilesOff);
  };

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${encodeMix(mix)}`;
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: t.shareTitle, url });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      say(t.linkCopied);
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
        say(t.offlineRemoved);
      } else {
        await enableOffline();
        setOffline('on');
        say(t.offlineReady);
      }
    } catch {
      setOffline(was);
      say(t.offlineFailed);
    }
  };

  const fill = (pct: number) => ({ '--fill': `${pct}%` }) as CSSProperties;
  const evoPct = Math.round(mix.evolution * 100);
  const bpmPct = Math.round(((bpm - BPM_MIN) / (BPM_MAX - BPM_MIN)) * 100);

  const detail = t.detail(NOTE_NAMES[key], bpm);

  const startersRow = (
    <div className="panel-row" role="group" aria-label={t.starterMixes}>
      <h2 className="micro bracket">{t.starters}</h2>
      <ul className="name-list">
        {PRESETS.map((p) => (
          <li key={p.id}>
            <button type="button" className="name btn starter" title={t.presets[p.id].hint} onClick={() => loadPreset(p)}>
              {t.presets[p.id].name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className={`app${playing ? ' is-playing' : ''}${welcome === 'open' ? ' welcoming' : ''}`}>
      <Background playing={playing} getLevels={getLevels} musicKey={previewKey ?? key} bpm={bpm} evolution={mix.evolution} />
      <Transport
        playing={playing}
        starting={starting}
        invite={invitePlay}
        chord={chord}
        detail={detail}
        activeCount={activeCount}
        volume={volume}
        timerLeft={timerLeft}
        onToggle={pressPlay}
        onVolume={setVolume}
        onTimer={setTimer}
        onShare={() => void share()}
        onMore={() => setSheet('about')}
      />

      <div className={`page${tab === 'sound' ? ' sound-open' : ''}`}>
        <h1 className="sr-only">Garsæ</h1>
        <section className="mix-strip" aria-label={t.mix}>
          {activeCount === 0 ? (
            startersRow
          ) : (
            <>
              <p className="tagline">{t.tagline}</p>
              <button type="button" className="micro-link" onClick={clearAll}>
                {t.clear}
              </button>
            </>
          )}
          <div className="actions">
            <button type="button" className="btn" onClick={surprise}>
              <ShuffleIcon size={16} />
              {t.surpriseMe}
            </button>
            <button type="button" className="btn primary" disabled={activeCount === 0 || isSaved} onClick={saveCurrent}>
              {isSaved ? <CheckIcon size={16} /> : <SaveIcon size={16} />}
              {isSaved ? t.mixSaved : t.saveMix}
            </button>
            <button type="button" className="btn" onClick={() => setSheet('mixes')}>
              <MixesIcon size={16} />
              {t.mixes}
              {saved.length > 0 && <span className="btn-count">{saved.length}</span>}
            </button>
          </div>
        </section>

        <div className="tab-strip" role="group" aria-label={t.sound}>
          {CATEGORIES.map((cat) => (
            <button key={cat.id} type="button" aria-pressed={tab === cat.id} onClick={() => setTab(cat.id)}>
              {t.categories[cat.id].name}
              {onIn(cat.id) > 0 && <span className="tab-count">{onIn(cat.id)}</span>}
            </button>
          ))}
          <button type="button" aria-pressed={tab === 'sound'} onClick={() => setTab('sound')}>
            {t.sound}
          </button>
        </div>

        <main className="stage">
          {CATEGORIES.map((cat) => (
            <section
              key={cat.id}
              className={`category${tab === cat.id ? ' active' : ''}`}
              aria-labelledby={`cat-${cat.id}`}
            >
              <div className="category-head">
                <h2 id={`cat-${cat.id}`} className="micro bracket">
                  {t.categories[cat.id].name}
                </h2>
                <span className="micro count">{onIn(cat.id) ? t.countOn(onIn(cat.id)) : ''}</span>
              </div>
              <div className="tiles">
                {TILES.filter((tile) => tile.category === cat.id).map((tile) => (
                  <TileCard
                    key={tile.id}
                    meta={tile}
                    setting={mix.tiles[tile.id]}
                    onToggle={() => toggleTile(tile.id)}
                    onVolume={(v) => setTile(tile.id, { volume: v })}
                  />
                ))}
                {t.categories[cat.id].note && <p className="category-note">{t.categories[cat.id].note}</p>}
              </div>
            </section>
          ))}
        </main>

        {/* Settings most mixes leave alone: a bar along the bottom, or their own tab on small screens. */}
        <section className={`sound panel${tab === 'sound' ? ' active' : ''}`} aria-label={t.sound}>
          <div className="field evolution">
            <div className="field-head">
              <label htmlFor="evolution">{t.evolution}</label>
              <span className="field-value">{evolutionText(mix.evolution, t)}</span>
            </div>
            <input
              id="evolution"
              type="range"
              min={0}
              max={100}
              value={evoPct}
              style={fill(evoPct)}
              aria-valuetext={`${evoPct}%, ${evolutionText(mix.evolution, t)}`}
              onChange={(e) => setMix((m) => ({ ...m, evolution: Number(e.currentTarget.value) / 100 }))}
            />
          </div>

          <div className="field tempo">
            <div className="field-head">
              <label htmlFor="bpm">{t.tempo}</label>
              <output htmlFor="bpm" className="field-value">
                {bpm} bpm
              </output>
            </div>
            <div className="inline">
              <div className="segmented" role="group" aria-label={t.tempoMode}>
                <button
                  type="button"
                  aria-pressed={mix.bpm === null}
                  onClick={() => setMix((m) => ({ ...m, bpm: null }))}
                >
                  {t.auto}
                </button>
                <button
                  type="button"
                  aria-pressed={mix.bpm !== null}
                  onClick={() => setMix((m) => ({ ...m, bpm }))}
                >
                  {t.setManually}
                </button>
              </div>
              <input
                id="bpm"
                type="range"
                min={BPM_MIN}
                max={BPM_MAX}
                value={bpm}
                style={fill(bpmPct)}
                onChange={(e) => setMix((m) => ({ ...m, bpm: Number(e.currentTarget.value) }))}
              />
            </div>
          </div>

          <div className="field key">
            <div className="field-head">
              <label htmlFor="key">{t.key}</label>
            </div>
            <div className="select">
              <select
                id="key"
                value={mix.key === null ? 'auto' : String(mix.key)}
                onChange={(e) => setMix((m) => ({ ...m, key: e.currentTarget.value === 'auto' ? null : Number(e.currentTarget.value) }))}
              >
                <option value="auto">
                  {t.auto} ({NOTE_NAMES[rolled.key]})
                </option>
                {NOTE_NAMES.map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
              <ChevronIcon size={16} />
            </div>
          </div>
        </section>
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
                    say(t.restored);
                  }
                : undefined,
            );
          }}
          onLoad={(m) => {
            const decoded = decodeMix(m.mix);
            if (decoded) {
              replaceMix(decoded, t.loaded(m.name));
              startWith(decoded);
            }
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
      {welcome && <Welcome leaving={welcome === 'leaving'} onPreview={(p) => setPreviewKey(p.welcomeKey)} onPick={pickWelcome} onBuild={leaveWelcome} />}
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
            {t.undo}
          </button>
        )}
      </div>
    </div>
  );
}
