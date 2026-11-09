import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getMeta, initDatabase, setMeta } from '../db/database';
import { translate } from '../i18n';
import type { Lang } from '../types';

interface LanguageValue {
  lang: Lang;
  setLang: (lang: Lang) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    initDatabase()
      .then(() => getMeta('language'))
      .then((value) => {
        if (value === 'en' || value === 'hi' || value === 'mr') setLangState(value);
      })
      .catch(() => undefined);
  }, []);

  const setLang = useCallback(async (next: Lang) => {
    setLangState(next);
    await initDatabase();
    await setMeta('language', next);
  }, []);

  const value = useMemo<LanguageValue>(
    () => ({
      lang,
      setLang,
      t: (key, params) => translate(lang, key, params),
    }),
    [lang, setLang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}
