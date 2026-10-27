import { useState } from 'react';
import {
  decodeMix,
  deleteMix,
  encodeMix,
  renameMix,
  saveMix,
  suggestName,
  updateMix,
  type MixState,
  type SavedMix,
} from '../state/mix';
import { PRESETS, type Preset } from '../state/presets';
import { TILES } from '../tiles';
import { Sheet } from './Sheet';

interface Props {
  mix: MixState;
  saved: SavedMix[];
  /** `undo` is the list as it was before this change, when the change can be undone. */
  onChange: (list: SavedMix[], message: string, undo?: SavedMix[]) => void;
  onLoad: (m: SavedMix) => void;
  onPreset: (p: Preset) => void;
  onClose: () => void;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/** One coloured dot per tile that is on, so mixes can be told apart at a glance. */
function Fingerprint({ encoded }: { encoded: string }) {
  const m = decodeMix(encoded);
  const on = m ? TILES.filter((t) => m.tiles[t.id].on) : [];
  return (
    <span className="fingerprint" aria-hidden="true">
      {on.map((t) => (
        <span key={t.id} className={`fp-dot cat-${t.category}`} title={t.name} />
      ))}
    </span>
  );
}

function tileNames(encoded: string): string {
  const m = decodeMix(encoded);
  return m ? TILES.filter((t) => m.tiles[t.id].on).map((t) => t.name).join(', ') : '';
}

export function MixesPanel({ mix, saved, onChange, onLoad, onPreset, onClose }: Props) {
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const current = encodeMix(mix);
  const suggested = suggestName(mix);

  const finishRename = (m: SavedMix) => {
    if (draft.trim() && draft.trim() !== m.name) onChange(renameMix(m.id, draft), 'Renamed');
    setRenaming(null);
  };

  return (
    <Sheet title="Mixes" onClose={onClose}>
      <form
        className="save-row"
        onSubmit={(e) => {
          e.preventDefault();
          const finalName = name.trim() || suggested;
          onChange(saveMix(finalName, mix), `Saved “${finalName}”`);
          setName('');
        }}
      >
        <input
          type="text"
          placeholder={suggested}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          aria-label="Name for the current mix"
        />
        <button type="submit" className="pill primary">
          Save
        </button>
      </form>

      <h3 className="sheet-sub">Saved</h3>
      {saved.length === 0 ? (
        <p className="muted small">No saved mixes yet. They are kept in this browser only.</p>
      ) : (
        <ul className="mix-list">
          {saved.map((m) => {
            const isCurrent = m.mix === current;
            return (
              <li key={m.id}>
                {renaming === m.id ? (
                  <input
                    className="rename-input"
                    type="text"
                    value={draft}
                    maxLength={40}
                    aria-label={`New name for ${m.name}`}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => finishRename(m)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') finishRename(m);
                      if (e.key === 'Escape') {
                        // Cancel the rename without closing the sheet.
                        e.stopPropagation();
                        e.preventDefault();
                        setRenaming(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className={`mix-load${isCurrent ? ' current' : ''}`}
                    onClick={() => onLoad(m)}
                    aria-label={`Load ${m.name}: ${tileNames(m.mix)}${isCurrent ? ' (current)' : ''}`}
                  >
                    <span className="mix-main">
                      <span className="mix-name">{m.name}</span>
                      <Fingerprint encoded={m.mix} />
                    </span>
                    <span className="muted small">{isCurrent ? 'Current' : dateFmt.format(m.savedAt)}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn small-icon"
                  aria-label={`Rename ${m.name}`}
                  title="Rename"
                  onClick={() => {
                    setDraft(m.name);
                    setRenaming(m.id);
                  }}
                >
                  ✎
                </button>
                {!isCurrent && (
                  <button
                    type="button"
                    className="icon-btn small-icon"
                    aria-label={`Replace ${m.name} with the current mix`}
                    title="Replace with current mix"
                    onClick={() => onChange(updateMix(m.id, mix), `Updated “${m.name}”`, saved)}
                  >
                    ↻
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Delete ${m.name}`}
                  title="Delete"
                  onClick={() => onChange(deleteMix(m.id), `Deleted “${m.name}”`, saved)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="sheet-sub">Starters</h3>
      <ul className="mix-list">
        {PRESETS.map((p) => (
          <li key={p.id}>
            <button type="button" className={`mix-load${p.mix === current ? ' current' : ''}`} onClick={() => onPreset(p)}>
              <span className="mix-main">
                <span className="mix-name">{p.name}</span>
                <span className="muted small">{p.hint}</span>
              </span>
              <Fingerprint encoded={p.mix} />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
