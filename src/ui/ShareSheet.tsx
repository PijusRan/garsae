import { useState } from 'react';
import { Sheet } from './Sheet';

interface Props {
  url: string;
  onClose: () => void;
}

/** Fallback when the clipboard is blocked: the link in a field, ready to copy by hand. */
export function ShareSheet({ url, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  return (
    <Sheet title="Share this mix" onClose={onClose}>
      <p className="note">Anyone with this link hears the same tiles and settings, played fresh.</p>
      <div className="save-row">
        <input type="text" readOnly value={url} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
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
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {!copied && <p className="note">If Copy does nothing, select the link and press Ctrl+C (⌘C on Mac).</p>}
    </Sheet>
  );
}
