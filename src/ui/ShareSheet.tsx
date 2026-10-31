import { useState } from 'react';
import { useT } from '../i18n';
import { Sheet } from './Sheet';

interface Props {
  url: string;
  onClose: () => void;
}

/** Fallback when the clipboard is blocked: the link in a field, ready to copy by hand. */
export function ShareSheet({ url, onClose }: Props) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <Sheet title={t.shareTitleSheet} onClose={onClose}>
      <p className="note">{t.shareNote}</p>
      <div className="save-row">
        <input type="text" readOnly value={url} aria-label={t.shareLink} onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="btn primary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? t.copied : t.copy}
        </button>
      </div>
      {!copied && <p className="note">{t.copyHelp}</p>}
    </Sheet>
  );
}
