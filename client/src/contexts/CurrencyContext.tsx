import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { 
  CurrencyCode, 
  DEFAULT_CURRENCY, 
  formatMoney, 
  formatMoneyDirect,
  getCurrencySymbol,
  getSupportedCurrencies,
  currencyMeta
} from '../../../shared/currency';

interface CurrencyContextValue {
  currency: CurrencyCode;
  setCurrency: (currency: CurrencyCode) => void;
  formatAmount: (amountInKobo: number) => string;
  formatAmountDirect: (amountInMinorUnits: number, sourceCurrency?: CurrencyCode) => string;
  symbol: string;
  currencies: typeof currencyMeta;
}

const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);

const STORAGE_KEY = 'preferred_currency';

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && stored in currencyMeta) {
        return stored as CurrencyCode;
      }
    }
    return DEFAULT_CURRENCY;
  });

  const setCurrency = useCallback((newCurrency: CurrencyCode) => {
    setCurrencyState(newCurrency);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, newCurrency);
    }
  }, []);

  const formatAmount = useCallback((amountInKobo: number) => {
    return formatMoney(amountInKobo, currency);
  }, [currency]);

  const formatAmountDirect = useCallback((amountInMinorUnits: number, sourceCurrency?: CurrencyCode) => {
    return formatMoneyDirect(amountInMinorUnits, sourceCurrency || currency);
  }, [currency]);

  const symbol = getCurrencySymbol(currency);

  const value: CurrencyContextValue = {
    currency,
    setCurrency,
    formatAmount,
    formatAmountDirect,
    symbol,
    currencies: currencyMeta,
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}

// Re-export utilities for convenience
export { getSupportedCurrencies, currencyMeta, DEFAULT_CURRENCY };
export type { CurrencyCode };
