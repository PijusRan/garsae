import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Grainient } from './Grainient';
import { labToHex, mixPalette, type Lab } from './palette';

/** Loudness and low-end energy of the music, each roughly 0-1. */
export interface AudioLevels {
  level: number;
  bass: number;
}

interface Props {
  playing: boolean;
  /** Called every frame while playing. Returns null before the engine exists. */
  getLevels: () => AudioLevels | null;
  /** The mix the colours come from (see palette.ts). */
  musicKey: number;
  bpm: number;
  evolution: number;
}

/**
 * A slow, grainy gradient whose colours come from the mix: key sets the hue, tempo the vividness, evolution
 * the hue spread (palette.ts). A new mix glides to its colours over a few seconds. Dark at the bottom, light
 * towards the top, so the light sits behind the player and the Sound panel and the tiles stay on dark ground.
 * Dimmer and nearly still while paused; while music plays it brightens and flows faster with the loudness.
 * The pointer never moves it: the background must not compete with the music.
 */
export function Background({ playing, getLevels, musicKey, bpm, evolution }: Props) {
  const playingRef = useRef(playing);
  const levelsRef = useRef(getLevels);
  playingRef.current = playing;
  levelsRef.current = getLevels;
  const target = useMemo(() => mixPalette(musicKey, bpm, evolution), [musicKey, bpm, evolution]);
  const targetRef = useRef(target);
  targetRef.current = target;
  // Everything eases, so play, pause, loud passages and new mixes never jump.
  const eased = useRef({ play: playing ? 1 : 0, level: 0, last: performance.now() });
  const shown = useRef<Lab[]>(target.map((lab) => [...lab] as Lab));
  const colourClock = useRef(performance.now());

  const speed = useCallback(() => {
    const e = eased.current;
    const now = performance.now();
    const dt = Math.min(0.1, (now - e.last) / 1000);
    e.last = now;
    const on = playingRef.current;
    e.play += ((on ? 1 : 0) - e.play) * (1 - Math.exp(-dt * 0.8));
    e.level += ((on ? (levelsRef.current()?.level ?? 0) : 0) - e.level) * (1 - Math.exp(-dt * 2.5));
    return 0.4 + 0.6 * e.play + 1.2 * e.level;
  }, []);

  const ramp = useCallback(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - colourClock.current) / 1000);
    colourClock.current = now;
    // Under reduced motion only single frames are drawn, so jump straight to the new colours.
    const k = REDUCED_MOTION ? 1 : 1 - Math.exp(-dt * 1.2);
    const to = targetRef.current;
    shown.current.forEach((lab, i) => {
      for (let j = 0; j < 3; j++) lab[j] += (to[i][j] - lab[j]) * k;
    });
    return shown.current;
  }, []);

  // Sliders take the two brightest stops; @property --slider-* in styles.css makes them glide too.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--slider-mid', labToHex(target[target.length - 1]));
    root.setProperty('--slider-end', labToHex(target[target.length - 2]));
  }, [target]);

  // Compile the shaders only after the page has painted, so the UI never waits for them.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const raf = requestAnimationFrame(() => {
      timer = setTimeout(() => setReady(true), 0);
    });
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="background" aria-hidden="true">
      {ready && (
        <Grainient
          angle={18}
          speed={0.8}
          flow={1.1}
          scale={1.2}
          softness={1}
          silk={0.3}
          grainAmount={0.06}
          grainAnimated={false}
          contrast={1.05}
          interactive={false}
          clickSwirl={false}
          dpr={1}
          liveSpeed={speed}
          liveRamp={ramp}
        />
      )}
    </div>
  );
}

const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Reads loudness and bass from an analyser. Reuses its buffers between calls. */
export function levelReader(analyser: AnalyserNode): () => AudioLevels {
  const wave = new Float32Array(analyser.fftSize);
  const spectrum = new Uint8Array(analyser.frequencyBinCount);
  const binHz = analyser.context.sampleRate / analyser.fftSize;
  const bassBins = Math.max(1, Math.round(160 / binHz));
  return () => {
    analyser.getFloatTimeDomainData(wave);
    let sum = 0;
    for (let i = 0; i < wave.length; i++) sum += wave[i] * wave[i];
    const rms = Math.sqrt(sum / wave.length);
    analyser.getByteFrequencyData(spectrum);
    let low = 0;
    for (let i = 1; i <= bassBins; i++) low += spectrum[i];
    return {
      // A quiet focus mix sits around 0.05-0.15 RMS; stretch that into a useful range.
      level: Math.min(1, rms * 5),
      bass: Math.min(1, low / bassBins / 200),
    };
  };
}
