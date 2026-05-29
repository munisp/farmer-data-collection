/**
 * Localization Context
 * Provides currency, units, language, and regional formatting preferences
 * Default: Nigerian Naira (NGN) and English with Nigerian languages support
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { resources, DEFAULT_LANGUAGE, LanguageCode, languageMeta, getSupportedLanguages } from '../../../shared/i18n/resources';

// Initialize i18next
const LANG_STORAGE_KEY = 'preferred_language';

function getInitialLanguage(): LanguageCode {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored && ['en', 'yo', 'ha', 'ig'].includes(stored)) {
      return stored as LanguageCode;
    }
  }
  return DEFAULT_LANGUAGE;
}

// Initialize i18n only once
if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: getInitialLanguage(),
      fallbackLng: DEFAULT_LANGUAGE,
      ns: ['common'],
      defaultNS: 'common',
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    });
}

// Supported currencies
export type Currency = 'NGN' | 'GHS' | 'KES' | 'UGX' | 'TZS' | 'USD' | 'EUR' | 'GBP';

// Supported languages
export type Language = LanguageCode;

// Supported unit systems
export type UnitSystem = 'metric' | 'imperial' | 'local';

// Supported area units
export type AreaUnit = 'hectares' | 'acres' | 'plots' | 'sqm';

// Supported weight units
export type WeightUnit = 'kg' | 'tonnes' | 'bags' | 'lbs';

// Currency configuration
const CURRENCY_CONFIG: Record<Currency, { symbol: string; name: string; locale: string; decimals: number }> = {
  NGN: { symbol: '₦', name: 'Nigerian Naira', locale: 'en-NG', decimals: 2 },
  GHS: { symbol: 'GH₵', name: 'Ghanaian Cedi', locale: 'en-GH', decimals: 2 },
  KES: { symbol: 'KSh', name: 'Kenyan Shilling', locale: 'en-KE', decimals: 2 },
  UGX: { symbol: 'USh', name: 'Ugandan Shilling', locale: 'en-UG', decimals: 0 },
  TZS: { symbol: 'TSh', name: 'Tanzanian Shilling', locale: 'en-TZ', decimals: 0 },
  USD: { symbol: '$', name: 'US Dollar', locale: 'en-US', decimals: 2 },
  EUR: { symbol: '€', name: 'Euro', locale: 'de-DE', decimals: 2 },
  GBP: { symbol: '£', name: 'British Pound', locale: 'en-GB', decimals: 2 },
};

// Unit conversion factors (to base units: hectares for area, kg for weight)
const AREA_CONVERSIONS: Record<AreaUnit, number> = {
  hectares: 1,
  acres: 0.404686, // 1 acre = 0.404686 hectares
  plots: 0.0929, // 1 plot ≈ 929 sqm ≈ 0.0929 hectares (Nigerian standard)
  sqm: 0.0001, // 1 sqm = 0.0001 hectares
};

const WEIGHT_CONVERSIONS: Record<WeightUnit, number> = {
  kg: 1,
  tonnes: 1000,
  bags: 50, // 1 bag = 50kg (common in Africa)
  lbs: 0.453592,
};

interface LocalizationSettings {
  currency: Currency;
  areaUnit: AreaUnit;
  weightUnit: WeightUnit;
  language: Language;
  region: string;
}

interface LocalizationContextType {
  settings: LocalizationSettings;
  updateSettings: (settings: Partial<LocalizationSettings>) => void;
  formatCurrency: (amount: number) => string;
  formatArea: (hectares: number) => string;
  formatWeight: (kg: number) => string;
  convertToBaseArea: (value: number) => number;
  convertFromBaseArea: (hectares: number) => number;
  convertToBaseWeight: (value: number) => number;
  convertFromBaseWeight: (kg: number) => number;
  getCurrencySymbol: () => string;
  getAreaUnitLabel: () => string;
  getWeightUnitLabel: () => string;
  changeLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const defaultSettings: LocalizationSettings = {
  currency: 'NGN',
  areaUnit: 'hectares',
  weightUnit: 'kg',
  language: 'en',
  region: 'NG',
};

const LocalizationContext = createContext<LocalizationContextType | undefined>(undefined);

export function LocalizationProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<LocalizationSettings>(() => {
    // Load from localStorage if available
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('localization-settings');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Validate currency is in CURRENCY_CONFIG
          if (parsed.currency && !CURRENCY_CONFIG[parsed.currency as Currency]) {
            parsed.currency = defaultSettings.currency;
          }
          return { ...defaultSettings, ...parsed };
        } catch (err) {
          console.warn('[i18n] Failed to parse localization settings:', String(err));
          return defaultSettings;
        }
      }
    }
    return defaultSettings;
  });

  // Save to localStorage when settings change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('localization-settings', JSON.stringify(settings));
    }
  }, [settings]);

  const updateSettings = (newSettings: Partial<LocalizationSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  const formatCurrency = (amount: number): string => {
    const config = CURRENCY_CONFIG[settings.currency] || CURRENCY_CONFIG.NGN;
    if (!config) {
      // Ultimate fallback
      return `₦${amount.toFixed(2)}`;
    }
    try {
      return new Intl.NumberFormat(config.locale, {
        style: 'currency',
        currency: settings.currency,
        minimumFractionDigits: config.decimals,
        maximumFractionDigits: config.decimals,
      }).format(amount);
    } catch (err) {
      console.warn('[i18n] Intl.NumberFormat failed:', String(err));
      return `${config.symbol}${amount.toFixed(config.decimals)}`;
    }
  };

  const formatArea = (hectares: number): string => {
    const converted = convertFromBaseArea(hectares);
    const unitLabels: Record<AreaUnit, string> = {
      hectares: 'ha',
      acres: 'ac',
      plots: 'plots',
      sqm: 'sqm',
    };
    return `${converted.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unitLabels[settings.areaUnit]}`;
  };

  const formatWeight = (kg: number): string => {
    const converted = convertFromBaseWeight(kg);
    const unitLabels: Record<WeightUnit, string> = {
      kg: 'kg',
      tonnes: 't',
      bags: 'bags',
      lbs: 'lbs',
    };
    return `${converted.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unitLabels[settings.weightUnit]}`;
  };

  const convertToBaseArea = (value: number): number => {
    return value * AREA_CONVERSIONS[settings.areaUnit];
  };

  const convertFromBaseArea = (hectares: number): number => {
    return hectares / AREA_CONVERSIONS[settings.areaUnit];
  };

  const convertToBaseWeight = (value: number): number => {
    return value * WEIGHT_CONVERSIONS[settings.weightUnit];
  };

  const convertFromBaseWeight = (kg: number): number => {
    return kg / WEIGHT_CONVERSIONS[settings.weightUnit];
  };

  const getCurrencySymbol = (): string => {
    const config = CURRENCY_CONFIG[settings.currency] || CURRENCY_CONFIG.NGN;
    return config?.symbol || '₦';
  };

  const getAreaUnitLabel = (): string => {
    const labels: Record<AreaUnit, string> = {
      hectares: 'Hectares',
      acres: 'Acres',
      plots: 'Plots',
      sqm: 'Square Meters',
    };
    return labels[settings.areaUnit];
  };

  const getWeightUnitLabel = (): string => {
    const labels: Record<WeightUnit, string> = {
      kg: 'Kilograms',
      tonnes: 'Tonnes',
      bags: 'Bags (50kg)',
      lbs: 'Pounds',
    };
    return labels[settings.weightUnit];
  };

  const changeLanguage = (lang: Language) => {
    i18n.changeLanguage(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    }
    setSettings((prev) => ({ ...prev, language: lang }));
  };

  const t = (key: string): string => {
    return i18n.t(key);
  };

  return (
    <LocalizationContext.Provider
      value={{
        settings,
        updateSettings,
        formatCurrency,
        formatArea,
        formatWeight,
        convertToBaseArea,
        convertFromBaseArea,
        convertToBaseWeight,
        convertFromBaseWeight,
        getCurrencySymbol,
        getAreaUnitLabel,
        getWeightUnitLabel,
        changeLanguage,
        t,
      }}
    >
      {children}
    </LocalizationContext.Provider>
  );
}

export function useLocalization(): LocalizationContextType {
  const context = useContext(LocalizationContext);
  if (!context) {
    throw new Error('useLocalization must be used within a LocalizationProvider');
  }
  return context;
}

// Export currency options for dropdowns
export const CURRENCY_OPTIONS = Object.entries(CURRENCY_CONFIG).map(([code, config]) => ({
  value: code as Currency,
  label: `${config.symbol} ${config.name}`,
}));

// Export area unit options for dropdowns
export const AREA_UNIT_OPTIONS: { value: AreaUnit; label: string }[] = [
  { value: 'hectares', label: 'Hectares (ha)' },
  { value: 'acres', label: 'Acres (ac)' },
  { value: 'plots', label: 'Plots (Nigerian)' },
  { value: 'sqm', label: 'Square Meters (sqm)' },
];

// Export weight unit options for dropdowns
export const WEIGHT_UNIT_OPTIONS: { value: WeightUnit; label: string }[] = [
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'tonnes', label: 'Tonnes (t)' },
  { value: 'bags', label: 'Bags (50kg)' },
  { value: 'lbs', label: 'Pounds (lbs)' },
];

// Export language options for dropdowns
export const LANGUAGE_OPTIONS = getSupportedLanguages().map((lang) => ({
  value: lang.code as Language,
  label: `${lang.nativeName} (${lang.name})`,
}));

// Re-export for convenience
export { useTranslation } from 'react-i18next';
export { languageMeta, getSupportedLanguages };
