import { useId, useRef } from 'react';
import { useT } from '../i18n';
import { PRESETS, presetMix, type Preset } from '../state/presets';
import { TILE_BY_ID, TILE_IDS } from '../tiles';
import { LanguageSwitch } from './LanguageSwitch';
import { useModal } from './Sheet';

interface Props {
  leaving: boolean;
  /** A starter is under the pointer or keyboard focus: the background takes its colours. */
  onPreview: (p: Preset) => void;
  onPick: (p: Preset) => void;
  onBuild: () => void;
}

/** What each starter plays, in catalogue order. */
const PRESET_TILES = PRESETS.map((p) => {
  const mix = presetMix(p);
  return TILE_IDS.filter((id) => mix.tiles[id].on).map((id) => TILE_BY_ID[id]);
});

/**
 * The opening of a first visit, once only: what Garsæ is, then the starters as a list, each with the
 * instruments it plays. Choosing one plays it while this fades away and the instrument comes up underneath.
 * Share links skip it.
 */
export function Welcome({ leaving, onPreview, onPick, onBuild }: Props) {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  useModal(ref, onBuild);

  return (
    <section ref={ref} className={`welcome${leaving ? ' leaving' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="welcome-inner">
        <header className="welcome-head">
          <h2 id={titleId} className="welcome-title">
            Garsæ
          </h2>
          <LanguageSwitch />
        </header>
        <p className="welcome-sub">{t.welcomeSub}</p>
        <h3 className="micro welcome-label">{t.welcomePick}</h3>
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
                <span className="welcome-pick-tiles">
                  {PRESET_TILES[i].map((tile) => (
                    <span key={tile.id} className={`welcome-pick-tile cat-${tile.category}`}>
                      <span className="mark" aria-hidden="true" />
                      {t.tiles[tile.id].name}
                    </span>
                  ))}
                </span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="welcome-pick welcome-skip" onClick={onBuild}>
              <span className="welcome-pick-name">{t.welcomeBuild}</span>
            </button>
          </li>
        </ul>
      </div>
    </section>
  );
}
