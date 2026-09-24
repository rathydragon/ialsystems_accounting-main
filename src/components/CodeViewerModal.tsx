import React, { useState } from 'react';
import { Copy, Check, Download, Code2, FileCode, CheckCircle2 } from 'lucide-react';

interface CodeViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CODE_GS_CONTENT = `/**
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

const CONFIG = {
  SPREADSHEET_ID: '18prsAT5KK6EwPPJFEX7gcldPJPrvXGD0FJ7eE1ceI-k',
  SHEET_NAME_DATA: 'Data',
  SHEET_NAME_BATCHES: 'Batches',
  SHEET_NAME_ITEMS: 'Collection_Items',
  SHEET_NAME_PAYERS: 'Payers',
  SHEET_NAME_SETTINGS: 'Settings',
  SHEET_NAME_LOGS: 'User_Logs',
  TELEGRAM_BOT_TOKEN: '8859388289:AAHzv7moxa3Z6-u57sc4YReerEIx5CEAtqg',
  TELEGRAM_CHAT_ID: '924306058',
  TIMEZONE: 'Asia/Phnom_Penh'
};

const HEADERS_BATCHES = [
  'Batch_ID', 'Date', 'Operator', 'Total_Items', 'Total_USD', 'Total_KHR', 'Bank_USD', 'Bank_KHR', 'Cash_USD', 'Cash_KHR', 'Reconciliation', 'Notes', 'Created_At'
];

const HEADERS_ITEMS = [
  'Batch_ID', 'Tracking', 'Customer_Name', 'PAYMENT', 'USD', 'KHM', 'DATE', 'Created_At'
];

const HEADERS_SETTINGS = [
  'Setting_Key', 'Setting_Value', 'Description', 'Updated_At'
];

const HEADERS_LOGS = [
  'Log_ID', 'Timestamp', 'Operator', 'Email', 'Role', 'Action', 'Details', 'Batch_Number', 'Amount_USD', 'Amount_KHR', 'Items_Count', 'Created_At'
];

function updateBatchesHeadersAndData() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_BATCHES);
  if (!sheet) {
    sheet = getOrCreateBatchesSheet(ss);
    return 'បានបង្កើតតារាង Batches ថ្មីជាមួយ Headers ត្រឹមត្រូវ!';
  }
  const fixMsg = fixBatchesAlignment(sheet);
  sheet.getRange(1, 1, 1, HEADERS_BATCHES.length).setValues([HEADERS_BATCHES]);
  const range = sheet.getRange(1, 1, 1, HEADERS_BATCHES.length);
  range.setFontWeight('bold');
  range.setBackground('#4F46E5');
  range.setFontColor('#FFFFFF');
  range.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  for (let c = 1; c <= HEADERS_BATCHES.length; c++) sheet.autoResizeColumn(c);
  return 'ជោគជ័យ! ក្បាលតារាង Batches ត្រូវបាន Update និងតម្រឹមរួចរាល់! (' + fixMsg + ')';
}

function fixBatchesAlignment(sheet) {
  if (!sheet) {
    const ss = getSpreadsheet();
    sheet = ss.getSheetByName(CONFIG.SHEET_NAME_BATCHES);
  }
  if (!sheet) return 'រកមិនឃើញតារាង Batches ទេ!';
  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(sheet.getLastColumn(), HEADERS_BATCHES.length);

  if (lastCol > HEADERS_BATCHES.length) {
    sheet.getRange(1, HEADERS_BATCHES.length + 1, Math.max(lastRow, 1), lastCol - HEADERS_BATCHES.length).clearContent();
  }

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
    const dateVal = r[1] ? (r[1] instanceof Date ? Utilities.formatDate(r[1], CONFIG.TIMEZONE, 'yyyy-MM-dd') : String(r[1])) : '';
    const operator = String(r[2] || '').trim();
    const totalItems = parseInt(r[3], 10) || 0;
    const totalUSD = parseFloat(r[4]) || 0;
    const totalKHR = parseFloat(r[5]) || 0;
    let bankUSD = 0, bankKHR = 0, cashUSD = 0, cashKHR = 0, reconciliation = '', notes = '', createdAt = '';

    const is13ColFormat = (
      r.length >= 13 &&
      (String(r[10] || '').includes('គ្រប់ចំនួន') || String(r[10] || '').includes('ខ្វះ') || String(r[10] || '').includes('លើស') || String(r[10] || '').includes('Balanced'))
    );

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
      createdAt = r[12] ? (r[12] instanceof Date ? Utilities.formatDate(r[12], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(r[12])) : '';
    } else if (is12ColFormat) {
      bankUSD = parseFloat(r[6]) || 0;
      bankKHR = parseFloat(r[7]) || 0;
      cashUSD = parseFloat(r[8]) || 0;
      cashKHR = parseFloat(r[9]) || 0;
      notes = String(r[10] || '').trim();
      createdAt = r[11] ? (r[11] instanceof Date ? Utilities.formatDate(r[11], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(r[11])) : '';
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
      notes = String(r[6] || '').trim();
      createdAt = r[7] ? (r[7] instanceof Date ? Utilities.formatDate(r[7], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(r[7])) : '';
      bankUSD = 0;
      bankKHR = 0;
      cashUSD = totalUSD;
      cashKHR = totalKHR;
      reconciliation = '✓ គ្រប់ចំនួន (Balanced 100%)';
    }
    fixedRows.push([bId, dateVal, operator, totalItems, totalUSD, totalKHR, bankUSD, bankKHR, cashUSD, cashKHR, reconciliation, notes, createdAt]);
  }
  if (fixedRows.length > 0) sheet.getRange(2, 1, fixedRows.length, HEADERS_BATCHES.length).setValues(fixedRows);
  for (let c = 1; c <= HEADERS_BATCHES.length; c++) sheet.autoResizeColumn(c);
  return 'បានតម្រឹមចំនួន ' + fixedRows.length + ' ជួរ';
}

function updateCollectionItemsHeaders() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_ITEMS);
  if (!sheet) {
    getOrCreateItemsSheet(ss);
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
  const fixMsg = fixCollectionItemsAlignment();
  for (let c = 1; c <= HEADERS_ITEMS.length; c++) sheet.autoResizeColumn(c);
  return 'ជោគជ័យ! ក្បាលតារាង Collection_Items ត្រូវបាន Update និងតម្រឹមរួចរាល់! (' + fixMsg + ')';
}

function fixCollectionItemsAlignment() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_ITEMS);
  if (!sheet) return 'រកមិនឃើញតារាង Collection_Items';
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 'គ្មានទិន្នន័យត្រូវជួសជុល';
  const lookupMap = {};
  const dataSheet = ss.getSheetByName(CONFIG.SHEET_NAME_DATA);
  if (dataSheet && dataSheet.getLastRow() > 1) {
    const dRows = dataSheet.getRange(2, 1, dataSheet.getLastRow() - 1, 5).getValues();
    dRows.forEach(r => {
      const code = String(r[0] || '').trim().toLowerCase();
      if (code) lookupMap[code] = { payment: String(r[1] || 'CASH').trim(), usd: Number(r[2]) || 0, khm: Number(r[3]) || 0, date: r[4] ? String(r[4]) : '' };
    });
  }
  const range = sheet.getRange(2, 1, lastRow - 1, 8);
  const rows = range.getValues();
  const fixedRows = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const bId = String(r[0] || '').trim();
    const trk = String(r[1] || '').trim();
    const name = String(r[2] || '').trim();
    const cD = String(r[3] || '').trim();
    const cE = String(r[4] || '').trim();
    const cF = String(r[5] || '').trim();
    const cG = String(r[6] || '').trim();
    const cH = String(r[7] || '').trim();
    const lk = lookupMap[trk.toLowerCase()] || {};
    const isOld = (cD.includes('-') || cD.includes('/')) && (cE === 'CASH' || cE === 'Collect' || cE === 'COD' || cE.includes('Cash') || cE === '') && (cF.includes(':') || cF.includes('202'));
    if (isOld) {
      fixedRows.push([bId, trk, name, cE || lk.payment || 'CASH', lk.usd || 0, lk.khm || 0, cD || lk.date || '', cF || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss')]);
    } else {
      fixedRows.push([bId, trk, name, cD || lk.payment || 'CASH', Number(cE) || lk.usd || 0, Number(cF) || lk.khm || 0, cG || lk.date || '', cH || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss')]);
    }
  }
  range.setValues(fixedRows);
  return 'បានតម្រឹមចំនួន ' + fixedRows.length + ' ជួរ';
}

const HEADERS_PAYERS = [
  'ID', 'Name', 'Phone', 'Category', 'Area', 'Status', 'Notes', 'Created_At', 'Updated_At'
];

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';

  if (action === 'get_data') {
    try {
      const ss = getSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEET_NAME_DATA) || ss.getSheets()[0];
      if (!sheet) return createJsonResponse({ status: 'success', data: [] });
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return createJsonResponse({ status: 'success', data: [] });

      const data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
      const records = [];
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row[0]) continue;
        records.push({
          id: 'row-' + (i + 1),
          barcode: String(row[0] || '').trim(),
          payment: String(row[1] || 'CASH').trim(),
          usd: parseFloat(row[2]) || 0,
          khm: parseFloat(row[3]) || 0,
          date: row[4] ? (row[4] instanceof Date ? Utilities.formatDate(row[4], CONFIG.TIMEZONE, 'd-MMM-yyyy') : String(row[4])) : ''
        });
      }
      return createJsonResponse({ status: 'success', data: records });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  // 0. Fetch All Data in a single high-speed request (Payers + Batches)
  if (action === 'get_all_data') {
    try {
      const ss = getSpreadsheet();
      const pSheet = getOrCreatePayersSheet(ss);
      const payers = parsePayersFromSheet(pSheet);

      const bSheet = getOrCreateBatchesSheet(ss);
      const bLastRow = bSheet.getLastRow();
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
              date: iRow[6] ? (iRow[6] instanceof Date ? Utilities.formatDate(iRow[6], CONFIG.TIMEZONE, 'yyyy-MM-dd') : String(iRow[6])) : '',
              createdAt: iRow[7] ? (iRow[7] instanceof Date ? Utilities.formatDate(iRow[7], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(iRow[7])) : ''
            });
          }
        }

        const lastCol = Math.max(bSheet.getLastColumn(), HEADERS_BATCHES.length);
        const bData = bSheet.getRange(2, 1, bLastRow - 1, lastCol).getValues();
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
        data: { payers, batches }
      });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

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

  if (action === 'get_batches') {
    try {
      const ss = getSpreadsheet();
      const sheet = getOrCreateBatchesSheet(ss);
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return createJsonResponse({ status: 'success', data: [] });

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
            date: iRow[6] ? (iRow[6] instanceof Date ? Utilities.formatDate(iRow[6], CONFIG.TIMEZONE, 'yyyy-MM-dd') : String(iRow[6])) : '',
            createdAt: iRow[7] ? (iRow[7] instanceof Date ? Utilities.formatDate(iRow[7], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(iRow[7])) : ''
          });
        }
      }

      for (let i = data.length - 1; i >= 0; i--) {
        const row = data[i];
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
      return createJsonResponse({ status: 'success', data: batches });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  if (action === 'get_items') {
    try {
      const ss = getSpreadsheet();
      const sheet = getOrCreateItemsSheet(ss);
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return createJsonResponse({ status: 'success', data: [] });

      const data = sheet.getRange(2, 1, lastRow - 1, HEADERS_ITEMS.length).getValues();
      const items = [];
      for (let i = data.length - 1; i >= 0; i--) {
        const row = data[i];
        if (!row[0] && !row[1]) continue;
        items.push({
          id: 'item-' + (i + 1),
          batchNumber: String(row[0] || ''),
          tracking: String(row[1] || ''),
          name: String(row[2] || ''),
          date: row[3] ? (row[3] instanceof Date ? Utilities.formatDate(row[3], CONFIG.TIMEZONE, 'yyyy-MM-dd') : String(row[3])) : '',
          paymentMethod: String(row[4] || 'Cash & Collect'),
          createdAt: row[5] ? (row[5] instanceof Date ? Utilities.formatDate(row[5], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(row[5])) : ''
        });
      }
      return createJsonResponse({ status: 'success', data: items });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  if (action === 'get_user_logs') {
    try {
      const ss = getSpreadsheet();
      const sheet = getOrCreateLogsSheet(ss);
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return createJsonResponse({ status: 'success', data: [] });
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

  if (action === 'update_columns' || action === 'setup_sheets') {
    try {
      const msg = setupAllSheets();
      return createJsonResponse({ status: 'success', message: msg });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  if (action === 'delete_batch') {
    try {
      const ss = getSpreadsheet();
      const batchNumber = String(e.parameter.batchNumber || e.parameter.id || '').trim();
      let bCount = 0;
      let iCount = 0;
      if (batchNumber) {
        const batchSheet = ss.getSheetByName(CONFIG.SHEET_NAME_BATCHES);
        bCount = fastRemoveBatchFromSheet(batchSheet, batchNumber);
        const itemsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_ITEMS);
        iCount = fastRemoveBatchFromSheet(itemsSheet, batchNumber);
      }
      return createJsonResponse({ status: 'success', message: 'Batch ' + batchNumber + ' deleted (' + bCount + ' batch, ' + iCount + ' items)' });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  if (action === 'delete_all_batches') {
    try {
      const ss = getSpreadsheet();
      const batchSheet = ss.getSheetByName(CONFIG.SHEET_NAME_BATCHES);
      const bCount = fastClearSheetData(batchSheet);
      const itemsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_ITEMS);
      const iCount = fastClearSheetData(itemsSheet);
      return createJsonResponse({ status: 'success', message: 'All batches deleted (' + bCount + ' batches, ' + iCount + ' items)' });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  if (action === 'get_settings') {
    try {
      const ss = getSpreadsheet();
      const sheet = getOrCreateSettingsSheet(ss);
      const settings = parseSettingsFromSheet(sheet);
      return createJsonResponse({ status: 'success', data: settings });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

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
      return createJsonResponse({ status: 'success', message: 'Saved ' + count + ' settings', data: parseSettingsFromSheet(sheet) });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  return createJsonResponse({
    status: 'online',
    service: 'Payment Collection & Payer Management API',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    sheets: {
      batches: CONFIG.SHEET_NAME_BATCHES,
      items: CONFIG.SHEET_NAME_ITEMS,
      payers: CONFIG.SHEET_NAME_PAYERS,
      settings: CONFIG.SHEET_NAME_SETTINGS
    },
    message: 'Google Apps Script Web App is active and ready.'
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return createJsonResponse({ status: 'error', message: 'Server is busy' }, 429);
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('No post data received in request.');
    }
    const data = JSON.parse(e.postData.contents);
    const ss = getSpreadsheet();
    const nowStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');

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
      const dateStr = batch.createdAt ? Utilities.formatDate(new Date(batch.createdAt), CONFIG.TIMEZONE, 'yyyy-MM-dd') : Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
      const createdAtStr = batch.createdAt ? Utilities.formatDate(new Date(batch.createdAt), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : nowStr;

      const batchSheet = getOrCreateBatchesSheet(ss);
      batchSheet.appendRow([batchNumber, dateStr, operator, totalItems, totalUSD, totalKHR, bankUSD, bankKHR, cashUSD, cashKHR, reconciliation, notes, createdAtStr]);

      if (Array.isArray(batch.items) && batch.items.length > 0) {
        const itemSheet = getOrCreateItemsSheet(ss);
        const itemRows = batch.items.map(item => [
          batchNumber,
          String(item.tracking || '').trim(),
          String(item.name || '').trim(),
          String(item.paymentMethod || 'CASH').trim(),
          Number(item.usd) || 0,
          Number(item.khm) || 0,
          item.date || dateStr,
          createdAtStr
        ]);
        const targetRow = itemSheet.getLastRow() + 1;
        itemSheet.getRange(targetRow, 1, itemRows.length, HEADERS_ITEMS.length).setValues(itemRows);
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
        } catch (tgErr) {}
      }

      return createJsonResponse({ status: 'success', message: 'Batch saved successfully' });
    }

    // High-speed bulk sync for all batches & payers in seconds
    if (data.action === 'sync_all_data' || data.action === 'bulk_save_batches') {
      const incomingBatches = Array.isArray(data.batches) ? data.batches : [];
      const incomingPayers = Array.isArray(data.payers) ? data.payers : [];
      let batchesAdded = 0;
      let itemsAdded = 0;
      let payersSynced = 0;

      if (incomingBatches.length > 0) {
        const batchSheet = getOrCreateBatchesSheet(ss);
        const itemSheet = getOrCreateItemsSheet(ss);
        const existingBatchSet = new Set();
        const bLastRow = batchSheet.getLastRow();
        if (bLastRow > 1) {
          const existingB = batchSheet.getRange(2, 1, bLastRow - 1, 1).getValues();
          for (let i = 0; i < existingB.length; i++) {
            const bNum = String(existingB[i][0] || '').trim();
            if (bNum) existingBatchSet.add(bNum);
          }
        }

        const newBatchRows = [];
        const newItemRows = [];

        incomingBatches.forEach(batch => {
          const batchNumber = String(batch.batchNumber || ('BATCH-' + Date.now().toString().slice(-6))).trim();
          if (existingBatchSet.has(batchNumber)) return;
          existingBatchSet.add(batchNumber);

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
          const dateStr = batch.createdAt ? Utilities.formatDate(new Date(batch.createdAt), CONFIG.TIMEZONE, 'yyyy-MM-dd') : Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
          const createdAtStr = batch.createdAt ? Utilities.formatDate(new Date(batch.createdAt), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : nowStr;

          newBatchRows.push([batchNumber, dateStr, operator, totalItems, totalUSD, totalKHR, bankUSD, bankKHR, cashUSD, cashKHR, reconciliation, notes, createdAtStr]);

          if (Array.isArray(batch.items) && batch.items.length > 0) {
            batch.items.forEach(item => {
              newItemRows.push([
                batchNumber,
                String(item.tracking || '').trim(),
                String(item.name || '').trim(),
                String(item.paymentMethod || 'CASH').trim(),
                Number(item.usd) || 0,
                Number(item.khm) || 0,
                item.date || dateStr,
                createdAtStr
              ]);
            });
          }
        });

        if (newBatchRows.length > 0) {
          const targetRow = batchSheet.getLastRow() + 1;
          batchSheet.getRange(targetRow, 1, newBatchRows.length, HEADERS_BATCHES.length).setValues(newBatchRows);
          batchesAdded = newBatchRows.length;
        }

        if (newItemRows.length > 0) {
          const targetRow = itemSheet.getLastRow() + 1;
          itemSheet.getRange(targetRow, 1, newItemRows.length, HEADERS_ITEMS.length).setValues(newItemRows);
          itemsAdded = newItemRows.length;
        }
      }

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
        message: 'Ultra-fast sync completed: ' + batchesAdded + ' batches, ' + itemsAdded + ' items, ' + payersSynced + ' payers',
        data: { batchesAdded, itemsAdded, payersSynced }
      });
    }

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
      }
      return createJsonResponse({ status: 'success', message: 'Payer saved' });
    }

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
      return createJsonResponse({ status: deleted ? 'success' : 'not_found' });
    }

    if (data.action === 'sync_payers') {
      const payerSheet = getOrCreatePayersSheet(ss);
      const incomingList = Array.isArray(data.payers) ? data.payers : [];
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
        } else {
          payerSheet.appendRow(rowData);
        }
      });
      return createJsonResponse({ status: 'success', message: 'Payers synced' });
    }

    if (data.action === 'update_columns' || data.action === 'setup_sheets') {
      const msg = setupAllSheets();
      return createJsonResponse({ status: 'success', message: msg });
    }

    if (data.action === 'delete_batch') {
      const batchNumber = String(data.batchNumber || data.id || '').trim();
      let bCount = 0;
      let iCount = 0;
      if (batchNumber) {
        const batchSheet = ss.getSheetByName(CONFIG.SHEET_NAME_BATCHES);
        bCount = fastRemoveBatchFromSheet(batchSheet, batchNumber);
        const itemsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_ITEMS);
        iCount = fastRemoveBatchFromSheet(itemsSheet, batchNumber);
      }
      return createJsonResponse({ status: 'success', message: 'Batch ' + batchNumber + ' deleted (' + bCount + ' batch, ' + iCount + ' items)' });
    }

    if (data.action === 'delete_all_batches') {
      const batchSheet = ss.getSheetByName(CONFIG.SHEET_NAME_BATCHES);
      const bCount = fastClearSheetData(batchSheet);
      const itemsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_ITEMS);
      const iCount = fastClearSheetData(itemsSheet);
      return createJsonResponse({ status: 'success', message: 'All batches deleted (' + bCount + ' batches, ' + iCount + ' items)' });
    }

    if (data.action === 'save_settings') {
      const sheet = getOrCreateSettingsSheet(ss);
      const newSettings = data.settings || {};
      const count = saveSettingsToSheet(sheet, newSettings);
      return createJsonResponse({ status: 'success', message: 'Saved ' + count + ' settings', data: parseSettingsFromSheet(sheet) });
    }

    if (data.action === 'get_settings') {
      const sheet = getOrCreateSettingsSheet(ss);
      const settings = parseSettingsFromSheet(sheet);
      return createJsonResponse({ status: 'success', data: settings });
    }

    if (data.action === 'log_user_activity') {
      const sheet = getOrCreateLogsSheet(ss);
      const log = data.log || {};
      const logId = String(log.id || ('log-' + Date.now())).trim();
      const timeStr = log.timestamp ? (typeof log.timestamp === 'string' ? log.timestamp.replace('T', ' ').slice(0, 19) : nowStr) : nowStr;
      sheet.appendRow([
        logId,
        timeStr,
        String(log.operator || log.userName || '').trim(),
        String(log.operatorEmail || log.userEmail || '').trim(),
        String(log.userRole || log.targetUserRole || '').trim(),
        String(log.action || '').trim(),
        String(log.details || log.description || log.title || '').trim(),
        String(log.batchNumber || '').trim(),
        log.amountUSD !== undefined && log.amountUSD !== null ? Number(log.amountUSD) : '',
        log.amountKHR !== undefined && log.amountKHR !== null ? Number(log.amountKHR) : '',
        log.itemsCount !== undefined && log.itemsCount !== null ? Number(log.itemsCount) : '',
        nowStr
      ]);
      return createJsonResponse({ status: 'success', message: 'Activity log recorded' });
    }

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
        rowsToAdd.push([
          logId,
          timeStr,
          String(log.operator || log.userName || '').trim(),
          String(log.operatorEmail || log.userEmail || '').trim(),
          String(log.userRole || log.targetUserRole || '').trim(),
          String(log.action || '').trim(),
          String(log.details || log.description || log.title || '').trim(),
          String(log.batchNumber || '').trim(),
          log.amountUSD !== undefined && log.amountUSD !== null ? Number(log.amountUSD) : '',
          log.amountKHR !== undefined && log.amountKHR !== null ? Number(log.amountKHR) : '',
          log.itemsCount !== undefined && log.itemsCount !== null ? Number(log.itemsCount) : '',
          nowStr
        ]);
        added++;
      });
      if (rowsToAdd.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, HEADERS_LOGS.length).setValues(rowsToAdd);
      }
      return createJsonResponse({ status: 'success', message: 'Synced ' + added + ' logs' });
    }

    return createJsonResponse({ status: 'error', message: 'Unknown action' }, 400);
  } catch (err) {
    return createJsonResponse({ status: 'error', message: err.message }, 500);
  } finally {
    lock.releaseLock();
  }
}

function setupAllSheets() {
  const ss = getSpreadsheet();
  updateBatchesHeadersAndData();
  updateCollectionItemsHeaders();
  const pSheet = getOrCreatePayersSheet(ss);
  removeDefaultPayers(pSheet);
  const sSheet = getOrCreateSettingsSheet(ss);
  seedDefaultSettings(sSheet);
  getOrCreateLogsSheet(ss);
  Logger.log('Setup successfully completed! Tabs created/updated: Batches, Collection_Items, Payers, Settings, User_Logs');
  return 'ជោគជ័យ! តារាងទាំងអស់ត្រូវបានបង្កើត និង Update រួចរាល់ (Batches, Collection_Items, Payers, Settings, User_Logs)!';
}

function getOrCreateLogsSheet(ss) {
  if (!ss) ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_LOGS || 'User_Logs');
  if (sheet) return sheet;
  sheet = ss.insertSheet(CONFIG.SHEET_NAME_LOGS || 'User_Logs');
  sheet.appendRow(HEADERS_LOGS);
  const headerRange = sheet.getRange(1, 1, 1, HEADERS_LOGS.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#2563EB');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  for (let c = 1; c <= HEADERS_LOGS.length; c++) sheet.autoResizeColumn(c);
  return sheet;
}

function getSpreadsheet() {
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}

  if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID !== 'YOUR_GOOGLE_SPREADSHEET_ID_HERE') {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      if (ss) return ss;
    } catch (e) {
      console.warn('Could not open spreadsheet by ID: ' + e.message);
    }
  }

  const fallback = SpreadsheetApp.getActiveSpreadsheet();
  if (!fallback) {
    throw new Error('ពុំអាចស្វែងរក Google Spreadsheet បានទេ។ សូមពិនិត្យមើល SPREADSHEET_ID ក្នុង CONFIG!');
  }
  return fallback;
}

function getOrCreateBatchesSheet(ss) {
  if (!ss) ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_BATCHES);
  if (sheet) {
    const col7 = String(sheet.getRange(1, 7).getValue() || '').trim();
    if (col7 !== 'Bank_USD') {
      fixBatchesAlignment(sheet);
    }
    return sheet;
  }

  sheet = ss.insertSheet(CONFIG.SHEET_NAME_BATCHES);
  sheet.appendRow(HEADERS_BATCHES);
  const range = sheet.getRange(1, 1, 1, HEADERS_BATCHES.length);
  range.setFontWeight('bold');
  range.setBackground('#4F46E5');
  range.setFontColor('#FFFFFF');
  range.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  for (let c = 1; c <= HEADERS_BATCHES.length; c++) sheet.autoResizeColumn(c);
  return sheet;
}

function getOrCreateItemsSheet(ss) {
  if (!ss) ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_ITEMS);
  if (sheet) return sheet;

  sheet = ss.insertSheet(CONFIG.SHEET_NAME_ITEMS);
  sheet.appendRow(HEADERS_ITEMS);
  const range = sheet.getRange(1, 1, 1, HEADERS_ITEMS.length);
  range.setFontWeight('bold');
  range.setBackground('#2563EB');
  range.setFontColor('#FFFFFF');
  range.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  for (let c = 1; c <= HEADERS_ITEMS.length; c++) sheet.autoResizeColumn(c);
  return sheet;
}

function getOrCreatePayersSheet(ss) {
  if (!ss) ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME_PAYERS);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME_PAYERS);
    sheet.appendRow(HEADERS_PAYERS);
    const range = sheet.getRange(1, 1, 1, HEADERS_PAYERS.length);
    range.setFontWeight('bold');
    range.setBackground('#059669');
    range.setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    for (let c = 1; c <= HEADERS_PAYERS.length; c++) sheet.autoResizeColumn(c);
  }
  return sheet;
}

function fastRemoveBatchFromSheet(sheet, batchNumber) {
  if (!sheet || sheet.getLastRow() <= 1 || !batchNumber) return 0;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const allData = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const remaining = [];
  let deletedCount = 0;
  const target = String(batchNumber).trim().toLowerCase();
  for (let i = 0; i < allData.length; i++) {
    if (String(allData[i][0] || '').trim().toLowerCase() === target) {
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

function fastClearSheetData(sheet) {
  if (!sheet || sheet.getLastRow() <= 1) return 0;
  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const count = lastRow - 1;
  sheet.getRange(2, 1, count, lastCol).clearContent();
  return count;
}

function removeDefaultPayers(sheet) {
  return 0;
}

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

    const lowerName = name.toLowerCase();
    const cleanPhone = phone.replace(/[\s-]/g, '');
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

    if (!phone) {
      for (let c = 0; c < row.length; c++) {
        if (c === colName || c === colId) continue;
        const val = String(row[c] || '').trim();
        if (/^[+]?[(]?[0-9]{2,4}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{3,6}$/.test(val)) {
          phone = val;
          break;
        }
      }
    }

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

function sendTelegramBatchNotification(batch) {
  if (!CONFIG.TELEGRAM_BOT_TOKEN || CONFIG.TELEGRAM_BOT_TOKEN === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') return { success: false };
  const bankText = (Number(batch.bankUSD || 0) > 0 || Number(batch.bankKHR || 0) > 0)
    ? '🏦 <b>ធនាគារ (Bank):</b> <code>$' + Number(batch.bankUSD || 0).toFixed(2) + '</code> | <code>' + Number(batch.bankKHR || 0).toLocaleString() + ' ៛</code>\\n'
    : '';
  const cashText = (Number(batch.cashUSD || 0) > 0 || Number(batch.cashKHR || 0) > 0)
    ? '💵 <b>ប្រាក់សុទ្ធ (Cash):</b> <code>$' + Number(batch.cashUSD || 0).toFixed(2) + '</code> | <code>' + Number(batch.cashKHR || 0).toLocaleString() + ' ៛</code>\\n'
    : '';

  const text = '📥 <b>ការទទួលប្រាក់សរុបថ្មី (Collection Batch)</b>\\n' +
    '━━━━━━━━━━━━━━━━━━━━\\n' +
    '📦 <b>កញ្ចប់លេខ:</b> <code>' + escapeHtml(batch.batchNumber) + '</code>\\n' +
    '👤 <b>អ្នកកត់ត្រា:</b> ' + escapeHtml(batch.operator) + '\\n' +
    '🔢 <b>ចំនួនវិក្កយបត្រ:</b> <b>' + batch.totalItems + '</b> ជួរ\\n' +
    '💵 <b>សរុប USD:</b> <code>$' + Number(batch.totalUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</code>\\n' +
    '៛ <b>សរុប KHR:</b> <code>' + Number(batch.totalKHR).toLocaleString('en-US') + ' ៛</code>\\n' +
    bankText +
    cashText +
    (batch.reconciliation ? '⚖️ <b>ផ្ទៀងផ្ទាត់:</b> <code>' + escapeHtml(batch.reconciliation) + '</code>\\n' : '') +
    (batch.notes ? '📝 <b>ចំណាំ:</b> <i>' + escapeHtml(batch.notes) + '</i>\\n' : '') +
    '⏰ <b>កាលបរិច្ឆេទ:</b> ' + batch.createdAt + '\\n' +
    '━━━━━━━━━━━━━━━━━━━━\\n' +
    '⚡ <i>Logged via Accounting SPA</i>';

  const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + CONFIG.TELEGRAM_BOT_TOKEN + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: CONFIG.TELEGRAM_CHAT_ID, text: text, parse_mode: 'HTML' }),
    muteHttpExceptions: true
  });
  return { success: response.getResponseCode() === 200 };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
  headerRange.setBackground('#1E293B');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  seedDefaultSettings(sheet);
  for (let c = 1; c <= HEADERS_SETTINGS.length; c++) sheet.autoResizeColumn(c);
  return sheet;
}

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
    ['dataBmSheetName', '', 'Data BM Sheet / Tab Name']
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
  return 'បានបញ្ចូលទិន្នន័យ Settings ចំនួន ' + rowsToAdd.length + ' ជួរជោគជ័យ!';
}

function parseSettingsFromSheet(sheet) {
  if (!sheet) return {};
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return {};
  const allData = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const settings = {};
  for (let i = 0; i < allData.length; i++) {
    const key = String(allData[i][0] || '').trim();
    const val = allData[i][1];
    if (key) settings[key] = val !== undefined && val !== null ? String(val).trim() : '';
  }
  return settings;
}

function saveSettingsToSheet(sheet, newSettings) {
  if (!sheet || !newSettings) return 0;
  const lastRow = sheet.getLastRow();
  const keyToRowIndex = {};
  if (lastRow > 1) {
    const existingKeys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < existingKeys.length; i++) {
      const k = String(existingKeys[i][0] || '').trim();
      if (k) keyToRowIndex[k] = i + 2;
    }
  }
  const now = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  let savedCount = 0;
  for (const key in newSettings) {
    if (key === 'darkMode' || key === 'demoMode' || key === 'webAppUrl') continue;
    const val = newSettings[key] !== undefined && newSettings[key] !== null ? String(newSettings[key]).trim() : '';
    if (keyToRowIndex[key]) {
      sheet.getRange(keyToRowIndex[key], 2, 1, 2).setValues([[val, now]]);
      savedCount++;
    } else {
      sheet.appendRow([key, val, '', now]);
      savedCount++;
    }
  }
  return savedCount;
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function setupAllSheets() {
  const ss = getSpreadsheet();
  updateBatchesHeadersAndData();
  updateCollectionItemsHeaders();
  const pSheet = getOrCreatePayersSheet(ss);
  removeDefaultPayers(pSheet);
  const sSheet = getOrCreateSettingsSheet(ss);
  seedDefaultSettings(sSheet);
  return 'ជោគជ័យ! តារាងទាំងអស់ត្រូវបានបង្កើត និង Update រួចរាល់!';
}

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('⚙️ គណនេយ្យ (Accounting)')
      .addItem('⚡ Update Columns ទាំងអស់ (All Sheets)', 'setupAllSheets')
      .addItem('⚙️ បញ្ចូលទិន្នន័យដើម Settings (Seed Settings)', 'seedDefaultSettings')
      .addItem('🔄 ជួសជុលតារាង Batches (Fix Batches)', 'updateBatchesHeadersAndData')
      .addItem('🔄 ជួសជុលតារាងទំនិញ (Fix Items)', 'updateCollectionItemsHeaders')
      .addItem('🚀 Setup / បង្កើតតារាងទាំងអស់', 'setupAllSheets')
      .addToUi();
  } catch (e) {}
}`;

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
