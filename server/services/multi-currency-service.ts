/**
 * Multi-Currency Support Service
 * Handles multiple African currencies with real-time exchange rates
 */

import axios from 'axios';
import { logger } from '../logger.js';

// Supported currencies
export type CurrencyCode = 'KES' | 'UGX' | 'TZS' | 'GHS' | 'NGN' | 'ZAR' | 'USD' | 'EUR';

/** Platform default currency — configurable via DEFAULT_CURRENCY env var */
export const DEFAULT_CURRENCY: CurrencyCode = (process.env.DEFAULT_CURRENCY as CurrencyCode) || 'NGN';

interface Currency {
  code: CurrencyCode;
  name: string;
  symbol: string;
  decimalPlaces: number;
  country: string;
  flag: string;
}

interface ExchangeRate {
  from: CurrencyCode;
  to: CurrencyCode;
  rate: number;
  timestamp: Date;
  source: string;
}

interface ConversionResult {
  originalAmount: number;
  originalCurrency: CurrencyCode;
  convertedAmount: number;
  targetCurrency: CurrencyCode;
  exchangeRate: number;
  timestamp: Date;
}

interface CurrencyConfig {
  defaultCurrency: CurrencyCode;
  exchangeRateApiKey?: string;
  exchangeRateApiUrl?: string;
  cacheExpiryMinutes?: number;
}

// Currency definitions
export const currencies: Record<CurrencyCode, Currency> = {
  KES: {
    code: 'KES',
    name: 'Kenyan Shilling',
    symbol: 'KSh',
    decimalPlaces: 2,
    country: 'Kenya',
    flag: '🇰🇪',
  },
  UGX: {
    code: 'UGX',
    name: 'Ugandan Shilling',
    symbol: 'USh',
    decimalPlaces: 0,
    country: 'Uganda',
    flag: '🇺🇬',
  },
  TZS: {
    code: 'TZS',
    name: 'Tanzanian Shilling',
    symbol: 'TSh',
    decimalPlaces: 0,
    country: 'Tanzania',
    flag: '🇹🇿',
  },
  GHS: {
    code: 'GHS',
    name: 'Ghanaian Cedi',
    symbol: 'GH₵',
    decimalPlaces: 2,
    country: 'Ghana',
    flag: '🇬🇭',
  },
  NGN: {
    code: 'NGN',
    name: 'Nigerian Naira',
    symbol: '₦',
    decimalPlaces: 2,
    country: 'Nigeria',
    flag: '🇳🇬',
  },
  ZAR: {
    code: 'ZAR',
    name: 'South African Rand',
    symbol: 'R',
    decimalPlaces: 2,
    country: 'South Africa',
    flag: '🇿🇦',
  },
  USD: {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    decimalPlaces: 2,
    country: 'United States',
    flag: '🇺🇸',
  },
  EUR: {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    decimalPlaces: 2,
    country: 'European Union',
    flag: '🇪🇺',
  },
};

// Fallback exchange rates (USD base) - updated periodically
const fallbackRates: Record<CurrencyCode, number> = {
  USD: 1,
  EUR: 0.92,
  KES: 153.50,
  UGX: 3750,
  TZS: 2510,
  GHS: 12.50,
  NGN: 1550,
  ZAR: 18.50,
};

export class MultiCurrencyService {
  private config: CurrencyConfig;
  private ratesCache: Map<string, ExchangeRate> = new Map();
  private lastFetchTime: Date | null = null;

  constructor(config: CurrencyConfig) {
    this.config = {
      cacheExpiryMinutes: 60,
      ...config,
    };
  }

  // Get all supported currencies
  getSupportedCurrencies(): Currency[] {
    return Object.values(currencies);
  }

  // Get currency by code
  getCurrency(code: CurrencyCode): Currency | null {
    return currencies[code] || null;
  }

  // Fetch exchange rates from API
  async fetchExchangeRates(baseCurrency: CurrencyCode = 'USD'): Promise<Map<string, ExchangeRate>> {
    // Check cache
    if (this.isCacheValid()) {
      return this.ratesCache;
    }

    try {
      if (this.config.exchangeRateApiKey) {
        // Use real API
        const response = await axios.get(
          `${this.config.exchangeRateApiUrl || 'https://api.exchangerate-api.com/v4'}/latest/${baseCurrency}`,
          {
            headers: { 'Authorization': `Bearer ${this.config.exchangeRateApiKey}` },
          }
        );

        const rates = response.data.rates;
        this.updateCache(baseCurrency, rates);
      } else {
        // Use fallback rates
        this.updateCacheFromFallback(baseCurrency);
      }

      this.lastFetchTime = new Date();
    } catch (error) {
      logger.error('Failed to fetch exchange rates:', error);
      // Fall back to cached or default rates
      if (this.ratesCache.size === 0) {
        this.updateCacheFromFallback(baseCurrency);
      }
    }

    return this.ratesCache;
  }

  // Update cache from API response
  private updateCache(baseCurrency: CurrencyCode, rates: Record<string, number>): void {
    const timestamp = new Date();
    
    for (const [code, rate] of Object.entries(rates)) {
      if (code in currencies) {
        const key = `${baseCurrency}_${code}`;
        this.ratesCache.set(key, {
          from: baseCurrency,
          to: code as CurrencyCode,
          rate,
          timestamp,
          source: 'api',
        });
      }
    }
  }

  // Update cache from fallback rates
  private updateCacheFromFallback(baseCurrency: CurrencyCode): void {
    const timestamp = new Date();
    const baseRate = fallbackRates[baseCurrency];

    for (const [code, rate] of Object.entries(fallbackRates)) {
      const key = `${baseCurrency}_${code}`;
      this.ratesCache.set(key, {
        from: baseCurrency,
        to: code as CurrencyCode,
        rate: rate / baseRate,
        timestamp,
        source: 'fallback',
      });
    }
  }

  // Check if cache is still valid
  private isCacheValid(): boolean {
    if (!this.lastFetchTime || this.ratesCache.size === 0) {
      return false;
    }

    const expiryMs = (this.config.cacheExpiryMinutes || 60) * 60 * 1000;
    return Date.now() - this.lastFetchTime.getTime() < expiryMs;
  }

  // Get exchange rate between two currencies
  async getExchangeRate(from: CurrencyCode, to: CurrencyCode): Promise<ExchangeRate> {
    if (from === to) {
      return {
        from,
        to,
        rate: 1,
        timestamp: new Date(),
        source: 'identity',
      };
    }

    await this.fetchExchangeRates('USD');

    // Calculate cross rate through USD
    const fromToUSD = this.ratesCache.get(`USD_${from}`)?.rate || fallbackRates[from];
    const toToUSD = this.ratesCache.get(`USD_${to}`)?.rate || fallbackRates[to];

    const rate = toToUSD / fromToUSD;

    return {
      from,
      to,
      rate,
      timestamp: new Date(),
      source: this.ratesCache.get(`USD_${from}`)?.source || 'fallback',
    };
  }

  // Convert amount between currencies
  async convert(
    amount: number,
    from: CurrencyCode,
    to: CurrencyCode
  ): Promise<ConversionResult> {
    const exchangeRate = await this.getExchangeRate(from, to);
    const targetCurrency = currencies[to];
    
    let convertedAmount = amount * exchangeRate.rate;
    
    // Round to appropriate decimal places
    const multiplier = Math.pow(10, targetCurrency.decimalPlaces);
    convertedAmount = Math.round(convertedAmount * multiplier) / multiplier;

    return {
      originalAmount: amount,
      originalCurrency: from,
      convertedAmount,
      targetCurrency: to,
      exchangeRate: exchangeRate.rate,
      timestamp: exchangeRate.timestamp,
    };
  }

  // Format amount in currency
  formatAmount(amount: number, currencyCode: CurrencyCode, options?: {
    showSymbol?: boolean;
    showCode?: boolean;
    locale?: string;
  }): string {
    const currency = currencies[currencyCode];
    const opts = {
      showSymbol: true,
      showCode: false,
      locale: 'en-US',
      ...options,
    };

    const formatted = new Intl.NumberFormat(opts.locale, {
      minimumFractionDigits: currency.decimalPlaces,
      maximumFractionDigits: currency.decimalPlaces,
    }).format(amount);

    if (opts.showSymbol && opts.showCode) {
      return `${currency.symbol}${formatted} ${currency.code}`;
    } else if (opts.showSymbol) {
      return `${currency.symbol}${formatted}`;
    } else if (opts.showCode) {
      return `${formatted} ${currency.code}`;
    }
    
    return formatted;
  }

  // Parse amount from string
  parseAmount(amountStr: string, currencyCode: CurrencyCode): number {
    const currency = currencies[currencyCode];
    
    // Remove currency symbols and whitespace
    let cleaned = amountStr.replace(/[^\d.,\-]/g, '');
    
    // Handle different decimal separators
    if (cleaned.includes(',') && cleaned.includes('.')) {
      // Assume comma is thousands separator
      cleaned = cleaned.replace(/,/g, '');
    } else if (cleaned.includes(',')) {
      // Could be decimal separator (European) or thousands (US)
      const parts = cleaned.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        // Likely decimal separator
        cleaned = cleaned.replace(',', '.');
      } else {
        // Likely thousands separator
        cleaned = cleaned.replace(/,/g, '');
      }
    }

    const amount = parseFloat(cleaned);
    
    if (isNaN(amount)) {
      throw new Error(`Invalid amount: ${amountStr}`);
    }

    // Round to currency's decimal places
    const multiplier = Math.pow(10, currency.decimalPlaces);
    return Math.round(amount * multiplier) / multiplier;
  }

  // Get currency for a country/region
  getCurrencyForRegion(region: string): CurrencyCode {
    const regionMap: Record<string, CurrencyCode> = {
      'kenya': 'KES',
      'uganda': 'UGX',
      'tanzania': 'TZS',
      'ghana': 'GHS',
      'nigeria': 'NGN',
      'south africa': 'ZAR',
      // Add more mappings as needed
    };

    const normalized = region.toLowerCase().trim();
    return regionMap[normalized] || this.config.defaultCurrency;
  }

  // Calculate loan amount in local currency
  async calculateLoanInLocalCurrency(
    loanAmountUSD: number,
    targetCurrency: CurrencyCode
  ): Promise<{
    localAmount: number;
    formattedAmount: string;
    exchangeRate: number;
  }> {
    const conversion = await this.convert(loanAmountUSD, 'USD', targetCurrency);
    
    return {
      localAmount: conversion.convertedAmount,
      formattedAmount: this.formatAmount(conversion.convertedAmount, targetCurrency),
      exchangeRate: conversion.exchangeRate,
    };
  }

  // Get all exchange rates for a currency
  async getAllRatesFor(baseCurrency: CurrencyCode): Promise<Array<{
    currency: Currency;
    rate: number;
    formatted: string;
  }>> {
    await this.fetchExchangeRates('USD');
    
    const results: Array<{
      currency: Currency;
      rate: number;
      formatted: string;
    }> = [];

    for (const currency of Object.values(currencies)) {
      if (currency.code === baseCurrency) continue;
      
      const exchangeRate = await this.getExchangeRate(baseCurrency, currency.code);
      results.push({
        currency,
        rate: exchangeRate.rate,
        formatted: `1 ${baseCurrency} = ${this.formatAmount(exchangeRate.rate, currency.code)}`,
      });
    }

    return results;
  }

  // Multi-currency transaction record
  createTransactionRecord(
    amount: number,
    currency: CurrencyCode,
    usdEquivalent: number,
    exchangeRate: number
  ): {
    amount: number;
    currency: CurrencyCode;
    usdEquivalent: number;
    exchangeRate: number;
    timestamp: Date;
    formattedAmount: string;
    formattedUSD: string;
  } {
    return {
      amount,
      currency,
      usdEquivalent,
      exchangeRate,
      timestamp: new Date(),
      formattedAmount: this.formatAmount(amount, currency),
      formattedUSD: this.formatAmount(usdEquivalent, 'USD'),
    };
  }

  // Aggregate amounts across currencies (convert to base currency)
  async aggregateAmounts(
    amounts: Array<{ amount: number; currency: CurrencyCode }>,
    targetCurrency: CurrencyCode = 'USD'
  ): Promise<{
    total: number;
    formattedTotal: string;
    breakdown: Array<{
      original: { amount: number; currency: CurrencyCode; formatted: string };
      converted: { amount: number; currency: CurrencyCode; formatted: string };
    }>;
  }> {
    let total = 0;
    const breakdown: Array<{
      original: { amount: number; currency: CurrencyCode; formatted: string };
      converted: { amount: number; currency: CurrencyCode; formatted: string };
    }> = [];

    for (const { amount, currency } of amounts) {
      const conversion = await this.convert(amount, currency, targetCurrency);
      total += conversion.convertedAmount;
      
      breakdown.push({
        original: {
          amount,
          currency,
          formatted: this.formatAmount(amount, currency),
        },
        converted: {
          amount: conversion.convertedAmount,
          currency: targetCurrency,
          formatted: this.formatAmount(conversion.convertedAmount, targetCurrency),
        },
      });
    }

    return {
      total,
      formattedTotal: this.formatAmount(total, targetCurrency),
      breakdown,
    };
  }
}

// Factory function
export function createMultiCurrencyService(config?: Partial<CurrencyConfig>): MultiCurrencyService {
  const defaultConfig: CurrencyConfig = {
    defaultCurrency: DEFAULT_CURRENCY,
    exchangeRateApiKey: process.env.EXCHANGE_RATE_API_KEY,
    exchangeRateApiUrl: process.env.EXCHANGE_RATE_API_URL,
    cacheExpiryMinutes: 60,
  };

  return new MultiCurrencyService({ ...defaultConfig, ...config });
}

export default MultiCurrencyService;
