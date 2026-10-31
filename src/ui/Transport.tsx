import type { CSSProperties } from 'react';
import { useT } from '../i18n';
import { MarkIcon, MixesIcon, MoreIcon, PauseIcon, PlayIcon, ShareIcon, VolumeIcon } from './icons';
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
  onToggle: () => void;
  onVolume: (v: number) => void;
  onTimer: (minutes: number | null) => void;
  onMixes: () => void;
  onShare: () => void;
  onMore: () => void;
}

/**
 * The one persistent control surface: a bar stuck to the top of the page on wide screens,
 * at the bottom (within thumb reach) on phones. The only glass layer that is always on screen.
 */
export function Transport(props: Props) {
  const { playing, starting, invite, chord, detail, activeCount, volume, timerLeft } = props;
  const t = useT();
  const pct = Math.round(volume * 100);
  return (
    <header className="transport glass" aria-label={t.player}>
      <a className="mark-link" href="#top" aria-label={t.backToTop}>
        <MarkIcon size={20} />
        <span className="wordmark">Garsæ</span>
      </a>
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
      <div className="status" aria-live="off">
        <span className="status-main">{playing && chord ? chord : playing ? t.starting : activeCount === 0 ? t.pickSound : invite ? t.pressPlay : t.paused}</span>
        <span className="status-detail">{detail}</span>
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
        <button type="button" className="icon-btn" onClick={props.onMixes} aria-label={t.mixes} title={t.mixes}>
          <MixesIcon size={18} />
        </button>
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
