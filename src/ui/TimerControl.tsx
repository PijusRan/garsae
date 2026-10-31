import { useT } from '../i18n';
import { TimerIcon } from './icons';

export const TIMER_CHOICES = [25, 50, 90] as const;

export function formatLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

interface Props {
  /** Milliseconds left, or null when no timer is set. */
  left: number | null;
  onSet: (minutes: number | null) => void;
}

/** Session timer: fades out gently and stops when time is up. */
export function TimerControl({ left, onSet }: Props) {
  const t = useT();
  return (
    <label className={`timer${left !== null ? ' active' : ''}`} title={t.sessionTimer}>
      <TimerIcon />
      <span className="timer-text">{left === null ? t.timer : formatLeft(left)}</span>
      <select
        aria-label={left === null ? t.sessionTimer : t.timerLeftAria(formatLeft(left))}
        value={left === null ? 'off' : 'on'}
        onChange={(e) => onSet(e.currentTarget.value === 'off' ? null : Number(e.currentTarget.value))}
      >
        {left !== null && (
          <option value="on" disabled>
            {t.timerLeft(formatLeft(left))}
          </option>
        )}
        <option value="off">{left === null ? t.noTimer : t.cancelTimer}</option>
        {TIMER_CHOICES.map((m) => (
          <option key={m} value={m}>
            {t.timerChoice(m)}
          </option>
        ))}
      </select>
    </label>
  );
}
