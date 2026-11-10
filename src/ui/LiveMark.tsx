import { useEffect, useId, useRef } from 'react';
import { useFocused } from './attention';
import type { AudioLevels } from './Background';

interface Props {
  size: number;
  /** Music is playing, so the eclipse clears the horizon. */
  risen: boolean;
  /** The session timer is fading out, so it sets slowly with the music. */
  fading: boolean;
  getLevels: () => AudioLevels | null;
}

const FRAME_MS = 1000 / 24;
const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * The Garsæ mark, alive: at rest it is the logo, the eclipse sitting behind its horizon. When music starts it
 * rises clear of the line and glows with the loudness; when the music stops it sets again.
 */
export function LiveMark({ size, risen, fading, getLevels }: Props) {
  const glow = useRef<HTMLSpanElement>(null);
  const clip = `mark-${useId().replace(/\W/g, '')}`;
  // Out of focus nothing redraws while you work in another window.
  const focused = useFocused();

  useEffect(() => {
    const el = glow.current;
    if (!el) return;
    if (!risen) {
      el.style.opacity = '';
      return;
    }
    // Phones and wide screens each show one of the two marks. The hidden one has nothing to do.
    // Out of focus the glow holds its brightness.
    if (!focused || !el.getClientRects().length) return;
    if (REDUCED_MOTION) {
      el.style.opacity = '0.5';
      return;
    }
    let raf = 0;
    let last = 0;
    let shown = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < FRAME_MS - 2) return;
      last = now;
      shown += ((getLevels()?.level ?? 0) - shown) * 0.2;
      el.style.opacity = String(0.2 + 0.8 * shown);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [risen, focused, getLevels]);

  return (
    <span className={`live-mark${risen ? ' risen' : ''}${fading ? ' fading' : ''}`} aria-hidden="true">
      <span ref={glow} className="live-mark-glow" />
      <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
        <clipPath id={clip}>
          <rect x="0" y="-4" width="20" height="17.5" />
        </clipPath>
        <g clipPath={`url(#${clip})`}>
          <circle className="live-mark-sun" cx="10" cy="9.5" r="6.5" />
        </g>
        <path d="M1.75 13.5h16.5" />
      </svg>
    </span>
  );
}
