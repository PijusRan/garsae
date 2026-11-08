import { useEffect, useRef } from 'react';

/** Points along the tile. Few, because this is a soft silhouette and not an analyser display. */
const POINTS = 18;
const FRAME_MS = 1000 / 24;
/** The tallest the wave gets, as a share of the tile: it stays under the name. */
const MAX_HEIGHT = 0.62;

interface Wave {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** The tile's category colour, read from CSS on first draw. */
  fill: string | null;
  meter: () => AnalyserNode | null;
  live: boolean;
  /** Scales the height, so the tile's slider moves the wave. */
  volume: number;
  data: Uint8Array<ArrayBuffer> | null;
  heights: Float32Array;
  /** The tile's own recent peak. Tiles differ widely in loudness, and each should fill its own space. */
  peak: number;
}

const waves = new Set<Wave>();
let raf = 0;
let lastFrame = 0;

function read(w: Wave, meter: AnalyserNode): Float32Array {
  const bins = meter.frequencyBinCount;
  if (!w.data || w.data.length !== bins) w.data = new Uint8Array(bins);
  meter.getByteFrequencyData(w.data);
  const out = new Float32Array(POINTS);
  // Spaced logarithmically, so low notes spread out instead of crowding the left edge.
  for (let i = 0; i < POINTS; i++) {
    const from = Math.floor(Math.pow(bins * 0.8, i / POINTS));
    const to = Math.max(from + 1, Math.floor(Math.pow(bins * 0.8, (i + 1) / POINTS)));
    let sum = 0;
    for (let b = from; b < to; b++) sum += w.data[b];
    // Music is bass-heavy: lifting the top end spreads the shape across the tile.
    out[i] = (sum / (to - from) / 255) * (1 + (i / POINTS) * 0.9);
  }
  return out;
}

/** Eases towards the sound. Returns false once it has fallen flat and has nothing left to draw. */
function update(w: Wave): boolean {
  const meter = w.live ? w.meter() : null;
  const target = meter ? read(w, meter) : null;
  if (target) w.peak = Math.max(0.2, w.peak * 0.995, ...target);
  let moving = !!target;
  for (let i = 0; i < POINTS; i++) {
    const to = target ? (target[i] / w.peak) * (0.35 + 0.65 * w.volume) : 0;
    w.heights[i] += (to - w.heights[i]) * (to > w.heights[i] ? 0.3 : 0.1);
    if (w.heights[i] > 0.004) moving = true;
  }
  return moving;
}

function draw(w: Wave): void {
  const { canvas, ctx, heights } = w;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  if (!width || !height) return;
  w.fill ||= getComputedStyle(canvas).getPropertyValue('--cat').trim() || '#c4c1b5';
  const y = (i: number) => height - heights[i] * height * MAX_HEIGHT;
  const x = (i: number) => (i / (POINTS - 1)) * width;
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(0, y(0));
  for (let i = 1; i < POINTS; i++) {
    // Curves through the midpoints, so the shape has no corners.
    ctx.quadraticCurveTo(x(i - 1), y(i - 1), (x(i - 1) + x(i)) / 2, (y(i - 1) + y(i)) / 2);
  }
  ctx.lineTo(width, y(POINTS - 1));
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fillStyle = w.fill;
  ctx.globalAlpha = 0.18;
  ctx.fill();
}

/** One loop for every tile. It stops when all of them have settled, and with the tab hidden. */
function tick(now: number): void {
  raf = 0;
  if (now - lastFrame >= FRAME_MS - 2) {
    lastFrame = now;
    for (const w of waves) {
      const moving = update(w);
      draw(w);
      if (!moving) waves.delete(w);
    }
  }
  if (waves.size) raf = requestAnimationFrame(tick);
}

function wake(w: Wave): void {
  waves.add(w);
  if (!raf) raf = requestAnimationFrame(tick);
}

const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

interface Props {
  /** The tile is on and music is playing. Otherwise the wave falls flat. */
  live: boolean;
  volume: number;
  meter: () => AnalyserNode | null;
}

/** A soft shape rising from a tile's bottom edge, drawn from what that tile is playing. */
export function TileWave({ live, volume, meter }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wave = useRef<Wave | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const w: Wave = { canvas, ctx, fill: null, meter, live: false, volume, data: null, heights: new Float32Array(POINTS), peak: 0.2 };
    wave.current = w;
    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      w.fill = null;
      draw(w);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      waves.delete(w);
      wave.current = null;
    };
  }, []);

  useEffect(() => {
    const w = wave.current;
    if (!w) return;
    w.meter = meter;
    w.live = live;
    w.volume = volume;
    if (live) wake(w);
    else if (w.heights.some((h) => h > 0.004)) wake(w);
  }, [live, volume, meter]);

  return REDUCED_MOTION ? null : <canvas ref={ref} className="tile-wave" aria-hidden="true" />;
}
