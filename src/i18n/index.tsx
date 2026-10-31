import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, type Strings } from './en';
import { lt } from './lt';

export const LANGUAGES = [
  { id: 'en', name: 'English' },
  { id: 'lt', name: 'Lietuvių' },
] as const;

export type Lang = (typeof LANGUAGES)[number]['id'];

const DICTIONARIES: Record<Lang, Strings> = { en, lt };
const KEY = 'garsae.lang';

const isLang = (s: string | null): s is Lang => s === 'en' || s === 'lt';

/** A language chosen here wins; otherwise the first browser language the app has. */
function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch {
    // Storage can be blocked. The browser language still works.
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.slice(0, 2).toLowerCase();
    if (isLang(base)) return base;
  }
  return 'en';
}

interface I18n {
  lang: Lang;
  t: Strings;
  setLang: (lang: Lang) => void;
}

const Context = createContext<I18n>({ lang: 'en', t: en, setLang: () => {} });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.querySelector('meta[name="description"]')?.setAttribute('content', DICTIONARIES[lang].description);
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      t: DICTIONARIES[lang],
      setLang: (next: Lang) => {
        setLangState(next);
        try {
          localStorage.setItem(KEY, next);
        } catch {
          // Then it only lasts this session.
        }
      },
    }),
    [lang],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useI18n = () => useContext(Context);
export const useT = () => useContext(Context).t;
