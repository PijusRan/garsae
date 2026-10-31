import { useId, useRef, type CSSProperties } from 'react';
import { PRESETS, type Preset } from '../state/presets';
import { useModal } from './Sheet';

interface Props {
  leaving: boolean;
  /** A starter is under the pointer or keyboard focus: the background takes its colours. */
  onPreview: (p: Preset) => void;
  onPick: (p: Preset) => void;
  onBuild: () => void;
}

const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

/**
 * The opening of a first visit, once only: the live background, full-bleed type and the starters. Choosing one
 * plays it while this fades away and the instrument comes up underneath. Share links skip it.
 */
export function Welcome({ leaving, onPreview, onPick, onBuild }: Props) {
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  useModal(ref, onBuild);

  return (
    <section ref={ref} className={`welcome${leaving ? ' leaving' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="welcome-inner">
        <svg className="welcome-mark" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path className="welcome-ring" pathLength={1} d="M4.88 13.5A6.5 6.5 0 1 1 15.12 13.5" />
          <path className="welcome-horizon" d="M1.75 13.5h16.5" />
        </svg>
        <h2 id={titleId} className="welcome-title">
          <span className="welcome-line">
            <span style={delay(500)}>Focus music</span>
          </span>{' '}
          <span className="welcome-line">
            <span style={delay(640)}>that never repeats.</span>
          </span>
        </h2>
        <p className="welcome-sub welcome-rise" style={delay(1000)}>
          Every note is synthesized live in your browser. No samples, no account.
        </p>
        <p className="micro bracket welcome-rise" style={delay(1200)}>
          Pick a mix to begin
        </p>
        <ul className="welcome-picks">
          {PRESETS.map((p, i) => (
            <li key={p.id} className="welcome-rise" style={delay(1280 + i * 80)}>
              <button
                type="button"
                className="welcome-pick"
                data-autofocus={i === 0 ? true : undefined}
                onPointerEnter={() => onPreview(p)}
                onFocus={() => onPreview(p)}
                onClick={() => onPick(p)}
              >
                <span className="welcome-pick-name">{p.name}</span>
                <span className="welcome-pick-hint">{p.hint}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="welcome-skip welcome-rise" style={delay(1800)} onClick={onBuild}>
          Or build my own mix
        </button>
      </div>
    </section>
  );
}
