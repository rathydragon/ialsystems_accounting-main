/**
 * 🛡️ CSV Export & Formula Injection Sanitizer (CWE-1236 Prevention)
 * Sanitizes cell values to prevent CSV / Formula injection in Excel, Google Sheets, LibreOffice.
 */

/**
 * Sanitizes a single cell value for CSV export.
 * - Detects formula triggers: '=', '+', '-', '@', '\t', '\r'
 * - Prepends single quote "'" so spreadsheet programs treat it as literal text.
 * - Escapes double quotes (" -> "") according to RFC 4180.
 * - Wraps string cells in quotes.
 */
export function sanitizeCsvCell(value: any): string {
  if (value === null || value === undefined) {
    return '""';
  }

  // Preserve pure finite numbers
  if (typeof value === 'number') {
    return isFinite(value) ? String(value) : '0';
  }

  // Preserve booleans
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  let str = String(value);

  // Check for dangerous formula injection triggers (even if preceded by whitespace)
  const trimmed = str.trimStart();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    str = `'${str}`;
  }

  // Escape double quotes by doubling them per RFC 4180
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Formats an array of row arrays into a sanitized, RFC 4180 compliant CSV string
 * with UTF-8 BOM (\uFEFF) for proper display of Khmer Unicode characters in Excel.
 */
export function formatCsv(headers: any[], rows: (any[])[]): string {
  const sanitizedHeaders = headers.map(sanitizeCsvCell).join(',');
  const sanitizedRows = rows.map(r => r.map(sanitizeCsvCell).join(','));
  return '\uFEFF' + [sanitizedHeaders, ...sanitizedRows].join('\r\n');
}

/**
 * Helper to trigger browser download of CSV file
 */
export function downloadCsv(filename: string, csvContent: string): void {
  const content = csvContent.startsWith('\uFEFF') ? csvContent : '\uFEFF' + csvContent;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
