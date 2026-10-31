import { useT } from '../i18n';
import { LanguageSwitch } from './LanguageSwitch';
import { Sheet } from './Sheet';

interface Props {
  offlineSupported: boolean;
  offline: 'off' | 'busy' | 'on';
  onToggleOffline: () => void;
  onInstall: (() => void) | null;
  onClose: () => void;
}

export function AboutSheet({ offlineSupported, offline, onToggleOffline, onInstall, onClose }: Props) {
  const t = useT();
  return (
    <Sheet title={t.aboutAndOffline} onClose={onClose}>
      <p className="note about-text">{t.aboutText}</p>
      <div className="about-row">
        <strong>{t.languageLabel}</strong>
        <LanguageSwitch />
      </div>
      {offlineSupported && (
        <div className="about-row">
          <div>
            <strong>{t.offlineUse}</strong>
            <p className="note">
              {offline === 'on' ? t.offlineAvailable : offline === 'busy' ? t.working : t.offlineNotSaved}
            </p>
          </div>
          <button type="button" className="btn" onClick={onToggleOffline} disabled={offline === 'busy'}>
            {offline === 'on' ? t.removeOffline : t.makeOffline}
          </button>
        </div>
      )}
      {onInstall && (
        <div className="about-row">
          <div>
            <strong>{t.install}</strong>
            <p className="note">{t.installNote}</p>
          </div>
          <button type="button" className="btn" onClick={onInstall}>
            {t.installApp}
          </button>
        </div>
      )}
      <div className="about-row">
        <div>
          <strong>{t.sourceCode}</strong>
          <p className="note">{t.sourceNote}</p>
        </div>
        <a className="btn" href="https://github.com/PijusRan/garsae" target="_blank" rel="noreferrer">
          {t.viewOnGithub}
        </a>
      </div>
      <p className="fineprint left">{t.storedHere}</p>
    </Sheet>
  );
}
