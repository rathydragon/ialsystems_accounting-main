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
  'Notes',
  'Created_At'
];

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

  // 1. Fetch all registered Payers (អ្នកប្រគល់ប្រាក់)
  if (action === 'get_payers') {
    try {
      const ss = getSpreadsheet();
      const sheet = getOrCreatePayersSheet(ss);
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        return createJsonResponse({ status: 'success', data: [] });
      }

      const data = sheet.getRange(2, 1, lastRow - 1, HEADERS_PAYERS.length).getValues();
      const records = [];

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row[0] && !row[1]) continue;

        records.push({
          id: String(row[0] || '').trim(),
          name: String(row[1] || '').trim(),
          phone: String(row[2] || '').trim(),
          category: String(row[3] || 'OTHER').trim(),
          area: String(row[4] || '').trim(),
          status: String(row[5] || 'ACTIVE').trim(),
          notes: String(row[6] || '').trim(),
          createdAt: row[7] ? (row[7] instanceof Date ? Utilities.formatDate(row[7], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(row[7])) : '',
          updatedAt: row[8] ? (row[8] instanceof Date ? Utilities.formatDate(row[8], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(row[8])) : ''
        });
      }

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

      const data = sheet.getRange(2, 1, lastRow - 1, HEADERS_BATCHES.length).getValues();
      const batches = [];

      // Latest batches first
      for (let i = data.length - 1; i >= 0; i--) {
        const row = data[i];
        if (!row[0]) continue;

        batches.push({
          id: 'batch-' + (i + 1),
          batchNumber: String(row[0] || ''),
          date: row[1] ? (row[1] instanceof Date ? Utilities.formatDate(row[1], CONFIG.TIMEZONE, 'yyyy-MM-dd') : String(row[1])) : '',
          operator: String(row[2] || ''),
          totalItems: parseInt(row[3], 10) || 0,
          totalUSD: parseFloat(row[4]) || 0,
          totalKHR: parseFloat(row[5]) || 0,
          notes: String(row[6] || ''),
          createdAt: row[7] ? (row[7] instanceof Date ? Utilities.formatDate(row[7], CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : String(row[7])) : '',
          items: [],
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

  // 4. Delete Collection Batch (លុបកញ្ចប់ Batch)
  if (action === 'delete_batch') {
    try {
      const ss = getSpreadsheet();
      const batchNumber = String(e.parameter.batchNumber || e.parameter.id || '').trim();
      let batchesDeleted = 0;
      let itemsDeleted = 0;

      if (batchNumber) {
        // 1. Delete from Batches
        const batchSheet = ss.getSheetByName(CONFIG.SHEET_NAME_BATCHES);
        if (batchSheet && batchSheet.getLastRow() > 1) {
          const bData = batchSheet.getRange(2, 1, batchSheet.getLastRow() - 1, 1).getValues();
          for (let i = bData.length - 1; i >= 0; i--) {
            if (String(bData[i][0] || '').trim() === batchNumber) {
              batchSheet.deleteRow(i + 2);
              batchesDeleted++;
            }
          }
        }

        // 2. Delete from Collection_Items
        const itemsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_ITEMS);
        if (itemsSheet && itemsSheet.getLastRow() > 1) {
          const iData = itemsSheet.getRange(2, 1, itemsSheet.getLastRow() - 1, 1).getValues();
          for (let i = iData.length - 1; i >= 0; i--) {
            if (String(iData[i][0] || '').trim() === batchNumber) {
              itemsSheet.deleteRow(i + 2);
              itemsDeleted++;
            }
          }
        }
      }

      return createJsonResponse({
        status: 'success',
        message: `Batch ${batchNumber} deleted (${batchesDeleted} batch, ${itemsDeleted} items removed)`
      });
    } catch (err) {
      return createJsonResponse({ status: 'error', message: err.message }, 500);
    }
  }

  // 5. Delete All Collection Batches (លុបកញ្ចប់ទាំងអស់ក្នុង Batches & Collection_Items)
  if (action === 'delete_all_batches') {
    try {
      const ss = getSpreadsheet();
      let bCount = 0;
      let iCount = 0;

      const batchSheet = ss.getSheetByName(CONFIG.SHEET_NAME_BATCHES);
      if (batchSheet && batchSheet.getLastRow() > 1) {
        bCount = batchSheet.getLastRow() - 1;
        batchSheet.deleteRows(2, bCount);
      }

      const itemsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_ITEMS);
      if (itemsSheet && itemsSheet.getLastRow() > 1) {
        iCount = itemsSheet.getLastRow() - 1;
        itemsSheet.deleteRows(2, iCount);
      }

      return createJsonResponse({
        status: 'success',
        message: `All batches deleted from Google Sheets (${bCount} batches, ${iCount} items removed)`
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
      payers: CONFIG.SHEET_NAME_PAYERS
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
      const notes = String(batch.notes || '').trim();
      const dateStr = batch.createdAt ? Utilities.formatDate(new Date(batch.createdAt), CONFIG.TIMEZONE, 'yyyy-MM-dd') : Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
      const createdAtStr = batch.createdAt ? Utilities.formatDate(new Date(batch.createdAt), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') : nowStr;

      // 1. Append summary row to 'Batches' sheet
      const batchSheet = getOrCreateBatchesSheet(ss);
      batchSheet.appendRow([
        batchNumber,
        dateStr,
        operator,
        totalItems,
        totalUSD,
        totalKHR,
        notes,
        createdAtStr
      ]);

      // 2. Append individual item rows to 'Collection_Items' sheet
      if (Array.isArray(batch.items) && batch.items.length > 0) {
        const itemSheet = getOrCreateItemsSheet(ss);
        batch.items.forEach(item => {
          itemSheet.appendRow([
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

      // 3. Send Telegram Notification (if configured)
      try {
        sendTelegramBatchNotification({
          batchNumber: batchNumber,
          operator: operator,
          totalItems: totalItems,
          totalUSD: totalUSD,
          totalKHR: totalKHR,
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
          totalKHR: totalKHR
        }
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
    // 🗑️ ACTION: DELETE COLLECTION BATCH (លុបកញ្ចប់ចេញពី Batches & Collection_Items)
    // =========================================================================
    if (data.action === 'delete_batch') {
      const batchNumber = String(data.batchNumber || data.id || '').trim();
      let batchesDeleted = 0;
      let itemsDeleted = 0;

      if (batchNumber) {
        // 1. Delete from Batches sheet
        const batchSheet = ss.getSheetByName(CONFIG.SHEET_NAME_BATCHES);
        if (batchSheet && batchSheet.getLastRow() > 1) {
          const bData = batchSheet.getRange(2, 1, batchSheet.getLastRow() - 1, 1).getValues();
          for (let i = bData.length - 1; i >= 0; i--) {
            if (String(bData[i][0] || '').trim() === batchNumber) {
              batchSheet.deleteRow(i + 2);
              batchesDeleted++;
            }
          }
        }

        // 2. Delete from Collection_Items sheet
        const itemsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_ITEMS);
        if (itemsSheet && itemsSheet.getLastRow() > 1) {
          const iData = itemsSheet.getRange(2, 1, itemsSheet.getLastRow() - 1, 1).getValues();
          for (let i = iData.length - 1; i >= 0; i--) {
            if (String(iData[i][0] || '').trim() === batchNumber) {
              itemsSheet.deleteRow(i + 2);
              itemsDeleted++;
            }
          }
        }
      }

      return createJsonResponse({
        status: 'success',
        message: `Batch ${batchNumber} deleted (${batchesDeleted} batch, ${itemsDeleted} items removed)`
      });
    }

    // =========================================================================
    // 🗑️ ACTION: DELETE ALL BATCHES (លុបរាល់កញ្ចប់ទាំងអស់ចេញពី Batches & Collection_Items)
    // =========================================================================
    if (data.action === 'delete_all_batches') {
      let bCount = 0;
      let iCount = 0;

      const batchSheet = ss.getSheetByName(CONFIG.SHEET_NAME_BATCHES);
      if (batchSheet && batchSheet.getLastRow() > 1) {
        bCount = batchSheet.getLastRow() - 1;
        batchSheet.deleteRows(2, bCount);
      }

      const itemsSheet = ss.getSheetByName(CONFIG.SHEET_NAME_ITEMS);
      if (itemsSheet && itemsSheet.getLastRow() > 1) {
        iCount = itemsSheet.getLastRow() - 1;
        itemsSheet.deleteRows(2, iCount);
      }

      return createJsonResponse({
        status: 'success',
        message: `All batches deleted from Google Sheets (${bCount} batches, ${iCount} items removed)`
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
  getOrCreateBatchesSheet(ss);
  getOrCreateItemsSheet(ss);
  getOrCreatePayersSheet(ss);
  Logger.log('Setup successfully completed! Tabs created/updated: Batches, Collection_Items, Payers');
  return 'ជោគជ័យ! តារាងទាំងអស់ត្រូវបានបង្កើត និង Update រួចរាល់!';
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
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME_BATCHES);
    sheet.appendRow(HEADERS_BATCHES);
  } else {
    // Ensure header row is set
    sheet.getRange(1, 1, 1, HEADERS_BATCHES.length).setValues([HEADERS_BATCHES]);
  }

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
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME_ITEMS);
    sheet.appendRow(HEADERS_ITEMS);
  } else {
    // If sheet exists, update Row 1 headers to match UI columns
    sheet.getRange(1, 1, 1, HEADERS_ITEMS.length).setValues([HEADERS_ITEMS]);
  }

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

    // Default Seed Payers
    const nowStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    const defaultPayers = [
      ['PAY-001', 'វិចិត្រ (Rider Sokha)', '012 345 678', 'RIDER', 'ភ្នំពេញ - សែនសុខ', 'ACTIVE', 'ដឹកជញ្ជូនរហ័សប្រចាំតំបន់', nowStr, nowStr],
      ['PAY-002', 'ក្រុមហ៊ុន ហេងលី (Heng Ly Co)', '098 765 432', 'CUSTOMER', 'ភ្នំពេញ - ទួលគោក', 'ACTIVE', 'អតិថិជនប្រចាំខែ', nowStr, nowStr],
      ['PAY-003', 'សាខា បឹងកក់ (TK Branch)', '077 112 233', 'BRANCH', 'ភ្នំពេញ - បឹងកក់', 'ACTIVE', 'បញ្ជូនសាច់ប្រាក់រៀងរាល់ល្ងាច', nowStr, nowStr],
      ['PAY-004', 'ដៃគូ ដឹកជញ្ជូន ជេអិនធី (J&T Express)', '015 999 888', 'PARTNER', 'ទូទាំងប្រទេស', 'ACTIVE', 'ប្រគល់ប្រាក់ COD ប្រចាំសប្តាហ៍', nowStr, nowStr]
    ];
    defaultPayers.forEach(row => sheet.appendRow(row));

    for (let c = 1; c <= HEADERS_PAYERS.length; c++) {
      sheet.autoResizeColumn(c);
    }
  }
  return sheet;
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

  const messageText = `📥 <b>ការទទួលប្រាក់សរុបថ្មី (Collection Batch)</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 <b>កញ្ចប់លេខ:</b> <code>${escapeHtml(batch.batchNumber)}</code>\n` +
    `👤 <b>អ្នកកត់ត្រា:</b> ${escapeHtml(batch.operator)}\n` +
    `🔢 <b>ចំនួនវិក្កយបត្រ:</b> <b>${batch.totalItems}</b> ជួរ\n` +
    `💵 <b>សរុប USD:</b> <code>$${Number(batch.totalUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</code>\n` +
    `៛ <b>សរុប KHR:</b> <code>${Number(batch.totalKHR).toLocaleString('en-US')} ៛</code>\n` +
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
      .addItem('⚡ Update Columns & តម្រឹមទិន្នន័យ', 'updateCollectionItemsHeaders')
      .addItem('🔄 ជួសជុលទិន្នន័យខុសជួរ (Fix Alignment)', 'fixCollectionItemsAlignment')
      .addItem('🚀 Setup / បង្កើតតារាងទាំងអស់', 'setupAllSheets')
      .addToUi();
  } catch (e) {
    Logger.log('Could not create menu: ' + e.message);
  }
}
