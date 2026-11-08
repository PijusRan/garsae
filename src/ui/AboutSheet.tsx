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

const SOURCE = 'https://github.com/PijusRan/garsae';

/** What Garsæ is, then a short list of settings: a label on the left, the state and its action on the right. */
export function AboutSheet({ offlineSupported, offline, onToggleOffline, onInstall, onClose }: Props) {
  const t = useT();
  return (
    <Sheet title={t.about} onClose={onClose}>
      <p className="about-text">{t.aboutText}</p>
      <dl className="about-list">
        <dt>{t.languageLabel}</dt>
        <dd>
          <LanguageSwitch />
        </dd>
        {offlineSupported && (
          <>
            <dt>{t.offlineUse}</dt>
            <dd>
              <span>{offline === 'on' ? t.offlineAvailable : offline === 'busy' ? t.working : t.offlineNotSaved}</span>
              <button type="button" className="text-btn" onClick={onToggleOffline} disabled={offline === 'busy'}>
                {offline === 'on' ? t.removeOffline : t.makeOffline}
              </button>
            </dd>
          </>
        )}
        {onInstall && (
          <>
            <dt>{t.install}</dt>
            <dd>
              <button type="button" className="text-btn" onClick={onInstall}>
                {t.installApp}
              </button>
            </dd>
          </>
        )}
        <dt>{t.sourceCode}</dt>
        <dd>
          <a className="text-btn" href={SOURCE} target="_blank" rel="noreferrer">
            github.com/PijusRan/garsae
          </a>
        </dd>
      </dl>
      <p className="fineprint">{t.storedHere}</p>
    </Sheet>
  );
}
