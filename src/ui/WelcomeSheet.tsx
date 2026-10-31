import { PlayIcon } from './icons';
import { Sheet } from './Sheet';

interface Props {
  onStart: () => void;
  onClose: () => void;
}

/** Shown once, on a first visit. Share links skip it and go straight to the shared mix. */
export function WelcomeSheet({ onStart, onClose }: Props) {
  return (
    <Sheet title="Welcome to Garsæ" onClose={onClose}>
      <p className="note about-text">
        Endless focus music, synthesized live in your browser, so it never repeats. Start with a ready-made mix, or pick your own sounds and set
        each level.
      </p>
      <div className="welcome-actions">
        <button type="button" className="btn primary" data-autofocus onClick={onStart}>
          <PlayIcon size={16} />
          Play Deep focus
        </button>
        <button type="button" className="btn" onClick={onClose}>
          Build my own
        </button>
      </div>
    </Sheet>
  );
}
