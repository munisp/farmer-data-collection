import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format amount in kobo to Nigerian Naira currency string
 * @param amountInKobo Amount in kobo (₦1 = 100 kobo)
 * @returns Formatted currency string (e.g., "₦1,234.56")
 */
export function formatCurrency(amountInKobo: number): string {
  const amountInNaira = amountInKobo / 100;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
  }).format(amountInNaira);
}
