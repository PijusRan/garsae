import type { CSSProperties } from 'react';
import type { MixState } from '../state/mix';
import { Fingerprint } from './Fingerprint';
import { MixesIcon, MoreIcon, PauseIcon, PlayIcon, ShareIcon, VolumeIcon } from './icons';
import { TimerControl } from './TimerControl';

interface Props {
  playing: boolean;
  starting: boolean;
  invite: boolean;
  chord: string;
  detail: string;
  mix: MixState;
  activeCount: number;
  volume: number;
  timerLeft: number | null;
  onToggle: () => void;
  onVolume: (v: number) => void;
  onTimer: (minutes: number | null) => void;
  onMixes: () => void;
  onShare: () => void;
  onMore: () => void;
}

/**
 * The one persistent control surface: sticky at the top on wide screens, at the
 * bottom (within thumb reach) on phones. The only glass layer that is always on screen.
 */
export function Transport(props: Props) {
  const { playing, starting, invite, chord, detail, mix, activeCount, volume, timerLeft } = props;
  const pct = Math.round(volume * 100);
  return (
    <header className="transport" aria-label="Player">
      <div className="backdrop" aria-hidden="true" />
      <span className="wordmark" aria-hidden="true">
        Garsae
      </span>
      <button
        type="button"
        className={`play${playing ? ' playing' : ''}${invite ? ' invite' : ''}`}
        onClick={props.onToggle}
        aria-label={playing ? 'Pause' : 'Play'}
        aria-busy={starting}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="status" aria-live="off">
        <span className="status-main">{playing && chord ? chord : playing ? 'Starting' : 'Paused'}</span>
        <span className="status-detail">{detail}</span>
      </div>
      <div className="t-mix" title={`${activeCount} tile${activeCount === 1 ? '' : 's'} on`}>
        <Fingerprint mix={mix} />
        <span className="t-count">{activeCount} on</span>
      </div>
      <label className="t-volume">
        <VolumeIcon />
        <input
          type="range"
          min={0}
          max={100}
          value={pct}
          style={{ '--fill': `${pct}%` } as CSSProperties}
          aria-label="Master volume"
          aria-valuetext={`${pct}%`}
          onChange={(e) => props.onVolume(Number(e.target.value) / 100)}
        />
      </label>
      <TimerControl left={timerLeft} onSet={props.onTimer} />
      <div className="t-actions">
        <button type="button" className="icon-btn" onClick={props.onMixes} aria-label="Mixes" title="Mixes">
          <MixesIcon />
        </button>
        <button
          type="button"
          className="icon-btn t-share"
          onClick={props.onShare}
          disabled={activeCount === 0}
          aria-label="Share link"
          title="Share link"
        >
          <ShareIcon />
        </button>
        <button type="button" className="icon-btn" onClick={props.onMore} aria-label="About & offline" title="About & offline">
          <MoreIcon />
        </button>
      </div>
    </header>
  );
}
