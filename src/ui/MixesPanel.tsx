import { useState } from 'react';
import { deleteMix, saveMix, type MixState, type SavedMix } from '../state/mix';
import { Sheet } from './Sheet';

interface Props {
  mix: MixState;
  saved: SavedMix[];
  /** `undo` is the list as it was before this change, when the change can be undone. */
  onChange: (list: SavedMix[], message: string, undo?: SavedMix[]) => void;
  onLoad: (m: SavedMix) => void;
  onClose: () => void;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

export function MixesPanel({ mix, saved, onChange, onLoad, onClose }: Props) {
  const [name, setName] = useState('');
  return (
    <Sheet title="Mixes" onClose={onClose}>
      <form
        className="save-row"
        onSubmit={(e) => {
          e.preventDefault();
          onChange(saveMix(name, mix), 'Saved');
          setName('');
        }}
      >
        <input
          type="text"
          placeholder="Name this mix"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          aria-label="Mix name"
        />
        <button type="submit" className="pill primary">
          Save
        </button>
      </form>
      {saved.length === 0 ? (
        <p className="muted">No saved mixes yet. Mixes are kept in this browser only.</p>
      ) : (
        <ul className="mix-list">
          {saved.map((m) => (
            <li key={m.id}>
              <button type="button" className="mix-load" onClick={() => onLoad(m)}>
                <span>{m.name}</span>
                <span className="muted">{dateFmt.format(m.savedAt)}</span>
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Delete ${m.name}`}
                onClick={() => onChange(deleteMix(m.id), `Deleted “${m.name}”`, saved)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
