/**
 * Customer import from Excel (.xlsx) or CSV, plus a blank template download.
 * exceljs is loaded lazily so it never weighs down the main bundle.
 *
 * Headers are matched loosely (case, spaces, "_" ignored) in English or Khmer, so the
 * page's own CSV export can be imported back as-is.
 */
import type { Customer, CustomerStatus, CustomerType } from '../services/customerService';

type Field = Exclude<keyof Customer, 'id' | 'sale_user_id' | 'sale_linked' | 'created_by' | 'updated_by' | 'created_at' | 'updated_at'>;

const HEADER_ALIASES: Record<Field, string[]> = {
  customer_code: ['code', 'customercode', 'customerid', 'លេខកូដ'],
  name: ['name', 'customername', 'customer', 'fullname', 'ឈ្មោះ', 'ឈ្មោះអតិថិជន'],
  nickname: ['nickname', 'nick', 'alias', 'othername', 'ឈ្មោះហៅក្រៅ', 'ឈ្មោះក្រៅ'],
  company: ['company', 'business', 'shop', 'ក្រុមហ៊ុន', 'ហាង', 'ក្រុមហ៊ុន/ហាង'],
  customer_type: ['type', 'customertype', 'ប្រភេទ'],
  phone: ['phone', 'phone1', 'tel', 'mobile', 'phonenumber', 'លេខទូរស័ព្ទ'],
  phone2: ['phone2', 'tel2', 'mobile2', 'otherphone', 'លេខទូរស័ព្ទទី២', 'លេខទូរស័ព្ទ២'],
  email: ['email', 'mail', 'អ៊ីមែល'],
  telegram: ['telegram', 'tg'],
  address: ['address', 'អាសយដ្ឋាន'],
  province: ['province', 'city', 'ខេត្ត', 'ក្រុង', 'ខេត្ត/ក្រុង'],
  status: ['status', 'ស្ថានភាព'],
  sale_handle: ['salehandle', 'sale', 'sales', 'salesperson', 'salesrep', 'handleby'],
  notes: ['notes', 'note', 'remark', 'remarks', 'កំណត់ចំណាំ'],
};

const TEMPLATE_HEADERS = ['Code', 'Name', 'Nickname', 'Company', 'Type', 'Phone', 'Phone 2', 'Email', 'Telegram', 'Address', 'Province', 'Sale_Handle', 'Status', 'Notes'];

/** Filler text people type into cells they mean to leave blank. */
const PLACEHOLDERS = new Set(['empty', 'null', 'none', 'n/a', 'na', '-', '--', 'គ្មាន']);

const normHeader =(h: string) => h.toLowerCase().replace(/[\s_\-.()]/g, '');

const HEADER_LOOKUP = new Map<string, Field>();
(Object.keys(HEADER_ALIASES) as Field[]).forEach((field) =>
  HEADER_ALIASES[field].forEach((alias) => HEADER_LOOKUP.set(normHeader(alias), field))
);

export interface ParsedCustomerFile {
  rows: Customer[];
  /** Data rows with no name (not imported) */
  missingName: number;
  /** Headers that matched no customer field (ignored) */
  ignoredHeaders: string[];
}

/** Plain text from an exceljs cell value (rich text, hyperlinks, formulas, dates). */
function cellText(value: any): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((r: any) => r.text).join('');
    if (value.text !== undefined) return cellText(value.text);
    if (value.result !== undefined) return cellText(value.result);
    return '';
  }
  return String(value);
}

/** Small RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function toType(v: string): CustomerType {
  const s = v.toLowerCase();
  if (s.includes('collect') || s.includes('អ្នកទទួលបង់')) return 'COLLECT';
  if (s.includes('cash') || s.includes('អ្នកផ្ញើបង់')) return 'CASH';
  return s.startsWith('bus') || s.includes('company') || s.includes('ក្រុមហ៊ុន') ? 'BUSINESS' : 'INDIVIDUAL';
}

function toStatus(v: string): CustomerStatus {
  const s = v.toLowerCase();
  return s.startsWith('inac') || s.includes('ផ្អាក') || s === 'no' || s === '0' ? 'INACTIVE' : 'ACTIVE';
}

/** Excel stores phone numbers as numbers and drops the leading 0 (012… → 12…). */
function toPhone(raw: any, text: string): string {
  return typeof raw === 'number' && !text.startsWith('0') ? `0${text}` : text;
}

function buildRows(table: { raw: any[]; text: string[] }[]): ParsedCustomerFile {
  // Header = the row (among the first 20) with the most recognised columns. A stray cell like
  // "BUSINESS" above the real header must not win just because it comes first.
  const score = (r: { text: string[] }) => r.text.filter((h) => HEADER_LOOKUP.has(normHeader(h))).length;
  let headerIdx = -1;
  table.slice(0, 20).forEach((r, i) => {
    if (score(r) > (headerIdx < 0 ? 0 : score(table[headerIdx]))) headerIdx = i;
  });
  if (headerIdx < 0) throw new Error('រកមិនឃើញជួរ Header (ត្រូវមាន Name, Phone, ...)');

  const headers = table[headerIdx].text;
  const fieldAt = headers.map((h) => HEADER_LOOKUP.get(normHeader(h)));
  if (!fieldAt.includes('name')) throw new Error('File ត្រូវមានជួរឈរ «Name»');
  const ignoredHeaders = headers.filter((h, i) => h.trim() && !fieldAt[i]);

  const rows: Customer[] = [];
  let missingName = 0;
  for (const line of table.slice(headerIdx + 1)) {
    if (line.text.every((t) => !t.trim())) continue;
    const c: Customer = {
      customer_code: null, name: '', nickname: null, company: null, customer_type: 'INDIVIDUAL', phone: null, phone2: null,
      email: null, telegram: null, address: null, province: null, status: 'ACTIVE', sale_user_id: null, sale_handle: null, notes: null,
    };
    fieldAt.forEach((field, i) => {
      if (!field) return;
      const text = (line.text[i] || '').trim();
      if (!text || PLACEHOLDERS.has(text.toLowerCase())) return;
      if (field === 'customer_type') c.customer_type = toType(text);
      else if (field === 'status') c.status = toStatus(text);
      else if (field === 'phone' || field === 'phone2') c[field] = toPhone(line.raw[i], text);
      else (c as any)[field] = text;
    });
    // Business rows often fill only Company
    if (!c.name && c.company) c.name = c.company;
    if (!c.name) { missingName++; continue; }
    rows.push(c);
  }
  return { rows, missingName, ignoredHeaders };
}

export async function parseCustomerFile(file: File): Promise<ParsedCustomerFile> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv')) {
    const text = (await file.text()).replace(/^﻿/, '');
    return buildRows(parseCsv(text).map((r) => ({ raw: r, text: r })));
  }
  if (!lower.endsWith('.xlsx')) {
    throw new Error('គាំទ្រតែ File .xlsx ឬ .csv (សូម Save As .xlsx ប្រសិនបើជា .xls ចាស់)');
  }
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets.find((s) => s.actualRowCount > 0);
  if (!ws) throw new Error('File Excel គ្មានទិន្នន័យ');

  const table: { raw: any[]; text: string[] }[] = [];
  const width = ws.actualColumnCount || ws.columnCount;
  ws.eachRow({ includeEmpty: false }, (row) => {
    const raw: any[] = [];
    const text: string[] = [];
    for (let col = 1; col <= width; col++) {
      const v = row.getCell(col).value;
      raw.push(v);
      text.push(cellText(v));
    }
    table.push({ raw, text });
  });
  return buildRows(table);
}

export async function downloadCustomerTemplate(): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Customers');
  ws.addRow(TEMPLATE_HEADERS);
  ws.addRow(['', 'សុខ សុខា', 'អាសុខ', '', 'INDIVIDUAL', '012345678', '', 'sokha@example.com', '@sokha', 'ផ្ទះលេខ 12, ផ្លូវ 271', 'ភ្នំពេញ', '', 'ACTIVE', '']);
  ws.addRow(['', 'ABC Trading', '', 'ABC Co., Ltd', 'BUSINESS', '098765432', '', '', '', '', 'សៀមរាប', '', 'ACTIVE', '']);
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  ws.columns.forEach((col) => { col.width = 18; });
  // Keep phone columns as text so leading zeros survive
  [6, 7].forEach((i) => { ws.getColumn(i).numFmt = '@'; });

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Customers_Import_Template.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
