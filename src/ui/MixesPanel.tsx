import { useState } from 'react';
import { deleteMix, saveMix, type MixState, type SavedMix } from '../state/mix';

interface Props {
  mix: MixState;
  saved: SavedMix[];
  onChange: (list: SavedMix[], message: string) => void;
  onLoad: (m: SavedMix) => void;
  onClose: () => void;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

export function MixesPanel({ mix, saved, onChange, onLoad, onClose }: Props) {
  const [name, setName] = useState('');
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet glass" role="dialog" aria-label="Saved mixes" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2>Mixes</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
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
                  onClick={() => onChange(deleteMix(m.id), 'Deleted')}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
