import { Sheet } from './Sheet';

interface Props {
  offlineSupported: boolean;
  offline: 'off' | 'busy' | 'on';
  onToggleOffline: () => void;
  onInstall: (() => void) | null;
  onClose: () => void;
}

export function AboutSheet({ offlineSupported, offline, onToggleOffline, onInstall, onClose }: Props) {
  return (
    <Sheet title="About & offline" onClose={onClose}>
      <p className="muted about-text">
        Garsae is a background player: every sound is synthesized live and never repeats. Pick a few tiles, set the level, and let it run.
      </p>
      {offlineSupported && (
        <div className="about-row">
          <div>
            <strong>Offline use</strong>
            <p className="muted">
              {offline === 'on'
                ? 'Available offline on this device.'
                : offline === 'busy'
                  ? 'Working…'
                  : 'Not saved on this device yet.'}
            </p>
          </div>
          <button type="button" className="pill" onClick={onToggleOffline} disabled={offline === 'busy'}>
            {offline === 'on' ? 'Remove offline copy' : 'Make available offline'}
          </button>
        </div>
      )}
      {onInstall && (
        <div className="about-row">
          <div>
            <strong>Install</strong>
            <p className="muted">Open Garsae in its own window.</p>
          </div>
          <button type="button" className="pill" onClick={onInstall}>
            Install app
          </button>
        </div>
      )}
      <p className="fineprint left">
        Experimental tiles make no health claims. Binaural beats need headphones. Mixes and settings are stored in this browser only.
      </p>
    </Sheet>
  );
}
