/**
 * 📊 Warehouse Operations → Excel (.xlsx) Export
 * Sheet 1 "ប្រតិបត្តិការ": one row per Operation Code (summary)
 * Sheet 2 "Barcode លម្អិត": every barcode, tagged with its Operation Code
 *
 * exceljs is loaded lazily so it never weighs down the main bundle.
 * Cell values are written as plain strings/numbers (never formulas), so no formula injection.
 */
import type { WarehouseScanItem, WarehouseScanType } from '../types';

export interface ExcelOperationGroup {
  operationCode: string;
  scanType: WarehouseScanType;
  date: string;
  timeStr?: string;
  operatorName?: string;
  items: WarehouseScanItem[];
}

const TYPE_LABEL: Record<WarehouseScanType, string> = {
  SCAN_IN: 'ចូលឃ្លាំង (ScanIn)',
  SCAN_OUT: 'ចេញពីឃ្លាំង (ScanOut)',
  OUT_OF_DELIVERY: 'ចេញចែកចាយ (Rider)',
  HOLD_REMAINING: 'នៅសល់ក្នុងឃ្លាំង (Hold)'
};

const SHEET_FILE_TAG: Record<WarehouseScanType, string> = {
  SCAN_IN: 'scan_in',
  SCAN_OUT: 'scan_out',
  OUT_OF_DELIVERY: 'out_of_delivery',
  HOLD_REMAINING: 'hold'
};

interface ColumnDef {
  header: string;
  width: number;
  value: (s: WarehouseScanItem) => string | number;
  numFmt?: string;
}

const uniqueJoin = (values: (string | undefined)[]) =>
  Array.from(new Set(values.map((v) => (v || '').trim()).filter(Boolean))).join(', ');

const formatDateTime = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** Detail columns: shared core + only the columns relevant to the scan types being exported */
function buildDetailColumns(types: Set<WarehouseScanType>): ColumnDef[] {
  const has = (t: WarehouseScanType) => types.has(t);
  const cols: ColumnDef[] = [
    { header: 'Barcode', width: 22, value: (s) => s.barcode },
    { header: 'Tracking', width: 22, value: (s) => s.tracking || s.barcode }
  ];
  if (types.size > 1) cols.push({ header: 'ប្រភេទ (Type)', width: 24, value: (s) => TYPE_LABEL[s.scanType] || s.scanType });
  if (has('SCAN_IN') || has('SCAN_OUT') || has('HOLD_REMAINING')) {
    cols.push({ header: 'គោលដៅ (Destination)', width: 20, value: (s) => s.destination || '' });
  }
  if (has('SCAN_IN') || has('SCAN_OUT')) {
    cols.push(
      { header: 'អ្នកបើកបរ (Driver)', width: 18, value: (s) => s.driverName || '' },
      { header: 'លេខឡាន (Truck No)', width: 14, value: (s) => s.truckNo || '' }
    );
  }
  if (has('SCAN_IN')) cols.push({ header: 'Transfer By', width: 12, value: (s) => s.transferBy || '' });
  if (has('OUT_OF_DELIVERY')) {
    cols.push(
      { header: 'Rider', width: 18, value: (s) => s.riderName || '' },
      { header: 'តំបន់ (Zone)', width: 16, value: (s) => s.deliveryZone || '' },
      { header: 'COD', width: 12, value: (s) => (s.codAmount !== undefined ? Number(s.codAmount) || 0 : ''), numFmt: '#,##0.00' },
      { header: 'រូបិយប័ណ្ណ', width: 10, value: (s) => (s.scanType === 'OUT_OF_DELIVERY' ? s.currency || 'USD' : '') }
    );
  }
  if (has('HOLD_REMAINING')) {
    cols.push(
      { header: 'មូលហេតុនៅសល់ (Hold Reason)', width: 24, value: (s) => s.holdReason || '' },
      { header: 'ធ្នើរ (Shelf)', width: 12, value: (s) => s.shelfLocation || '' }
    );
  }
  cols.push(
    { header: 'កាលបរិច្ឆេទ (Date)', width: 13, value: (s) => s.date || '' },
    { header: 'ម៉ោងស្កេន (Scanned At)', width: 20, value: (s) => formatDateTime(s.createdAt) },
    { header: 'អ្នកស្កេន (Operator)', width: 26, value: (s) => s.operatorEmail || s.createdBy || '' },
    { header: 'កំណត់សម្គាល់ (Remarks)', width: 24, value: (s) => s.remarks || '' }
  );
  return cols;
}

/**
 * Build and download an .xlsx workbook for the given operation groups.
 * Returns the number of barcode rows written.
 */
export async function exportWarehouseOperationsToExcel(
  groups: ExcelOperationGroup[],
  options: { fileLabel?: string; exportedBy?: string } = {}
): Promise<number> {
  const nonEmpty = groups.filter((g) => g.items.length > 0);
  if (nonEmpty.length === 0) return 0;

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = options.exportedBy || 'IAL Systems';
  wb.created = new Date();

  const types = new Set<WarehouseScanType>(nonEmpty.flatMap((g) => g.items.map((s) => s.scanType)));
  const hasCOD = types.has('OUT_OF_DELIVERY');

  const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF0E7490' } };
  const styleHeader = (row: any) => {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = headerFill;
    row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    row.height = 30;
  };

  // ── Sheet 1: Operations summary ──────────────────────────────
  const summary = wb.addWorksheet('ប្រតិបត្តិការ', { views: [{ state: 'frozen', ySplit: 1 }] });
  summary.columns = [
    { header: '#', width: 5 },
    { header: 'លេខកូដប្រតិបត្តិការ (Operation Code)', width: 30 },
    { header: 'ប្រភេទ (Type)', width: 24 },
    { header: 'កាលបរិច្ឆេទ (Date)', width: 13 },
    { header: 'ម៉ោង (Time)', width: 10 },
    { header: 'អ្នកស្កេន (Operator)', width: 26 },
    { header: 'អ្នកបើកបរ / Rider', width: 20 },
    { header: 'លេខឡាន (Truck No)', width: 14 },
    { header: 'គោលដៅ / តំបន់', width: 22 },
    { header: 'Transfer By', width: 12 },
    { header: 'មូលហេតុ / ធ្នើរ (Hold)', width: 24 },
    { header: 'ចំនួនកញ្ចប់ (Items)', width: 12 },
    ...(hasCOD ? [{ header: 'COD សរុប', width: 14 }] : [])
  ];
  styleHeader(summary.getRow(1));

  nonEmpty.forEach((g, idx) => {
    const its = g.items;
    const first = its[0];
    const isRider = g.scanType === 'OUT_OF_DELIVERY';
    const timeStr = first.createdAt ? formatDateTime(first.createdAt).slice(11, 16) : g.timeStr || '';
    const row = summary.addRow([
      idx + 1,
      g.operationCode,
      TYPE_LABEL[g.scanType] || g.scanType,
      g.date || first.date || '',
      timeStr,
      g.operatorName || first.operatorEmail || first.createdBy || '',
      isRider ? uniqueJoin(its.map((s) => s.riderName)) : uniqueJoin(its.map((s) => s.driverName)),
      uniqueJoin(its.map((s) => s.truckNo)),
      isRider ? uniqueJoin(its.map((s) => s.deliveryZone)) : uniqueJoin(its.map((s) => s.destination)),
      uniqueJoin(its.map((s) => s.transferBy)),
      g.scanType === 'HOLD_REMAINING'
        ? [uniqueJoin(its.map((s) => s.holdReason)), uniqueJoin(its.map((s) => s.shelfLocation))].filter(Boolean).join(' / ')
        : '',
      its.length,
      ...(hasCOD ? [isRider ? its.reduce((sum, s) => sum + (Number(s.codAmount) || 0), 0) : ''] : [])
    ]);
    row.alignment = { vertical: 'middle' };
  });

  // Totals row
  const totalItems = nonEmpty.reduce((n, g) => n + g.items.length, 0);
  const totalCOD = nonEmpty.reduce(
    (n, g) => n + g.items.reduce((m, s) => m + (s.scanType === 'OUT_OF_DELIVERY' ? Number(s.codAmount) || 0 : 0), 0),
    0
  );
  const totalRow = summary.addRow([
    '', `សរុប ${nonEmpty.length} ប្រតិបត្តិការ`, '', '', '', '', '', '', '', '', '', totalItems, ...(hasCOD ? [totalCOD] : [])
  ]);
  totalRow.font = { bold: true };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
  summary.getColumn(12).alignment = { horizontal: 'center' };
  if (hasCOD) summary.getColumn(13).numFmt = '#,##0.00';
  summary.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: summary.columnCount } };

  // ── Sheet 2: Barcode details ─────────────────────────────────
  const detailCols = buildDetailColumns(types);
  const detail = wb.addWorksheet('Barcode លម្អិត', { views: [{ state: 'frozen', ySplit: 1 }] });
  detail.columns = [
    { header: '#', width: 6 },
    { header: 'លេខកូដប្រតិបត្តិការ (Operation Code)', width: 30 },
    ...detailCols.map((c) => ({ header: c.header, width: c.width }))
  ];
  styleHeader(detail.getRow(1));
  detailCols.forEach((c, i) => {
    if (c.numFmt) detail.getColumn(i + 3).numFmt = c.numFmt;
  });

  let n = 0;
  for (const g of nonEmpty) {
    for (const s of g.items) {
      n += 1;
      detail.addRow([n, g.operationCode, ...detailCols.map((c) => c.value(s))]);
    }
  }
  detail.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: detail.columnCount } };

  // ── Download ─────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const typeTag = types.size === 1 ? SHEET_FILE_TAG[[...types][0]] : 'all';
  const label = (options.fileLabel || '').replace(/[^\w.-]+/g, '_');
  const filename = `warehouse_${typeTag}${label ? `_${label}` : ''}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return n;
}
