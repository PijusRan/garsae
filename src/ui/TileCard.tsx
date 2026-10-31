import { useRef, type CSSProperties } from 'react';
import type { TileMeta } from '../tiles';
import type { TileSetting } from '../state/mix';
import { useT } from '../i18n';
import { EffectIcon } from './icons';
import { TileWave } from './TileWave';

interface Props {
  meta: TileMeta;
  setting: TileSetting;
  playing: boolean;
  meter: () => AnalyserNode | null;
  onToggle: () => void;
  onVolume: (v: number) => void;
}

/** A tile: tap to toggle, slider for level once it is on. The filled track is the on indicator. */
export function TileCard({ meta, setting, playing, meter, onToggle, onVolume }: Props) {
  const pct = Math.round(setting.volume * 100);
  const t = useT();
  const { name, hint } = t.tiles[meta.id];
  // The wave stays once a tile has been on, so switching it off lets it fall instead of vanishing.
  const hasBeenOn = useRef(false);
  hasBeenOn.current ||= setting.on;
  return (
    <div id={`tile-${meta.id}`} className={`tile${setting.on ? ' on' : ''}`}>
      {hasBeenOn.current && !meta.effect && <TileWave live={setting.on && playing} volume={setting.volume} meter={meter} />}
      <button type="button" className="tile-toggle" aria-pressed={setting.on} title={hint} onClick={onToggle}>
        <span className="tile-name">
          {name}
          {meta.effect && <EffectIcon size={14} aria-label={t.effect} />}
        </span>
        <span className="tile-hint">{hint}</span>
      </button>
      <input
        className="tile-volume"
        type="range"
        min={0}
        max={100}
        value={pct}
        style={{ '--fill': `${pct}%` } as CSSProperties}
        aria-label={meta.effect ? t.tileAmount(name) : t.tileVolume(name)}
        aria-valuetext={`${pct}%`}
        title={`${pct}%`}
        disabled={!setting.on}
        tabIndex={setting.on ? 0 : -1}
        onChange={(e) => onVolume(Number(e.currentTarget.value) / 100)}
      />
    </div>
  );
}
