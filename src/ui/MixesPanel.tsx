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
import { useT } from '../i18n';
import type { Strings } from '../i18n/en';
import { PRESETS, type Preset } from '../state/presets';
import { TILES } from '../tiles';
import { Fingerprint } from './Fingerprint';
import { CloseIcon, EditIcon, ReplaceIcon } from './icons';
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

function tileNames(encoded: string, strings: Strings): string {
  const m = decodeMix(encoded);
  return m ? TILES.filter((t) => m.tiles[t.id].on).map((t) => strings.tiles[t.id].name).join(', ') : '';
}

export function MixesPanel({ mix, saved, onChange, onLoad, onPreset, onClose }: Props) {
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const t = useT();
  const dateFmt = new Intl.DateTimeFormat(t.locale, { month: 'short', day: 'numeric' });
  const current = encodeMix(mix);
  const suggested = suggestName(mix, (id) => t.tiles[id].name, t.untitledMix);

  const finishRename = (m: SavedMix) => {
    if (draft.trim() && draft.trim() !== m.name) onChange(renameMix(m.id, draft), t.renamed);
    setRenaming(null);
  };

  return (
    <Sheet title={t.mixes} onClose={onClose}>
      <form
        className="save-row"
        onSubmit={(e) => {
          e.preventDefault();
          const finalName = name.trim() || suggested;
          onChange(saveMix(finalName, mix), t.savedName(finalName));
          setName('');
        }}
      >
        <input
          type="text"
          placeholder={suggested}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.currentTarget.value)}
          aria-label={t.saveName}
        />
        <button type="submit" className="btn primary">
          {t.save}
        </button>
      </form>

      <h3 className="sheet-sub">{t.saved}</h3>
      {saved.length === 0 ? (
        <p className="note">{t.noSavedMixes}</p>
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
                    aria-label={t.newNameFor(m.name)}
                    autoFocus
                    onChange={(e) => setDraft(e.currentTarget.value)}
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
                    aria-label={t.loadMix(m.name, tileNames(m.mix, t), isCurrent)}
                  >
                    <span className="mix-main">
                      <span className="mix-name">{m.name}</span>
                      <Fingerprint encoded={m.mix} />
                    </span>
                    <span className="mix-meta">{isCurrent ? t.current : dateFmt.format(m.savedAt)}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t.renameName(m.name)}
                  title={t.rename}
                  onClick={() => {
                    setDraft(m.name);
                    setRenaming(m.id);
                  }}
                >
                  <EditIcon size={18} />
                </button>
                {!isCurrent && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t.replaceName(m.name)}
                    title={t.replaceWithCurrent}
                    onClick={() => onChange(updateMix(m.id, mix), t.updatedName(m.name), saved)}
                  >
                    <ReplaceIcon size={18} />
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t.deleteName(m.name)}
                  title={t.delete}
                  onClick={() => onChange(deleteMix(m.id), t.deletedName(m.name), saved)}
                >
                  <CloseIcon size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="sheet-sub">{t.starters}</h3>
      <ul className="mix-list">
        {PRESETS.map((p) => (
          <li key={p.id}>
            <button type="button" className={`mix-load${p.mix === current ? ' current' : ''}`} onClick={() => onPreset(p)}>
              <span className="mix-main">
                <span className="mix-name">{t.presets[p.id].name}</span>
                <span className="mix-meta">{t.presets[p.id].hint}</span>
              </span>
              <Fingerprint encoded={p.mix} />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
