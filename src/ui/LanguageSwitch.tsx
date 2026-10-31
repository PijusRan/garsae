import { LANGUAGES, useI18n } from '../i18n';

/** Each language is named in itself, so it can be found from either one. */
export function LanguageSwitch() {
  const { lang, t, setLang } = useI18n();
  return (
    <div className="segmented" role="group" aria-label={t.languageLabel}>
      {LANGUAGES.map((l) => (
        <button key={l.id} type="button" lang={l.id} aria-pressed={lang === l.id} onClick={() => setLang(l.id)}>
          {l.name}
        </button>
      ))}
    </div>
  );
}
