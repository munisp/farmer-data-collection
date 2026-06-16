import { resilientPost, resilientGet } from './resilient-http.js';

const GEOCODING_URL = process.env.GEOCODING_SERVICE_URL || 'http://localhost:8100';
const SERVICE_NAME = 'geocoding';

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  display_name: string;
  city?: string;
  state?: string;
  country?: string;
  confidence: number;
  source: string;
}

export interface ValidatedAddress {
  valid: boolean;
  normalized: {
    address: string;
    city: string;
    state: string;
    country: string;
    latitude: number;
    longitude: number;
  } | null;
  confidence: number;
  source: string;
  display_name?: string;
}

export async function forwardGeocode(
  address: string,
  country: string = 'ng',
  limit: number = 5,
): Promise<GeocodeResult[]> {
  return await resilientPost<GeocodeResult[]>(SERVICE_NAME, `${GEOCODING_URL}/geocode/forward`, {
    address,
    country,
    limit,
  });
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<GeocodeResult> {
  return await resilientPost<GeocodeResult>(SERVICE_NAME, `${GEOCODING_URL}/geocode/reverse`, {
    latitude,
    longitude,
  });
}

export async function batchGeocode(
  addresses: string[],
  country: string = 'ng',
): Promise<{ results: Array<{ address: string; result: GeocodeResult | null; found: boolean }>; total: number; found: number }> {
  return await resilientPost(SERVICE_NAME, `${GEOCODING_URL}/geocode/batch`, {
    addresses,
    country,
  });
}

export async function validateAddress(
  address: string,
  city: string = '',
  state: string = '',
  country: string = 'Nigeria',
): Promise<ValidatedAddress> {
  return await resilientPost<ValidatedAddress>(SERVICE_NAME, `${GEOCODING_URL}/geocode/validate`, {
    address,
    city,
    state,
    country,
  });
}

export async function getAddressSuggestions(
  query: string,
): Promise<{ suggestions: Array<{ text: string; latitude: number; longitude: number; source: string }>; count: number }> {
  return await resilientGet(
    SERVICE_NAME,
    `${GEOCODING_URL}/geocode/suggestions?q=${encodeURIComponent(query)}`,
  );
}
