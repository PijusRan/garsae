import { useState, type CSSProperties } from 'react';
import { TILES, type TileId } from '../tiles';
import type { MixState } from '../state/mix';
import { useT } from '../i18n';
import { ChevronIcon, ResetIcon } from './icons';

interface Props {
  mix: MixState;
  /** null hands the tile back to the mix's Evolution. */
  onChange: (id: TileId, evolution: number | null) => void;
}

/**
 * Evolution per sound, folded away under the main slider. It lists only the tiles that are on and
 * respond to Evolution, so it never grows into a wall of sliders.
 */
export function PerSound({ mix, onChange }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const tiles = TILES.filter((tile) => !tile.steady && mix.tiles[tile.id].on);
  const custom = tiles.filter((tile) => mix.tiles[tile.id].evolution !== null).length;
  return (
    <div className="per-sound">
      <button type="button" className="per-sound-toggle" aria-expanded={open} aria-controls="per-sound-list" onClick={() => setOpen((o) => !o)}>
        <ChevronIcon size={14} />
        {t.perSound}
        {custom > 0 && <span className="per-sound-count">{t.perSoundCustom(custom)}</span>}
      </button>
      {open && (
        <div id="per-sound-list" className="per-sound-list">
          {tiles.length === 0 && <p className="per-sound-empty">{t.perSoundEmpty}</p>}
          {tiles.map((tile) => {
            const own = mix.tiles[tile.id].evolution;
            const pct = Math.round((own ?? mix.evolution) * 100);
            const name = t.tiles[tile.id].name;
            return (
              <div key={tile.id} className={`per-sound-row${own === null ? ' follows' : ''}`}>
                <label htmlFor={`evo-${tile.id}`}>{name}</label>
                {own === null ? (
                  <span className="per-sound-state" title={t.followsMix}>{t.auto}</span>
                ) : (
                  <button type="button" className="per-sound-reset" aria-label={t.resetTile(name)} title={t.resetTile(name)} onClick={() => onChange(tile.id, null)}>
                    <ResetIcon size={16} />
                  </button>
                )}
                <input
                  id={`evo-${tile.id}`}
                  type="range"
                  min={0}
                  max={100}
                  value={pct}
                  style={{ '--fill': `${pct}%` } as CSSProperties}
                  aria-label={t.tileEvolution(name)}
                  aria-valuetext={own === null ? `${pct}%, ${t.followsMix}` : `${pct}%`}
                  onChange={(e) => onChange(tile.id, Number(e.currentTarget.value) / 100)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
