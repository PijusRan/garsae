import { PlayIcon } from './PlayIcon';
import { formatLeft } from './TimerControl';

interface Props {
  visible: boolean;
  playing: boolean;
  starting: boolean;
  status: string;
  activeCount: number;
  timerLeft: number | null;
  volume: number;
  onVolume: (v: number) => void;
  onToggle: () => void;
  onMixes: () => void;
  onShare: () => void;
}

/** A compact player that appears once the main play button has scrolled out of view. */
export function PlayerBar(props: Props) {
  const { visible, playing, starting, status, activeCount, timerLeft, volume, onVolume, onToggle, onMixes, onShare } = props;
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
        <span className="bar-count">
          {activeCount} on{timerLeft !== null && ` · ${formatLeft(timerLeft)} left`}
        </span>
      </div>
      <input
        className="bar-volume"
        type="range"
        min={0}
        max={100}
        value={Math.round(volume * 100)}
        aria-label="Master volume"
        aria-valuetext={`${Math.round(volume * 100)}%`}
        onChange={(e) => onVolume(Number(e.target.value) / 100)}
      />
      <button type="button" className="chip" onClick={onMixes}>
        Mixes
      </button>
      <button type="button" className="chip" onClick={onShare} disabled={activeCount === 0}>
        Share
      </button>
    </div>
  );
}
