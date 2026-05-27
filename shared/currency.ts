/**
 * Multi-currency support for the ag-fintech platform
 * Default currency: Nigerian Naira (NGN)
 * All amounts are stored in minor units (kobo for NGN, cents for USD/EUR)
 */

export type CurrencyCode = 'NGN' | 'USD' | 'EUR' | 'GBP' | 'KES';

export const DEFAULT_CURRENCY: CurrencyCode = 'NGN';

export interface CurrencyMeta {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string;
  minorUnit: number; // decimal places
}

export const currencyMeta: Record<CurrencyCode, CurrencyMeta> = {
  NGN: { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', locale: 'en-NG', minorUnit: 2 },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US', minorUnit: 2 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', locale: 'de-DE', minorUnit: 2 },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en-GB', minorUnit: 2 },
  KES: { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', locale: 'en-KE', minorUnit: 2 },
};

// Exchange rates from NGN to other currencies (approximate rates as of Dec 2024)
// In production, these should come from a real-time FX API
export const fxRatesFromNGN: Record<CurrencyCode, number> = {
  NGN: 1,
  USD: 1 / 1550,    // ~1550 NGN = 1 USD
  EUR: 1 / 1650,    // ~1650 NGN = 1 EUR
  GBP: 1 / 1950,    // ~1950 NGN = 1 GBP
  KES: 1 / 10,      // ~10 NGN = 1 KES (approximate)
};

/**
 * Format money from base currency (NGN in kobo) to target currency
 * @param amountInKobo - Amount in minor units (kobo for NGN)
 * @param targetCurrency - Target currency code
 * @param options - Formatting options
 */
export function formatMoney(
  amountInKobo: number,
  targetCurrency: CurrencyCode = DEFAULT_CURRENCY,
  options?: {
    showSymbol?: boolean;
    compact?: boolean;
  }
): string {
  const rate = fxRatesFromNGN[targetCurrency] ?? 1;
  const meta = currencyMeta[targetCurrency];
  const value = (amountInKobo / 100) * rate;

  try {
    const formatter = new Intl.NumberFormat(meta.locale, {
      style: 'currency',
      currency: targetCurrency,
      currencyDisplay: options?.showSymbol === false ? 'code' : 'symbol',
      notation: options?.compact ? 'compact' : 'standard',
      maximumFractionDigits: meta.minorUnit,
    });

    return formatter.format(value);
  } catch {
    // Fallback for environments without Intl support
    const symbol = options?.showSymbol !== false ? meta.symbol : '';
    return `${symbol}${value.toFixed(meta.minorUnit)}`;
  }
}

/**
 * Format money without conversion (amount already in target currency minor units)
 * @param amountInMinorUnits - Amount in minor units of the specified currency
 * @param currency - Currency code
 */
export function formatMoneyDirect(
  amountInMinorUnits: number,
  currency: CurrencyCode = DEFAULT_CURRENCY,
  options?: {
    showSymbol?: boolean;
    compact?: boolean;
  }
): string {
  const meta = currencyMeta[currency];
  const value = amountInMinorUnits / 100;

  try {
    const formatter = new Intl.NumberFormat(meta.locale, {
      style: 'currency',
      currency: currency,
      currencyDisplay: options?.showSymbol === false ? 'code' : 'symbol',
      notation: options?.compact ? 'compact' : 'standard',
      maximumFractionDigits: meta.minorUnit,
    });

    return formatter.format(value);
  } catch {
    // Fallback for environments without Intl support
    const symbol = options?.showSymbol !== false ? meta.symbol : '';
    return `${symbol}${value.toFixed(meta.minorUnit)}`;
  }
}

/**
 * Convert amount from one currency to another
 * @param amount - Amount in minor units of source currency
 * @param fromCurrency - Source currency
 * @param toCurrency - Target currency
 */
export function convertCurrency(
  amount: number,
  fromCurrency: CurrencyCode,
  toCurrency: CurrencyCode
): number {
  if (fromCurrency === toCurrency) return amount;
  
  // Convert to NGN first, then to target
  const amountInNGN = amount / fxRatesFromNGN[fromCurrency];
  const amountInTarget = amountInNGN * fxRatesFromNGN[toCurrency];
  
  return Math.round(amountInTarget);
}

/**
 * Parse a currency string to minor units
 * @param value - String value (e.g., "1,234.56" or "1234.56")
 * @param currency - Currency code for minor unit calculation
 */
export function parseCurrencyToMinorUnits(
  value: string,
  currency: CurrencyCode = DEFAULT_CURRENCY
): number {
  const meta = currencyMeta[currency];
  // Remove currency symbols, commas, and spaces
  const cleaned = value.replace(/[₦$€£,\s]/g, '');
  const parsed = parseFloat(cleaned);
  
  if (isNaN(parsed)) return 0;
  
  return Math.round(parsed * Math.pow(10, meta.minorUnit));
}

/**
 * Get currency symbol
 */
export function getCurrencySymbol(currency: CurrencyCode = DEFAULT_CURRENCY): string {
  return currencyMeta[currency]?.symbol ?? currency;
}

/**
 * Get all supported currencies for dropdown/select
 */
export function getSupportedCurrencies(): CurrencyMeta[] {
  return Object.values(currencyMeta);
}
