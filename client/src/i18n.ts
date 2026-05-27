import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources, DEFAULT_LANGUAGE, LanguageCode } from '../../shared/i18n/resources';

const STORAGE_KEY = 'preferred_language';

// Get stored language or default
function getInitialLanguage(): LanguageCode {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ['en', 'yo', 'ha', 'ig'].includes(stored)) {
      return stored as LanguageCode;
    }
  }
  return DEFAULT_LANGUAGE;
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    ns: ['common'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    react: {
      useSuspense: false,
    },
  });

// Persist language changes
i18n.on('languageChanged', (lng) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, lng);
  }
});

export default i18n;
export { LanguageCode, DEFAULT_LANGUAGE };
