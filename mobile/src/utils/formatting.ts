export const formatCurrency = (amount: number): string => `$${amount.toFixed(2)}`;
export const formatDate = (date: string | Date): string => new Date(date).toLocaleDateString();
export const formatDateTime = (date: string | Date): string => new Date(date).toLocaleString();
export const formatNumber = (num: number, decimals: number = 2): string => num.toFixed(decimals);
