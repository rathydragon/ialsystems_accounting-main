/**
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

  // Sheet tab សម្រាប់កត់ត្រាបញ្ជីអ្នកប្រគល់ប្រាក់ (Payers / Remitters)
  SHEET_NAME_PAYERS: 'Payers',

  // Sheet tab សម្រាប់កត់ត្រាការកំណត់ប្រព័ន្ធ App Settings
  SHEET_NAME_SETTINGS: 'Settings',

  // Sheet tab ទិន្នន័យទូទៅ Google Sheets
  SHEET_NAME_DATA: 'Data',

  // Telegram Bot Token ពី @BotFather
  TELEGRAM_BOT_TOKEN: 'YOUR_TELEGRAM_BOT_TOKEN_HERE',

  // Telegram Chat ID ឬ Channel ID
  TELEGRAM_CHAT_ID: 'YOUR_TELEGRAM_CHAT_ID_HERE',

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

    const dateVal = r[1] ? (r[1] instanceof Date ? Utilities.formatDate(r[1], CONFIG.TIMEZONE, 'yyyy-MM-dd') : String(r[1])) : '';
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
      createdAt = r[12] ? (r[12] instanceof Date ? Utilities.formatDate(r[12], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(r[12])) : '';
    } else if (is12ColFormat) {
      bankUSD = parseFloat(r[6]) || 0;
      bankKHR = parseFloat(r[7]) || 0;
      cashUSD = parseFloat(r[8]) || 0;
      cashKHR = parseFloat(r[9]) || 0;
      notes = String(r[10] || '').trim();
      createdAt = r[11] ? (r[11] instanceof Date ? Utilities.formatDate(r[11], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(r[11])) : '';
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
      createdAt = r[7] ? (r[7] instanceof Date ? Utilities.formatDate(r[7], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(r[7])) : '';
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

    if (isOldFormat) {
      const payment = colE || lookup.payment || 'CASH';
      const usd = lookup.usd || 0;
      const khm = lookup.khm || 0;
      const dateVal = colD || lookup.date || '';
      const createdAt = colF || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
      fixedRows.push([batchId, tracking, name, payment, usd, khm, dateVal, createdAt]);
    } else {
      const payment = colD || lookup.payment || 'CASH';
      const usd = Number(colE) || lookup.usd || 0;
      const khm = Number(colF) || lookup.khm || 0;
      const dateVal = colG || lookup.date || '';
      const createdAt = colH || Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
      fixedRows.push([batchId, tracking, name, payment, usd, khm, dateVal, createdAt]);
    }
  }

  range.setValues(fixedRows);
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
              date: iRow[6] ? (iRow[6] instanceof Date ? Utilities.formatDate(iRow[6], CONFIG.TIMEZONE, 'yyyy-MM-dd') : String(iRow[6])) : '',
              createdAt: iRow[7] ? (iRow[7] instanceof Date ? Utilities.formatDate(iRow[7], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(iRow[7])) : ''
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
            date: iRow[6] ? (iRow[6] instanceof Date ? Utilities.formatDate(iRow[6], CONFIG.TIMEZONE, 'yyyy-MM-dd') : String(iRow[6])) : '',
            createdAt: iRow[7] ? (iRow[7] instanceof Date ? Utilities.formatDate(iRow[7], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(iRow[7])) : ''
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
        message: `Batch ${batchNumber} deleted (${batchesDeleted} batch, ${itemsDeleted} items removed)`
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
        message: `All batches deleted from Google Sheets (${bCount} batches, ${iCount} items removed)`
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
        message: `Saved ${count} settings to Google Sheets`,
        data: parseSettingsFromSheet(sheet)
      });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  // Default Health check
  const result = {
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
      const dateStr = batch.createdAt ? Utilities.formatDate(new Date(batch.createdAt), CONFIG.TIMEZONE, 'yyyy-MM-dd') : Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
      const createdAtStr = batch.createdAt ? Utilities.formatDate(new Date(batch.createdAt), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : nowStr;

      // 1. Append summary row to 'Batches' sheet (13 Columns)
      const batchSheet = getOrCreateBatchesSheet(ss);
      batchSheet.appendRow([
        batchNumber,
        dateStr,
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

      // 2. Append individual item rows to 'Collection_Items' sheet (High-Speed Matrix Write)
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

      // 3. Send Telegram Notification (if configured)
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
        
        // Read existing batch numbers into Set for deduplication
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
          if (existingBatchSet.has(batchNumber)) return; // Skip already synced batches
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

          newBatchRows.push([
            batchNumber,
            dateStr,
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
        message: `Ultra-fast sync completed: ${batchesAdded} batches, ${itemsAdded} items, ${payersSynced} payers synced`,
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
        message: `Payers synced: ${added} added, ${updated} updated`
      });
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
        message: `Batch ${batchNumber} deleted (${batchesDeleted} batch, ${itemsDeleted} items removed)`
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
        message: `All batches deleted from Google Sheets (${bCount} batches, ${iCount} items removed)`
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
        message: `Saved ${count} settings to Google Sheets`,
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
  const pSheet = getOrCreatePayersSheet(ss);
  removeDefaultPayers(pSheet);
  const sSheet = getOrCreateSettingsSheet(ss);
  seedDefaultSettings(sSheet);
  Logger.log('Setup successfully completed! Tabs created/updated: Batches, Collection_Items, Payers, Settings');
  return 'ជោគជ័យ! តារាងទាំងអស់ត្រូវបានបង្កើត និង Update រួចរាល់ (Batches, Collection_Items, Payers, Settings)!';
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
  for (let i = 0; i < allData.length; i++) {
    const rowBatch = String(allData[i][0] || '').trim();
    if (rowBatch === batchNumber) {
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

    // Smart phone detection if phone is missing or located in another column
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
    ? `🏦 <b>ធនាគារ (Bank):</b> <code>$${Number(batch.bankUSD || 0).toFixed(2)}</code> | <code>${Number(batch.bankKHR || 0).toLocaleString()} ៛</code>\n`
    : '';

  const cashText = (Number(batch.cashUSD || 0) > 0 || Number(batch.cashKHR || 0) > 0)
    ? `💵 <b>ប្រាក់សុទ្ធ (Cash):</b> <code>$${Number(batch.cashUSD || 0).toFixed(2)}</code> | <code>${Number(batch.cashKHR || 0).toLocaleString()} ៛</code>\n`
    : '';

  const messageText = `📥 <b>ការទទួលប្រាក់សរុបថ្មី (Collection Batch)</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 <b>កញ្ចប់លេខ:</b> <code>${escapeHtml(batch.batchNumber)}</code>\n` +
    `👤 <b>អ្នកកត់ត្រា:</b> ${escapeHtml(batch.operator)}\n` +
    `🔢 <b>ចំនួនវិក្កយបត្រ:</b> <b>${batch.totalItems}</b> ជួរ\n` +
    `💵 <b>សរុប USD:</b> <code>$${Number(batch.totalUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</code>\n` +
    `៛ <b>សរុប KHR:</b> <code>${Number(batch.totalKHR).toLocaleString('en-US')} ៛</code>\n` +
    bankText +
    cashText +
    (batch.reconciliation ? `⚖️ <b>ផ្ទៀងផ្ទាត់:</b> <code>${escapeHtml(batch.reconciliation)}</code>\n` : '') +
    (batch.notes ? `📝 <b>ចំណាំ:</b> <i>${escapeHtml(batch.notes)}</i>\n` : '') +
    `⏰ <b>កាលបរិច្ឆេទ:</b> ${batch.createdAt}\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `⚡ <i>Logged via Accounting SPA</i>`;

  const telegramUrl = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`;
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
    ['telegramBotToken', '', 'Telegram Bot #1 Token (Main / Reconciliation)'],
    ['telegramChatId', '', 'Telegram Bot #1 Chat ID'],
    ['telegramPaymentBotToken', '', 'Telegram Bot #2 Token (Payment Collection Alert)'],
    ['telegramPaymentChatId', '', 'Telegram Bot #2 Chat ID']
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
    telegramPaymentChatId: 'Telegram Bot #2 Chat ID'
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
 * ⚡ បង្កើត Menu លើ Google Sheets ដោយស្វ័យប្រវត្តិ
 * នៅពេល User បើក Google Sheets នឹងមាន Menu ឈ្មោះ "⚙️ គណនេយ្យ (Accounting)"
 * ដែលអាចចុច Update Columns ភ្លាមៗដោយមិនចាំបាច់ចូលកូដ
 */
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
  } catch (e) {
    Logger.log('Could not create menu: ' + e.message);
  }
}
