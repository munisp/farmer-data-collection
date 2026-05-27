export const validateEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export const validatePassword = (password: string): boolean => password.length >= 8;
export const validateNumber = (value: string): boolean => !isNaN(parseFloat(value)) && isFinite(Number(value));
export const validateRequired = (value: string): boolean => value.trim().length > 0;
