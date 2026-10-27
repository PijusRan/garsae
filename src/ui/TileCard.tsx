import type { CSSProperties } from 'react';
import type { TileMeta } from '../tiles';
import type { TileSetting } from '../state/mix';

interface Props {
  meta: TileMeta;
  setting: TileSetting;
  onToggle: () => void;
  onVolume: (v: number) => void;
}

/** A large rounded tile: tap to toggle, slider for volume once it is on. */
export function TileCard({ meta, setting, onToggle, onVolume }: Props) {
  const style = { '--vol': setting.on ? setting.volume : 0 } as CSSProperties;
  const pct = Math.round(setting.volume * 100);
  const noun = meta.effect ? 'amount' : 'volume';
  return (
    <div id={`tile-${meta.id}`} className={`tile cat-${meta.category}${setting.on ? ' on' : ''}`} style={style}>
      <button type="button" className="tile-toggle" aria-pressed={setting.on} onClick={onToggle}>
        <span className="tile-top">
          <span className="tile-dot" aria-hidden="true" />
          {meta.effect && <span className="tile-badge">FX</span>}
          {meta.needsHeadphones && <span className="tile-badge">Headphones</span>}
        </span>
        <span className="tile-name">{meta.name}</span>
        <span className="tile-hint">{meta.hint}</span>
      </button>
      <input
        className="tile-volume"
        type="range"
        min={0}
        max={100}
        value={pct}
        aria-label={`${meta.name} ${noun}`}
        aria-valuetext={`${pct}%`}
        title={`${pct}%`}
        disabled={!setting.on}
        tabIndex={setting.on ? 0 : -1}
        onChange={(e) => onVolume(Number(e.target.value) / 100)}
      />
    </div>
  );
}
