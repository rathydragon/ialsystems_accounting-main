/**
 * Issue Invoice Excel: read an uploaded .xlsx / .csv, build the blank upload template, and export.
 * Headers are matched loosely (case, spaces, "_" ignored) in English or Khmer, so the page's own
 * export can be uploaded back as-is. exceljs is loaded lazily.
 */
import { readSpreadsheetTable, SheetTable } from './customerExcelImport';
import type { IssueInvoice } from '../services/issueInvoiceService';

export interface IssueInvoiceRow {
  tracking: string;
  unitPrice: number | null;
  customerName: string;
  note: string;
}

type Field = keyof IssueInvoiceRow;

const HEADER_ALIASES: Record<Field, string[]> = {
  tracking: ['tracking', 'trackingno', 'trackingnumber', 'barcode', 'លេខtracking', 'លេខកូដ'],
  unitPrice: ['unitprice', 'price', 'amount', 'តម្លៃ', 'តម្លៃឯកតា'],
  customerName: ['customersname', 'customername', 'customer', 'customers', 'ឈ្មោះអតិថិជន', 'អតិថិជន'],
  note: ['noted', 'note', 'notes', 'remark', 'remarks', 'ចំណាំ', 'កំណត់សម្គាល់'],
};

const normHeader = (h: string) => h.toLowerCase().replace(/[\s_\-.()'’]/g, '');
const HEADER_LOOKUP = new Map<string, Field>();
(Object.keys(HEADER_ALIASES) as Field[]).forEach((f) => HEADER_ALIASES[f].forEach((a) => HEADER_LOOKUP.set(normHeader(a), f)));

const PLACEHOLDERS = new Set(['null', 'none', 'n/a', 'na', '-', '--']);

/** Excel number or "1,250.50" / "$12" → number. Blank → null, unreadable → NaN. */
function toPrice(raw: any, text: string): number {
  if (typeof raw === 'number') return raw;
  if (raw && typeof raw === 'object' && typeof raw.result === 'number') return raw.result; // formula cell
  const t = text.replace(/[$,\s៛]/g, '');
  if (!t) return NaN;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

export interface ParsedIssueInvoiceFile {
  rows: IssueInvoiceRow[];
  missingTracking: number;
  badPrice: string[];
  duplicatesInFile: number;
  ignoredHeaders: string[];
}

export function buildIssueInvoiceRows(table: SheetTable): ParsedIssueInvoiceFile {
  const score = (r: { text: string[] }) => r.text.filter((h) => HEADER_LOOKUP.has(normHeader(h))).length;
  let headerIdx = -1;
  table.slice(0, 20).forEach((r, i) => {
    if (score(r) > (headerIdx < 0 ? 0 : score(table[headerIdx]))) headerIdx = i;
  });
  if (headerIdx < 0) throw new Error('រកមិនឃើញជួរ Header (ត្រូវមាន Tracking, Unit Price, Customers Name, Noted)');
  const headers = table[headerIdx].text;
  const fieldAt = headers.map((h) => HEADER_LOOKUP.get(normHeader(h)));
  if (!fieldAt.includes('tracking')) throw new Error('File ត្រូវមានជួរឈរ «Tracking»');
  const ignoredHeaders = headers.filter((h, i) => h.trim() && !fieldAt[i]);

  const seen = new Set<string>();
  const rows: IssueInvoiceRow[] = [];
  const badPrice: string[] = [];
  let missingTracking = 0;
  let duplicatesInFile = 0;
  for (const line of table.slice(headerIdx + 1)) {
    if (line.text.every((t) => !String(t || '').trim())) continue;
    const row: IssueInvoiceRow = { tracking: '', unitPrice: null, customerName: '', note: '' };
    let priceOk = true;
    fieldAt.forEach((f, i) => {
      if (!f) return;
      const text = String(line.text[i] ?? '').trim();
      if (!text || PLACEHOLDERS.has(text.toLowerCase())) return;
      if (f === 'unitPrice') {
        const n = toPrice(line.raw[i], text);
        if (Number.isNaN(n)) priceOk = false;
        else row.unitPrice = Math.round(n * 100) / 100;
      } else if (f === 'tracking') {
        row.tracking = text.toUpperCase().replace(/\s+/g, '');
      } else {
        row[f] = text;
      }
    });
    if (!row.tracking) {
      missingTracking++;
      continue;
    }
    if (!priceOk) {
      badPrice.push(row.tracking);
      continue;
    }
    if (seen.has(row.tracking)) {
      duplicatesInFile++;
      continue;
    }
    seen.add(row.tracking);
    rows.push(row);
  }
  return { rows, missingTracking, badPrice, duplicatesInFile, ignoredHeaders };
}

export async function parseIssueInvoiceFile(file: File): Promise<ParsedIssueInvoiceFile> {
  return buildIssueInvoiceRows(await readSpreadsheetTable(file));
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const HEADER_COLOR = 'FF4F46E5';
const COLUMNS = [
  { header: 'Tracking', key: 'tracking', width: 20 },
  { header: 'Unit Price', key: 'unitPrice', width: 14 },
  { header: 'Customers Name', key: 'customerName', width: 32 },
  { header: 'Noted', key: 'note', width: 40 },
];

function styleHeader(ws: any) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_COLOR } };
  header.alignment = { vertical: 'middle' };
  header.height = 20;
}

async function saveWorkbook(wb: any, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: XLSX_TYPE }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Upload template: data sheet first (the uploader reads the first sheet), then instructions. */
export function fillIssueInvoiceTemplate(wb: any): void {
  const ws = wb.addWorksheet('Issue Invoice', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUMNS;
  styleHeader(ws);
  ws.getRow(1).getCell(1).note = 'ត្រូវតែមាន • មិនអាចស្ទួនគ្នា';
  ws.getRow(1).getCell(2).note = 'លេខសុទ្ធ ឧ. 12.50 (មិនចាំបាច់)';
  ws.getColumn(1).numFmt = '@'; // keep leading zeros
  ws.getColumn(2).numFmt = '#,##0.00';
  for (let r = 2; r <= 5001; r++) {
    ws.getCell(r, 2).dataValidation = {
      type: 'decimal',
      operator: 'greaterThanOrEqual',
      allowBlank: true,
      formulae: [0],
      showErrorMessage: true,
      errorTitle: 'Unit Price',
      error: 'សូមបញ្ចូលលេខ (ឧ. 12.50)',
    };
  }

  const help = wb.addWorksheet('របៀបបំពេញ');
  help.getColumn(1).width = 18;
  help.getColumn(2).width = 80;
  const lines: [string, string][] = [
    ['ជួរឈរ', 'ការពន្យល់'],
    ['Tracking', 'លេខ Tracking (ត្រូវតែមាន មិនអាចស្ទួន)'],
    ['Unit Price', 'តម្លៃឯកតា — លេខសុទ្ធ ឧ. 12.50 (មិនចាំបាច់)'],
    ['Customers Name', 'ឈ្មោះអតិថិជន'],
    ['Noted', 'កំណត់សម្គាល់'],
    ['', ''],
    ['ចំណាំ', 'បំពេញក្នុង Sheet «Issue Invoice» • រក្សាទុកជា .xlsx • Tracking ដែលមានរួចហើយនឹងត្រូវរំលង (លើកលែងតែធីក «សរសេរជាន់»)'],
    ['', ''],
    ['ឧទាហរណ៍', 'Tracking | Unit Price | Customers Name | Noted'],
    ['', 'E12345678901 | 12.50 | ABC Co., Ltd | បង់រួច'],
    ['', 'E12345678902 | 8 | សុខ សុខា | '],
  ];
  lines.forEach((l) => help.addRow(l));
  styleHeader(help);
  help.getColumn(1).font = { bold: true };
  help.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
}

export async function downloadIssueInvoiceTemplate(): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  fillIssueInvoiceTemplate(wb);
  await saveWorkbook(wb, 'Issue_Invoice_Upload_Template.xlsx');
}

/** Export rows in the same layout as the template, so the file can be uploaded back. */
export async function exportIssueInvoices(rows: IssueInvoice[], filename: string): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Issue Invoice', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [...COLUMNS, { header: 'Created By', key: 'createdBy', width: 22 }, { header: 'Created At', key: 'createdAt', width: 20 }];
  styleHeader(ws);
  ws.getColumn(1).numFmt = '@';
  ws.getColumn(2).numFmt = '#,##0.00';
  rows.forEach((r) =>
    ws.addRow({
      tracking: r.tracking,
      unitPrice: r.unitPrice,
      customerName: r.customerName,
      note: r.note,
      createdBy: r.createdBy || '',
      createdAt: r.createdAt ? new Date(r.createdAt).toLocaleString('en-GB') : '',
    })
  );
  await saveWorkbook(wb, filename);
}
