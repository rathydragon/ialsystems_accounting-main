/**
 * Barcode & Tracking Code Sanitizer
 * Removes invisible control characters, zero-width spaces, BOM, trailing spaces,
 * extracts query parameter IDs if full URLs are scanned, and enforces standard casing.
 */
export function sanitizeTrackingCode(raw: string | null | undefined): string {
  if (!raw) return '';
  
  // 1. Remove zero-width spaces, byte order marks (BOM), and control characters
  let cleaned = String(raw)
    .replace(/[\u200B-\u200D\uFEFF\u0000-\u001F\u007F-\u009F]/g, '')
    .trim();

  // 2. If scanned text is a full URL, attempt to parse out tracking or barcode parameter
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    try {
      const url = new URL(cleaned);
      const candidates = ['id', 'tracking', 'code', 'barcode', 'track', 'no', 'bill'];
      for (const param of candidates) {
        const val = url.searchParams.get(param);
        if (val && val.trim()) {
          cleaned = val.trim();
          break;
        }
      }
      // If no query parameter matched, check the last path segment (e.g. https://.../track/EXP12345)
      if (cleaned.startsWith('http')) {
        const pathname = url.pathname.replace(/\/+$/, '');
        const lastSegment = pathname.substring(pathname.lastIndexOf('/') + 1).trim();
        if (lastSegment && lastSegment.length >= 3 && !lastSegment.includes('.')) {
          cleaned = lastSegment;
        }
      }
    } catch {
      // Keep raw cleaned string if URL parsing fails
    }
  }

  // 3. Remove leading/trailing quotation marks or brackets sometimes added by barcode guns
  cleaned = cleaned.replace(/^["'([{<]+|["')\]}>]+$/g, '').trim();

  // 4. Return standard uppercase
  return cleaned.toUpperCase();
}
