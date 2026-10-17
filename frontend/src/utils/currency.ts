/**
 * Currency & Precision Helper
 * Prevents IEEE-754 floating-point arithmetic errors in financial calculations.
 */

/**
 * Round USD to 2 decimal places using fixed-point integer cents.
 */
export function roundUSD(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined || amount === '') return 0;
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^0-9.-]/g, ''));
  if (isNaN(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Round KHR to integer (Cambodian Riel has no subunit).
 */
export function roundKHR(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined || amount === '') return 0;
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^0-9.-]/g, ''));
  if (isNaN(num)) return 0;
  return Math.round(num);
}

/**
 * Safely add two USD numbers without floating-point drift.
 */
export function addUSD(a: number, b: number): number {
  const centsA = Math.round((a || 0) * 100);
  const centsB = Math.round((b || 0) * 100);
  return (centsA + centsB) / 100;
}

/**
 * Safely subtract two USD numbers.
 */
export function subtractUSD(a: number, b: number): number {
  const centsA = Math.round((a || 0) * 100);
  const centsB = Math.round((b || 0) * 100);
  return (centsA - centsB) / 100;
}

/**
 * Format USD amount for presentation ($1,234.56)
 */
export function formatUSD(amount: number | string | null | undefined): string {
  const rounded = roundUSD(amount);
  return `$${rounded.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

/**
 * Format KHR amount for presentation (1,234 ៛)
 */
export function formatKHR(amount: number | string | null | undefined): string {
  const rounded = roundKHR(amount);
  return `${rounded.toLocaleString('en-US')} ៛`;
}

/**
 * Parse any currency input (handles strings with '$', '៛', commas, spaces)
 */
export function parseCurrency(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const clean = String(val).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}
