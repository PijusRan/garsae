import { useEffect, useMemo, type CSSProperties } from 'react';
import { BANDS, labToHex, mixPalette } from './palette';

/** Loudness and low-end energy of the music, each roughly 0-1. */
export interface AudioLevels {
  level: number;
  bass: number;
}

interface Props {
  /** The mix the colours come from (see palette.ts). */
  musicKey: number;
  bpm: number;
  evolution: number;
}

/**
 * Flat horizontal bands of the mix's colours, darkest at the bottom: key sets the hue, tempo the vividness,
 * evolution how far the hue walks from band to band (palette.ts). A new mix glides to its colours over a couple
 * of seconds (@property --band-* in styles.css). It never moves otherwise: the background must not compete
 * with the music.
 */
export function Background({ musicKey, bpm, evolution }: Props) {
  const bands = useMemo(() => mixPalette(musicKey, bpm, evolution, BANDS), [musicKey, bpm, evolution]);
  const lit = useMemo(() => mixPalette(musicKey, bpm, evolution), [musicKey, bpm, evolution]);

  // Sliders take the two brightest stops of the lit ramp; @property --slider-* makes them glide too.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--slider-mid', labToHex(lit[lit.length - 1]));
    root.setProperty('--slider-end', labToHex(lit[lit.length - 2]));
  }, [lit]);

  const style = Object.fromEntries(bands.map((lab, i) => [`--band-${i}`, labToHex(lab)])) as CSSProperties;
  return <div className="background" style={style} aria-hidden="true" />;
}

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
      // A typical mastered mix sits around 0.1-0.3 RMS; stretch that into a useful range.
      level: Math.min(1, rms * 2.2),
      bass: Math.min(1, low / bassBins / 200),
    };
  };
}
