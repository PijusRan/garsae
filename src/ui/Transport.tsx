import type { CSSProperties } from 'react';
import { useT } from '../i18n';
import { ChevronIcon, MoreIcon, PauseIcon, PlayIcon, ShareIcon, VolumeIcon } from './icons';
import type { AudioLevels } from './Background';
import { LiveMark } from './LiveMark';
import { TimerControl } from './TimerControl';

interface Props {
  playing: boolean;
  starting: boolean;
  invite: boolean;
  chord: string;
  detail: string;
  activeCount: number;
  volume: number;
  timerLeft: number | null;
  fading: boolean;
  getLevels: () => AudioLevels | null;
  /** Under 900px the sound settings fold into the player, opened from the status. */
  islandOpen: boolean;
  onIsland: () => void;
  onToggle: () => void;
  onVolume: (v: number) => void;
  onTimer: (minutes: number | null) => void;
  onShare: () => void;
  onMore: () => void;
}

/**
 * The one persistent control surface: part of the sidebar on wide screens. Under 900px it is the bar of
 * the player island, along the top on tablets and at the bottom (within thumb reach) on phones, and
 * tapping the status opens the sound settings out of it.
 */
export function Transport(props: Props) {
  const { playing, starting, invite, chord, detail, activeCount, volume, timerLeft } = props;
  const t = useT();
  const pct = Math.round(volume * 100);
  return (
    <header className="transport" aria-label={t.player}>
      <span className="mark-link">
        <LiveMark size={24} risen={playing && !props.fading} fading={props.fading} getLevels={props.getLevels} />
        <span className="wordmark">Garsæ</span>
      </span>
      <button
        type="button"
        className={`play${playing ? ' playing' : ''}${invite ? ' invite' : ''}`}
        onClick={props.onToggle}
        aria-label={playing ? t.pause : t.play}
        aria-busy={starting}
      >
        {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
        <span className="play-label">{playing ? t.pause : t.play}</span>
      </button>
      <div className="status-wrap">
        <div className="status" aria-live="off">
          <span className="status-main">{playing && chord ? chord : playing ? t.starting : activeCount === 0 ? t.pickSound : invite ? t.pressPlay : t.paused}</span>
          <span className="status-detail">{detail}</span>
        </div>
        {/* Covers the status, so the whole middle of the bar is the target. */}
        <button
          type="button"
          className="island-toggle"
          aria-expanded={props.islandOpen}
          aria-controls="island-panel"
          aria-label={t.soundSettings}
          title={t.soundSettings}
          onClick={props.onIsland}
        >
          <ChevronIcon size={16} />
        </button>
      </div>
      <span className="t-sep" aria-hidden="true" />
      <label className="t-volume">
        <VolumeIcon size={18} />
        <input
          type="range"
          min={0}
          max={100}
          value={pct}
          style={{ '--fill': `${pct}%` } as CSSProperties}
          aria-label={t.masterVolume}
          aria-valuetext={`${pct}%`}
          onChange={(e) => props.onVolume(Number(e.currentTarget.value) / 100)}
        />
      </label>
      <TimerControl left={timerLeft} onSet={props.onTimer} />
      <div className="t-actions">
        <button
          type="button"
          className="icon-btn t-share"
          onClick={props.onShare}
          disabled={activeCount === 0}
          aria-label={t.shareLink}
          title={t.shareLink}
        >
          <ShareIcon size={18} />
        </button>
        <button type="button" className="icon-btn" onClick={props.onMore} aria-label={t.aboutAndOffline} title={t.aboutAndOffline}>
          <MoreIcon size={18} />
        </button>
      </div>
    </header>
  );
}
