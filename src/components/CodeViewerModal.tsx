import React, { useState } from 'react';
import { Copy, Check, Download, Code2, FileCode, CheckCircle2 } from 'lucide-react';

interface CodeViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CODE_GS_CONTENT = `/**
 * =========================================================================
 * PAYMENT COLLECTION & PAYER MANAGEMENT - GOOGLE APPS SCRIPT BACKEND
 * ប្រព័ន្ធគ្រប់គ្រងការទទួលប្រាក់ និងបញ្ជីអ្នកប្រគល់ប្រាក់ (Google Sheets & Telegram)
 * =========================================================================
 * 
 * លក្ខណៈពិសេស (Features):
 * 1. ទទួលប្រាក់ជាកញ្ចប់ (Collection Batches): រក្សាទុកកញ្ចប់សរុប (USD, KHR, វិក្កយបត្រ) ក្នុង Tab "Batches"
 * 2. មុខទំនិញលម្អិត (Collection Items): រក្សាទុករាល់លេខ Tracking, ឈ្មោះអតិថិជន ក្នុង Tab "Collection_Items"
 * 3. បញ្ជីអ្នកប្រគល់ប្រាក់ (Payers): រក្សាទុក និងគ្រប់គ្រង Rider, អតិថិជន, សាខា, ដៃគូ ក្នុង Tab "Payers"
 * 4. ជូនដំណឹងស្វ័យប្រវត្ត (Telegram Alert): ផ្ញើព័ត៌មានលម្អិតនៃកញ្ចប់ទៅកាន់ Telegram Bot ភ្លាមៗ
 * 5. បង្កើតតារាងស្វ័យប្រវត្ត (Auto Table Setup): បង្កើត Tab និង Header ស្អាតបាតដោយស្វ័យប្រវត្តក្នុង Sheets
 */

// =========================================================================
// ⚙️ CONFIGURATION SETTINGS (ការកំណត់រចនាសម្ព័ន្ធ)
// =========================================================================
const CONFIG = {
  // Google Sheet ID (យកចេញពី Link Google Sheets)
  SPREADSHEET_ID: '18prsAT5KK6EwPPJFEX7gcldPJPrvXGD0FJ7eE1ceI-k',

  // Sheet tab សម្រាប់កត់ត្រាកញ្ចប់ទទួលប្រាក់សរុប
  SHEET_NAME_BATCHES: 'Batches',

  // Sheet tab សម្រាប់កត់ត្រាមុខទំនិញ/Tracking លម្អិតក្នុងកញ្ចប់
  SHEET_NAME_ITEMS: 'Collection_Items',

  // Sheet tab សម្រាប់កត់ត្រាកញ្ចប់ទទួលលុយថ្នាំពេទ្យសរុប (Data_BM)
  SHEET_NAME_MEDICINE_BATCHES: 'Medicine_Batches',

  // Sheet tab សម្រាប់កត់ត្រាទំនិញ/Tracking ថ្នាំពេទ្យលម្អិត (Data_BM)
  SHEET_NAME_MEDICINE_ITEMS: 'Medicine_Items',

  // Sheet tab សម្រាប់កត់ត្រាបញ្ជីអ្នកប្រគល់ប្រាក់ (Payers / Remitters)
  SHEET_NAME_PAYERS: 'Payers',

  // Sheet tab សម្រាប់កត់ត្រាការកំណត់ប្រព័ន្ធ App Settings
  SHEET_NAME_SETTINGS: 'Settings',

  // Sheet tab សម្រាប់កត់ត្រាសិទ្ធិអ្នកប្រើប្រាស់ (User Permissions & Roles)
  SHEET_NAME_PERMISSIONS: 'Permissions',

  // Sheet tab សម្រាប់កត់ត្រាកំណត់ត្រាសកម្មភាពអ្នកប្រើ (User Activity Logs / Audit Trail)
  SHEET_NAME_LOGS: 'User_Logs',

  // Sheet tab ទិន្នន័យទូទៅ Google Sheets
  SHEET_NAME_DATA: 'Data',

  // Sheet tab សម្រាប់កត់ត្រាបង្កាន់ដៃធនាគារ (Bank Slips)
  SHEET_NAME_BANK_SLIPS: 'Bank_Slips',

  // Sheet tab សម្រាប់កត់ត្រារបាយការណ៍ចែកចាយ (Distribution Reports)
  SHEET_NAME_DISTRIBUTION: 'Distribution_Reports',

  // Sheet tabs សម្រាប់គ្រប់គ្រងឃ្លាំង (Warehouse Hub)
  SHEET_NAME_SCAN_IN: 'Scan_In',
  SHEET_NAME_SCAN_OUT: 'Scan_Out',
  SHEET_NAME_OUT_OF_DELIVERY: 'Out_Of_Delivery',

  // Google Drive Folder ID សម្រាប់ផ្ទុករូបភាពបង្កាន់ដៃ Bank Slips
  DRIVE_FOLDER_ID: '1nsWC8MZaGFz0HGOxwCqzKyRU0IB5kM5w',

  // Telegram Bot Token ពី @BotFather
  TELEGRAM_BOT_TOKEN: '8859388289:AAHzv7moxa3Z6-u57sc4YReerEIx5CEAtqg',

  // Telegram Chat ID ឬ Channel ID
  TELEGRAM_CHAT_ID: '924306058',

  // Timezone
  TIMEZONE: 'Asia/Phnom_Penh'
};

// =========================================================================
// 📋 EXPECTED SHEET HEADERS (ក្បាលតារាង Google Sheets)
// =========================================================================

// ១. តារាងកញ្ចប់ទទួលប្រាក់សរុប (Batches Table)
const HEADERS_BATCHES = [
  'Batch_ID',
  'Date',
  'Operator',
  'Total_Items',
  'Total_USD',
  'Total_KHR',
  'Bank_USD',
  'Bank_KHR',
  'Cash_USD',
  'Cash_KHR',
  'Reconciliation',
  'Notes',
  'Created_At'
];

// ៤. តារាងការកំណត់ប្រព័ន្ធ (App Settings Table)
const HEADERS_SETTINGS = [
  'Setting_Key',
  'Setting_Value',
  'Description',
  'Updated_At'
];

// ៥. តារាងសិទ្ធិអ្នកប្រើប្រាស់ (User Permissions Table)
const HEADERS_PERMISSIONS = [
  'User_ID',
  'Email',
  'Name',
  'Role',
  'Status',
  'Created_At',
  'Last_Login',
  'Updated_At'
];

// ៦. តារាងកំណត់ត្រាសកម្មភាពអ្នកប្រើ (User Activity Logs Table)
const HEADERS_LOGS = [
  'Log_ID',
  'Timestamp',
  'Operator',
  'Email',
  'Role',
  'Action',
  'Details',
  'Batch_Number',
  'Amount_USD',
  'Amount_KHR',
  'Items_Count',
  'Created_At'
];

// ៧. តារាងបង្កាន់ដៃធនាគារ (Bank Slips Table - Clean Version)
const HEADERS_BANK_SLIPS = [
  'ID',
  'AWBN',
  'Category',
  'Receiver_Name',
  'Operator',
  'Operator_Email',
  'Drive_Image_Link',
  'Drive_File_ID',
  'Created_At'
];

// ៨. តារាងរបាយការណ៍ចែកចាយ (Distribution Alert Reports Table)
const HEADERS_DISTRIBUTION = [
  'ID',
  'Barcode',
  'Name',
  'Date',
  'Remarks',
  'Operator_Email',
  'Created_By',
  'Created_At',
  'Updated_At'
];

// ៩. តារាងអីវ៉ាន់ចូលឃ្លាំង (ScanIn Table)
const HEADERS_SCAN_IN = [
  'ID',
  'Barcode',
  'Tracking',
  'Destination',
  'Driver_Name',
  'Truck_No',
  'Operator_Email',
  'Created_By',
  'Date',
  'Created_At'
];

// ១០. តារាងអីវ៉ាន់ចេញពីឃ្លាំង (ScanOut Table)
const HEADERS_SCAN_OUT = [
  'ID',
  'Barcode',
  'Tracking',
  'Destination',
  'Driver_Name',
  'Truck_No',
  'Operator_Email',
  'Created_By',
  'Date',
  'Created_At'
];

// ១១. តារាងអីវ៉ាន់ចេញចែកចាយតាម Rider (Out of Delivery Table)
const HEADERS_OUT_OF_DELIVERY = [
  'ID',
  'Barcode',
  'Tracking',
  'Rider_Name',
  'Delivery_Zone',
  'COD_Amount',
  'Currency',
  'Operator_Email',
  'Created_By',
  'Date',
  'Created_At',
  'Remarks'
];

/**
 * 🕒 មុខងារជួសជុល និង Format កាលបរិច្ឆេទឱ្យស្អាត តាមទម្រង់: yyyy-MM-dd HH:mm:ss (ឧ. 2026-09-21 08:50:47)
 * ដោះស្រាយបញ្ហា GMT+0700 (Indochina Time) និង Timezone Error ទាំងស្រុង
 */
function formatDateTimeSafely(val, fallbackStr) {
  const tz = (typeof CONFIG !== 'undefined' && CONFIG.TIMEZONE) ? CONFIG.TIMEZONE : 'Asia/Phnom_Penh';
  
  function fmtDate(d) {
    if (typeof Utilities !== 'undefined' && Utilities.formatDate) {
      return Utilities.formatDate(d, tz, 'yyyy-MM-dd HH:mm:ss');
    }
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return y + '-' + mo + '-' + day + ' ' + h + ':' + mi + ':' + s;
  }

  if (!val && val !== 0) {
    return fallbackStr ? formatDateTimeSafely(fallbackStr) : fmtDate(new Date());
  }

  if (val instanceof Date) {
    if (isNaN(val.getTime())) {
      return fallbackStr ? formatDateTimeSafely(fallbackStr) : fmtDate(new Date());
    }
    return fmtDate(val);
  }

  const str = String(val).trim();
  if (!str) {
    return fallbackStr ? formatDateTimeSafely(fallbackStr) : fmtDate(new Date());
  }

  // Already strictly in "YYYY-MM-DD HH:mm:ss" format
  if (/^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$/.test(str)) {
    return str;
  }

  // Strictly "YYYY-MM-DD"
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(str)) {
    return str + ' 00:00:00';
  }

  // Google Viz Date format: Date(2026,8,21) or Date(2026,8,21,8,50,47)
  const gvizMatch = str.match(/Date\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*(\\d+),\\s*(\\d+),\\s*(\\d+))?\\)/i);
  if (gvizMatch) {
    const y = parseInt(gvizMatch[1], 10);
    const m = parseInt(gvizMatch[2], 10);
    const d = parseInt(gvizMatch[3], 10);
    const hh = gvizMatch[4] !== undefined ? parseInt(gvizMatch[4], 10) : 0;
    const mm = gvizMatch[5] !== undefined ? parseInt(gvizMatch[5], 10) : 0;
    const ss = gvizMatch[6] !== undefined ? parseInt(gvizMatch[6], 10) : 0;
    const dateObj = new Date(y, m, d, hh, mm, ss);
    if (!isNaN(dateObj.getTime())) {
      return fmtDate(dateObj);
    }
  }

  // DD-MMM-YYYY or DD-MM-YYYY (e.g. 24-Sep-2026 or 21/09/2026)
  const dDashMatch = str.match(/^(\\d{1,2})[-/]([A-Za-z]{3}|\\d{1,2})[-/](\\d{4})(?:\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?)?$/);
  if (dDashMatch) {
    const day = parseInt(dDashMatch[1], 10);
    const monthPart = dDashMatch[2];
    const year = parseInt(dDashMatch[3], 10);
    const hh = dDashMatch[4] ? parseInt(dDashMatch[4], 10) : 0;
    const mm = dDashMatch[5] ? parseInt(dDashMatch[5], 10) : 0;
    const ss = dDashMatch[6] ? parseInt(dDashMatch[6], 10) : 0;

    let month = 0;
    if (/^\\d+$/.test(monthPart)) {
      month = parseInt(monthPart, 10) - 1;
    } else {
      const monthNames = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      const mKey = monthPart.toLowerCase().slice(0, 3);
      if (monthNames[mKey] !== undefined) {
        month = monthNames[mKey];
      }
    }
    const dateObj = new Date(year, month, day, hh, mm, ss);
    if (!isNaN(dateObj.getTime())) {
      return fmtDate(dateObj);
    }
  }

  // Standard JS Date parse (e.g. "Mon Sep 21 2026 08:50:47 GMT+0700 (Indochina Time)" or ISO)
  try {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return fmtDate(parsed);
    }
  } catch (err) {}

  // Timestamp integer
  if (/^\\d{10,13}$/.test(str)) {
    const num = parseInt(str, 10);
    const parsed = new Date(num > 1e11 ? num : num * 1000);
    if (!isNaN(parsed.getTime())) {
      return fmtDate(parsed);
    }
  }

  return fallbackStr || str;
}

/**
 * 🕒 ជួសជុល និងលាងសម្អាតកាលបរិច្ឆេទក្នុងគ្រប់ Sheets ទាំងអស់ (Fix All Dates)
 * បម្លែងរាល់ទម្រង់ GMT+0700 (Indochina Time) មកជា: 2026-09-21 08:50:47
 * ដំណើរការលើ៖ Collection_Items, Medicine_Items, Batches, Medicine_Batches
 */
function fixAllDatesInAllSheets() {
  const ss = getSpreadsheet();
  let totalFixed = 0;
  const results = [];

  const targets = [
    { sheetName: CONFIG.SHEET_NAME_ITEMS || 'Collection_Items', dateCol: 7, createdCol: 8, isDateOnly: false },
    { sheetName: CONFIG.SHEET_NAME_MEDICINE_ITEMS || 'Medicine_Items', dateCol: 7, createdCol: 8, isDateOnly: false },
    { sheetName: CONFIG.SHEET_NAME_BATCHES || 'Batches', dateCol: 2, createdCol: 13, isDateOnly: true },
    { sheetName: CONFIG.SHEET_NAME_MEDICINE_BATCHES || 'Medicine_Batches', dateCol: 2, createdCol: 13, isDateOnly: true }
  ];

  targets.forEach(function(t) {
    const sheet = ss.getSheetByName(t.sheetName);
    if (!sheet) return;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;

    let sheetFixed = 0;
    // Format entire columns as text (@) so Google Sheets won't re-render them with timezone
    sheet.getRange(2, t.dateCol, lastRow - 1, 1).setNumberFormat('@');
    sheet.getRange(2, t.createdCol, lastRow - 1, 1).setNumberFormat('@');

    const dateRange = sheet.getRange(2, t.dateCol, lastRow - 1, 1);
    const dateVals = dateRange.getValues();
    for (let i = 0; i < dateVals.length; i++) {
      const orig = dateVals[i][0];
      if (orig) {
        let cleaned = formatDateTimeSafely(orig);
        if (t.isDateOnly && cleaned.length > 10) {
          cleaned = cleaned.slice(0, 10);
        }
        if (cleaned !== orig) {
          dateVals[i][0] = cleaned;
          sheetFixed++;
        }
      }
    }
    dateRange.setValues(dateVals);

    const createdRange = sheet.getRange(2, t.createdCol, lastRow - 1, 1);
    const createdVals = createdRange.getValues();
    for (let i = 0; i < createdVals.length; i++) {
      const orig = createdVals[i][0];
      if (orig) {
        const cleaned = formatDateTimeSafely(orig);
        if (cleaned !== orig) {
          createdVals[i][0] = cleaned;
          sheetFixed++;
        }
      }
    }
    createdRange.setValues(createdVals);

    totalFixed += sheetFixed;
    results.push(t.sheetName + ': ' + sheetFixed + ' ក្រឡា');
  });

  const msg = 'ជោគជ័យ! បានជួសជុល និងកំណត់ Format (2026-09-21 08:50:47) សរុប ' + totalFixed + ' ក្រឡា (' + results.join(', ') + ')';
  Logger.log(msg);
  return msg;
}

/**
 * ⚡ ចុច RUN មុខងារនេះដើម្បីកែប្រែ ឬ Update ក្បាលតារាង (Headers) និងតម្រឹមទិន្នន័យចាស់ៗក្នុង Batches ភ្លាមៗ
 */
function updateBatchesHeadersAndData() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_BATCHES);
  if (!sheet) {
    sheet = getOrCreateBatchesSheet(ss);
    Logger.log('Created new Batches sheet with updated headers.');
    return 'បានបង្កើតតារាង Batches ថ្មីជាមួយ Headers ត្រឹមត្រូវ!';
  }

  // 1. Fix data alignment if old 8-column or 12-column format exists
  const fixMsg = fixBatchesAlignment(sheet);
  fixAllDatesInAllSheets();

  // 2. Set updated 13 headers in Row 1
  sheet.getRange(1, 1, 1, HEADERS_BATCHES.length).setValues([HEADERS_BATCHES]);
  const range = sheet.getRange(1, 1, 1, HEADERS_BATCHES.length);
  range.setFontWeight('bold');
  range.setBackground('#4F46E5');
  range.setFontColor('#FFFFFF');
  range.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);

  for (let c = 1; c <= HEADERS_BATCHES.length; c++) {
    sheet.autoResizeColumn(c);
  }
  Logger.log('Updated Batches headers & data successfully! ' + fixMsg);
  return 'ជោគជ័យ! ក្បាលតារាង និងទិន្នន័យ Batches ត្រូវបាន Update និងតម្រឹមឱ្យត្រូវជាមួយ UI រួចរាល់! (' + fixMsg + ')';
}

/**
 * 🛠️ មុខងារជួសជុលទិន្នន័យចាស់ដែលខុសជួរ Column ក្នុង Batches
 * ធានាថាក្រឡា Bank, Cash, Reconciliation, Notes, Created_At ត្រូវតាមជួរ ១០០%
 */
function fixBatchesAlignment(sheet) {
  if (!sheet) {
    const ss = getSpreadsheet();
    sheet = ss.getSheetByName(CONFIG.SHEET_NAME_BATCHES);
  }
  if (!sheet) return 'រកមិនឃើញតារាង Batches ទេ!';

  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(sheet.getLastColumn(), HEADERS_BATCHES.length);

  // Clear extra header columns beyond column 13 if duplicate columns were created
  if (lastCol > HEADERS_BATCHES.length) {
    sheet.getRange(1, HEADERS_BATCHES.length + 1, Math.max(lastRow, 1), lastCol - HEADERS_BATCHES.length).clearContent();
  }

  // 1. Always enforce the correct 13 headers in Row 1
  sheet.getRange(1, 1, 1, HEADERS_BATCHES.length).setValues([HEADERS_BATCHES]);
  const hRange = sheet.getRange(1, 1, 1, HEADERS_BATCHES.length);
  hRange.setFontWeight('bold');
  hRange.setBackground('#4F46E5');
  hRange.setFontColor('#FFFFFF');
  hRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);

  if (lastRow <= 1) {
    for (let c = 1; c <= HEADERS_BATCHES.length; c++) sheet.autoResizeColumn(c);
    return 'គ្មានទិន្នន័យចាស់ត្រូវតម្រឹមទេ បាន Update ក្បាលតារាងរួចរាល់';
  }

  const range = sheet.getRange(2, 1, lastRow - 1, lastCol);
  const rows = range.getValues();
  const fixedRows = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const bId = String(r[0] || '').trim();
    if (!bId) continue;

    const dateVal = formatDateTimeSafely(r[1]).slice(0, 10);
    const operator = String(r[2] || '').trim();
    const totalItems = parseInt(r[3], 10) || 0;
    const totalUSD = parseFloat(r[4]) || 0;
    const totalKHR = parseFloat(r[5]) || 0;

    let bankUSD = 0;
    let bankKHR = 0;
    let cashUSD = 0;
    let cashKHR = 0;
    let reconciliation = '';
    let notes = '';
    let createdAt = '';

    // Check if row is already in the new 13-column format (where Col 13 has a timestamp/date or Col 11 is reconciliation status)
    const is13ColFormat = (
      r.length >= 13 &&
      (String(r[10] || '').includes('គ្រប់ចំនួន') || String(r[10] || '').includes('ខ្វះ') || String(r[10] || '').includes('លើស') || String(r[10] || '').includes('Balanced'))
    );

    // Check if row is in 12-column format (where Col 11 was Notes and Col 12 was Created_At)
    const is12ColFormat = (
      !is13ColFormat &&
      r.length >= 12 &&
      (r[11] instanceof Date || (typeof r[11] === 'string' && (r[11].includes(':') || r[11].includes('-')))) &&
      (typeof r[6] === 'number' || !isNaN(Number(r[6])))
    );

    if (is13ColFormat) {
      bankUSD = parseFloat(r[6]) || 0;
      bankKHR = parseFloat(r[7]) || 0;
      cashUSD = parseFloat(r[8]) || 0;
      cashKHR = parseFloat(r[9]) || 0;
      reconciliation = String(r[10] || '').trim();
      notes = String(r[11] || '').trim();
      createdAt = formatDateTimeSafely(r[12]);
    } else if (is12ColFormat) {
      bankUSD = parseFloat(r[6]) || 0;
      bankKHR = parseFloat(r[7]) || 0;
      cashUSD = parseFloat(r[8]) || 0;
      cashKHR = parseFloat(r[9]) || 0;
      notes = String(r[10] || '').trim();
      createdAt = formatDateTimeSafely(r[11]);
      // Infer reconciliation
      const actualUSD = bankUSD + cashUSD;
      const actualKHR = bankKHR + cashKHR;
      const dUSD = actualUSD - totalUSD;
      const dKHR = actualKHR - totalKHR;
      if (Math.abs(dUSD) < 0.005 && Math.abs(dKHR) < 0.5) {
        reconciliation = '✓ គ្រប់ចំនួន (Balanced 100%)';
      } else if (dUSD < -0.005 || dKHR < -0.5) {
        reconciliation = '⚠️ ខ្វះប្រាក់';
      } else {
        reconciliation = 'ℹ️ លើសប្រាក់';
      }
    } else {
      // Legacy 8-column format (where Col 7 was Notes and Col 8 was Created_At)
      notes = String(r[6] || '').trim();
      createdAt = formatDateTimeSafely(r[7]);
      bankUSD = 0;
      bankKHR = 0;
      cashUSD = totalUSD;
      cashKHR = totalKHR;
      reconciliation = '✓ គ្រប់ចំនួន (Balanced 100%)';
    }

    fixedRows.push([
      bId,
      dateVal,
      operator,
      totalItems,
      totalUSD,
      totalKHR,
      bankUSD,
      bankKHR,
      cashUSD,
      cashKHR,
      reconciliation,
      notes,
      createdAt
    ]);
  }

  if (fixedRows.length > 0) {
    sheet.getRange(2, 1, fixedRows.length, HEADERS_BATCHES.length).setValues(fixedRows);
    sheet.getRange(2, 2, fixedRows.length, 1).setNumberFormat('@');
    sheet.getRange(2, 13, fixedRows.length, 1).setNumberFormat('@');
  }

  for (let c = 1; c <= HEADERS_BATCHES.length; c++) {
    sheet.autoResizeColumn(c);
  }

  return 'បានតម្រឹមជួរទិន្នន័យ Batches ចំនួន ' + fixedRows.length + ' ជួរឱ្យត្រឹមត្រូវ ១០០%';
}

// ២. តារាងមុខទំនិញ/Tracking លម្អិត (Collection Items Table)
const HEADERS_ITEMS = [
  'Batch_ID',
  'Tracking',
  'Customer_Name',
  'PAYMENT',
  'USD',
  'KHM',
  'DATE',
  'Created_At'
];

/**
 * ⚡ ចុច RUN មុខងារនេះដើម្បីកែប្រែ ឬ Update ក្បាលតារាង (Headers) និងតម្រឹមទិន្នន័យចាស់ៗក្នុង Collection_Items ភ្លាមៗ
 */
function updateCollectionItemsHeaders() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_ITEMS);
  if (!sheet) {
    sheet = getOrCreateItemsSheet(ss);
    Logger.log('Created new Collection_Items sheet with updated headers.');
    return 'បានបង្កើតតារាង Collection_Items ថ្មីជាមួយ Headers ត្រឹមត្រូវ!';
  }
  
  // 1. Update Row 1 headers to match UI
  sheet.getRange(1, 1, 1, HEADERS_ITEMS.length).setValues([HEADERS_ITEMS]);
  const range = sheet.getRange(1, 1, 1, HEADERS_ITEMS.length);
  range.setFontWeight('bold');
  range.setBackground('#2563EB');
  range.setFontColor('#FFFFFF');
  range.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);

  // 2. Also fix any old misaligned rows
  const fixMsg = fixCollectionItemsAlignment();
  fixAllDatesInAllSheets();

  for (let c = 1; c <= HEADERS_ITEMS.length; c++) {
    sheet.autoResizeColumn(c);
  }
  Logger.log('Updated Collection_Items headers & data successfully! ' + fixMsg);
  return 'ជោគជ័យ! ក្បាលតារាង និងទិន្នន័យ Collection_Items ត្រូវបាន Update និងតម្រឹមឱ្យត្រូវជាមួយ UI រួចរាល់! (' + fixMsg + ')';
}

/**
 * 🛠️ មុខងារជួសជុលទិន្នន័យចាស់ដែលខុសជួរ Column ក្នុង Collection_Items
 * រៀបចំ Column ទាំងអស់ឱ្យត្រូវ 100% និង Lookup USD, KHM ពីតារាង Data មកបំពេញស្វ័យប្រវត្តិ!
 */
function fixCollectionItemsAlignment() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_ITEMS);
  if (!sheet) return 'រកមិនឃើញតារាង Collection_Items ទេ!';
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 'គ្មានទិន្នន័យត្រូវជួសជុលទេ!';

  // Build lookup map from 'Data' sheet for barcodes
  const lookupMap = {};
  const dataSheet = ss.getSheetByName(CONFIG.SHEET_NAME_DATA);
  if (dataSheet && dataSheet.getLastRow() > 1) {
    const dRows = dataSheet.getRange(2, 1, dataSheet.getLastRow() - 1, 5).getValues();
    dRows.forEach(r => {
      const code = String(r[0] || '').trim().toLowerCase();
      if (code) {
        lookupMap[code] = {
          payment: String(r[1] || 'CASH').trim(),
          usd: Number(r[2]) || 0,
          khm: Number(r[3]) || 0,
          date: r[4] ? (r[4] instanceof Date ? Utilities.formatDate(r[4], CONFIG.TIMEZONE, 'yyyy-MM-dd') : String(r[4])) : ''
        };
      }
    });
  }

  // Read and fix rows
  const range = sheet.getRange(2, 1, lastRow - 1, 8);
  const rows = range.getValues();
  const fixedRows = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const batchId = String(r[0] || '').trim();
    const tracking = String(r[1] || '').trim();
    const name = String(r[2] || '').trim();
    const colD = String(r[3] || '').trim();
    const colE = String(r[4] || '').trim();
    const colF = String(r[5] || '').trim();
    const colG = String(r[6] || '').trim();
    const colH = String(r[7] || '').trim();

    const lookup = lookupMap[tracking.toLowerCase()] || {};

    // Check if row is in old 6-column format (where Col D is date, Col E is payment, Col F is createdAt)
    const isOldFormat = (colD.includes('-') || colD.includes('/')) && 
                        (colE === 'CASH' || colE === 'Collect' || colE === 'COD' || colE.includes('Cash') || colE === '') && 
                        (colF.includes(':') || colF.includes('202'));

    const nowStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE || 'Asia/Phnom_Penh', 'yyyy-MM-dd HH:mm:ss');
    if (isOldFormat) {
      const payment = colE || lookup.payment || 'CASH';
      const usd = lookup.usd || 0;
      const khm = lookup.khm || 0;
      const dateVal = formatDateTimeSafely(colD || lookup.date || '');
      const createdAt = formatDateTimeSafely(colF, nowStr);
      fixedRows.push([batchId, tracking, name, payment, usd, khm, dateVal, createdAt]);
    } else {
      const payment = colD || lookup.payment || 'CASH';
      const usd = Number(colE) || lookup.usd || 0;
      const khm = Number(colF) || lookup.khm || 0;
      const dateVal = formatDateTimeSafely(r[6] || lookup.date || '');
      const createdAt = formatDateTimeSafely(r[7], nowStr);
      fixedRows.push([batchId, tracking, name, payment, usd, khm, dateVal, createdAt]);
    }
  }

  range.setValues(fixedRows);
  sheet.getRange(2, 7, fixedRows.length, 1).setNumberFormat('@');
  sheet.getRange(2, 8, fixedRows.length, 1).setNumberFormat('@');
  return 'បានតម្រឹមជួរទិន្នន័យចំនួន ' + fixedRows.length + ' ជួរឱ្យត្រឹមត្រូវ ១០០%';
}

// ៣. តារាងអ្នកប្រគល់ប្រាក់ (Payers Table)
const HEADERS_PAYERS = [
  'ID',
  'Name',
  'Phone',
  'Category',
  'Area',
  'Status',
  'Notes',
  'Created_At',
  'Updated_At'
];

/**
 * Handle HTTP GET Requests
 */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';

  // 0. Fetch All Data in a single high-speed request (Payers + Batches)
  if (action === 'get_all_data') {
    try {
      const ss = getSpreadsheet();
      
      // Payers
      const payerSheet = getOrCreatePayersSheet(ss);
      const payers = parsePayersFromSheet(payerSheet);

      // Batches & Items
      const batchSheet = getOrCreateBatchesSheet(ss);
      const bLastRow = batchSheet.getLastRow();
      const batches = [];
      if (bLastRow > 1) {
        // Pre-fetch items from Collection_Items mapped by batchNumber
        const itemsMap = {};
        const itemsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_ITEMS);
        if (itemsSheet && itemsSheet.getLastRow() > 1) {
          const iData = itemsSheet.getRange(2, 1, itemsSheet.getLastRow() - 1, HEADERS_ITEMS.length).getValues();
          for (let j = 0; j < iData.length; j++) {
            const iRow = iData[j];
            const bNum = String(iRow[0] || '').trim();
            if (!bNum) continue;
            if (!itemsMap[bNum]) itemsMap[bNum] = [];
            itemsMap[bNum].push({
              id: 'item-' + (j + 1),
              tracking: String(iRow[1] || '').trim(),
              name: String(iRow[2] || '').trim(),
              paymentMethod: String(iRow[3] || 'CASH').trim(),
              usd: parseFloat(iRow[4]) || 0,
              khm: parseFloat(iRow[5]) || 0,
              date: formatDateTimeSafely(iRow[6]),
              createdAt: formatDateTimeSafely(iRow[7])
            });
          }
        }

        const lastCol = Math.max(batchSheet.getLastColumn(), HEADERS_BATCHES.length);
        const bData = batchSheet.getRange(2, 1, bLastRow - 1, lastCol).getValues();
        for (let i = bData.length - 1; i >= 0; i--) {
          const row = bData[i];
          if (!row[0]) continue;
          const totalUSD = parseFloat(row[4]) || 0;
          const totalKHR = parseFloat(row[5]) || 0;
          let bankUSD = 0, bankKHR = 0, cashUSD = 0, cashKHR = 0, reconciliation = '', notes = '', createdAt = '';

          const is13ColFormat = (
            row.length >= 13 &&
            (String(row[10] || '').includes('គ្រប់ចំនួន') || String(row[10] || '').includes('ខ្វះ') || String(row[10] || '').includes('លើស') || String(row[10] || '').includes('Balanced'))
          );

          const is12ColFormat = (
            !is13ColFormat &&
            row.length >= 12 &&
            (row[11] instanceof Date || (typeof row[11] === 'string' && (row[11].includes(':') || row[11].includes('-')))) &&
            (typeof row[6] === 'number' || !isNaN(Number(row[6])))
          );

          if (is13ColFormat) {
            bankUSD = parseFloat(row[6]) || 0;
            bankKHR = parseFloat(row[7]) || 0;
            cashUSD = parseFloat(row[8]) || 0;
            cashKHR = parseFloat(row[9]) || 0;
            reconciliation = String(row[10] || '').trim();
            notes = String(row[11] || '').trim();
            createdAt = row[12] ? (row[12] instanceof Date ? Utilities.formatDate(row[12], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(row[12])) : '';
          } else if (is12ColFormat) {
            bankUSD = parseFloat(row[6]) || 0;
            bankKHR = parseFloat(row[7]) || 0;
            cashUSD = parseFloat(row[8]) || 0;
            cashKHR = parseFloat(row[9]) || 0;
            notes = String(row[10] || '').trim();
            createdAt = row[11] ? (row[11] instanceof Date ? Utilities.formatDate(row[11], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(row[11])) : '';
            const actualUSD = bankUSD + cashUSD;
            const actualKHR = bankKHR + cashKHR;
            const dUSD = actualUSD - totalUSD;
            const dKHR = actualKHR - totalKHR;
            if (Math.abs(dUSD) < 0.005 && Math.abs(dKHR) < 0.5) {
              reconciliation = '✓ គ្រប់ចំនួន (Balanced 100%)';
            } else if (dUSD < -0.005 || dKHR < -0.5) {
              reconciliation = '⚠️ ខ្វះប្រាក់';
            } else {
              reconciliation = 'ℹ️ លើសប្រាក់';
            }
          } else {
            notes = String(row[6] || '').trim();
            createdAt = row[7] ? (row[7] instanceof Date ? Utilities.formatDate(row[7], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(row[7])) : '';
            cashUSD = totalUSD;
            cashKHR = totalKHR;
            reconciliation = '✓ គ្រប់ចំនួន (Balanced 100%)';
          }

          const bNum = String(row[0] || '').trim();
          batches.push({
            id: 'batch-' + (i + 1),
            batchNumber: bNum,
            date: row[1] ? (row[1] instanceof Date ? Utilities.formatDate(row[1], CONFIG.TIMEZONE, 'yyyy-MM-dd') : String(row[1])) : '',
            operator: String(row[2] || ''),
            totalItems: parseInt(row[3], 10) || 0,
            totalUSD: totalUSD,
            totalKHR: totalKHR,
            bankUSD: bankUSD,
            bankKHR: bankKHR,
            cashUSD: cashUSD,
            cashKHR: cashKHR,
            reconciliation: reconciliation,
            notes: notes,
            createdAt: createdAt,
            items: itemsMap[bNum] || [],
            syncedToGoogle: true
          });
        }
      }

      return createJsonResponse({
        status: 'success',
        data: {
          payers: payers,
          batches: batches
        }
      });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  // 1. Fetch all registered Payers (អ្នកប្រគល់ប្រាក់)
  if (action === 'get_payers') {
    try {
      const ss = getSpreadsheet();
      const sheet = getOrCreatePayersSheet(ss);
      const records = parsePayersFromSheet(sheet);
      return createJsonResponse({ status: 'success', data: records });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  // 1.1 Fetch all User Permissions (សិទ្ធិអ្នកប្រើប្រាស់)
  if (action === 'get_permissions') {
    try {
      const ss = getSpreadsheet();
      const sheet = getOrCreatePermissionsSheet(ss);
      const perms = parsePermissionsFromSheet(sheet);
      return createJsonResponse({ status: 'success', data: perms });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  // 1.2 Fetch User Activity Logs (កំណត់ត្រាសកម្មភាពអ្នកប្រើប្រាស់)
  if (action === 'get_user_logs') {
    try {
      const ss = getSpreadsheet();
      const sheet = getOrCreateLogsSheet(ss);
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        return createJsonResponse({ status: 'success', data: [] });
      }
      const data = sheet.getRange(2, 1, lastRow - 1, HEADERS_LOGS.length).getValues();
      const logs = [];
      for (let i = data.length - 1; i >= 0; i--) {
        const r = data[i];
        if (!r[0]) continue;
        logs.push({
          id: String(r[0] || '').trim(),
          timestamp: r[1] instanceof Date ? Utilities.formatDate(r[1], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(r[1] || ''),
          operator: String(r[2] || '').trim(),
          operatorEmail: String(r[3] || '').trim(),
          userRole: String(r[4] || '').trim(),
          action: String(r[5] || '').trim(),
          description: String(r[6] || '').trim(),
          details: String(r[6] || '').trim(),
          batchNumber: String(r[7] || '').trim(),
          amountUSD: r[8] !== '' ? Number(r[8]) : undefined,
          amountKHR: r[9] !== '' ? Number(r[9]) : undefined,
          itemsCount: r[10] !== '' ? Number(r[10]) : undefined
        });
      }
      return createJsonResponse({ status: 'success', data: logs });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  // 2. Fetch all saved Collection Batches (កញ្ចប់ទទួលប្រាក់)
  if (action === 'get_batches') {
    try {
      const ss = getSpreadsheet();
      const sheet = getOrCreateBatchesSheet(ss);
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        return createJsonResponse({ status: 'success', data: [] });
      }

      const lastCol = Math.max(sheet.getLastColumn(), HEADERS_BATCHES.length);
      const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      const batches = [];

      // Pre-fetch items from Collection_Items mapped by batchNumber
      const itemsMap = {};
      const itemsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_ITEMS);
      if (itemsSheet && itemsSheet.getLastRow() > 1) {
        const iData = itemsSheet.getRange(2, 1, itemsSheet.getLastRow() - 1, HEADERS_ITEMS.length).getValues();
        for (let j = 0; j < iData.length; j++) {
          const iRow = iData[j];
          const bNum = String(iRow[0] || '').trim();
          if (!bNum) continue;
          if (!itemsMap[bNum]) itemsMap[bNum] = [];
          itemsMap[bNum].push({
            id: 'item-' + (j + 1),
            tracking: String(iRow[1] || '').trim(),
            name: String(iRow[2] || '').trim(),
            paymentMethod: String(iRow[3] || 'CASH').trim(),
            usd: parseFloat(iRow[4]) || 0,
            khm: parseFloat(iRow[5]) || 0,
            date: formatDateTimeSafely(iRow[6]),
            createdAt: formatDateTimeSafely(iRow[7])
          });
        }
      }

      // Latest batches first
      for (let i = data.length - 1; i >= 0; i--) {
        const row = data[i];
        if (!row[0]) continue;

        const totalUSD = parseFloat(row[4]) || 0;
        const totalKHR = parseFloat(row[5]) || 0;
        let bankUSD = 0;
        let bankKHR = 0;
        let cashUSD = 0;
        let cashKHR = 0;
        let reconciliation = '';
        let notes = '';
        let createdAt = '';

        // Check if row has 13 columns, 12 columns, or old 8 columns
        const is13ColFormat = (
          row.length >= 13 &&
          (String(row[10] || '').includes('គ្រប់ចំនួន') || String(row[10] || '').includes('ខ្វះ') || String(row[10] || '').includes('លើស') || String(row[10] || '').includes('Balanced'))
        );

        const is12ColFormat = (
          !is13ColFormat &&
          row.length >= 12 &&
          (row[11] instanceof Date || (typeof row[11] === 'string' && (row[11].includes(':') || row[11].includes('-')))) &&
          (typeof row[6] === 'number' || !isNaN(Number(row[6])))
        );

        if (is13ColFormat) {
          bankUSD = parseFloat(row[6]) || 0;
          bankKHR = parseFloat(row[7]) || 0;
          cashUSD = parseFloat(row[8]) || 0;
          cashKHR = parseFloat(row[9]) || 0;
          reconciliation = String(row[10] || '').trim();
          notes = String(row[11] || '').trim();
          createdAt = row[12] ? (row[12] instanceof Date ? Utilities.formatDate(row[12], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(row[12])) : '';
        } else if (is12ColFormat) {
          bankUSD = parseFloat(row[6]) || 0;
          bankKHR = parseFloat(row[7]) || 0;
          cashUSD = parseFloat(row[8]) || 0;
          cashKHR = parseFloat(row[9]) || 0;
          notes = String(row[10] || '').trim();
          createdAt = row[11] ? (row[11] instanceof Date ? Utilities.formatDate(row[11], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(row[11])) : '';
          const actualUSD = bankUSD + cashUSD;
          const actualKHR = bankKHR + cashKHR;
          const dUSD = actualUSD - totalUSD;
          const dKHR = actualKHR - totalKHR;
          if (Math.abs(dUSD) < 0.005 && Math.abs(dKHR) < 0.5) {
            reconciliation = '✓ គ្រប់ចំនួន (Balanced 100%)';
          } else if (dUSD < -0.005 || dKHR < -0.5) {
            reconciliation = '⚠️ ខ្វះប្រាក់';
          } else {
            reconciliation = 'ℹ️ លើសប្រាក់';
          }
        } else {
          notes = String(row[6] || '').trim();
          createdAt = row[7] ? (row[7] instanceof Date ? Utilities.formatDate(row[7], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(row[7])) : '';
          cashUSD = totalUSD;
          cashKHR = totalKHR;
          reconciliation = '✓ គ្រប់ចំនួន (Balanced 100%)';
        }

        const bNum = String(row[0] || '').trim();
        batches.push({
          id: 'batch-' + (i + 1),
          batchNumber: bNum,
          date: row[1] ? (row[1] instanceof Date ? Utilities.formatDate(row[1], CONFIG.TIMEZONE, 'yyyy-MM-dd') : String(row[1])) : '',
          operator: String(row[2] || ''),
          totalItems: parseInt(row[3], 10) || 0,
          totalUSD: totalUSD,
          totalKHR: totalKHR,
          bankUSD: bankUSD,
          bankKHR: bankKHR,
          cashUSD: cashUSD,
          cashKHR: cashKHR,
          reconciliation: reconciliation,
          notes: notes,
          createdAt: createdAt,
          items: itemsMap[bNum] || [],
          syncedToGoogle: true
        });
      }

      return createJsonResponse({ status: 'success', data: batches });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  // 3. Update Column Headers / Setup Sheets (អាចហៅតាមរយៈ GET Request)
  if (action === 'update_columns' || action === 'setup_sheets') {
    try {
      const msg = setupAllSheets();
      return createJsonResponse({
        status: 'success',
        message: msg,
        headers: {
          batches: HEADERS_BATCHES,
          items: HEADERS_ITEMS,
          payers: HEADERS_PAYERS
        }
      });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  // Fix Dates Action
  if (action === 'fix_dates' || action === 'fix_all_dates') {
    try {
      const msg = fixAllDatesInAllSheets();
      return createJsonResponse({ status: 'success', message: msg });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  // 4. Delete Collection Batch (លុបកញ្ចប់ Batch - ល្បឿនលឿន Fast In-Memory)
  if (action === 'delete_batch') {
    try {
      const ss = getSpreadsheet();
      const batchNumber = String(e.parameter.batchNumber || e.parameter.id || '').trim();
      let batchesDeleted = 0;
      let itemsDeleted = 0;

      if (batchNumber) {
        const batchSheet = ss.getSheetByName(CONFIG.SHEET_NAME_BATCHES);
        batchesDeleted = fastRemoveBatchFromSheet(batchSheet, batchNumber);

        const itemsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_ITEMS);
        itemsDeleted = fastRemoveBatchFromSheet(itemsSheet, batchNumber);
      }

      return createJsonResponse({
        status: 'success',
        message: \`Batch \${batchNumber} deleted (\${batchesDeleted} batch, \${itemsDeleted} items removed)\`
      });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  // 5. Delete All Collection Batches (លុបកញ្ចប់ទាំងអស់ក្នុង Batches & Collection_Items - ល្បឿនលឿន Fast Clear)
  if (action === 'delete_all_batches') {
    try {
      const ss = getSpreadsheet();
      const batchSheet = ss.getSheetByName(CONFIG.SHEET_NAME_BATCHES);
      const bCount = fastClearSheetData(batchSheet);

      const itemsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_ITEMS);
      const iCount = fastClearSheetData(itemsSheet);

      return createJsonResponse({
        status: 'success',
        message: \`All batches deleted from Google Sheets (\${bCount} batches, \${iCount} items removed)\`
      });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  // 5b. Delete Medicine Batch (លុបកញ្ចប់ថ្នាំពេទ្យក្នុង Medicine_Batches & Medicine_Items)
  if (action === 'delete_medicine_batch') {
    try {
      const ss = getSpreadsheet();
      const batchNumber = String(e.parameter.batchNumber || e.parameter.id || '').trim();
      let batchesDeleted = 0;
      let itemsDeleted = 0;

      if (batchNumber) {
        const batchSheet = ss.getSheetByName(CONFIG.SHEET_NAME_MEDICINE_BATCHES || 'Medicine_Batches');
        if (batchSheet) batchesDeleted = fastRemoveBatchFromSheet(batchSheet, batchNumber);

        const itemsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_MEDICINE_ITEMS || 'Medicine_Items');
        if (itemsSheet) itemsDeleted = fastRemoveBatchFromSheet(itemsSheet, batchNumber);
      }

      return createJsonResponse({
        status: 'success',
        message: \`Medicine batch \${batchNumber} deleted (\${batchesDeleted} batch, \${itemsDeleted} items removed)\`
      });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  // 5c. Delete All Medicine Batches (លុបកញ្ចប់ថ្នាំពេទ្យទាំងអស់)
  if (action === 'delete_all_medicine_batches') {
    try {
      const ss = getSpreadsheet();
      const batchSheet = ss.getSheetByName(CONFIG.SHEET_NAME_MEDICINE_BATCHES || 'Medicine_Batches');
      const bCount = batchSheet ? fastClearSheetData(batchSheet) : 0;

      const itemsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_MEDICINE_ITEMS || 'Medicine_Items');
      const iCount = itemsSheet ? fastClearSheetData(itemsSheet) : 0;

      return createJsonResponse({
        status: 'success',
        message: \`All medicine batches deleted from Google Sheets (\${bCount} batches, \${iCount} items removed)\`
      });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  // 6. Get App Settings from Sheet (ទាញយកការកំណត់ Settings ពី Google Sheets)
  if (action === 'get_settings') {
    try {
      const ss = getSpreadsheet();
      const sheet = getOrCreateSettingsSheet(ss);
      const settings = parseSettingsFromSheet(sheet);
      return createJsonResponse({
        status: 'success',
        data: settings
      });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  // 7. Save App Settings via GET (រក្សាទុកការកំណត់ Settings តាម GET)
  if (action === 'save_settings') {
    try {
      const ss = getSpreadsheet();
      const sheet = getOrCreateSettingsSheet(ss);
      let newSettings = {};
      if (e.parameter.settings) {
        try { newSettings = JSON.parse(e.parameter.settings); } catch (err) {}
      } else {
        newSettings = e.parameter;
      }
      const count = saveSettingsToSheet(sheet, newSettings);
      return createJsonResponse({
        status: 'success',
        message: \`Saved \${count} settings to Google Sheets\`,
        data: parseSettingsFromSheet(sheet)
      });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  // 8. Get Distribution Reports via GET (ទាញយករបាយការណ៍ចែកចាយ)
  if (action === 'get_distribution_reports') {
    try {
      const ss = getSpreadsheet();
      const sheet = getOrCreateDistributionSheet(ss);
      const lastRow = sheet.getLastRow();
      const list = [];
      if (lastRow > 1) {
        const values = sheet.getRange(2, 1, lastRow - 1, HEADERS_DISTRIBUTION.length).getValues();
        for (let i = 0; i < values.length; i++) {
          const row = values[i];
          if (!row[0] && !row[1]) continue;
          list.push({
            id: String(row[0] || ''),
            barcode: String(row[1] || ''),
            name: String(row[2] || ''),
            date: String(row[3] || ''),
            remarks: String(row[4] || ''),
            operatorEmail: String(row[5] || ''),
            createdBy: String(row[6] || ''),
            createdAt: formatDateTimeSafely(row[7]),
            updatedAt: formatDateTimeSafely(row[8])
          });
        }
      }
      return createJsonResponse({
        status: 'success',
        count: list.length,
        data: list
      });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  // 9. Get Warehouse Scans via GET (ScanIn, ScanOut, Out of Delivery)
  if (action === 'get_warehouse_scans') {
    try {
      const ss = getSpreadsheet();
      const list = fetchAllWarehouseScansFromSheets(ss);
      return createJsonResponse({
        status: 'success',
        count: list.length,
        data: list
      });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  // Default Health check
  const result = {
    status: 'online',
    service: 'Payment Collection & Payer Management API',
    version: '2.2.0',
    timestamp: new Date().toISOString(),
    sheets: {
      batches: CONFIG.SHEET_NAME_BATCHES,
      items: CONFIG.SHEET_NAME_ITEMS,
      payers: CONFIG.SHEET_NAME_PAYERS,
      settings: CONFIG.SHEET_NAME_SETTINGS,
      distribution: CONFIG.SHEET_NAME_DISTRIBUTION,
      scanIn: CONFIG.SHEET_NAME_SCAN_IN,
      scanOut: CONFIG.SHEET_NAME_SCAN_OUT,
      outOfDelivery: CONFIG.SHEET_NAME_OUT_OF_DELIVERY
    },
    message: 'Google Apps Script Web App is active and ready.'
  };

  return createJsonResponse(result);
}

/**
 * Handle HTTP POST Requests
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(30000);
  } catch (err) {
    return createJsonResponse({
      status: 'error',
      message: 'Server is busy processing another transaction. Please try again.'
    }, 429);
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('No post data received in request.');
    }

    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      throw new Error('Invalid JSON payload: ' + parseErr.message);
    }

    const ss = getSpreadsheet();
    const nowStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');

    // =========================================================================
    // 📥 ACTION: SAVE COLLECTION BATCH (រក្សាទុកកញ្ចប់ទទួលប្រាក់ និងទំនិញលម្អិត)
    // =========================================================================
    if (data.action === 'save_collection_batch') {
      const batch = data.batch || {};
      const batchNumber = String(batch.batchNumber || ('BATCH-' + Date.now().toString().slice(-6))).trim();
      const operator = String(batch.operator || data.user || 'Unknown').trim();
      const totalItems = parseInt(batch.totalItems, 10) || (Array.isArray(batch.items) ? batch.items.length : 0);
      const totalUSD = parseFloat(batch.totalUSD) || 0;
      const totalKHR = parseFloat(batch.totalKHR) || 0;
      const bankUSD = parseFloat(batch.bankUSD) || 0;
      const bankKHR = parseFloat(batch.bankKHR) || 0;
      const cashUSD = parseFloat(batch.cashUSD) || 0;
      const cashKHR = parseFloat(batch.cashKHR) || 0;
      const reconciliation = String(batch.reconciliation || '✓ គ្រប់ចំនួន (Balanced 100%)').trim();
      const notes = String(batch.notes || '').trim();
      const dateStr = formatDateTimeSafely(batch.date || batch.createdAt, nowStr);
      const batchDateOnly = dateStr.slice(0, 10);
      const createdAtStr = formatDateTimeSafely(batch.createdAt, nowStr);

      // 1. Append summary row to 'Batches' sheet (13 Columns)
      const batchSheet = getOrCreateBatchesSheet(ss);
      batchSheet.appendRow([
        batchNumber,
        batchDateOnly,
        operator,
        totalItems,
        totalUSD,
        totalKHR,
        bankUSD,
        bankKHR,
        cashUSD,
        cashKHR,
        reconciliation,
        notes,
        createdAtStr
      ]);
      const lastBRow = batchSheet.getLastRow();
      batchSheet.getRange(lastBRow, 2).setNumberFormat('@');
      batchSheet.getRange(lastBRow, 13).setNumberFormat('@');

      // 2. Append individual item rows to 'Collection_Items' sheet (High-Speed Matrix Write)
      if (Array.isArray(batch.items) && batch.items.length > 0) {
        const itemSheet = getOrCreateItemsSheet(ss);
        const itemRows = batch.items.map(item => [
          batchNumber,
          String(item.tracking || item.barcode || item.trackingNumber || '').trim(),
          String(item.name || item.customerName || item.customer || '').trim(),
          String(item.paymentMethod || item.payment || item.payment_method || 'CASH').trim(),
          Number(item.usd !== undefined ? item.usd : (item.amountUSD || 0)) || 0,
          Number(item.khm !== undefined ? item.khm : (item.khr !== undefined ? item.khr : (item.amountKHR || 0))) || 0,
          formatDateTimeSafely(item.date || item.deliveryDate, dateStr),
          formatDateTimeSafely(item.createdAt, createdAtStr)
        ]);
        const targetRow = itemSheet.getLastRow() + 1;
        const neededRow = targetRow + itemRows.length - 1;
        if (neededRow > itemSheet.getMaxRows()) {
          itemSheet.insertRowsAfter(itemSheet.getMaxRows(), neededRow - itemSheet.getMaxRows() + 20);
        }
        itemSheet.getRange(targetRow, 1, itemRows.length, HEADERS_ITEMS.length).setValues(itemRows);
        itemSheet.getRange(targetRow, 7, itemRows.length, 1).setNumberFormat('@');
        itemSheet.getRange(targetRow, 8, itemRows.length, 1).setNumberFormat('@');
      }

      // 3. Send Telegram Notification (Skip if already sent directly by Web App client)
      if (data.notifyTelegram === true && !data.skipTelegram) {
        try {
          sendTelegramBatchNotification({
            batchNumber: batchNumber,
            operator: operator,
            totalItems: totalItems,
            totalUSD: totalUSD,
            totalKHR: totalKHR,
            bankUSD: bankUSD,
            bankKHR: bankKHR,
            cashUSD: cashUSD,
            cashKHR: cashKHR,
            reconciliation: reconciliation,
            notes: notes,
            createdAt: createdAtStr
          });
        } catch (tgErr) {
          console.warn('Telegram notification error: ' + tgErr.message);
        }
      }

      return createJsonResponse({
        status: 'success',
        message: 'Collection batch and items saved to Google Sheets successfully',
        data: {
          batchNumber: batchNumber,
          totalItems: totalItems,
          totalUSD: totalUSD,
          totalKHR: totalKHR,
          bankUSD: bankUSD,
          bankKHR: bankKHR,
          cashUSD: cashUSD,
          cashKHR: cashKHR,
          reconciliation: reconciliation
        }
      });
    }

    // =========================================================================
    // 💊 ACTION: SAVE MEDICINE COLLECTION BATCH (រក្សាទុកកញ្ចប់ទទួលប្រាក់ថ្នាំពេទ្យ Data_BM)
    // =========================================================================
    if (data.action === 'save_medicine_batch') {
      const batch = data.batch || {};
      const batchNumber = String(batch.batchNumber || ('MED-' + Date.now().toString().slice(-6))).trim();
      const operator = String(batch.operator || data.user || 'Unknown').trim();
      const totalItems = parseInt(batch.totalItems, 10) || (Array.isArray(batch.items) ? batch.items.length : 0);
      const totalUSD = parseFloat(batch.totalUSD) || 0;
      const totalKHR = parseFloat(batch.totalKHR) || 0;
      const bankUSD = parseFloat(batch.bankUSD) || 0;
      const bankKHR = parseFloat(batch.bankKHR) || 0;
      const cashUSD = parseFloat(batch.cashUSD) || 0;
      const cashKHR = parseFloat(batch.cashKHR) || 0;
      const reconciliation = String(batch.reconciliation || '✓ គ្រប់ចំនួន (Balanced 100%)').trim();
      const notes = String(batch.notes || '').trim();
      const dateStr = formatDateTimeSafely(batch.date || batch.createdAt, nowStr);
      const batchDateOnly = dateStr.slice(0, 10);
      const createdAtStr = formatDateTimeSafely(batch.createdAt, nowStr);

      // 1. Append summary row to 'Medicine_Batches' sheet (13 Columns)
      const mBatchSheet = getOrCreateMedicineBatchesSheet(ss);
      mBatchSheet.appendRow([
        batchNumber,
        batchDateOnly,
        operator,
        totalItems,
        totalUSD,
        totalKHR,
        bankUSD,
        bankKHR,
        cashUSD,
        cashKHR,
        reconciliation,
        notes,
        createdAtStr
      ]);
      const lastMBRow = mBatchSheet.getLastRow();
      mBatchSheet.getRange(lastMBRow, 2).setNumberFormat('@');
      mBatchSheet.getRange(lastMBRow, 13).setNumberFormat('@');

      // 2. Append individual item rows to 'Medicine_Items' sheet (High-Speed Matrix Write)
      if (Array.isArray(batch.items) && batch.items.length > 0) {
        const mItemSheet = getOrCreateMedicineItemsSheet(ss);
        const itemRows = batch.items.map(item => [
          batchNumber,
          String(item.tracking || item.barcode || item.trackingNumber || '').trim(),
          String(item.name || item.customerName || item.customer || '').trim(),
          String(item.paymentMethod || item.payment || item.payment_method || 'CASH').trim(),
          Number(item.usd !== undefined ? item.usd : (item.amountUSD || 0)) || 0,
          Number(item.khm !== undefined ? item.khm : (item.khr !== undefined ? item.khr : (item.amountKHR || 0))) || 0,
          formatDateTimeSafely(item.date || item.deliveryDate, dateStr),
          formatDateTimeSafely(item.createdAt, createdAtStr)
        ]);
        const targetRow = mItemSheet.getLastRow() + 1;
        const neededRow = targetRow + itemRows.length - 1;
        if (neededRow > mItemSheet.getMaxRows()) {
          mItemSheet.insertRowsAfter(mItemSheet.getMaxRows(), neededRow - mItemSheet.getMaxRows() + 20);
        }
        mItemSheet.getRange(targetRow, 1, itemRows.length, HEADERS_ITEMS.length).setValues(itemRows);
        mItemSheet.getRange(targetRow, 7, itemRows.length, 1).setNumberFormat('@');
        mItemSheet.getRange(targetRow, 8, itemRows.length, 1).setNumberFormat('@');
      }

      // 3. Send Telegram Notification if requested
      if (data.notifyTelegram === true && !data.skipTelegram) {
        try {
          sendTelegramBatchNotification({
            batchNumber: batchNumber,
            operator: operator,
            totalItems: totalItems,
            totalUSD: totalUSD,
            totalKHR: totalKHR,
            bankUSD: bankUSD,
            bankKHR: bankKHR,
            cashUSD: cashUSD,
            cashKHR: cashKHR,
            reconciliation: reconciliation,
            notes: notes,
            createdAt: createdAtStr
          });
        } catch (tgErr) {
          console.warn('Telegram notification error: ' + tgErr.message);
        }
      }

      return createJsonResponse({
        status: 'success',
        message: 'Medicine collection batch and items saved to Google Sheets successfully',
        data: {
          batchNumber: batchNumber,
          totalItems: totalItems,
          totalUSD: totalUSD,
          totalKHR: totalKHR,
          bankUSD: bankUSD,
          bankKHR: bankKHR,
          cashUSD: cashUSD,
          cashKHR: cashKHR,
          reconciliation: reconciliation
        }
      });
    }

    // =========================================================================
    // 💊 ACTION: BULK SAVE MEDICINE BATCHES (Sync ពី Firebase/Local ចូល Google Sheets)
    // =========================================================================
    if (data.action === 'bulk_save_medicine_batches') {
      const incomingBatches = Array.isArray(data.batches) ? data.batches : [];
      let batchesAdded = 0;
      let itemsAdded = 0;

      if (incomingBatches.length > 0) {
        const mBatchSheet = getOrCreateMedicineBatchesSheet(ss);
        const mItemSheet = getOrCreateMedicineItemsSheet(ss);

        // Read existing batch numbers from Medicine_Batches sheet
        const existingBatchSet = new Set();
        const bLastRow = mBatchSheet.getLastRow();
        if (bLastRow > 1) {
          const existingB = mBatchSheet.getRange(2, 1, bLastRow - 1, 1).getValues();
          for (let i = 0; i < existingB.length; i++) {
            const bNum = String(existingB[i][0] || '').trim();
            if (bNum) existingBatchSet.add(bNum);
          }
        }

        // Read existing batch numbers from Medicine_Items sheet for independent deduplication
        const existingItemBatchSet = new Set();
        const iLastRow = mItemSheet.getLastRow();
        if (iLastRow > 1) {
          const existingI = mItemSheet.getRange(2, 1, iLastRow - 1, 1).getValues();
          for (let i = 0; i < existingI.length; i++) {
            const bNum = String(existingI[i][0] || '').trim();
            if (bNum) existingItemBatchSet.add(bNum);
          }
        }

        const newBatchRows = [];
        const newItemRows = [];

        incomingBatches.forEach(batch => {
          const batchNumber = String(batch.batchNumber || ('MED-' + Date.now().toString().slice(-6))).trim();
          const operator = String(batch.operator || data.user || 'Unknown').trim();
          const totalItems = parseInt(batch.totalItems, 10) || (Array.isArray(batch.items) ? batch.items.length : 0);
          const totalUSD = parseFloat(batch.totalUSD) || 0;
          const totalKHR = parseFloat(batch.totalKHR) || 0;
          const bankUSD = parseFloat(batch.bankUSD) || 0;
          const bankKHR = parseFloat(batch.bankKHR) || 0;
          const cashUSD = parseFloat(batch.cashUSD) || 0;
          const cashKHR = parseFloat(batch.cashKHR) || 0;
          const reconciliation = String(batch.reconciliation || '✓ គ្រប់ចំនួន (Balanced 100%)').trim();
          const notes = String(batch.notes || '').trim();
          const dateStr = formatDateTimeSafely(batch.date || batch.createdAt, nowStr);
          const batchDateOnly = dateStr.slice(0, 10);
          const createdAtStr = formatDateTimeSafely(batch.createdAt, nowStr);

          // A. Add to Medicine_Batches if not yet present
          if (!existingBatchSet.has(batchNumber)) {
            existingBatchSet.add(batchNumber);
            newBatchRows.push([
              batchNumber,
              batchDateOnly,
              operator,
              totalItems,
              totalUSD,
              totalKHR,
              bankUSD,
              bankKHR,
              cashUSD,
              cashKHR,
              reconciliation,
              notes,
              createdAtStr
            ]);
          }

          // B. Independently add items to Medicine_Items if not yet in Medicine_Items
          if (!existingItemBatchSet.has(batchNumber) && Array.isArray(batch.items) && batch.items.length > 0) {
            existingItemBatchSet.add(batchNumber);
            batch.items.forEach(item => {
              newItemRows.push([
                batchNumber,
                String(item.tracking || item.barcode || item.trackingNumber || '').trim(),
                String(item.name || item.customerName || item.customer || '').trim(),
                String(item.paymentMethod || item.payment || item.payment_method || 'CASH').trim(),
                Number(item.usd !== undefined ? item.usd : (item.amountUSD || 0)) || 0,
                Number(item.khm !== undefined ? item.khm : (item.khr !== undefined ? item.khr : (item.amountKHR || 0))) || 0,
                formatDateTimeSafely(item.date || item.deliveryDate, dateStr),
                formatDateTimeSafely(item.createdAt, createdAtStr)
              ]);
            });
          }
        });

        if (newBatchRows.length > 0) {
          const targetRow = mBatchSheet.getLastRow() + 1;
          const neededRow = targetRow + newBatchRows.length - 1;
          if (neededRow > mBatchSheet.getMaxRows()) {
            mBatchSheet.insertRowsAfter(mBatchSheet.getMaxRows(), neededRow - mBatchSheet.getMaxRows() + 20);
          }
          mBatchSheet.getRange(targetRow, 1, newBatchRows.length, HEADERS_BATCHES.length).setValues(newBatchRows);
          mBatchSheet.getRange(targetRow, 2, newBatchRows.length, 1).setNumberFormat('@');
          mBatchSheet.getRange(targetRow, 13, newBatchRows.length, 1).setNumberFormat('@');
          batchesAdded = newBatchRows.length;
        }

        if (newItemRows.length > 0) {
          const targetRow = mItemSheet.getLastRow() + 1;
          const neededRow = targetRow + newItemRows.length - 1;
          if (neededRow > mItemSheet.getMaxRows()) {
            mItemSheet.insertRowsAfter(mItemSheet.getMaxRows(), neededRow - mItemSheet.getMaxRows() + 20);
          }
          mItemSheet.getRange(targetRow, 1, newItemRows.length, HEADERS_ITEMS.length).setValues(newItemRows);
          mItemSheet.getRange(targetRow, 7, newItemRows.length, 1).setNumberFormat('@');
          mItemSheet.getRange(targetRow, 8, newItemRows.length, 1).setNumberFormat('@');
          itemsAdded = newItemRows.length;
        }
      }

      return createJsonResponse({
        status: 'success',
        message: 'Bulk saved medicine batches successfully to Google Sheets',
        batchesAdded: batchesAdded,
        itemsAdded: itemsAdded
      });
    }

    // =========================================================================
    // ⚡ ACTION: ULTRA-FAST BULK SYNC ALL DATA (សមកាលកម្មទិន្នន័យទាំងអស់លឿនបំផុតជាវិនាទី)
    // =========================================================================
    if (data.action === 'sync_all_data' || data.action === 'bulk_save_batches') {
      const incomingBatches = Array.isArray(data.batches) ? data.batches : [];
      const incomingPayers = Array.isArray(data.payers) ? data.payers : [];
      let batchesAdded = 0;
      let itemsAdded = 0;
      let payersSynced = 0;

      // 1. Bulk Process Batches & Items using High-Speed Matrix writes
      if (incomingBatches.length > 0) {
        const batchSheet = getOrCreateBatchesSheet(ss);
        const itemSheet = getOrCreateItemsSheet(ss);
        
        // Read existing batch numbers from Batches sheet
        const existingBatchSet = new Set();
        const bLastRow = batchSheet.getLastRow();
        if (bLastRow > 1) {
          const existingB = batchSheet.getRange(2, 1, bLastRow - 1, 1).getValues();
          for (let i = 0; i < existingB.length; i++) {
            const bNum = String(existingB[i][0] || '').trim();
            if (bNum) existingBatchSet.add(bNum);
          }
        }

        // Read existing batch numbers from Collection_Items sheet for independent deduplication
        const existingItemBatchSet = new Set();
        const iLastRow = itemSheet.getLastRow();
        if (iLastRow > 1) {
          const existingI = itemSheet.getRange(2, 1, iLastRow - 1, 1).getValues();
          for (let i = 0; i < existingI.length; i++) {
            const bNum = String(existingI[i][0] || '').trim();
            if (bNum) existingItemBatchSet.add(bNum);
          }
        }

        const newBatchRows = [];
        const newItemRows = [];

        incomingBatches.forEach(batch => {
          const batchNumber = String(batch.batchNumber || ('BATCH-' + Date.now().toString().slice(-6))).trim();
          const operator = String(batch.operator || data.user || 'Unknown').trim();
          const totalItems = parseInt(batch.totalItems, 10) || (Array.isArray(batch.items) ? batch.items.length : 0);
          const totalUSD = parseFloat(batch.totalUSD) || 0;
          const totalKHR = parseFloat(batch.totalKHR) || 0;
          const bankUSD = parseFloat(batch.bankUSD) || 0;
          const bankKHR = parseFloat(batch.bankKHR) || 0;
          const cashUSD = parseFloat(batch.cashUSD) || 0;
          const cashKHR = parseFloat(batch.cashKHR) || 0;
          const reconciliation = String(batch.reconciliation || '✓ គ្រប់ចំនួន (Balanced 100%)').trim();
          const notes = String(batch.notes || '').trim();
          const dateStr = formatDateTimeSafely(batch.date || batch.createdAt, nowStr);
          const batchDateOnly = dateStr.slice(0, 10);
          const createdAtStr = formatDateTimeSafely(batch.createdAt, nowStr);

          // A. Add to Batches sheet if not yet present
          if (!existingBatchSet.has(batchNumber)) {
            existingBatchSet.add(batchNumber);
            newBatchRows.push([
              batchNumber,
              batchDateOnly,
              operator,
              totalItems,
              totalUSD,
              totalKHR,
              bankUSD,
              bankKHR,
              cashUSD,
              cashKHR,
              reconciliation,
              notes,
              createdAtStr
            ]);
          }

          // B. Independently add items to Collection_Items sheet if not yet in Collection_Items
          if (!existingItemBatchSet.has(batchNumber) && Array.isArray(batch.items) && batch.items.length > 0) {
            existingItemBatchSet.add(batchNumber);
            batch.items.forEach(item => {
              newItemRows.push([
                batchNumber,
                String(item.tracking || item.barcode || item.trackingNumber || '').trim(),
                String(item.name || item.customerName || item.customer || '').trim(),
                String(item.paymentMethod || item.payment || item.payment_method || 'CASH').trim(),
                Number(item.usd !== undefined ? item.usd : (item.amountUSD || 0)) || 0,
                Number(item.khm !== undefined ? item.khm : (item.khr !== undefined ? item.khr : (item.amountKHR || 0))) || 0,
                formatDateTimeSafely(item.date || item.deliveryDate, dateStr),
                formatDateTimeSafely(item.createdAt, createdAtStr)
              ]);
            });
          }
        });

        if (newBatchRows.length > 0) {
          const targetRow = batchSheet.getLastRow() + 1;
          const neededRow = targetRow + newBatchRows.length - 1;
          if (neededRow > batchSheet.getMaxRows()) {
            batchSheet.insertRowsAfter(batchSheet.getMaxRows(), neededRow - batchSheet.getMaxRows() + 20);
          }
          batchSheet.getRange(targetRow, 1, newBatchRows.length, HEADERS_BATCHES.length).setValues(newBatchRows);
          batchSheet.getRange(targetRow, 2, newBatchRows.length, 1).setNumberFormat('@');
          batchSheet.getRange(targetRow, 13, newBatchRows.length, 1).setNumberFormat('@');
          batchesAdded = newBatchRows.length;
        }

        if (newItemRows.length > 0) {
          const targetRow = itemSheet.getLastRow() + 1;
          const neededRow = targetRow + newItemRows.length - 1;
          if (neededRow > itemSheet.getMaxRows()) {
            itemSheet.insertRowsAfter(itemSheet.getMaxRows(), neededRow - itemSheet.getMaxRows() + 20);
          }
          itemSheet.getRange(targetRow, 1, newItemRows.length, HEADERS_ITEMS.length).setValues(newItemRows);
          itemSheet.getRange(targetRow, 7, newItemRows.length, 1).setNumberFormat('@');
          itemSheet.getRange(targetRow, 8, newItemRows.length, 1).setNumberFormat('@');
          itemsAdded = newItemRows.length;
        }
      }

      // 2. Bulk Process Payers using High-Speed Matrix writes
      if (incomingPayers.length > 0) {
        const payerSheet = getOrCreatePayersSheet(ss);
        const pLastRow = payerSheet.getLastRow();
        const existingPMap = {};
        if (pLastRow > 1) {
          const pData = payerSheet.getRange(2, 1, pLastRow - 1, 2).getValues();
          for (let i = 0; i < pData.length; i++) {
            const pId = String(pData[i][0] || '').trim();
            if (pId) existingPMap[pId] = i + 2;
          }
        }

        const newPayerRows = [];
        incomingPayers.forEach(p => {
          const pId = String(p.id || '').trim() || ('PAY-' + Date.now().toString().slice(-6));
          const row = [
            pId,
            String(p.name || '').trim(),
            String(p.phone || '').trim(),
            String(p.category || 'OTHER').trim(),
            String(p.area || '').trim(),
            String(p.status || 'ACTIVE').trim(),
            String(p.notes || '').trim(),
            p.createdAt || nowStr,
            nowStr
          ];

          if (existingPMap[pId]) {
            payerSheet.getRange(existingPMap[pId], 1, 1, 9).setValues([row]);
          } else {
            newPayerRows.push(row);
          }
          payersSynced++;
        });

        if (newPayerRows.length > 0) {
          const targetRow = payerSheet.getLastRow() + 1;
          payerSheet.getRange(targetRow, 1, newPayerRows.length, 9).setValues(newPayerRows);
        }
      }

      return createJsonResponse({
        status: 'success',
        message: \`Ultra-fast sync completed: \${batchesAdded} batches, \${itemsAdded} items, \${payersSynced} payers synced\`,
        data: { batchesAdded, itemsAdded, payersSynced }
      });
    }

    // =========================================================================
    // 👤 ACTION: SAVE / UPDATE PAYER (រក្សាទុក ឬកែប្រែអ្នកប្រគល់ប្រាក់)
    // =========================================================================
    if (data.action === 'save_payer') {
      const payerSheet = getOrCreatePayersSheet(ss);
      const payer = data.payer || {};
      const payerId = String(payer.id || ('PAY-' + Date.now().toString().slice(-6))).trim();
      const payerName = String(payer.name || '').trim();
      const phone = String(payer.phone || '').trim();
      const category = String(payer.category || 'OTHER').trim();
      const area = String(payer.area || '').trim();
      const status = String(payer.status || 'ACTIVE').trim();
      const notes = String(payer.notes || '').trim();
      const createdAt = payer.createdAt || nowStr;
      const updatedAt = nowStr;

      // Check if payer exists to update
      const lastRow = payerSheet.getLastRow();
      let updatedRow = -1;
      if (lastRow > 1) {
        const ids = payerSheet.getRange(2, 1, lastRow - 1, 2).getValues();
        for (let i = 0; i < ids.length; i++) {
          if (String(ids[i][0]).trim() === payerId || (payerName && String(ids[i][1]).trim().toLowerCase() === payerName.toLowerCase())) {
            updatedRow = i + 2;
            payerSheet.getRange(updatedRow, 1, 1, 9).setValues([[
              payerId, payerName, phone, category, area, status, notes, ids[i][7] || createdAt, updatedAt
            ]]);
            break;
          }
        }
      }

      if (updatedRow === -1) {
        payerSheet.appendRow([payerId, payerName, phone, category, area, status, notes, createdAt, updatedAt]);
        updatedRow = payerSheet.getLastRow();
      }

      return createJsonResponse({
        status: 'success',
        message: 'Payer saved to Google Sheets',
        data: { id: payerId, name: payerName, rowNumber: updatedRow }
      });
    }

    // =========================================================================
    // 🗑️ ACTION: DELETE PAYER (លុបអ្នកប្រគល់ប្រាក់)
    // =========================================================================
    if (data.action === 'delete_payer') {
      const payerSheet = getOrCreatePayersSheet(ss);
      const targetId = String(data.id || '').trim();
      const targetName = String(data.name || '').trim().toLowerCase();
      const lastRow = payerSheet.getLastRow();
      let deleted = false;
      if (lastRow > 1) {
        const ids = payerSheet.getRange(2, 1, lastRow - 1, 2).getValues();
        for (let i = ids.length - 1; i >= 0; i--) {
          const rowId = String(ids[i][0] || '').trim();
          const rowName = String(ids[i][1] || '').trim().toLowerCase();
          if ((targetId && rowId === targetId) || (targetName && rowName === targetName)) {
            payerSheet.deleteRow(i + 2);
            deleted = true;
            break;
          }
        }
      }
      return createJsonResponse({
        status: deleted ? 'success' : 'not_found',
        message: deleted ? 'Payer deleted from Google Sheets' : 'Payer not found in Google Sheets'
      });
    }

    // =========================================================================
    // 🔄 ACTION: BULK SYNC PAYERS (ធ្វើសមកាលកម្មអ្នកប្រគល់ប្រាក់ទាំងអស់)
    // =========================================================================
    if (data.action === 'sync_payers') {
      const payerSheet = getOrCreatePayersSheet(ss);
      const incomingList = Array.isArray(data.payers) ? data.payers : [];
      let added = 0;
      let updated = 0;

      const lastRow = payerSheet.getLastRow();
      const existingMap = {};
      if (lastRow > 1) {
        const existingData = payerSheet.getRange(2, 1, lastRow - 1, 2).getValues();
        for (let i = 0; i < existingData.length; i++) {
          const id = String(existingData[i][0]).trim();
          if (id) existingMap[id] = i + 2;
        }
      }

      incomingList.forEach(p => {
        const pId = String(p.id || '').trim();
        const rowData = [
          pId || ('PAY-' + Date.now().toString().slice(-6)),
          String(p.name || '').trim(),
          String(p.phone || '').trim(),
          String(p.category || 'OTHER').trim(),
          String(p.area || '').trim(),
          String(p.status || 'ACTIVE').trim(),
          String(p.notes || '').trim(),
          p.createdAt || nowStr,
          nowStr
        ];
        if (pId && existingMap[pId]) {
          payerSheet.getRange(existingMap[pId], 1, 1, 9).setValues([rowData]);
          updated++;
        } else {
          payerSheet.appendRow(rowData);
          added++;
        }
      });

      return createJsonResponse({
        status: 'success',
        message: \`Payers synced: \${added} added, \${updated} updated\`
      });
    }

    if (data.action === 'fix_dates' || data.action === 'fix_all_dates') {
      const msg = fixAllDatesInAllSheets();
      return createJsonResponse({ status: 'success', message: msg });
    }

    // =========================================================================
    // ⚡ ACTION: UPDATE COLUMNS / SETUP SHEETS (Update ក្បាលតារាងឱ្យត្រូវជាមួយ UI)
    // =========================================================================
    if (data.action === 'update_columns' || data.action === 'setup_sheets') {
      const msg = setupAllSheets();
      return createJsonResponse({
        status: 'success',
        message: msg,
        headers: {
          batches: HEADERS_BATCHES,
          items: HEADERS_ITEMS,
          payers: HEADERS_PAYERS
        }
      });
    }

    // =========================================================================
    // 🗑️ ACTION: DELETE BATCH (លុបកញ្ចប់ Batch មួយចេញពី Batches & Collection_Items - Fast)
    // =========================================================================
    if (data.action === 'delete_batch') {
      const batchNumber = String(data.batchNumber || data.id || '').trim();
      let batchesDeleted = 0;
      let itemsDeleted = 0;

      if (batchNumber) {
        const batchSheet = ss.getSheetByName(CONFIG.SHEET_NAME_BATCHES);
        batchesDeleted = fastRemoveBatchFromSheet(batchSheet, batchNumber);

        const itemsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_ITEMS);
        itemsDeleted = fastRemoveBatchFromSheet(itemsSheet, batchNumber);
      }

      return createJsonResponse({
        status: 'success',
        message: \`Batch \${batchNumber} deleted (\${batchesDeleted} batch, \${itemsDeleted} items removed)\`
      });
    }

    // =========================================================================
    // 🗑️ ACTION: DELETE ALL BATCHES (លុបរាល់កញ្ចប់ទាំងអស់ចេញពី Batches & Collection_Items - Fast)
    // =========================================================================
    if (data.action === 'delete_all_batches') {
      const batchSheet = ss.getSheetByName(CONFIG.SHEET_NAME_BATCHES);
      const bCount = fastClearSheetData(batchSheet);

      const itemsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_ITEMS);
      const iCount = fastClearSheetData(itemsSheet);

      return createJsonResponse({
        status: 'success',
        message: \`All batches deleted from Google Sheets (\${bCount} batches, \${iCount} items removed)\`
      });
    }

    // =========================================================================
    // 🗑️ ACTION: DELETE MEDICINE BATCH (លុបកញ្ចប់ថ្នាំពេទ្យចេញពី Medicine_Batches & Medicine_Items)
    // =========================================================================
    if (data.action === 'delete_medicine_batch') {
      const batchNumber = String(data.batchNumber || data.id || '').trim();
      let batchesDeleted = 0;
      let itemsDeleted = 0;

      if (batchNumber) {
        const batchSheet = ss.getSheetByName(CONFIG.SHEET_NAME_MEDICINE_BATCHES || 'Medicine_Batches');
        if (batchSheet) batchesDeleted = fastRemoveBatchFromSheet(batchSheet, batchNumber);

        const itemsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_MEDICINE_ITEMS || 'Medicine_Items');
        if (itemsSheet) itemsDeleted = fastRemoveBatchFromSheet(itemsSheet, batchNumber);
      }

      return createJsonResponse({
        status: 'success',
        message: \`Medicine batch \${batchNumber} deleted (\${batchesDeleted} batch, \${itemsDeleted} items removed)\`
      });
    }

    // =========================================================================
    // 🗑️ ACTION: DELETE ALL MEDICINE BATCHES (លុបរាល់កញ្ចប់ថ្នាំពេទ្យទាំងអស់)
    // =========================================================================
    if (data.action === 'delete_all_medicine_batches') {
      const batchSheet = ss.getSheetByName(CONFIG.SHEET_NAME_MEDICINE_BATCHES || 'Medicine_Batches');
      const bCount = batchSheet ? fastClearSheetData(batchSheet) : 0;

      const itemsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_MEDICINE_ITEMS || 'Medicine_Items');
      const iCount = itemsSheet ? fastClearSheetData(itemsSheet) : 0;

      return createJsonResponse({
        status: 'success',
        message: \`All medicine batches deleted from Google Sheets (\${bCount} batches, \${iCount} items removed)\`
      });
    }

    // =========================================================================
    // ⚙️ ACTION: SAVE APP SETTINGS (រក្សាទុកការកំណត់ប្រព័ន្ធទៅក្នុង Tab "Settings")
    // =========================================================================
    if (data.action === 'save_settings') {
      const sheet = getOrCreateSettingsSheet(ss);
      const newSettings = data.settings || {};
      const count = saveSettingsToSheet(sheet, newSettings);
      return createJsonResponse({
        status: 'success',
        message: \`Saved \${count} settings to Google Sheets\`,
        data: parseSettingsFromSheet(sheet)
      });
    }

    // =========================================================================
    // ⚙️ ACTION: GET APP SETTINGS (ទាញយកការកំណត់ប្រព័ន្ធពី Tab "Settings")
    // =========================================================================
    if (data.action === 'get_settings') {
      const sheet = getOrCreateSettingsSheet(ss);
      const settings = parseSettingsFromSheet(sheet);
      return createJsonResponse({
        status: 'success',
        data: settings
      });
    }

    // =========================================================================
    // 🔒 ACTION: SEND TELEGRAM VIA BACKEND PROXY (លាក់ Bot Token មិនឱ្យលេចធ្លាយ)
    // =========================================================================
    if (data.action === 'send_telegram') {
      try {
        const text = String(data.text || '').trim();
        const chatId = String(data.chat_id || data.chatId || CONFIG.TELEGRAM_CHAT_ID || '').trim();
        const parseMode = data.parse_mode || 'HTML';
        const token = String(data.token || CONFIG.TELEGRAM_BOT_TOKEN || '').trim();

        if (!token) {
          return createJsonResponse({ status: 'error', message: 'Telegram Bot Token not configured on server' }, 400);
        }
        if (!chatId) {
          return createJsonResponse({ status: 'error', message: 'Telegram Chat ID is required' }, 400);
        }

        const telegramUrl = 'https://api.telegram.org/bot' + token + '/sendMessage';
        const payload = {
          chat_id: chatId,
          text: text,
          parse_mode: parseMode,
          disable_web_page_preview: true
        };

        const response = UrlFetchApp.fetch(telegramUrl, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });

        const resJson = JSON.parse(response.getContentText() || '{}');
        if (resJson.ok) {
          return createJsonResponse({ status: 'success', message: 'Telegram message sent successfully via backend' });
        } else {
          return createJsonResponse({ status: 'error', message: resJson.description || 'Telegram API rejected message' }, 400);
        }
      } catch (tgErr) {
        return createJsonResponse({ status: 'error', message: 'Proxy error: ' + tgErr.message }, 500);
      }
    }

    // =========================================================================
    // 🔍 ACTION: DETECT TELEGRAM CHAT ID VIA BACKEND PROXY
    // =========================================================================
    if (data.action === 'detect_telegram_chat_id') {
      try {
        const token = String(data.token || CONFIG.TELEGRAM_BOT_TOKEN || '').trim();
        if (!token) {
          return createJsonResponse({ status: 'error', message: 'Token required' }, 400);
        }

        const upRes = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getUpdates', { muteHttpExceptions: true });
        const upData = JSON.parse(upRes.getContentText() || '{}');

        if (upData.ok && Array.isArray(upData.result) && upData.result.length > 0) {
          const reversed = upData.result.slice().reverse();
          const found = reversed.find(u => u.message?.chat?.id || u.channel_post?.chat?.id || u.my_chat_member?.chat?.id);
          const chat = found?.message?.chat || found?.channel_post?.chat || found?.my_chat_member?.chat;

          if (chat && chat.id) {
            return createJsonResponse({
              status: 'success',
              chatId: String(chat.id),
              chatTitle: chat.first_name || chat.title || 'User'
            });
          }
        }

        return createJsonResponse({
          status: 'pending',
          message: 'No recent messages found. Please send /start to your bot in Telegram first!'
        });
      } catch (err) {
        return createJsonResponse({ status: 'error', message: err.message }, 500);
      }
    }

    // =========================================================================
    // 👥 ACTION: SAVE USER PERMISSION (រក្សាទុកសិទ្ធិអ្នកប្រើប្រាស់)
    // =========================================================================
    if (data.action === 'save_permission') {
      const sheet = getOrCreatePermissionsSheet(ss);
      const perm = data.permission || {};
      const email = String(perm.email || '').toLowerCase().trim();
      if (!email) {
        return createJsonResponse({ status: 'error', message: 'User email is required' }, 400);
      }

      const pId = String(perm.id || ('u-' + Date.now())).trim();
      const pName = String(perm.name || email.split('@')[0]).trim();
      const pRole = String(perm.role || 'VIEWER').trim();
      const pStatus = String(perm.status || 'ACTIVE').trim();
      const pCreatedAt = perm.createdAt || nowStr;
      const pLastLogin = perm.lastLogin || nowStr;

      const lastRow = sheet.getLastRow();
      let updatedRow = -1;
      if (lastRow > 1) {
        const emails = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
        for (let i = 0; i < emails.length; i++) {
          if (String(emails[i][0] || '').toLowerCase().trim() === email) {
            updatedRow = i + 2;
            sheet.getRange(updatedRow, 1, 1, HEADERS_PERMISSIONS.length).setValues([[
              pId, email, pName, pRole, pStatus, pCreatedAt, pLastLogin, nowStr
            ]]);
            break;
          }
        }
      }

      if (updatedRow === -1) {
        sheet.appendRow([pId, email, pName, pRole, pStatus, pCreatedAt, pLastLogin, nowStr]);
      }

      return createJsonResponse({
        status: 'success',
        message: \`User permission for \${email} saved to Google Sheets\`
      });
    }

    // =========================================================================
    // 👥 ACTION: DELETE USER PERMISSION (លុបសិទ្ធិអ្នកប្រើប្រាស់)
    // =========================================================================
    if (data.action === 'delete_permission') {
      const sheet = getOrCreatePermissionsSheet(ss);
      const email = String(data.email || '').toLowerCase().trim();
      if (email === 'rathykim34@gmail.com') {
        return createJsonResponse({ status: 'error', message: 'Cannot delete Master Admin' }, 403);
      }

      const lastRow = sheet.getLastRow();
      let deleted = false;
      if (lastRow > 1) {
        const emails = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
        for (let i = emails.length - 1; i >= 0; i--) {
          if (String(emails[i][0] || '').toLowerCase().trim() === email) {
            sheet.deleteRow(i + 2);
            deleted = true;
            break;
          }
        }
      }

      return createJsonResponse({
        status: deleted ? 'success' : 'not_found',
        message: deleted ? \`Permission for \${email} removed\` : 'User not found in sheet'
      });
    }

    // =========================================================================
    // 👥 ACTION: SYNC ALL PERMISSIONS (ធ្វើសមកាលកម្មសិទ្ធិអ្នកប្រើប្រាស់ទាំងអស់)
    // =========================================================================
    if (data.action === 'sync_permissions') {
      const sheet = getOrCreatePermissionsSheet(ss);
      const incoming = Array.isArray(data.permissions) ? data.permissions : [];
      let added = 0;
      let updated = 0;

      const lastRow = sheet.getLastRow();
      const existingMap = {};
      if (lastRow > 1) {
        const emails = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
        for (let i = 0; i < emails.length; i++) {
          const em = String(emails[i][0] || '').toLowerCase().trim();
          if (em) existingMap[em] = i + 2;
        }
      }

      incoming.forEach(p => {
        const email = String(p.email || '').toLowerCase().trim();
        if (!email) return;

        const row = [
          String(p.id || ('u-' + Date.now())).trim(),
          email,
          String(p.name || email.split('@')[0]).trim(),
          String(p.role || 'VIEWER').trim(),
          String(p.status || 'ACTIVE').trim(),
          p.createdAt || nowStr,
          p.lastLogin || '',
          nowStr
        ];

        if (existingMap[email]) {
          sheet.getRange(existingMap[email], 1, 1, HEADERS_PERMISSIONS.length).setValues([row]);
          updated++;
        } else {
          sheet.appendRow(row);
          added++;
        }
      });

      return createJsonResponse({
        status: 'success',
        message: \`Permissions synced: \${added} added, \${updated} updated\`
      });
    }

    // =========================================================================
    // 📜 ACTION: LOG USER ACTIVITY (កត់ត្រាសកម្មភាពអ្នកប្រើប្រាស់ ១ ភ្លាមៗ)
    // =========================================================================
    if (data.action === 'log_user_activity') {
      const sheet = getOrCreateLogsSheet(ss);
      const log = data.log || {};
      const logId = String(log.id || ('log-' + Date.now())).trim();
      const timeStr = log.timestamp ? (typeof log.timestamp === 'string' ? log.timestamp.replace('T', ' ').slice(0, 19) : nowStr) : nowStr;
      const op = String(log.operator || log.userName || '').trim();
      const em = String(log.operatorEmail || log.userEmail || '').trim();
      const role = String(log.userRole || log.targetUserRole || '').trim();
      const act = String(log.action || '').trim();
      const details = String(log.details || log.description || log.title || '').trim();
      const batchNum = String(log.batchNumber || '').trim();
      const usd = log.amountUSD !== undefined && log.amountUSD !== null ? Number(log.amountUSD) : '';
      const khr = log.amountKHR !== undefined && log.amountKHR !== null ? Number(log.amountKHR) : '';
      const itemsCount = log.itemsCount !== undefined && log.itemsCount !== null ? Number(log.itemsCount) : '';

      sheet.appendRow([
        logId,
        timeStr,
        op,
        em,
        role,
        act,
        details,
        batchNum,
        usd,
        khr,
        itemsCount,
        nowStr
      ]);

      return createJsonResponse({
        status: 'success',
        message: 'Activity log recorded in Google Sheets'
      });
    }

    // =========================================================================
    // 📜 ACTION: BULK SYNC USER LOGS (ធ្វើសមកាលកម្មកំណត់ត្រាសកម្មភាពទាំងអស់)
    // =========================================================================
    if (data.action === 'sync_user_logs') {
      const sheet = getOrCreateLogsSheet(ss);
      const incomingLogs = Array.isArray(data.logs) ? data.logs : [];
      let added = 0;

      const lastRow = sheet.getLastRow();
      const existingSet = new Set();
      if (lastRow > 1) {
        const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (let i = 0; i < ids.length; i++) {
          const id = String(ids[i][0] || '').trim();
          if (id) existingSet.add(id);
        }
      }

      const rowsToAdd = [];
      incomingLogs.forEach(log => {
        const logId = String(log.id || ('log-' + Date.now())).trim();
        if (existingSet.has(logId)) return;
        existingSet.add(logId);

        const timeStr = log.timestamp ? (typeof log.timestamp === 'string' ? log.timestamp.replace('T', ' ').slice(0, 19) : nowStr) : nowStr;
        const op = String(log.operator || log.userName || '').trim();
        const em = String(log.operatorEmail || log.userEmail || '').trim();
        const role = String(log.userRole || log.targetUserRole || '').trim();
        const act = String(log.action || '').trim();
        const details = String(log.details || log.description || log.title || '').trim();
        const batchNum = String(log.batchNumber || '').trim();
        const usd = log.amountUSD !== undefined && log.amountUSD !== null ? Number(log.amountUSD) : '';
        const khr = log.amountKHR !== undefined && log.amountKHR !== null ? Number(log.amountKHR) : '';
        const itemsCount = log.itemsCount !== undefined && log.itemsCount !== null ? Number(log.itemsCount) : '';

        rowsToAdd.push([
          logId,
          timeStr,
          op,
          em,
          role,
          act,
          details,
          batchNum,
          usd,
          khr,
          itemsCount,
          nowStr
        ]);
        added++;
      });

      if (rowsToAdd.length > 0) {
        const targetRow = sheet.getLastRow() + 1;
        sheet.getRange(targetRow, 1, rowsToAdd.length, HEADERS_LOGS.length).setValues(rowsToAdd);
      }

      return createJsonResponse({
        status: 'success',
        message: \`User activity logs synced: \${added} added to Google Sheets\`,
        data: { added }
      });
    }

    // =========================================================================
    // 📥 ACTION: SAVE BANK SLIP (រក្សាទុកបង្កាន់ដៃធនាគារ និងរូបភាពទៅ Google Drive)
    // =========================================================================
    if (data.action === 'save_bank_slip') {
      const slip = data.slip || {};
      const slipId = String(slip.id || ('SLIP-' + Date.now())).trim();
      const awbn = String(slip.awbn || '').trim();
      const category = String(slip.category || 'Buymed').trim();
      const receiverName = String(slip.receiverName || '').trim();
      const operator = String(slip.operator || data.user || 'Unknown').trim();
      const operatorEmail = String(slip.operatorEmail || '').trim();
      const createdAtStr = formatDateTimeSafely(slip.createdAt, nowStr);

      let driveUrl = '';
      let driveFileId = '';

      // 1. Upload Image to Google Drive if imageBase64 is provided
      const base64Data = slip.imageBase64 || data.imageBase64;
      if (base64Data && typeof DriveApp !== 'undefined') {
        try {
          const folderId = String(data.folderId || CONFIG.DRIVE_FOLDER_ID || '1nsWC8MZaGFz0HGOxwCqzKyRU0IB5kM5w').trim();
          let folder;
          try {
            folder = DriveApp.getFolderById(folderId);
          } catch (fErr) {
            console.warn('Could not open folder by ID ' + folderId + ', searching by name...');
            const folders = DriveApp.getFoldersByName('Bank_Slips');
            if (folders.hasNext()) {
              folder = folders.next();
            } else {
              folder = DriveApp.createFolder('Bank_Slips');
            }
          }

          // Clean base64 prefix if present (e.g. data:image/webp;base64,...)
          let cleanBase64 = base64Data;
          let contentType = 'image/webp';
          if (cleanBase64.indexOf(',') > -1) {
            const parts = cleanBase64.split(',');
            const match = parts[0].match(/:(.*?);/);
            if (match && match[1]) {
              contentType = match[1];
            }
            cleanBase64 = parts[1];
          }

          const decodedBlob = Utilities.newBlob(Utilities.base64Decode(cleanBase64), contentType);
          const fileName = slip.imageName || ('slip_' + (awbn || slipId) + '_' + Date.now() + '.webp');
          decodedBlob.setName(fileName);

          const file = folder.createFile(decodedBlob);
          file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          driveFileId = file.getId();
          driveUrl = file.getUrl();
        } catch (uploadErr) {
          console.error('Error saving image to Drive: ' + uploadErr.message);
        }
      }

      // 2. Append/Update row in Google Sheets (Bank_Slips)
      const slipSheet = getOrCreateBankSlipsSheet(ss);
      const rowData = [
        slipId,
        awbn,
        category,
        receiverName,
        operator,
        operatorEmail,
        driveUrl,
        driveFileId,
        createdAtStr
      ];

      // Check if slip already exists to prevent duplicates
      const lastRow = slipSheet.getLastRow();
      let rowUpdated = false;
      if (lastRow > 1) {
        const idCol = slipSheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (let r = 0; r < idCol.length; r++) {
          if (String(idCol[r][0]).trim() === slipId) {
            slipSheet.getRange(r + 2, 1, 1, rowData.length).setValues([rowData]);
            rowUpdated = true;
            break;
          }
        }
      }

      if (!rowUpdated) {
        slipSheet.appendRow(rowData);
      }

      return createJsonResponse({
        status: 'success',
        message: 'Bank slip saved successfully',
        fileId: driveFileId,
        fileUrl: driveUrl,
        driveUrl: driveUrl,
        slipId: slipId
      });
    }

    // =========================================================================
    // 📤 ACTION: GET BANK SLIPS (ទាញយកបញ្ជីបង្កាន់ដៃធនាគារ)
    // =========================================================================
    if (data.action === 'get_bank_slips') {
      const slipSheet = getOrCreateBankSlipsSheet(ss);
      const lastRow = slipSheet.getLastRow();
      const slips = [];

      if (lastRow > 1) {
        const values = slipSheet.getRange(2, 1, lastRow - 1, HEADERS_BANK_SLIPS.length).getValues();
        for (let i = 0; i < values.length; i++) {
          const row = values[i];
          if (!row[0] && !row[1]) continue;
          slips.push({
            id: String(row[0] || ''),
            awbn: String(row[1] || ''),
            category: String(row[2] || 'Buymed'),
            receiverName: String(row[3] || ''),
            operator: String(row[4] || ''),
            operatorEmail: String(row[5] || ''),
            driveViewUrl: String(row[6] || ''),
            driveFileId: String(row[7] || ''),
            createdAt: formatDateTimeSafely(row[8], nowStr)
          });
        }
      }

      return createJsonResponse({
        status: 'success',
        data: slips
      });
    }

    // =========================================================================
    // 🚚 ACTION: SAVE DISTRIBUTION REPORT (រក្សាទុក ឬកែប្រែរបាយការណ៍ចែកចាយ)
    // =========================================================================
    if (data.action === 'save_distribution_report') {
      const item = data.report || data.item || {};
      const id = String(item.id || ('dist-' + Date.now())).trim();
      const barcode = String(item.barcode || '').trim();
      const name = String(item.name || '').trim();
      const date = String(item.date || nowStr.slice(0, 10)).trim();
      const remarks = String(item.remarks || '').trim();
      const operatorEmail = String(item.operatorEmail || item.email || '').trim();
      const createdBy = String(item.createdBy || data.user || 'User').trim();
      const createdAt = formatDateTimeSafely(item.createdAt, nowStr);
      const updatedAt = formatDateTimeSafely(item.updatedAt, nowStr);

      const sheet = getOrCreateDistributionSheet(ss);
      const allRows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues() : [];
      let foundRow = -1;
      for (let i = 0; i < allRows.length; i++) {
        if (String(allRows[i][0]) === id || (barcode && String(allRows[i][1]).toUpperCase() === barcode.toUpperCase())) {
          foundRow = i + 2;
          break;
        }
      }

      const rowValues = [id, barcode, name, date, remarks, operatorEmail, createdBy, createdAt, updatedAt];

      if (foundRow > 0) {
        sheet.getRange(foundRow, 1, 1, HEADERS_DISTRIBUTION.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
      }
      sheet.getRange(sheet.getLastRow(), 2).setNumberFormat('@');

      return createJsonResponse({
        status: 'success',
        message: 'Distribution report saved to Google Sheets successfully',
        id: id,
        barcode: barcode
      });
    }

    // =========================================================================
    // 🗑️ ACTION: DELETE DISTRIBUTION REPORT
    // =========================================================================
    if (data.action === 'delete_distribution_report') {
      const id = String(data.id || '').trim();
      const barcode = String(data.barcode || '').trim();
      const sheet = getOrCreateDistributionSheet(ss);
      if (sheet.getLastRow() > 1) {
        const allRows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
        for (let i = allRows.length - 1; i >= 0; i--) {
          if ((id && String(allRows[i][0]) === id) || (barcode && String(allRows[i][1]).toUpperCase() === barcode.toUpperCase())) {
            sheet.deleteRow(i + 2);
            return createJsonResponse({ status: 'success', message: 'Deleted distribution report from Google Sheets' });
          }
        }
      }
      return createJsonResponse({ status: 'success', message: 'Record not found in Google Sheets or already deleted' });
    }

    // =========================================================================
    // 🔄 ACTION: SYNC ALL DISTRIBUTION REPORTS (Bulk Sync)
    // =========================================================================
    if (data.action === 'sync_distribution_reports') {
      const reports = Array.isArray(data.reports) ? data.reports : (Array.isArray(data.items) ? data.items : []);
      const sheet = getOrCreateDistributionSheet(ss);
      
      // Clear old rows below header
      if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS_DISTRIBUTION.length).clearContent();
      }

      if (reports.length > 0) {
        const rows = reports.map(r => [
          String(r.id || '').trim(),
          String(r.barcode || '').trim(),
          String(r.name || '').trim(),
          String(r.date || '').trim(),
          String(r.remarks || '').trim(),
          String(r.operatorEmail || '').trim(),
          String(r.createdBy || '').trim(),
          formatDateTimeSafely(r.createdAt, nowStr),
          formatDateTimeSafely(r.updatedAt, nowStr)
        ]);

        const targetRow = 2;
        if (targetRow + rows.length - 1 > sheet.getMaxRows()) {
          sheet.insertRowsAfter(sheet.getMaxRows(), rows.length + 10);
        }
        sheet.getRange(targetRow, 1, rows.length, HEADERS_DISTRIBUTION.length).setValues(rows);
        sheet.getRange(targetRow, 2, rows.length, 1).setNumberFormat('@');
      }

      for (let c = 1; c <= HEADERS_DISTRIBUTION.length; c++) {
        sheet.autoResizeColumn(c);
      }

      return createJsonResponse({
        status: 'success',
        message: 'Synced ' + reports.length + ' distribution reports to Google Sheets successfully',
        count: reports.length
      });
    }

    // =========================================================================
    // 📋 ACTION: GET DISTRIBUTION REPORTS
    // =========================================================================
    if (data.action === 'get_distribution_reports') {
      const sheet = getOrCreateDistributionSheet(ss);
      const lastRow = sheet.getLastRow();
      const list = [];
      if (lastRow > 1) {
        const values = sheet.getRange(2, 1, lastRow - 1, HEADERS_DISTRIBUTION.length).getValues();
        for (let i = 0; i < values.length; i++) {
          const row = values[i];
          if (!row[0] && !row[1]) continue;
          list.push({
            id: String(row[0] || ''),
            barcode: String(row[1] || ''),
            name: String(row[2] || ''),
            date: String(row[3] || ''),
            remarks: String(row[4] || ''),
            operatorEmail: String(row[5] || ''),
            createdBy: String(row[6] || ''),
            createdAt: formatDateTimeSafely(row[7], nowStr),
            updatedAt: formatDateTimeSafely(row[8], nowStr)
          });
        }
      }
      return createJsonResponse({
        status: 'success',
        data: list
      });
    }

    // =========================================================================
    // 📦 ACTION: SAVE WAREHOUSE SCAN (ScanIn, ScanOut, Out of Delivery)
    // =========================================================================
    if (data.action === 'save_warehouse_scan') {
      const item = data.item || data.scan || {};
      const scanType = String(item.scanType || 'SCAN_IN').toUpperCase();
      const id = String(item.id || ('wh-' + Date.now())).trim();
      const barcode = String(item.barcode || '').trim();
      const tracking = String(item.tracking || barcode).trim();
      const customerName = String(item.customerName || '').trim();
      const customerPhone = String(item.customerPhone || '').trim();
      const destination = String(item.destination || '').trim();
      const driverName = String(item.driverName || '').trim();
      const truckNo = String(item.truckNo || '').trim();
      const codAmount = item.codAmount !== undefined ? Number(item.codAmount) : '';
      const currency = String(item.currency || 'USD').trim();
      const location = String(item.location || '').trim();
      const riderName = String(item.riderName || '').trim();
      const riderPhone = String(item.riderPhone || '').trim();
      const deliveryZone = String(item.deliveryZone || '').trim();
      const outReason = String(item.outReason || '').trim();
      const remarks = String(item.remarks || '').trim();
      const date = String(item.date || nowStr.slice(0, 10)).trim();
      const operatorEmail = String(item.operatorEmail || item.email || '').trim();
      const createdBy = String(item.createdBy || data.user || 'User').trim();
      const createdAt = formatDateTimeSafely(item.createdAt, nowStr);

      let sheet, headers, rowValues;

      if (scanType === 'SCAN_IN') {
        sheet = getOrCreateScanInSheet(ss);
        headers = HEADERS_SCAN_IN;
        rowValues = [id, barcode, tracking, destination, driverName, truckNo, operatorEmail, createdBy, date, createdAt];
      } else if (scanType === 'SCAN_OUT') {
        sheet = getOrCreateScanOutSheet(ss);
        headers = HEADERS_SCAN_OUT;
        rowValues = [id, barcode, tracking, destination, driverName, truckNo, operatorEmail, createdBy, date, createdAt];
      } else {
        sheet = getOrCreateOutOfDeliverySheet(ss);
        headers = HEADERS_OUT_OF_DELIVERY;
        rowValues = [id, barcode, tracking, riderName, deliveryZone, codAmount, currency, operatorEmail, createdBy, date, createdAt, remarks];
      }

      // Check for existing row to update
      const allRows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues() : [];
      let foundRow = -1;
      for (let i = 0; i < allRows.length; i++) {
        if (String(allRows[i][0]) === id || (barcode && String(allRows[i][1]).toUpperCase() === barcode.toUpperCase())) {
          foundRow = i + 2;
          break;
        }
      }

      if (foundRow > 0) {
        sheet.getRange(foundRow, 1, 1, headers.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
      }
      sheet.getRange(sheet.getLastRow(), 2).setNumberFormat('@');

      return createJsonResponse({
        status: 'success',
        message: 'Warehouse scan (' + scanType + ') saved to Google Sheets successfully',
        id: id,
        barcode: barcode
      });
    }

    // =========================================================================
    // 🗑️ ACTION: DELETE WAREHOUSE SCAN
    // =========================================================================
    if (data.action === 'delete_warehouse_scan') {
      const id = String(data.id || '').trim();
      const barcode = String(data.barcode || '').trim();
      const scanType = String(data.scanType || '').toUpperCase();

      const sheetsToCheck = [];
      if (scanType === 'SCAN_IN') sheetsToCheck.push(getOrCreateScanInSheet(ss));
      else if (scanType === 'SCAN_OUT') sheetsToCheck.push(getOrCreateScanOutSheet(ss));
      else if (scanType === 'OUT_OF_DELIVERY') sheetsToCheck.push(getOrCreateOutOfDeliverySheet(ss));
      else {
        sheetsToCheck.push(getOrCreateScanInSheet(ss));
        sheetsToCheck.push(getOrCreateScanOutSheet(ss));
        sheetsToCheck.push(getOrCreateOutOfDeliverySheet(ss));
      }

      for (let s = 0; s < sheetsToCheck.length; s++) {
        const sheet = sheetsToCheck[s];
        if (sheet.getLastRow() > 1) {
          const allRows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
          for (let i = allRows.length - 1; i >= 0; i--) {
            if ((id && String(allRows[i][0]) === id) || (barcode && String(allRows[i][1]).toUpperCase() === barcode.toUpperCase())) {
              sheet.deleteRow(i + 2);
              return createJsonResponse({ status: 'success', message: 'Deleted warehouse scan from Google Sheets' });
            }
          }
        }
      }
      return createJsonResponse({ status: 'success', message: 'Record not found in Google Sheets or already deleted' });
    }

    // =========================================================================
    // 🔄 ACTION: SYNC ALL WAREHOUSE SCANS (Bulk Sync)
    // =========================================================================
    if (data.action === 'sync_warehouse_scans') {
      const items = Array.isArray(data.items) ? data.items : (Array.isArray(data.scans) ? data.scans : []);

      const scanInItems = items.filter(it => it.scanType === 'SCAN_IN');
      const scanOutItems = items.filter(it => it.scanType === 'SCAN_OUT');
      const outOfDeliveryItems = items.filter(it => it.scanType === 'OUT_OF_DELIVERY');

      // 1. Sync ScanIn
      const inSheet = getOrCreateScanInSheet(ss);
      if (inSheet.getLastRow() > 1) {
        inSheet.getRange(2, 1, inSheet.getLastRow() - 1, HEADERS_SCAN_IN.length).clearContent();
      }
      if (scanInItems.length > 0) {
        const rows = scanInItems.map(it => [
          String(it.id || '').trim(),
          String(it.barcode || '').trim(),
          String(it.tracking || it.barcode || '').trim(),
          String(it.destination || '').trim(),
          String(it.driverName || '').trim(),
          String(it.truckNo || '').trim(),
          String(it.operatorEmail || '').trim(),
          String(it.createdBy || '').trim(),
          String(it.date || '').trim(),
          formatDateTimeSafely(it.createdAt, nowStr)
        ]);
        if (rows.length + 1 > inSheet.getMaxRows()) inSheet.insertRowsAfter(inSheet.getMaxRows(), rows.length + 10);
        inSheet.getRange(2, 1, rows.length, HEADERS_SCAN_IN.length).setValues(rows);
        inSheet.getRange(2, 2, rows.length, 1).setNumberFormat('@');
      }

      // 2. Sync ScanOut
      const outSheet = getOrCreateScanOutSheet(ss);
      if (outSheet.getLastRow() > 1) {
        outSheet.getRange(2, 1, outSheet.getLastRow() - 1, HEADERS_SCAN_OUT.length).clearContent();
      }
      if (scanOutItems.length > 0) {
        const rows = scanOutItems.map(it => [
          String(it.id || '').trim(),
          String(it.barcode || '').trim(),
          String(it.tracking || it.barcode || '').trim(),
          String(it.destination || '').trim(),
          String(it.driverName || '').trim(),
          String(it.truckNo || '').trim(),
          String(it.operatorEmail || '').trim(),
          String(it.createdBy || '').trim(),
          String(it.date || '').trim(),
          formatDateTimeSafely(it.createdAt, nowStr)
        ]);
        if (rows.length + 1 > outSheet.getMaxRows()) outSheet.insertRowsAfter(outSheet.getMaxRows(), rows.length + 10);
        outSheet.getRange(2, 1, rows.length, HEADERS_SCAN_OUT.length).setValues(rows);
        outSheet.getRange(2, 2, rows.length, 1).setNumberFormat('@');
      }

      // 3. Sync Out of Delivery
      const oodSheet = getOrCreateOutOfDeliverySheet(ss);
      if (oodSheet.getLastRow() > 1) {
        oodSheet.getRange(2, 1, oodSheet.getLastRow() - 1, HEADERS_OUT_OF_DELIVERY.length).clearContent();
      }
      if (outOfDeliveryItems.length > 0) {
        const rows = outOfDeliveryItems.map(it => [
          String(it.id || '').trim(),
          String(it.barcode || '').trim(),
          String(it.tracking || it.barcode || '').trim(),
          String(it.riderName || '').trim(),
          String(it.deliveryZone || '').trim(),
          it.codAmount !== undefined ? it.codAmount : '',
          String(it.currency || 'USD').trim(),
          String(it.operatorEmail || '').trim(),
          String(it.createdBy || '').trim(),
          String(it.date || '').trim(),
          formatDateTimeSafely(it.createdAt, nowStr),
          String(it.remarks || '').trim()
        ]);
        if (rows.length + 1 > oodSheet.getMaxRows()) oodSheet.insertRowsAfter(oodSheet.getMaxRows(), rows.length + 10);
        oodSheet.getRange(2, 1, rows.length, HEADERS_OUT_OF_DELIVERY.length).setValues(rows);
        oodSheet.getRange(2, 2, rows.length, 1).setNumberFormat('@');
      }

      return createJsonResponse({
        status: 'success',
        message: 'Synced ' + items.length + ' warehouse scans to Google Sheets successfully (ScanIn: ' + scanInItems.length + ', ScanOut: ' + scanOutItems.length + ', OutOfDelivery: ' + outOfDeliveryItems.length + ')',
        count: items.length
      });
    }

    // =========================================================================
    // 📋 ACTION: GET WAREHOUSE SCANS
    // =========================================================================
    if (data.action === 'get_warehouse_scans') {
      const list = fetchAllWarehouseScansFromSheets(ss);
      return createJsonResponse({
        status: 'success',
        count: list.length,
        data: list
      });
    }

    // Fallback: Unknown action
    return createJsonResponse({
      status: 'error',
      message: 'Unknown action: ' + (data.action || 'empty')
    }, 400);

  } catch (error) {
    console.error('API Error: ' + error.stack);
    return createJsonResponse({
      status: 'error',
      message: error.message || 'Unknown server error occurred'
    }, 500);
  } finally {
    lock.releaseLock();
  }
}

// =========================================================================
// 🛠️ HELPER FUNCTIONS (មុខងារជំនួយ និងស្វ័យប្រវត្តបង្កើតតារាង)
// =========================================================================

/**
 * 🚀 ចុច RUN មុខងារនេះដើម្បីបង្កើត ឬ Update ក្បាលតារាង (Headers) ទាំងអស់ក្នុង Sheets ភ្លាមៗ
 */
function setupAllSheets() {
  const ss = getSpreadsheet();
  updateBatchesHeadersAndData();
  updateCollectionItemsHeaders();
  setupMedicineSheets(ss);
  getOrCreateBankSlipsSheet(ss);
  getOrCreateDistributionSheet(ss);
  getOrCreateScanInSheet(ss);
  getOrCreateScanOutSheet(ss);
  getOrCreateOutOfDeliverySheet(ss);
  fixAllDatesInAllSheets();
  const pSheet = getOrCreatePayersSheet(ss);
  removeDefaultPayers(pSheet);
  const sSheet = getOrCreateSettingsSheet(ss);
  seedDefaultSettings(sSheet);
  getOrCreateLogsSheet(ss);
  Logger.log('Setup successfully completed! Tabs created/updated: Batches, Collection_Items, Medicine_Batches, Medicine_Items, Bank_Slips, Distribution_Reports, Scan_In, Scan_Out, Out_Of_Delivery, Payers, Settings, User_Logs');
  return 'ជោគជ័យ! តារាងទាំងអស់ត្រូវបានបង្កើត និង Update រួចរាល់ (Batches, Collection_Items, Medicine_Batches, Medicine_Items, Bank_Slips, Distribution_Reports, Scan_In, Scan_Out, Out_Of_Delivery, Payers, Settings, User_Logs)!';
}

/**
 * Get active or configured spreadsheet safely
 */
function getSpreadsheet() {
  // 1. Try active spreadsheet first (works automatically when container-bound to the sheet)
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}

  // 2. Try configured spreadsheet ID
  if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID !== 'YOUR_GOOGLE_SPREADSHEET_ID_HERE') {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      if (ss) return ss;
    } catch (e) {
      console.warn('Could not open spreadsheet by ID: ' + e.message);
    }
  }

  // 3. Fallback to active spreadsheet
  const fallback = SpreadsheetApp.getActiveSpreadsheet();
  if (!fallback) {
    throw new Error('ពុំអាចស្វែងរក Google Spreadsheet បានទេ។ សូមពិនិត្យមើល SPREADSHEET_ID ក្នុង CONFIG!');
  }
  return fallback;
}

/**
 * Ensures 'Batches' sheet tab exists with appropriate headers
 */
function getOrCreateBatchesSheet(ss) {
  if (!ss) ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_BATCHES);
  if (sheet) {
    // 🛡️ Auto-healing: If Row 1 Col 7 is not 'Bank_USD', auto-fix the headers and existing rows!
    const col7 = String(sheet.getRange(1, 7).getValue() || '').trim();
    if (col7 !== 'Bank_USD') {
      fixBatchesAlignment(sheet);
    }
    return sheet;
  }

  sheet = ss.insertSheet(CONFIG.SHEET_NAME_BATCHES);
  sheet.appendRow(HEADERS_BATCHES);

  // Styling: Indigo header
  const headerRange = sheet.getRange(1, 1, 1, HEADERS_BATCHES.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4F46E5');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  sheet.getRange(2, 2, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  sheet.getRange(2, 13, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');

  for (let c = 1; c <= HEADERS_BATCHES.length; c++) {
    sheet.autoResizeColumn(c);
  }
  return sheet;
}

/**
 * Ensures 'Collection_Items' sheet tab exists with appropriate headers
 */
function getOrCreateItemsSheet(ss) {
  if (!ss) ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_ITEMS);
  if (sheet) return sheet;

  sheet = ss.insertSheet(CONFIG.SHEET_NAME_ITEMS);
  sheet.appendRow(HEADERS_ITEMS);

  // Styling: Blue header
  const headerRange = sheet.getRange(1, 1, 1, HEADERS_ITEMS.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#2563EB');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  sheet.getRange(2, 7, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  sheet.getRange(2, 8, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');

  for (let c = 1; c <= HEADERS_ITEMS.length; c++) {
    sheet.autoResizeColumn(c);
  }
  return sheet;
}

/**
 * ⚡ បង្កើត ឬត្រួតពិនិត្យតារាងទទួលលុយថ្នាំពេទ្យ (Medicine_Batches & Medicine_Items)
 */
function setupMedicineSheets(ss) {
  if (!ss) ss = getSpreadsheet();
  const mBatchSheet = getOrCreateMedicineBatchesSheet(ss);
  const mItemSheet = getOrCreateMedicineItemsSheet(ss);
  Logger.log('Medicine sheets verified/created: Medicine_Batches, Medicine_Items');
  return 'ជោគជ័យ! តារាងថ្នាំពេទ្យ (Medicine_Batches, Medicine_Items) ត្រូវបានបង្កើត និងរៀបចំរួចរាល់!';
}

/**
 * Ensures 'Medicine_Batches' sheet tab exists with appropriate headers
 */
function getOrCreateMedicineBatchesSheet(ss) {
  if (!ss) ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_MEDICINE_BATCHES || 'Medicine_Batches');
  if (sheet) return sheet;

  sheet = ss.insertSheet(CONFIG.SHEET_NAME_MEDICINE_BATCHES || 'Medicine_Batches');
  sheet.appendRow(HEADERS_BATCHES);

  // Styling: Emerald Green header for Medicine
  const headerRange = sheet.getRange(1, 1, 1, HEADERS_BATCHES.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#059669'); // Emerald Green
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  sheet.getRange(2, 2, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  sheet.getRange(2, 13, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');

  for (let c = 1; c <= HEADERS_BATCHES.length; c++) {
    sheet.autoResizeColumn(c);
  }
  return sheet;
}

/**
 * Ensures 'Medicine_Items' sheet tab exists with appropriate headers
 */
function getOrCreateMedicineItemsSheet(ss) {
  if (!ss) ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_MEDICINE_ITEMS || 'Medicine_Items');
  if (sheet) return sheet;

  sheet = ss.insertSheet(CONFIG.SHEET_NAME_MEDICINE_ITEMS || 'Medicine_Items');
  sheet.appendRow(HEADERS_ITEMS);

  // Styling: Teal header for Medicine Items
  const headerRange = sheet.getRange(1, 1, 1, HEADERS_ITEMS.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#0D9488'); // Teal
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  sheet.getRange(2, 7, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  sheet.getRange(2, 8, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');

  for (let c = 1; c <= HEADERS_ITEMS.length; c++) {
    sheet.autoResizeColumn(c);
  }
  return sheet;
}

/**
 * Ensures 'Payers' sheet tab exists with appropriate headers & initial seed data
 */
function getOrCreatePayersSheet(ss) {
  if (!ss) ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_PAYERS);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME_PAYERS);
    sheet.appendRow(HEADERS_PAYERS);

    // Styling: Emerald Green header
    const headerRange = sheet.getRange(1, 1, 1, HEADERS_PAYERS.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#059669');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setHorizontalAlignment('center');
    sheet.setFrozenRows(1);

    for (let c = 1; c <= HEADERS_PAYERS.length; c++) {
      sheet.autoResizeColumn(c);
    }
  }
  return sheet;
}

/**
 * Fast Batch Remover using In-Memory Filtering (100x faster than deleting row-by-row)
 */
function fastRemoveBatchFromSheet(sheet, batchNumber) {
  if (!sheet || sheet.getLastRow() <= 1 || !batchNumber) return 0;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const allData = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const remaining = [];
  let deletedCount = 0;
  const target = String(batchNumber).trim().toLowerCase();

  for (let i = 0; i < allData.length; i++) {
    const rowBatch = String(allData[i][0] || '').trim().toLowerCase();
    if (rowBatch === target) {
      deletedCount++;
    } else {
      remaining.push(allData[i]);
    }
  }

  if (deletedCount > 0) {
    sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
    if (remaining.length > 0) {
      sheet.getRange(2, 1, remaining.length, lastCol).setValues(remaining);
    }
  }
  return deletedCount;
}

/**
 * Fast Clear All Data Rows (Under 0.2s without deleting grid rows)
 */
function fastClearSheetData(sheet) {
  if (!sheet || sheet.getLastRow() <= 1) return 0;
  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const count = lastRow - 1;
  sheet.getRange(2, 1, count, lastCol).clearContent();
  return count;
}

/**
 * Helper to remove legacy default dummy payers from Google Sheets
 * Disabled to preserve real user records (PAY-001 to PAY-004)
 */
function removeDefaultPayers(sheet) {
  return 0;
}

/**
 * Robust Dynamic Parser for Payers Sheet:
 * Reads all rows and auto-maps columns and categories
 */
function parsePayersFromSheet(sheet) {
  if (!sheet) return [];
  const allData = sheet.getDataRange().getValues();
  if (!allData || allData.length <= 1) return [];

  const headerRow = allData[0].map(h => String(h || '').trim().toLowerCase());
  let colId = headerRow.findIndex(h => h === 'id' || h === 'no' || h === 'code' || h === 'ល.រ' || h === 'កូដ');
  let colName = headerRow.findIndex(h => h === 'name' || h.includes('ឈ្មោះ') || h.includes('payer') || h.includes('staff'));
  let colPhone = headerRow.findIndex(h => h.includes('phone') || h.includes('tel') || h.includes('ទូរស័ព្ទ') || h.includes('contact'));
  let colCat = headerRow.findIndex(h => h.includes('cat') || h.includes('role') || h.includes('type') || h.includes('តួនាទី') || h.includes('ប្រភេទ'));
  let colArea = headerRow.findIndex(h => h.includes('area') || h.includes('branch') || h.includes('dept') || h.includes('location') || h.includes('តំបន់') || h.includes('សាខា') || h.includes('ផ្នែក'));
  let colStatus = headerRow.findIndex(h => h.includes('stat') || h.includes('ស្ថានភាព'));
  let colNotes = headerRow.findIndex(h => h.includes('note') || h.includes('remark') || h.includes('ចំណាំ'));
  let colCreatedAt = headerRow.findIndex(h => h.includes('created') || h.includes('date'));
  let colUpdatedAt = headerRow.findIndex(h => h.includes('updated'));

  // Sensible default column positions if not identified by headers
  if (colId === -1) colId = 0;
  if (colName === -1) colName = 1;
  if (colPhone === -1) colPhone = 2;
  if (colCat === -1) colCat = 3;
  if (colArea === -1) colArea = 4;
  if (colStatus === -1) colStatus = 5;
  if (colNotes === -1) colNotes = 6;

  const records = [];

  for (let i = 1; i < allData.length; i++) {
    const row = allData[i];
    if (!row || row.length === 0) continue;

    let pId = colId >= 0 ? String(row[colId] || '').trim() : '';
    let name = colName >= 0 ? String(row[colName] || '').trim() : '';
    let phone = colPhone >= 0 ? String(row[colPhone] || '').trim() : '';
    let category = colCat >= 0 ? String(row[colCat] || '').trim() : '';
    let area = colArea >= 0 ? String(row[colArea] || '').trim() : '';
    let status = colStatus >= 0 ? String(row[colStatus] || '').trim() : 'ACTIVE';
    let notes = colNotes >= 0 ? String(row[colNotes] || '').trim() : '';

    // If name column is empty, find the first valid non-ID text column
    if (!name) {
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim();
        if (val && !val.startsWith('PAY-') && isNaN(Number(val)) && val.length > 2) {
          name = val;
          break;
        }
      }
    }

    if (!name && !pId) continue;

    // Filter out legacy dummy test payers
    const lowerName = name.toLowerCase();
    const cleanPhone = phone.replace(/[\\s-]/g, '');
    if (
      lowerName.includes('rider sokha') ||
      lowerName.includes('heng ly') ||
      lowerName.includes('tk branch') ||
      lowerName.includes('j&t express') ||
      lowerName.includes('វិបុល') ||
      lowerName.includes('វិចិត្រ') ||
      cleanPhone === '012345678' ||
      cleanPhone === '098765432' ||
      cleanPhone === '077112233' ||
      cleanPhone === '015999888'
    ) {
      continue;
    }

    if (!pId) pId = 'PAY-' + i;

    // Smart phone detection if phone is missing or located in another column
    if (!phone) {
      for (let c = 0; c < row.length; c++) {
        if (c === colName || c === colId) continue;
        const val = String(row[c] || '').trim();
        if (/^[+]?[(]?[0-9]{2,4}[)]?[-\\s.]?[0-9]{3}[-\\s.]?[0-9]{3,6}$/.test(val)) {
          phone = val;
          break;
        }
      }
    }

    // Smart category auto-detection
    const combined = (category + ' ' + area + ' ' + notes).toUpperCase();
    if (combined.includes('RIDER') || combined.includes('អ្នកដឹក') || combined.includes('ដឹកជញ្ជូន') || combined.includes('DELIVERY')) {
      category = 'RIDER';
    } else if (combined.includes('BRANCH') || combined.includes('សាខា') || combined.includes('OVERSEA') || combined.includes('OCS') || combined.includes('ផ្នែក')) {
      category = 'BRANCH';
    } else if (combined.includes('CUSTOMER') || combined.includes('អតិថិជន') || combined.includes('CLIENT')) {
      category = 'CUSTOMER';
    } else if (combined.includes('PARTNER') || combined.includes('ដៃគូ') || combined.includes('AGENT')) {
      category = 'PARTNER';
    } else if (!category || category === 'OTHER') {
      category = 'OTHER';
    }

    records.push({
      id: pId,
      name: name,
      phone: phone,
      category: category,
      area: area,
      status: (status && status.toUpperCase().includes('INACT')) ? 'INACTIVE' : 'ACTIVE',
      notes: notes,
      createdAt: colCreatedAt >= 0 && row[colCreatedAt] ? String(row[colCreatedAt]) : '',
      updatedAt: colUpdatedAt >= 0 && row[colUpdatedAt] ? String(row[colUpdatedAt]) : ''
    });
  }
  return records;
}

/**
 * Sends a rich batch summary notification to Telegram
 */
function sendTelegramBatchNotification(batch) {
  if (
    !CONFIG.TELEGRAM_BOT_TOKEN ||
    CONFIG.TELEGRAM_BOT_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN_HERE' ||
    !CONFIG.TELEGRAM_CHAT_ID ||
    CONFIG.TELEGRAM_CHAT_ID === 'YOUR_TELEGRAM_CHAT_ID_HERE'
  ) {
    return { success: false, reason: 'Telegram token/chatId not configured' };
  }

  const bankText = (Number(batch.bankUSD || 0) > 0 || Number(batch.bankKHR || 0) > 0)
    ? \`🏦 <b>ធនាគារ (Bank):</b> <code>$\${Number(batch.bankUSD || 0).toFixed(2)}</code> | <code>\${Number(batch.bankKHR || 0).toLocaleString()} ៛</code>\\n\`
    : '';

  const cashText = (Number(batch.cashUSD || 0) > 0 || Number(batch.cashKHR || 0) > 0)
    ? \`💵 <b>ប្រាក់សុទ្ធ (Cash):</b> <code>$\${Number(batch.cashUSD || 0).toFixed(2)}</code> | <code>\${Number(batch.cashKHR || 0).toLocaleString()} ៛</code>\\n\`
    : '';

  const messageText = \`📥 <b>ការទទួលប្រាក់សរុបថ្មី (Collection Batch)</b>\\n\` +
    \`━━━━━━━━━━━━━━━━━━━━\\n\` +
    \`📦 <b>កញ្ចប់លេខ:</b> <code>\${escapeHtml(batch.batchNumber)}</code>\\n\` +
    \`👤 <b>អ្នកកត់ត្រា:</b> \${escapeHtml(batch.operator)}\\n\` +
    \`🔢 <b>ចំនួនវិក្កយបត្រ:</b> <b>\${batch.totalItems}</b> ជួរ\\n\` +
    \`💵 <b>សរុប USD:</b> <code>$\${Number(batch.totalUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</code>\\n\` +
    \`៛ <b>សរុប KHR:</b> <code>\${Number(batch.totalKHR).toLocaleString('en-US')} ៛</code>\\n\` +
    bankText +
    cashText +
    (batch.reconciliation ? \`⚖️ <b>ផ្ទៀងផ្ទាត់:</b> <code>\${escapeHtml(batch.reconciliation)}</code>\\n\` : '') +
    (batch.notes ? \`📝 <b>ចំណាំ:</b> <i>\${escapeHtml(batch.notes)}</i>\\n\` : '') +
    \`⏰ <b>កាលបរិច្ឆេទ:</b> \${batch.createdAt}\\n\` +
    \`━━━━━━━━━━━━━━━━━━━━\\n\` +
    \`⚡ <i>Logged via Accounting SPA</i>\`;

  const telegramUrl = \`https://api.telegram.org/bot\${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage\`;
  const payload = {
    chat_id: CONFIG.TELEGRAM_CHAT_ID,
    text: messageText,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(telegramUrl, options);
  const resBody = JSON.parse(response.getContentText() || '{}');
  return { success: resBody.ok || false };
}

/**
 * =========================================================================
 * ⚙️ APP SETTINGS MANAGEMENT HELPERS (ការគ្រប់គ្រងការកំណត់ក្នុង Google Sheets)
 * =========================================================================
 */

/**
 * Ensures 'Settings' sheet tab exists with appropriate headers
 */
function getOrCreateSettingsSheet(ss) {
  if (!ss) ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_SETTINGS);
  if (sheet) {
    if (sheet.getLastRow() <= 1) {
      seedDefaultSettings(sheet);
    }
    return sheet;
  }

  sheet = ss.insertSheet(CONFIG.SHEET_NAME_SETTINGS);
  sheet.appendRow(HEADERS_SETTINGS);

  const headerRange = sheet.getRange(1, 1, 1, HEADERS_SETTINGS.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1E293B'); // Slate 800
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);

  seedDefaultSettings(sheet);

  for (let c = 1; c <= HEADERS_SETTINGS.length; c++) {
    sheet.autoResizeColumn(c);
  }
  return sheet;
}

/**
 * ⚡ បញ្ចូលទិន្នន័យដើម (Default Settings) ចូលក្នុង Tab "Settings" ដោយស្វ័យប្រវត្តិ
 */
function seedDefaultSettings(sheet) {
  if (!sheet) {
    const ss = getSpreadsheet();
    sheet = ss.getSheetByName(CONFIG.SHEET_NAME_SETTINGS);
    if (!sheet) sheet = getOrCreateSettingsSheet(ss);
  }

  const defaultRows = [
    ['spreadsheetId', CONFIG.SPREADSHEET_ID || '18prsAT5KK6EwPPJFEX7gcldPJPrvXGD0FJ7eE1ceI-k', 'Google Spreadsheet ID / Link'],
    ['driveFolderId', '1nsWC8MZaGFz0HGOxwCqzKyRU0IB5kM5w', 'Google Drive Folder ID'],
    ['exchangeRate', '4100', 'Exchange Rate (USD to KHR)'],
    ['googleClientId', '594375780266-3pu9am9mgelmd08f0fkc06n3m2gho1bn.apps.googleusercontent.com', 'Google OAuth Client ID'],
    ['allowedEmails', '', 'Allowed Whitelist Emails (Comma-separated)'],
    ['adminPin', '123456', 'Admin PIN Code'],
    ['telegramBotToken', '8859388289:AAHzv7moxa3Z6-u57sc4YReerEIx5CEAtqg', 'Telegram Bot #1 Token (Main / Reconciliation)'],
    ['telegramChatId', '924306058', 'Telegram Bot #1 Chat ID'],
    ['telegramPaymentBotToken', '8859388289:AAHzv7moxa3Z6-u57sc4YReerEIx5CEAtqg', 'Telegram Bot #2 Token (Payment Collection Alert)'],
    ['telegramPaymentChatId', '924306058', 'Telegram Bot #2 Chat ID'],
    ['telegramLogBotToken', '', 'Telegram Bot #3 Token (User Activity Logs Alert)'],
    ['telegramLogChatId', '', 'Telegram Bot #3 Chat ID (User Activity Logs Alert)'],
    ['telegramLogAlertsEnabled', 'true', 'Enable/Disable User Activity Logs Telegram Alert'],
    ['dataBmSheetUrl', '', 'Data BM Google Spreadsheet URL / ID'],
    ['dataBmSheetName', '', 'Data BM Sheet / Tab Name'],
    ['sokimexSheetUrl', '', 'SOKIMEX POSTPAID Google Spreadsheet URL / ID'],
    ['sokimexSheetName', '', 'SOKIMEX POSTPAID Sheet / Tab Name']
  ];

  const lastRow = sheet.getLastRow();
  const existingKeys = new Set();
  if (lastRow > 1) {
    const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < keys.length; i++) {
      const k = String(keys[i][0] || '').trim();
      if (k) existingKeys.add(k);
    }
  }

  const now = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  const rowsToAdd = [];
  defaultRows.forEach(item => {
    if (!existingKeys.has(item[0])) {
      rowsToAdd.push([item[0], item[1], item[2], now]);
    }
  });

  if (rowsToAdd.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, 4).setValues(rowsToAdd);
    for (let c = 1; c <= 4; c++) sheet.autoResizeColumn(c);
  }

  Logger.log('Seed Settings complete. Added: ' + rowsToAdd.length + ' rows.');
  return 'បានបញ្ចូលទិន្នន័យ Settings ចំនួន ' + rowsToAdd.length + ' ជួរជោគជ័យ!';
}

/**
 * Read App Settings from Google Sheets "Settings" tab
 */
function parseSettingsFromSheet(sheet) {
  if (!sheet) return {};
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return {};

  const allData = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const settings = {};
  for (let i = 0; i < allData.length; i++) {
    const key = String(allData[i][0] || '').trim();
    const val = allData[i][1];
    if (key) {
      settings[key] = val !== undefined && val !== null ? String(val).trim() : '';
    }
  }
  return settings;
}

/**
 * Save App Settings to Google Sheets "Settings" tab
 */
function saveSettingsToSheet(sheet, newSettings) {
  if (!sheet || !newSettings) return 0;
  const lastRow = sheet.getLastRow();
  const keyToRowIndex = {};

  if (lastRow > 1) {
    const existingKeys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < existingKeys.length; i++) {
      const k = String(existingKeys[i][0] || '').trim();
      if (k) {
        keyToRowIndex[k] = i + 2; // 1-indexed sheet row
      }
    }
  }

  const now = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  const DESCRIPTIONS = {
    spreadsheetId: 'Google Spreadsheet ID / Link',
    driveFolderId: 'Google Drive Folder ID',
    exchangeRate: 'Exchange Rate (USD to KHR)',
    googleClientId: 'Google OAuth Client ID',
    allowedEmails: 'Allowed Whitelist Emails (Comma-separated)',
    adminPin: 'Admin PIN Code',
    telegramBotToken: 'Telegram Bot #1 Token (Main / Reconciliation)',
    telegramChatId: 'Telegram Bot #1 Chat ID',
    telegramPaymentBotToken: 'Telegram Bot #2 Token (Payment Collection Alert)',
    telegramPaymentChatId: 'Telegram Bot #2 Chat ID',
    telegramLogBotToken: 'Telegram Bot #3 Token (User Activity Logs Alert)',
    telegramLogChatId: 'Telegram Bot #3 Chat ID (User Activity Logs Alert)',
    telegramLogAlertsEnabled: 'Enable/Disable User Activity Logs Telegram Alert',
    dataBmSheetUrl: 'Data BM Google Spreadsheet URL / ID',
    dataBmSheetName: 'Data BM Sheet / Tab Name',
    sokimexSheetUrl: 'SOKIMEX POSTPAID Google Spreadsheet URL / ID',
    sokimexSheetName: 'SOKIMEX POSTPAID Sheet / Tab Name'
  };

  let savedCount = 0;
  for (const key in newSettings) {
    if (key === 'darkMode' || key === 'demoMode' || key === 'webAppUrl') continue;
    const val = newSettings[key] !== undefined && newSettings[key] !== null ? String(newSettings[key]).trim() : '';
    const desc = DESCRIPTIONS[key] || '';

    if (keyToRowIndex[key]) {
      const rowNum = keyToRowIndex[key];
      sheet.getRange(rowNum, 2, 1, 3).setValues([[val, desc, now]]);
      savedCount++;
    } else {
      sheet.appendRow([key, val, desc, now]);
      savedCount++;
    }
  }
  return savedCount;
}

/**
 * Helper to escape HTML characters
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Helper to build JSON responses with CORS safety
 */
function createJsonResponse(data, statusCode) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * =========================================================================
 * 👥 USER PERMISSIONS MANAGEMENT HELPERS (ការគ្រប់គ្រងសិទ្ធិក្នុង Google Sheets)
 * =========================================================================
 */

/**
 * Ensures 'Permissions' sheet tab exists with appropriate headers and Master Admin seeded
 */
function getOrCreatePermissionsSheet(ss) {
  if (!ss) ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_PERMISSIONS);
  if (sheet) {
    if (sheet.getLastRow() <= 1) {
      seedDefaultPermissions(sheet);
    }
    return sheet;
  }

  sheet = ss.insertSheet(CONFIG.SHEET_NAME_PERMISSIONS);
  sheet.appendRow(HEADERS_PERMISSIONS);

  const headerRange = sheet.getRange(1, 1, 1, HEADERS_PERMISSIONS.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#7C3AED'); // Violet 600
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);

  seedDefaultPermissions(sheet);

  for (let c = 1; c <= HEADERS_PERMISSIONS.length; c++) {
    sheet.autoResizeColumn(c);
  }
  return sheet;
}

/**
 * Seed Master Admin into Permissions sheet
 */
function seedDefaultPermissions(sheet) {
  const now = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  sheet.appendRow([
    'u-master-admin',
    'rathykim34@gmail.com',
    'Rathy Kim',
    'ADMIN',
    'ACTIVE',
    now,
    now,
    now
  ]);
}

/**
 * Parses user permissions from 'Permissions' sheet
 */
function parsePermissionsFromSheet(sheet) {
  if (!sheet) return [];
  const allData = sheet.getDataRange().getValues();
  if (!allData || allData.length <= 1) return [];

  const list = [];
  for (let i = 1; i < allData.length; i++) {
    const row = allData[i];
    const email = String(row[1] || '').toLowerCase().trim();
    if (!email) continue;

    const isMaster = (email === 'rathykim34@gmail.com');
    list.push({
      id: String(row[0] || ('u-' + i)).trim(),
      email: email,
      name: String(row[2] || email.split('@')[0]).trim(),
      role: isMaster ? 'ADMIN' : String(row[3] || 'VIEWER').trim(),
      status: isMaster ? 'ACTIVE' : (String(row[4] || 'ACTIVE').toUpperCase().includes('SUSPEND') ? 'SUSPENDED' : 'ACTIVE'),
      createdAt: row[5] ? (row[5] instanceof Date ? Utilities.formatDate(row[5], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(row[5])) : '',
      lastLogin: row[6] ? (row[6] instanceof Date ? Utilities.formatDate(row[6], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(row[6])) : ''
    });
  }
  return list;
}

/**
 * Ensures 'User_Logs' sheet tab exists with appropriate headers
 */
function getOrCreateLogsSheet(ss) {
  if (!ss) ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_LOGS || 'User_Logs');
  if (sheet) return sheet;

  sheet = ss.insertSheet(CONFIG.SHEET_NAME_LOGS || 'User_Logs');
  sheet.appendRow(HEADERS_LOGS);

  // Styling: Royal Blue / Indigo Header with bold white text
  const headerRange = sheet.getRange(1, 1, 1, HEADERS_LOGS.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#2563EB');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);

  for (let c = 1; c <= HEADERS_LOGS.length; c++) {
    sheet.autoResizeColumn(c);
  }
  return sheet;
}

/**
 * 🧾 បង្កើត ឬ Update ក្បាលតារាង Bank_Slips (9 Columns) ឱ្យត្រូវតាមទម្រង់ថ្មី
 */
function getOrCreateBankSlipsSheet(ss) {
  if (!ss) ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_BANK_SLIPS || 'Bank_Slips');
  if (sheet) {
    // Check if headers match HEADERS_BANK_SLIPS; if not, update header row
    const curHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    const isMatched = HEADERS_BANK_SLIPS.every((h, i) => curHeaders[i] === h);
    if (!isMatched) {
      sheet.getRange(1, 1, 1, HEADERS_BANK_SLIPS.length).setValues([HEADERS_BANK_SLIPS]);
      const headerRange = sheet.getRange(1, 1, 1, HEADERS_BANK_SLIPS.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#4F46E5');
      headerRange.setFontColor('#FFFFFF');
      headerRange.setHorizontalAlignment('center');
      sheet.setFrozenRows(1);
    }
    return sheet;
  }

  sheet = ss.insertSheet(CONFIG.SHEET_NAME_BANK_SLIPS || 'Bank_Slips');
  sheet.appendRow(HEADERS_BANK_SLIPS);

  // Styling: Indigo header
  const headerRange = sheet.getRange(1, 1, 1, HEADERS_BANK_SLIPS.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4F46E5');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);

  sheet.getRange(2, 2, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  sheet.getRange(2, 9, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');

  for (let c = 1; c <= HEADERS_BANK_SLIPS.length; c++) {
    sheet.autoResizeColumn(c);
  }
  return sheet;
}

/**
 * 🚚 បង្កើត ឬ Update ក្បាលតារាង Distribution_Reports (9 Columns)
 */
function getOrCreateDistributionSheet(ss) {
  if (!ss) ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_DISTRIBUTION || 'Distribution_Reports');
  if (sheet) {
    const curHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    const isMatched = HEADERS_DISTRIBUTION.every((h, i) => curHeaders[i] === h);
    if (!isMatched) {
      sheet.getRange(1, 1, 1, HEADERS_DISTRIBUTION.length).setValues([HEADERS_DISTRIBUTION]);
      const headerRange = sheet.getRange(1, 1, 1, HEADERS_DISTRIBUTION.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#EA580C'); // Orange 600
      headerRange.setFontColor('#FFFFFF');
      headerRange.setHorizontalAlignment('center');
      sheet.setFrozenRows(1);
    }
    return sheet;
  }

  sheet = ss.insertSheet(CONFIG.SHEET_NAME_DISTRIBUTION || 'Distribution_Reports');
  sheet.appendRow(HEADERS_DISTRIBUTION);

  // Styling: Orange header
  const headerRange = sheet.getRange(1, 1, 1, HEADERS_DISTRIBUTION.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#EA580C');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);

  // Set Barcode, Date, Created_At as text format
  sheet.getRange(2, 2, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  sheet.getRange(2, 4, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  sheet.getRange(2, 8, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  sheet.getRange(2, 9, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');

  for (let c = 1; c <= HEADERS_DISTRIBUTION.length; c++) {
    sheet.autoResizeColumn(c);
  }
  return sheet;
}

/**
  * 📥 បង្កើត ឬ Update ក្បាលតារាង Scan_In (10 Columns)
  */
function getOrCreateScanInSheet(ss) {
  if (!ss) ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_SCAN_IN || 'Scan_In');
  if (sheet) {
    const curHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    const isMatched = HEADERS_SCAN_IN.every((h, i) => curHeaders[i] === h);
    if (!isMatched) {
      sheet.getRange(1, 1, 1, HEADERS_SCAN_IN.length).setValues([HEADERS_SCAN_IN]);
      const headerRange = sheet.getRange(1, 1, 1, HEADERS_SCAN_IN.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#059669'); // Emerald 600
      headerRange.setFontColor('#FFFFFF');
      headerRange.setHorizontalAlignment('center');
      sheet.setFrozenRows(1);
    }
    return sheet;
  }

  sheet = ss.insertSheet(CONFIG.SHEET_NAME_SCAN_IN || 'Scan_In');
  sheet.appendRow(HEADERS_SCAN_IN);

  const headerRange = sheet.getRange(1, 1, 1, HEADERS_SCAN_IN.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#059669');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);

  sheet.getRange(2, 2, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  sheet.getRange(2, 3, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  sheet.getRange(2, 9, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  sheet.getRange(2, 10, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');

  for (let c = 1; c <= HEADERS_SCAN_IN.length; c++) {
    sheet.autoResizeColumn(c);
  }
  return sheet;
}

/**
  * 📤 បង្កើត ឬ Update ក្បាលតារាង Scan_Out (10 Columns)
  */
function getOrCreateScanOutSheet(ss) {
  if (!ss) ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_SCAN_OUT || 'Scan_Out');
  if (sheet) {
    const curHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    const isMatched = HEADERS_SCAN_OUT.every((h, i) => curHeaders[i] === h);
    if (!isMatched) {
      sheet.getRange(1, 1, 1, HEADERS_SCAN_OUT.length).setValues([HEADERS_SCAN_OUT]);
      const headerRange = sheet.getRange(1, 1, 1, HEADERS_SCAN_OUT.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#D97706'); // Amber 600
      headerRange.setFontColor('#FFFFFF');
      headerRange.setHorizontalAlignment('center');
      sheet.setFrozenRows(1);
    }
    return sheet;
  }

  sheet = ss.insertSheet(CONFIG.SHEET_NAME_SCAN_OUT || 'Scan_Out');
  sheet.appendRow(HEADERS_SCAN_OUT);

  const headerRange = sheet.getRange(1, 1, 1, HEADERS_SCAN_OUT.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#D97706');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);

  sheet.getRange(2, 2, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  sheet.getRange(2, 3, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  sheet.getRange(2, 9, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  sheet.getRange(2, 10, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');

  for (let c = 1; c <= HEADERS_SCAN_OUT.length; c++) {
    sheet.autoResizeColumn(c);
  }
  return sheet;
}

/**
  * 🚚 បង្កើត ឬ Update ក្បាលតារាង Out_Of_Delivery (12 Columns)
  */
function getOrCreateOutOfDeliverySheet(ss) {
  if (!ss) ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_OUT_OF_DELIVERY || 'Out_Of_Delivery');
  if (sheet) {
    const curHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    const isMatched = HEADERS_OUT_OF_DELIVERY.every((h, i) => curHeaders[i] === h);
    if (!isMatched) {
      sheet.getRange(1, 1, 1, HEADERS_OUT_OF_DELIVERY.length).setValues([HEADERS_OUT_OF_DELIVERY]);
      const headerRange = sheet.getRange(1, 1, 1, HEADERS_OUT_OF_DELIVERY.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#2563EB'); // Blue 600
      headerRange.setFontColor('#FFFFFF');
      headerRange.setHorizontalAlignment('center');
      sheet.setFrozenRows(1);
    }
    return sheet;
  }

  sheet = ss.insertSheet(CONFIG.SHEET_NAME_OUT_OF_DELIVERY || 'Out_Of_Delivery');
  sheet.appendRow(HEADERS_OUT_OF_DELIVERY);

  const headerRange = sheet.getRange(1, 1, 1, HEADERS_OUT_OF_DELIVERY.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#2563EB');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);

  sheet.getRange(2, 2, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  sheet.getRange(2, 3, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  sheet.getRange(2, 10, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  sheet.getRange(2, 11, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');

  for (let c = 1; c <= HEADERS_OUT_OF_DELIVERY.length; c++) {
    sheet.autoResizeColumn(c);
  }
  return sheet;
}

/**
 * 📦 ទាញយកកំណត់ត្រា Warehouse ទាំងអស់ពី Sheets ទាំង ៣
 */
function fetchAllWarehouseScansFromSheets(ss) {
  if (!ss) ss = getSpreadsheet();
  const list = [];

  // 1. ScanIn
  const inSheet = getOrCreateScanInSheet(ss);
  if (inSheet.getLastRow() > 1) {
    const vals = inSheet.getRange(2, 1, inSheet.getLastRow() - 1, HEADERS_SCAN_IN.length).getValues();
    for (let i = 0; i < vals.length; i++) {
      const r = vals[i];
      if (!r[0] && !r[1]) continue;
      list.push({
        id: String(r[0] || ''),
        scanType: 'SCAN_IN',
        barcode: String(r[1] || ''),
        tracking: String(r[2] || ''),
        destination: String(r[3] || ''),
        driverName: String(r[4] || ''),
        truckNo: String(r[5] || ''),
        operatorEmail: String(r[6] || ''),
        createdBy: String(r[7] || ''),
        date: String(r[8] || ''),
        createdAt: formatDateTimeSafely(r[9])
      });
    }
  }

  // 2. ScanOut
  const outSheet = getOrCreateScanOutSheet(ss);
  if (outSheet.getLastRow() > 1) {
    const vals = outSheet.getRange(2, 1, outSheet.getLastRow() - 1, HEADERS_SCAN_OUT.length).getValues();
    for (let i = 0; i < vals.length; i++) {
      const r = vals[i];
      if (!r[0] && !r[1]) continue;
      list.push({
        id: String(r[0] || ''),
        scanType: 'SCAN_OUT',
        barcode: String(r[1] || ''),
        tracking: String(r[2] || ''),
        destination: String(r[3] || ''),
        driverName: String(r[4] || ''),
        truckNo: String(r[5] || ''),
        operatorEmail: String(r[6] || ''),
        createdBy: String(r[7] || ''),
        date: String(r[8] || ''),
        createdAt: formatDateTimeSafely(r[9])
      });
    }
  }

  // 3. Out of Delivery
  const oodSheet = getOrCreateOutOfDeliverySheet(ss);
  if (oodSheet.getLastRow() > 1) {
    const vals = oodSheet.getRange(2, 1, oodSheet.getLastRow() - 1, HEADERS_OUT_OF_DELIVERY.length).getValues();
    for (let i = 0; i < vals.length; i++) {
      const r = vals[i];
      if (!r[0] && !r[1]) continue;
      list.push({
        id: String(r[0] || ''),
        scanType: 'OUT_OF_DELIVERY',
        barcode: String(r[1] || ''),
        tracking: String(r[2] || ''),
        riderName: String(r[3] || ''),
        deliveryZone: String(r[4] || ''),
        codAmount: r[5] !== '' ? parseFloat(r[5]) : undefined,
        currency: String(r[6] || 'USD'),
        operatorEmail: String(r[7] || ''),
        createdBy: String(r[8] || ''),
        date: String(r[9] || ''),
        createdAt: formatDateTimeSafely(r[10]),
        remarks: String(r[11] || '')
      });
    }
  }

  return list;
}

/**
 * ⚡ បង្កើត Menu លើ Google Sheets ដោយស្វ័យប្រវត្តិ
 * នៅពេល User បើក Google Sheets នឹងមាន Menu ឈ្មោះ "⚙️ គណនេយ្យ (Accounting)"
 * ដែលអាចចុច Update Columns ភ្លាមៗដោយមិនចាំបាច់ចូលកូដ
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('⚙️ គណនេយ្យ (Accounting)')
      .addItem('⚡ Update Columns ទាំងអស់ (All Sheets)', 'setupAllSheets')
      .addItem('📥 បង្កើត/ត្រួតពិនិត្យតារាង ScanIn (ចូលឃ្លាំង)', 'getOrCreateScanInSheet')
      .addItem('📤 បង្កើត/ត្រួតពិនិត្យតារាង ScanOut (ចេញពីឃ្លាំង)', 'getOrCreateScanOutSheet')
      .addItem('🚚 បង្កើត/ត្រួតពិនិត្យតារាង Out of Delivery (ចេញចែកចាយ)', 'getOrCreateOutOfDeliverySheet')
      .addItem('🚚 បង្កើត/ត្រួតពិនិត្យតារាងរបាយការណ៍ចែកចាយ (Distribution Reports)', 'getOrCreateDistributionSheet')
      .addItem('🧾 បង្កើត/ត្រួតពិនិត្យតារាង Bank Slips', 'getOrCreateBankSlipsSheet')
      .addItem('🕒 ជួសជុល Format កាលបរិច្ឆេទ (Fix Date & Timezone)', 'fixAllDatesInAllSheets')
      .addItem('💊 បង្កើត/ត្រួតពិនិត្យតារាងថ្នាំពេទ្យ (Setup Medicine Sheets)', 'setupMedicineSheets')
      .addItem('⚙️ បញ្ចូលទិន្នន័យដើម Settings (Seed Settings)', 'seedDefaultSettings')
      .addItem('🔄 ជួសជុលតារាង Batches (Fix Batches)', 'updateBatchesHeadersAndData')
      .addItem('🔄 ជួសជុលតារាងទំនិញ (Fix Items)', 'updateCollectionItemsHeaders')
      .addItem('📜 បង្កើត/ត្រួតពិនិត្យតារាង User Logs (Setup Logs)', 'getOrCreateLogsSheet')
      .addItem('🚀 Setup / បង្កើតតារាងទាំងអស់', 'setupAllSheets')
      .addToUi();
  } catch (e) {
    Logger.log('Could not create menu: ' + e.message);
  }
}

`;

const STANDALONE_HTML_PREVIEW = `<!-- Standalone index.html for Single Page Vanilla JS + Tailwind CSS -->
<!-- Includes client-side Canvas WebP compression, Form & Local Storage -->
<!-- Ready to host on GitHub Pages, Cloudflare Pages, or open locally -->
(Refer to the standalone-index.html file in the project root, or click "Download standalone-index.html" below)`;

export const CodeViewerModal: React.FC<CodeViewerModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'CODE_GS' | 'STANDALONE_HTML'>('CODE_GS');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentContent = activeTab === 'CODE_GS' ? CODE_GS_CONTENT : STANDALONE_HTML_PREVIEW;

  const handleCopy = () => {
    navigator.clipboard.writeText(CODE_GS_CONTENT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 max-w-4xl w-full rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Source Code Artifacts
              </h3>
              <p className="text-[11px] text-slate-500">
                Production-ready Google Apps Script backend and Standalone Frontend SPA
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 flex items-center gap-1.5 transition"
            >
              {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy Code'}</span>
            </button>

            <button
              onClick={() => handleDownload(
                activeTab === 'CODE_GS' ? 'Code.gs' : 'standalone-index.html',
                activeTab === 'CODE_GS' ? CODE_GS_CONTENT : currentContent
              )}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download File</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold ml-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950/40 p-1.5 gap-1">
          <button
            onClick={() => setActiveTab('CODE_GS')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'CODE_GS'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>Code.gs (Google Apps Script Backend)</span>
          </button>

          <button
            onClick={() => setActiveTab('STANDALONE_HTML')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'STANDALONE_HTML'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Code2 className="w-4 h-4" />
            <span>standalone-index.html (Vanilla JS Frontend)</span>
          </button>
        </div>

        {/* Code Content View */}
        <div className="flex-1 overflow-auto p-4 bg-slate-950 font-mono text-[11px] leading-relaxed text-slate-300">
          <pre className="whitespace-pre font-mono">
            {activeTab === 'CODE_GS' ? CODE_GS_CONTENT : STANDALONE_HTML_PREVIEW}
          </pre>
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 transition"
          >
            Close Viewer
          </button>
        </div>

      </div>
    </div>
  );
};
