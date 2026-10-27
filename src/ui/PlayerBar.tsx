import { PlayIcon } from './PlayIcon';

interface Props {
  visible: boolean;
  playing: boolean;
  starting: boolean;
  status: string;
  activeCount: number;
  onToggle: () => void;
  onMixes: () => void;
  onShare: () => void;
}

/** A compact player that appears once the main play button has scrolled out of view. */
export function PlayerBar({ visible, playing, starting, status, activeCount, onToggle, onMixes, onShare }: Props) {
  return (
    <div className={`playerbar glass${visible ? ' show' : ''}`} role="region" aria-label="Player" inert={!visible}>
      <button
        type="button"
        className={`bar-play${playing ? ' playing' : ''}`}
        onClick={onToggle}
        aria-label={playing ? 'Pause' : 'Play'}
        aria-busy={starting}
      >
        <PlayIcon playing={playing} size={22} />
      </button>
      <div className="bar-info">
        <span className="bar-status">{status}</span>
        <span className="bar-count">{activeCount} on</span>
      </div>
      <button type="button" className="chip" onClick={onMixes}>
        Mixes
      </button>
      <button type="button" className="chip" onClick={onShare} disabled={activeCount === 0}>
        Share
      </button>
    </div>
  );
}
