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
  return (
    <div className={`tile cat-${meta.category}${setting.on ? ' on' : ''}`} style={style}>
      <button type="button" className="tile-toggle" aria-pressed={setting.on} onClick={onToggle}>
        <span className="tile-dot" aria-hidden="true" />
        <span className="tile-name">{meta.name}</span>
        <span className="tile-hint">{meta.hint}</span>
      </button>
      <input
        className="tile-volume"
        type="range"
        min={0}
        max={100}
        value={Math.round(setting.volume * 100)}
        aria-label={`${meta.name} ${meta.effect ? 'amount' : 'volume'}`}
        disabled={!setting.on}
        tabIndex={setting.on ? 0 : -1}
        onChange={(e) => onVolume(Number(e.target.value) / 100)}
      />
    </div>
  );
}
