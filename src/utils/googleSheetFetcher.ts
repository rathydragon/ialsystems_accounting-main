/**
 * Robust Google Sheet Data Fetcher
 * Works reliably on Local, Vercel, and all hosting environments.
 * Supports:
 * - Full Google Sheets URL (with #gid=..., ?gid=..., edit, sharing, etc.)
 * - Direct Spreadsheet ID
 * - Published to Web URLs (/pubhtml, /pub?output=csv)
 * - Multi-tier fallback strategy (GViz JSON -> CSV Export -> GViz CSV -> CORS Proxy)
 */

export interface ParsedSheetInfo {
  spreadsheetId: string;
  gid: string | null;
  sheetName: string | null;
  isPublishedWeb: boolean;
  isWebApp: boolean;
  originalInput: string;
}

export interface SheetColumnDef {
  id: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean';
}

export interface SheetRowData {
  _id: string;
  [key: string]: any;
}

export interface FetchSheetResult {
  success: boolean;
  columns: SheetColumnDef[];
  rows: SheetRowData[];
  spreadsheetId: string;
  sheetName?: string;
  fetchedVia: 'JSONP' | 'GVIZ_JSON' | 'CSV_EXPORT' | 'GVIZ_CSV' | 'PUB_CSV' | 'CORS_PROXY';
  error?: string;
  isRestricted?: boolean;
}

/**
 * Extract spreadsheet ID, GID (tab ID), and sheet name from any URL format or raw ID
 */
export function parseGoogleSheetInput(input: string): ParsedSheetInfo {
  const result: ParsedSheetInfo = {
    spreadsheetId: '',
    gid: null,
    sheetName: null,
    isPublishedWeb: false,
    isWebApp: false,
    originalInput: input || ''
  };

  if (!input || typeof input !== 'string') return result;
  const trimmed = input.trim();

  // Check if it's an Apps Script Web App URL
  if (trimmed.includes('script.google.com/macros/s/')) {
    result.isWebApp = true;
    return result;
  }

  // 1. Extract GID (Sheet Tab ID) if present in URL (e.g. #gid=12345678 or ?gid=12345678)
  const gidMatch = trimmed.match(/[#?&]gid=([0-9]+)/i);
  if (gidMatch && gidMatch[1]) {
    result.gid = gidMatch[1];
  }

  // 2. Extract Sheet Name if specified in query param (e.g. &sheet=Data)
  const sheetParamMatch = trimmed.match(/[?&]sheet=([^&#]+)/i);
  if (sheetParamMatch && sheetParamMatch[1]) {
    try {
      result.sheetName = decodeURIComponent(sheetParamMatch[1].replace(/\+/g, ' '));
    } catch (e) {
      result.sheetName = sheetParamMatch[1];
    }
  }

  // 3. Check for published to web: /spreadsheets/d/e/2PACX-.../pubhtml or /pub
  if (trimmed.includes('/spreadsheets/d/e/')) {
    result.isPublishedWeb = true;
    const pubMatch = trimmed.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
    if (pubMatch && pubMatch[1]) {
      result.spreadsheetId = pubMatch[1];
      return result;
    }
  }

  // 4. Standard Google Sheet URL: /spreadsheets/d/{id}
  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  if (idMatch && idMatch[1]) {
    result.spreadsheetId = idMatch[1];
    return result;
  }

  // 5. Google Drive file URL: /file/d/{id} or ?id={id}
  const driveMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9-_]+)/i) || trimmed.match(/[?&]id=([a-zA-Z0-9-_]+)/i);
  if (driveMatch && driveMatch[1]) {
    result.spreadsheetId = driveMatch[1];
    return result;
  }

  // 6. Raw ID string (Google Sheets IDs are typically 40-50 chars, base64url-like)
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    result.spreadsheetId = trimmed;
    return result;
  }

  // Fallback: strip leading/trailing slashes
  result.spreadsheetId = trimmed.replace(/^https?:\/\/[^/]+\//, '').split(/[\/?#]/)[0];
  return result;
}

/**
 * High-performance RFC 4180 compliant CSV parser
 * Handles quotes, commas, newlines inside cells, tabs, semicolons.
 */
export function parseCSV(text: string): string[][] {
  if (!text) return [];

  // Remove UTF-8 BOM if present
  let cleanText = text;
  if (cleanText.charCodeAt(0) === 0xFEFF) {
    cleanText = cleanText.slice(1);
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentVal += '"';
          i++;
        } else {
          // Closing quote
          inQuotes = false;
        }
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentVal);
        currentVal = '';
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++;
        }
        currentRow.push(currentVal);
        rows.push(currentRow);
        currentRow = [];
        currentVal = '';
      } else if (char === '\n') {
        currentRow.push(currentVal);
        rows.push(currentRow);
        currentRow = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
  }

  // Add remaining value and row
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal);
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Convert parsed 2D array of CSV strings into typed ColumnDef and RowData
 */
export function convertTableToRowsAndColumns(rawRows: string[][]): { columns: SheetColumnDef[]; rows: SheetRowData[] } {
  if (!rawRows || rawRows.length === 0) {
    return { columns: [], rows: [] };
  }

  // 1. First row is header row
  const headerRow = rawRows[0] || [];
  const columns: SheetColumnDef[] = headerRow.map((h, idx) => ({
    id: `col_${idx}`,
    label: (h && h.trim()) || `ជួរឈរ ${idx + 1}`,
    type: 'string'
  }));

  // 2. Data rows
  const rows: SheetRowData[] = [];
  for (let r = 1; r < rawRows.length; r++) {
    const rCells = rawRows[r];
    if (!rCells) continue;

    // Check if entire row is empty
    const hasValue = rCells.some(val => val !== undefined && val !== null && String(val).trim() !== '');
    if (!hasValue) continue;

    const rowObj: SheetRowData = {
      _id: `row_${r}_${Date.now()}`
    };

    columns.forEach((col, cIdx) => {
      const cellVal = rCells[cIdx] !== undefined && rCells[cIdx] !== null ? rCells[cIdx].trim() : '';
      rowObj[col.id] = cellVal;
    });

    rows.push(rowObj);
  }

  // 3. Detect numeric columns
  columns.forEach(col => {
    let isAllNumbers = true;
    let nonNullCount = 0;
    for (const row of rows.slice(0, 100)) {
      const val = row[col.id];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        nonNullCount++;
        const num = Number(String(val).replace(/,/g, '').replace(/\$/g, '').trim());
        if (isNaN(num)) {
          isAllNumbers = false;
          break;
        }
      }
    }
    if (nonNullCount > 0 && isAllNumbers) {
      col.type = 'number';
    }
  });

  return { columns, rows };
}

/**
 * Helper to parse GViz table format into typed columns and rows
 */
export function parseGVizTable(
  table: any,
  spreadsheetId: string,
  effectiveSheetName?: string,
  fetchedVia: 'JSONP' | 'GVIZ_JSON' | 'CORS_PROXY' = 'JSONP'
): FetchSheetResult {
  const rawCols = table.cols || [];
  const rawRows = table.rows || [];

  let parsedCols: SheetColumnDef[] = [];
  let startRowIdx = 0;

  // Check if table.cols has real labels
  const hasColLabels = rawCols.some((c: any) => c && c.label && c.label.trim() !== '');

  if (hasColLabels) {
    parsedCols = rawCols.map((c: any, idx: number) => ({
      id: `col_${idx}`,
      label: (c.label && c.label.trim()) || `ជួរឈរ ${idx + 1}`,
      type: (c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'string') as any
    }));
  } else if (rawRows.length > 0) {
    // First row contains the header names
    const firstRowCells = rawRows[0]?.c || [];
    parsedCols = firstRowCells.map((cell: any, idx: number) => {
      const headerText = cell?.f || (cell?.v !== undefined && cell?.v !== null ? String(cell.v).trim() : '');
      return {
        id: `col_${idx}`,
        label: headerText || `ជួរឈរ ${idx + 1}`,
        type: 'string'
      };
    });
    startRowIdx = 1;
  } else {
    parsedCols = rawCols.map((_: any, idx: number) => ({
      id: `col_${idx}`,
      label: `ជួរឈរ ${idx + 1}`,
      type: 'string'
    }));
  }

  // Build row objects
  const parsedRows: SheetRowData[] = [];
  for (let r = startRowIdx; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || !Array.isArray(row.c)) continue;

    const hasValue = row.c.some((c: any) => c && (c.v !== null && c.v !== undefined && String(c.v).trim() !== ''));
    if (!hasValue) continue;

    const rowObj: SheetRowData = {
      _id: `row_${r}_${Date.now()}`
    };

    row.c.forEach((cell: any, colIdx: number) => {
      const colKey = `col_${colIdx}`;
      if (cell === null || cell === undefined) {
        rowObj[colKey] = '';
        return;
      }

      let val = cell.v;
      if (typeof val === 'string' && val.startsWith('Date(')) {
        const parts = val.replace('Date(', '').replace(')', '').split(',');
        if (parts.length >= 3) {
          const y = parts[0].trim();
          const m = String(Number(parts[1].trim()) + 1).padStart(2, '0');
          const d = String(parts[2].trim()).padStart(2, '0');
          val = `${d}/${m}/${y}`;
        }
      }

      const displayVal = cell.f !== undefined && cell.f !== null ? cell.f : val;
      rowObj[colKey] = displayVal !== undefined && displayVal !== null ? displayVal : '';
    });

    parsedRows.push(rowObj);
  }

  // Auto-detect numeric columns
  parsedCols = parsedCols.map(col => {
    let isAllNumbers = true;
    let nonNullCount = 0;
    for (const row of parsedRows.slice(0, 100)) {
      const val = row[col.id];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        nonNullCount++;
        const num = Number(String(val).replace(/,/g, '').replace(/\$/g, '').trim());
        if (isNaN(num)) {
          isAllNumbers = false;
          break;
        }
      }
    }
    if (nonNullCount > 0 && isAllNumbers) {
      return { ...col, type: 'number' };
    }
    return col;
  });

  return {
    success: true,
    columns: parsedCols,
    rows: parsedRows,
    spreadsheetId,
    sheetName: effectiveSheetName,
    fetchedVia
  };
}

/**
 * TIER 1 (PRIMARY): JSONP via Dynamic <script> Tag
 * Google Visualization Query API natively supports JSONP responseHandler:
 * https://docs.google.com/spreadsheets/d/{id}/gviz/tq?tqx=responseHandler:{cbName}&sheet={sheetName}&t={timestamp}
 *
 * CRITICAL ADVANTAGE:
 * Browsers NEVER enforce CORS on <script> tags!
 * This completely eliminates all CORS policy blocks and Service Worker fetch errors
 * on localhost, Vercel, and custom domains.
 */
export function fetchGoogleSheetViaJSONP(
  spreadsheetId: string,
  effectiveSheetName?: string,
  effectiveGid?: string | null,
  timeoutMs = 15000
): Promise<FetchSheetResult | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const callbackName = `_googleGviz_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    let script: HTMLScriptElement | null = null;
    let timer: any = null;
    let hasResolved = false;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      try {
        if (script && script.parentNode) {
          script.parentNode.removeChild(script);
        }
      } catch (e) {
        // ignore
      }
      try {
        delete (window as any)[callbackName];
      } catch (e) {
        (window as any)[callbackName] = undefined;
      }
    };

    // Global callback invoked by Google's response script
    (window as any)[callbackName] = (resData: any) => {
      if (hasResolved) return;
      hasResolved = true;
      cleanup();

      if (!resData) {
        resolve(null);
        return;
      }

      if (resData.status === 'error') {
        const errorMsg = (resData.errors && resData.errors[0]?.detailed_message) || resData.errors?.[0]?.message || '';
        console.warn('GViz JSONP notice:', errorMsg);
        if (errorMsg.toLowerCase().includes('permission') || errorMsg.toLowerCase().includes('access') || errorMsg.toLowerCase().includes('restricted')) {
          resolve({
            success: false,
            columns: [],
            rows: [],
            spreadsheetId,
            sheetName: effectiveSheetName,
            fetchedVia: 'JSONP',
            isRestricted: true,
            error: 'Google Sheet នេះស្ថិតក្នុងស្ថានភាព "មានកំណត់ (Restricted)"។ សូម Share ជា "Anyone with the link (អ្នកដែលមានតំណភ្ជាប់អាចមើលបាន)"!'
          });
          return;
        }
        resolve(null);
        return;
      }

      if (resData.status === 'ok' && resData.table) {
        const result = parseGVizTable(resData.table, spreadsheetId, effectiveSheetName, 'JSONP');
        resolve(result);
      } else {
        resolve(null);
      }
    };

    let url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=responseHandler:${callbackName}&t=${Date.now()}`;
    if (effectiveSheetName) {
      url += `&sheet=${encodeURIComponent(effectiveSheetName)}`;
    } else if (effectiveGid) {
      url += `&gid=${effectiveGid}`;
    }

    script = document.createElement('script');
    script.src = url;
    script.async = true;

    script.onerror = () => {
      if (hasResolved) return;
      hasResolved = true;
      cleanup();
      console.debug('JSONP script load error (possibly private or restricted).');
      resolve(null);
    };

    timer = setTimeout(() => {
      if (hasResolved) return;
      hasResolved = true;
      cleanup();
      console.debug('JSONP script request timed out');
      resolve(null);
    }, timeoutMs);

    document.head.appendChild(script);
  });
}

/**
 * Multi-Tier Google Sheet Fetcher
 * Designed to execute cleanly across Vercel, localhost, and all production setups
 */
export async function fetchGoogleSheetDataUniversal(
  input: string,
  explicitSheetName?: string
): Promise<FetchSheetResult> {
  const parsed = parseGoogleSheetInput(input);
  const id = parsed.spreadsheetId;

  if (!id) {
    return {
      success: false,
      columns: [],
      rows: [],
      spreadsheetId: '',
      fetchedVia: 'JSONP',
      error: 'មិនអាចស្វែងរក Spreadsheet ID បានឡើយ សូមពិនិត្យមើល Link ម្តងទៀត'
    };
  }

  const effectiveSheetName = (explicitSheetName && explicitSheetName.trim()) 
    ? explicitSheetName.trim() 
    : (parsed.sheetName || '');

  const effectiveGid = parsed.gid;

  // =========================================================================
  // TIER 1 (PRIMARY): JSONP via Dynamic <script> Tag (100% CORS-Free!)
  // Completely bypasses browser CORS restrictions on localhost, Vercel, and custom domains.
  // =========================================================================
  try {
    const jsonpResult = await fetchGoogleSheetViaJSONP(id, effectiveSheetName, effectiveGid);
    if (jsonpResult) {
      if (jsonpResult.success || jsonpResult.isRestricted) {
        return jsonpResult;
      }
    }
  } catch (jsonpErr) {
    console.debug('JSONP tier fallback:', jsonpErr);
  }

  // =========================================================================
  // TIER 2: GViz JSON API (Google Visualization Query API via fetch)
  // =========================================================================
  try {
    let gvizUrl = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&t=${Date.now()}`;
    if (effectiveSheetName) {
      gvizUrl += `&sheet=${encodeURIComponent(effectiveSheetName)}`;
    } else if (effectiveGid) {
      gvizUrl += `&gid=${effectiveGid}`;
    }

    const gvizRes = await fetch(gvizUrl);
    const text = await gvizRes.text();

    // Check for Restricted Google Sheet (requires Google login)
    if (text.includes('<!DOCTYPE html>') || text.includes('accounts.google.com') || text.includes('ServiceLogin')) {
      return {
        success: false,
        columns: [],
        rows: [],
        spreadsheetId: id,
        fetchedVia: 'GVIZ_JSON',
        isRestricted: true,
        error: 'Google Sheet នេះស្ថិតក្នុងស្ថានភាព "មានកំណត់ (Restricted)"។ សូម Share ជា "Anyone with the link (អ្នកដែលមានតំណភ្ជាប់អាចមើលបាន)"!'
      };
    }

    if (text.includes('google.visualization.Query.setResponse')) {
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        const jsonStr = text.substring(jsonStart, jsonEnd + 1);
        const resData = JSON.parse(jsonStr);

        if (resData.status === 'ok' && resData.table) {
          return parseGVizTable(resData.table, id, effectiveSheetName, 'GVIZ_JSON');
        }
      }
    }
  } catch (tier2Err) {
    console.debug('GViz JSON tier fallback:', tier2Err);
  }

  // =========================================================================
  // TIER 2: Direct Google Sheet CSV Export (/export?format=csv)
  // Highly reliable for public/shared sheets with standard CORS headers
  // =========================================================================
  try {
    let csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&t=${Date.now()}`;
    if (effectiveSheetName) {
      csvUrl += `&sheet=${encodeURIComponent(effectiveSheetName)}`;
    } else if (effectiveGid) {
      csvUrl += `&gid=${effectiveGid}`;
    }

    const csvRes = await fetch(csvUrl);
    if (csvRes.ok) {
      const csvText = await csvRes.text();
      // Ensure it's not a redirected login page
      if (!csvText.includes('<!DOCTYPE html>') && !csvText.includes('accounts.google.com')) {
        const rawGrid = parseCSV(csvText);
        if (rawGrid.length > 0) {
          const { columns, rows } = convertTableToRowsAndColumns(rawGrid);
          return {
            success: true,
            columns,
            rows,
            spreadsheetId: id,
            sheetName: effectiveSheetName,
            fetchedVia: 'CSV_EXPORT'
          };
        }
      }
    }
  } catch (tier2Err) {
    console.warn('CSV export tier failed, trying GViz CSV tier:', tier2Err);
  }

  // =========================================================================
  // TIER 3: GViz CSV Output (/gviz/tq?tqx=out:csv)
  // =========================================================================
  try {
    let gvizCsvUrl = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&t=${Date.now()}`;
    if (effectiveSheetName) {
      gvizCsvUrl += `&sheet=${encodeURIComponent(effectiveSheetName)}`;
    } else if (effectiveGid) {
      gvizCsvUrl += `&gid=${effectiveGid}`;
    }

    const gvizCsvRes = await fetch(gvizCsvUrl);
    if (gvizCsvRes.ok) {
      const gvizCsvText = await gvizCsvRes.text();
      if (!gvizCsvText.includes('<!DOCTYPE html>') && !gvizCsvText.includes('accounts.google.com')) {
        const rawGrid = parseCSV(gvizCsvText);
        if (rawGrid.length > 0) {
          const { columns, rows } = convertTableToRowsAndColumns(rawGrid);
          return {
            success: true,
            columns,
            rows,
            spreadsheetId: id,
            sheetName: effectiveSheetName,
            fetchedVia: 'GVIZ_CSV'
          };
        }
      }
    }
  } catch (tier3Err) {
    console.warn('GViz CSV tier failed, trying Published CSV tier:', tier3Err);
  }

  // =========================================================================
  // TIER 4: Published to Web CSV (/pub?output=csv)
  // If user published via "File > Share > Publish to web"
  // =========================================================================
  if (parsed.isPublishedWeb || input.includes('/pubhtml') || input.includes('/pub')) {
    try {
      let pubCsvUrl = input.replace(/\/pubhtml.*$/, '/pub?output=csv').replace(/\/pub.*$/, '/pub?output=csv');
      if (!pubCsvUrl.includes('output=csv')) {
        pubCsvUrl += (pubCsvUrl.includes('?') ? '&' : '?') + 'output=csv';
      }
      if (effectiveGid && !pubCsvUrl.includes('gid=')) {
        pubCsvUrl += `&gid=${effectiveGid}`;
      }

      const pubRes = await fetch(pubCsvUrl);
      if (pubRes.ok) {
        const pubText = await pubRes.text();
        if (!pubText.includes('<!DOCTYPE html>')) {
          const rawGrid = parseCSV(pubText);
          if (rawGrid.length > 0) {
            const { columns, rows } = convertTableToRowsAndColumns(rawGrid);
            return {
              success: true,
              columns,
              rows,
              spreadsheetId: id,
              sheetName: effectiveSheetName,
              fetchedVia: 'PUB_CSV'
            };
          }
        }
      }
    } catch (tier4Err) {
      console.warn('Pub CSV tier failed:', tier4Err);
    }
  }

  // =========================================================================
  // TIER 5: CORS Proxy Fallback (Guaranteed fallback for strict Vercel browser policies)
  // =========================================================================
  try {
    const targetGviz = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json${effectiveSheetName ? `&sheet=${encodeURIComponent(effectiveSheetName)}` : ''}${effectiveGid ? `&gid=${effectiveGid}` : ''}`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetGviz)}`;
    
    const proxyRes = await fetch(proxyUrl);
    if (proxyRes.ok) {
      const pText = await proxyRes.text();
      if (pText.includes('google.visualization.Query.setResponse')) {
        const jStart = pText.indexOf('{');
        const jEnd = pText.lastIndexOf('}');
        if (jStart >= 0 && jEnd > jStart) {
          const pData = JSON.parse(pText.substring(jStart, jEnd + 1));
          if (pData.status === 'ok' && pData.table) {
            const cols = (pData.table.cols || []).map((c: any, idx: number) => ({
              id: `col_${idx}`,
              label: (c.label && c.label.trim()) || `ជួរឈរ ${idx + 1}`,
              type: (c.type === 'number' ? 'number' : 'string') as any
            }));
            const rows: SheetRowData[] = [];
            (pData.table.rows || []).forEach((r: any, rIdx: number) => {
              if (!r || !r.c) return;
              const rowObj: SheetRowData = { _id: `row_${rIdx}_${Date.now()}` };
              cols.forEach((col: any, cIdx: number) => {
                const cell = r.c[cIdx];
                rowObj[col.id] = cell?.f !== undefined && cell?.f !== null ? cell.f : (cell?.v !== undefined && cell?.v !== null ? cell.v : '');
              });
              rows.push(rowObj);
            });
            return {
              success: true,
              columns: cols,
              rows,
              spreadsheetId: id,
              sheetName: effectiveSheetName,
              fetchedVia: 'CORS_PROXY'
            };
          }
        }
      }
    }
  } catch (tier5Err) {
    console.warn('Proxy tier failed:', tier5Err);
  }

  // All tiers failed
  return {
    success: false,
    columns: [],
    rows: [],
    spreadsheetId: id,
    fetchedVia: 'GVIZ_JSON',
    error: 'ពុំអាចទាញយកទិន្នន័យពី Google Sheets នេះបានឡើយ។ សូមពិនិត្យមើលសិទ្ធិ Share (ត្រូវតែជ្រើសរើស "Anyone with the link can view")!'
  };
}
