import { useId, useRef } from 'react';
import { useT } from '../i18n';
import { PRESETS, type Preset } from '../state/presets';
import { LanguageSwitch } from './LanguageSwitch';
import { useModal } from './Sheet';

interface Props {
  leaving: boolean;
  /** A starter is under the pointer or keyboard focus: the background takes its colours. */
  onPreview: (p: Preset) => void;
  onPick: (p: Preset) => void;
  onBuild: () => void;
}

/**
 * The opening of a first visit, once only: the live background, the mark drawing itself, and the starters as a
 * plain list. Choosing one plays it while this fades away and the instrument comes up underneath. Share links skip it.
 */
export function Welcome({ leaving, onPreview, onPick, onBuild }: Props) {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  useModal(ref, onBuild);

  return (
    <section ref={ref} className={`welcome${leaving ? ' leaving' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="welcome-head">
        <span className="welcome-brand">
          <svg className="welcome-mark" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path className="welcome-ring" pathLength={1} d="M4.88 13.5A6.5 6.5 0 1 1 15.12 13.5" />
            <path className="welcome-horizon" d="M1.75 13.5h16.5" />
          </svg>
          <span className="wordmark">Garsæ</span>
        </span>
        <LanguageSwitch />
      </header>
      <div className="welcome-body">
        <h2 id={titleId} className="welcome-title">
          {t.welcomeTitle}
        </h2>
        <p className="welcome-sub">{t.welcomeSub}</p>
        <ul className="welcome-picks">
          {PRESETS.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                className="welcome-pick"
                data-autofocus={i === 0 ? true : undefined}
                onPointerEnter={() => onPreview(p)}
                onFocus={() => onPreview(p)}
                onClick={() => onPick(p)}
              >
                <span className="welcome-pick-name">{t.presets[p.id].name}</span>
                <span className="welcome-pick-hint">{t.presets[p.id].hint}</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="welcome-pick build" onClick={onBuild}>
              <span className="welcome-pick-name">{t.welcomeBuild}</span>
              <span className="welcome-pick-hint">{t.welcomeBuildHint}</span>
            </button>
          </li>
        </ul>
      </div>
    </section>
  );
}
