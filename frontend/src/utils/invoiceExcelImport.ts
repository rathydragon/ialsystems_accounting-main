/**
 * Import of old invoice-number records from Excel (.xlsx) or CSV, plus a blank template.
 * Headers are matched loosely (case, spaces, "_" ignored) in English or Khmer, so the
 * page's own CSV export can be imported back as-is.
 */
import { readSpreadsheetTable, SheetTable } from './customerExcelImport';
import type { InvoiceStatus } from '../services/invoiceNumberService';

export interface ImportInvoiceRow {
  tracking: string;
  customer: string;
  province: string;
  namePrepare: string;
  date: string; // YYYY-MM-DD or ''
  status: InvoiceStatus;
  issuedDate: string;
  issuedBy: string;
}

type Field = keyof ImportInvoiceRow;

const HEADER_ALIASES: Record<Field, string[]> = {
  tracking: ['tracking', 'trackingno', 'trackingnumber', 'invoice', 'invoiceno', 'invoicenumber', 'barcode', 'លេខ', 'លេខវិក័យប័ត្រ', 'លេខវិក្កយបត្រ'],
  customer: ['customer', 'customername', 'receiver', 'issuedto', 'អតិថិជន', 'អ្នកទទួល'],
  province: ['province', 'city', 'ខេត្ត', 'ខេត្ត/ក្រុង'],
  namePrepare: ['nameprepaire', 'nameprepare', 'preparedby', 'prepareby', 'preparer', 'អ្នករៀបចំ'],
  date: ['date', 'preparedate', 'prepareddate', 'កាលបរិច្ឆេទ', 'ថ្ងៃ', 'ថ្ងៃរៀបចំ'],
  status: ['status', 'ស្ថានភាព'],
  issuedDate: ['issueddate', 'issuedate', 'ថ្ងៃបើកឲ្យ', 'ថ្ងៃបើកអោយ'],
  issuedBy: ['issuedby', 'អ្នកបើកឲ្យ'],
};

const PLACEHOLDERS = new Set(['empty', 'null', 'none', 'n/a', 'na', '-', '--', 'គ្មាន']);
const normHeader = (h: string) => h.toLowerCase().replace(/[\s_\-.()]/g, '');
const HEADER_LOOKUP = new Map<string, Field>();
(Object.keys(HEADER_ALIASES) as Field[]).forEach((f) => HEADER_ALIASES[f].forEach((a) => HEADER_LOOKUP.set(normHeader(a), f)));

const pad = (n: number) => String(n).padStart(2, '0');

/** Accepts Excel dates, YYYY-MM-DD, D/M/YYYY (Khmer order), D-M-YYYY and Excel serial numbers. */
export function toIsoDate(raw: any, text: string): string {
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return `${raw.getUTCFullYear()}-${pad(raw.getUTCMonth() + 1)}-${pad(raw.getUTCDate())}`;
  }
  const t = text.trim();
  if (!t) return '';
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    let day = +m[1];
    let month = +m[2];
    if (month > 12 && day <= 12) [day, month] = [month, day]; // clearly M/D/YYYY
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${year}-${pad(month)}-${pad(day)}`;
    return '';
  }
  if (/^\d{5}$/.test(t)) {
    // Excel serial day number (days since 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + +t * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Status text → status. Blank: ISSUED when a customer is filled in, otherwise PREPARED. */
export function toInvoiceStatus(text: string, hasCustomer: boolean): InvoiceStatus {
  const s = text.trim().toLowerCase();
  if (!s) return hasCustomer ? 'ISSUED' : 'PREPARED';
  if (s.includes('cancel') || s.includes('void') || s.includes('បោះបង់') || s.includes('លុប')) return 'CANCELLED';
  if (s.includes('unused') || s.includes('prepar') || s.includes('stock') || s.includes('មិនទាន់') || s.includes('រៀបចំ')) return 'PREPARED';
  if (s.includes('issue') || s.includes('used') || s.includes('use') || s.includes('done') || s.includes('បើក') || s.includes('ប្រើ') || s.includes('ប្រគល់'))
    return 'ISSUED';
  return hasCustomer ? 'ISSUED' : 'PREPARED';
}

export interface ParsedInvoiceFile {
  rows: ImportInvoiceRow[];
  missingTracking: number;
  duplicatesInFile: number;
  ignoredHeaders: string[];
}

export function buildInvoiceRows(table: SheetTable): ParsedInvoiceFile {
  const score = (r: { text: string[] }) => r.text.filter((h) => HEADER_LOOKUP.has(normHeader(h))).length;
  let headerIdx = -1;
  table.slice(0, 20).forEach((r, i) => {
    if (score(r) > (headerIdx < 0 ? 0 : score(table[headerIdx]))) headerIdx = i;
  });
  if (headerIdx < 0) throw new Error('រកមិនឃើញជួរ Header (ត្រូវមាន TRACKING, CUSTOMER, ...)');
  const headers = table[headerIdx].text;
  const fieldAt = headers.map((h) => HEADER_LOOKUP.get(normHeader(h)));
  if (!fieldAt.includes('tracking')) throw new Error('File ត្រូវមានជួរឈរ «TRACKING»');
  const ignoredHeaders = headers.filter((h, i) => h.trim() && !fieldAt[i]);

  const seen = new Set<string>();
  const rows: ImportInvoiceRow[] = [];
  let missingTracking = 0;
  let duplicatesInFile = 0;
  for (const line of table.slice(headerIdx + 1)) {
    if (line.text.every((t) => !String(t || '').trim())) continue;
    const v: Record<Field, string> = { tracking: '', customer: '', province: '', namePrepare: '', date: '', status: '', issuedDate: '', issuedBy: '' };
    fieldAt.forEach((f, i) => {
      if (!f) return;
      const text = String(line.text[i] || '').trim();
      if (!text || PLACEHOLDERS.has(text.toLowerCase())) return;
      v[f] = f === 'date' || f === 'issuedDate' ? toIsoDate(line.raw[i], text) : text;
    });
    const tracking = v.tracking.toUpperCase().replace(/\s+/g, '');
    if (!tracking) {
      missingTracking++;
      continue;
    }
    if (seen.has(tracking)) {
      duplicatesInFile++;
      continue;
    }
    seen.add(tracking);
    const status = toInvoiceStatus(v.status, !!v.customer);
    rows.push({
      tracking,
      customer: v.customer,
      province: v.province,
      namePrepare: v.namePrepare,
      date: v.date,
      status,
      // Old sheets usually have one DATE; use it as the issue day too when nothing else is given
      issuedDate: status === 'ISSUED' ? v.issuedDate || v.date : v.issuedDate,
      issuedBy: v.issuedBy,
    });
  }
  return { rows, missingTracking, duplicatesInFile, ignoredHeaders };
}

export async function parseInvoiceFile(file: File): Promise<ParsedInvoiceFile> {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith('.csv') && !lower.endsWith('.xlsx')) {
    throw new Error('គាំទ្រតែ File .xlsx ឬ .csv (សូម Save As .xlsx ប្រសិនបើជា .xls ចាស់)');
  }
  return buildInvoiceRows(await readSpreadsheetTable(file));
}

/**
 * Fills a workbook with the import template: a data sheet (STATUS / PROVINCE dropdowns,
 * date columns, text TRACKING) and a sheet of instructions. Kept free of browser APIs.
 */
export function fillInvoiceTemplate(wb: any, provinces: string[]): void {
  const ws = wb.addWorksheet('Invoice Numbers', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'TRACKING', key: 'tracking', width: 18 },
    { header: 'CUSTOMER', key: 'customer', width: 26 },
    { header: 'PROVINCE', key: 'province', width: 28 },
    { header: 'NAME PREPAIRE', key: 'namePrepare', width: 20 },
    { header: 'DATE', key: 'date', width: 14 },
    { header: 'STATUS', key: 'status', width: 14 },
    { header: 'ISSUED DATE', key: 'issuedDate', width: 14 },
  ];

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0891B2' } };
  header.alignment = { vertical: 'middle' };
  header.height = 20;
  ws.getRow(1).getCell(1).note = 'ត្រូវតែមាន • មិនអាចស្ទួនគ្នា';
  ws.getRow(1).getCell(6).note = 'PREPARED = រៀបចំទុក • ISSUED = បានបើកឲ្យ • CANCELLED = បោះបង់\nទុកទទេ៖ មាន CUSTOMER → ISSUED, គ្មាន → PREPARED';

  // Formats and dropdowns for the first 5000 data rows
  ws.getColumn(1).numFmt = '@'; // keep leading zeros
  ws.getColumn(5).numFmt = 'dd/mm/yyyy';
  ws.getColumn(7).numFmt = 'dd/mm/yyyy';
  // Provinces live on a hidden sheet so the dropdown list can be long
  const lists = wb.addWorksheet('Lists', { state: 'hidden' });
  provinces.forEach((p, i) => (lists.getCell(i + 1, 1).value = p));
  for (let r = 2; r <= 5001; r++) {
    ws.getCell(r, 6).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"PREPARED,ISSUED,CANCELLED"'],
      showErrorMessage: true,
      errorTitle: 'STATUS',
      error: 'សូមជ្រើស PREPARED, ISSUED ឬ CANCELLED',
    };
    if (provinces.length) {
      ws.getCell(r, 3).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`Lists!$A$1:$A$${provinces.length}`],
        showErrorMessage: false, // other names may be typed too
      };
    }
    for (const c of [5, 7]) {
      ws.getCell(r, c).dataValidation = {
        type: 'date',
        operator: 'greaterThan',
        allowBlank: true,
        formulae: [new Date(Date.UTC(2000, 0, 1))],
        showErrorMessage: true,
        errorTitle: 'DATE',
        error: 'សូមបញ្ចូលកាលបរិច្ឆេទ (ថ្ងៃ/ខែ/ឆ្នាំ)',
      };
    }
  }

  const help = wb.addWorksheet('របៀបបំពេញ');
  help.getColumn(1).width = 18;
  help.getColumn(2).width = 80;
  const lines: [string, string][] = [
    ['ជួរឈរ', 'ការពន្យល់'],
    ['TRACKING', 'លេខវិក័យប័ត្រ (ត្រូវតែមាន មិនអាចស្ទួន)។ ឧ. INV0001'],
    ['CUSTOMER', 'ឈ្មោះអតិថិជន ឬបុគ្គលិកដែលបានទទួល។ ទុកទទេ បើមិនទាន់បើកឲ្យ'],
    ['PROVINCE', 'ខេត្ត — ជ្រើសពីបញ្ជី ឬវាយបញ្ចូល'],
    ['NAME PREPAIRE', 'ឈ្មោះអ្នករៀបចំ'],
    ['DATE', 'ថ្ងៃរៀបចំ (ថ្ងៃ/ខែ/ឆ្នាំ)'],
    ['STATUS', 'PREPARED = រៀបចំទុក • ISSUED = បានបើកឲ្យ • CANCELLED = បោះបង់ • ទុកទទេ៖ មាន CUSTOMER → ISSUED, គ្មាន → PREPARED'],
    ['ISSUED DATE', 'ថ្ងៃបើកឲ្យ (មិនចាំបាច់)។ បើទទេ ហើយ STATUS = ISSUED នឹងយក DATE ជំនួស'],
    ['', ''],
    ['ចំណាំ', 'បំពេញក្នុង Sheet «Invoice Numbers» • រក្សាទុកជា .xlsx • លេខដែលមានរួចហើយនឹងត្រូវរំលង (លើកលែងតែធីក «សរសេរជាន់»)'],
    ['', ''],
    ['ឧទាហរណ៍', 'TRACKING | CUSTOMER | PROVINCE | NAME PREPAIRE | DATE | STATUS | ISSUED DATE'],
    ['', 'INV0001 |  |  | សុខ សុខា | 01/10/2026 | PREPARED | '],
    ['', 'INV0002 | ABC Co., Ltd | ខេត្តកណ្ដាល (Kandal) | សុខ សុខា | 01/10/2026 | ISSUED | 05/10/2026'],
    ['', 'INV0003 |  |  | សុខ សុខា | 01/10/2026 | CANCELLED | '],
  ];
  lines.forEach((l) => help.addRow(l));
  help.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  help.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0891B2' } };
  help.getColumn(1).font = { bold: true };
  help.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
}

export async function downloadInvoiceTemplate(): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const { CAMBODIA_PROVINCES } = await import('../data/cambodiaProvinces');
  const wb = new ExcelJS.Workbook();
  fillInvoiceTemplate(wb, CAMBODIA_PROVINCES);
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Invoice_Numbers_Import_Template.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
