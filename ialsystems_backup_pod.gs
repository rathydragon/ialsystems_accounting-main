/**
 * =========================================================================
 * 🚚 IAL SYSTEMS - POD DELIVERED SHIPMENTS BACKUP SYNC SCRIPT
 * =========================================================================
 * 
 * ឯកសារនេះសម្រាប់ដាក់ក្នុង៖
 * Google Sheets: "ialsystems_backup_pod"
 * Link: https://docs.google.com/spreadsheets/d/1TwvUk5fsPbbvpG_eNfxuVFxxIZJv2Czo9LaGM8OWNHQ/edit
 * Sheet Tab: "ialsystems_backup_pod"
 * 
 * របៀបដំឡើង (Setup Instructions):
 * 1. បើក Google Sheets ខាងលើ
 * 2. ចូលទៅ Extensions (ផ្នែកបន្ថែម) -> Apps Script
 * 3. លុបកូដចាស់ទាំងអស់ចេញ រួចចម្លង (Paste) កូដក្នុងឯកសារនេះចូល
 * 4. ចុច Save (💾)
 * 5. ចុច "Deploy" (ដាក់ឱ្យដំណើរការ) -> "New deployment" (ការដាក់ឱ្យដំណើរការថ្មី)
 * 6. ត្រង់ Select type ជ្រើសយក "Web app"
 *    - Description: "POD Delivered Sync API v1.0"
 *    - Execute as: "Me" (គណនីរបស់អ្នក)
 *    - Who has access: "Anyone" (អ្នកណាក៏បាន)
 * 7. ចុច "Deploy" រួចអនុញ្ញាតសិទ្ធិ (Authorize access)
 * 8. ចម្លងយក "Web app URL" មកដាក់ក្នុងប្រព័ន្ធជាការស្រេច!
 * =========================================================================
 */

const POD_CONFIG = {
  // Spreadsheet ID
  SPREADSHEET_ID: '1TwvUk5fsPbbvpG_eNfxuVFxxIZJv2Czo9LaGM8OWNHQ',

  // Sheet Tab Name
  SHEET_NAME: 'ialsystems_backup_pod',

  // Timezone
  TIMEZONE: 'Asia/Phnom_Penh'
};

// 📋 ក្បាលតារាង (Headers) ទាំង ១១ ជួរឈរ
const POD_HEADERS = [
  'ID',
  'Tracking_Number',
  'Sign_By',
  'Delivery_On',
  'Issue_By',
  'Delivery_By',
  'Shipped_On',
  'Status',
  'COD',
  'Remarks',
  'Synced_At'
];

/**
 * 🌐 ទទួល HTTP GET Requests (សម្រាប់ធ្វើតេស្ត Ping)
 */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'ping';

  if (action === 'ping') {
    return createJsonResponse({
      ok: true,
      status: 'online',
      service: 'IAL POD Backup Sync API',
      version: '1.1.0',
      timestamp: new Date().toISOString(),
      sheet_name: POD_CONFIG.SHEET_NAME
    });
  }

  if (action === 'get_stats') {
    try {
      const ss = getSpreadsheet(e && e.parameter && e.parameter.spreadsheetId);
      const tabName = (e && e.parameter && e.parameter.sheetName) || POD_CONFIG.SHEET_NAME;
      const sheet = getOrCreatePodSheet(ss, tabName);
      const lastRow = sheet.getLastRow();
      return createJsonResponse({
        ok: true,
        sheet_name: tabName,
        total_rows: Math.max(0, lastRow - 1)
      });
    } catch (err) {
      return createJsonResponse({ ok: false, error: err.message }, 500);
    }
  }

  if (action === 'get_max_id') {
    try {
      const ss = getSpreadsheet(e && e.parameter && e.parameter.spreadsheetId);
      const tabName = (e && e.parameter && e.parameter.sheetName) || POD_CONFIG.SHEET_NAME;
      const sheet = getOrCreatePodSheet(ss, tabName);
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        return createJsonResponse({ ok: true, sheet_name: tabName, max_id: 0, total_rows: 0 });
      }
      // Read ID values from Column A
      const range = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      let maxId = 0;
      for (let i = range.length - 1; i >= 0; i--) {
        const n = Number(range[i][0]);
        if (!isNaN(n) && n > maxId) {
          maxId = n;
        }
      }
      return createJsonResponse({
        ok: true,
        sheet_name: tabName,
        max_id: maxId,
        total_rows: lastRow - 1
      });
    } catch (err) {
      return createJsonResponse({ ok: false, error: err.message }, 500);
    }
  }

  return createJsonResponse({ ok: false, message: 'Invalid action' }, 400);
}

/**
 * 📥 ទទួល HTTP POST Requests (សម្រាប់ Sync ទិន្នន័យ)
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return createJsonResponse({ ok: false, message: 'Server is busy, please retry' }, 429);
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('No POST data received');
    }

    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (err) {
      throw new Error('Invalid JSON format: ' + err.message);
    }

    const action = data.action || 'sync_pod_backup';
    const ss = getSpreadsheet(data.spreadsheetId);
    const sheet = getOrCreatePodSheet(ss, data.sheetName);
    const nowStr = Utilities.formatDate(new Date(), POD_CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');

    // =========================================================================
    // 🚚 ACTION: SYNC POD BACKUP BATCH
    // =========================================================================
    if (action === 'sync_pod_backup') {
      const rows = data.rows || [];
      const mode = data.mode || 'append'; // 'replace' | 'append'
      const isFirstBatch = data.isFirstBatch === true;

      // បើសិនជា Batch ដំបូង ហើយ Mode គឺ Replace (Full Sync) -> សម្អាតតារាងចាស់ រួចដាក់ Header ថ្មី
      if (isFirstBatch && mode === 'replace') {
        sheet.clear();
        sheet.getRange(1, 1, 1, POD_HEADERS.length).setValues([POD_HEADERS]);
        applyHeaderStyle(sheet);
      }

      let insertedCount = 0;
      let skippedDuplicates = 0;

      // រៀបចំទិន្នន័យសរសេរចូល Sheet
      if (rows.length > 0) {
        const lastRow = sheet.getLastRow();

        // 🛡️ DEDUPLICATION: រក្សាទុក ID ដែលមានស្រាប់ ដើម្បីកុំឱ្យបញ្ចូលស្ទួន ID ដែលមានរួចហើយ
        let existingIdSet = new Set();
        if (mode !== 'replace' && lastRow > 1) {
          const checkCount = Math.min(lastRow - 1, 10000);
          const startCheckRow = Math.max(2, lastRow - checkCount + 1);
          const existingRange = sheet.getRange(startCheckRow, 1, checkCount, 1).getValues();
          for (let i = 0; i < existingRange.length; i++) {
            const val = String(existingRange[i][0]).trim();
            if (val) existingIdSet.add(val);
          }
        }

        const formattedRows = [];
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          const idStr = r.id !== undefined && r.id !== null ? String(r.id).trim() : '';
          if (mode !== 'replace' && idStr && existingIdSet.has(idStr)) {
            skippedDuplicates++;
            continue;
          }
          if (idStr) existingIdSet.add(idStr);

          formattedRows.push([
            idStr,
            r.tracking_number ? String(r.tracking_number).trim() : '',
            r.sign_by ? String(r.sign_by).trim() : '',
            r.delivery_on ? String(r.delivery_on).trim() : '',
            r.issue_by ? String(r.issue_by).trim() : '',
            r.delivery_by ? String(r.delivery_by).trim() : '',
            r.shipped_on ? String(r.shipped_on).trim() : '',
            r.status ? String(r.status).trim() : 'Delivered',
            r.cod !== null && r.cod !== undefined && r.cod !== '' ? String(r.cod).trim() : '',
            r.remark ? String(r.remark).trim() : '',
            r.synced_at || nowStr
          ]);
        }

        if (formattedRows.length > 0) {
          const currentLastRow = sheet.getLastRow();
          const startRow = currentLastRow + 1;
          const neededRows = startRow + formattedRows.length - 1;
          if (neededRows > sheet.getMaxRows()) {
            sheet.insertRowsAfter(sheet.getMaxRows(), neededRows - sheet.getMaxRows() + 100);
          }
          sheet.getRange(startRow, 1, formattedRows.length, POD_HEADERS.length).setValues(formattedRows);
          insertedCount = formattedRows.length;
        }
      }

      return createJsonResponse({
        ok: true,
        message: insertedCount > 0 
          ? '✓ បាន Sync ទិន្នន័យដោយជោគជ័យ (បន្ថែម ' + insertedCount + ' ជួរ)' 
          : '✓ ទិន្នន័យទាំងអស់មានក្នុងតារាងរួចហើយ (ពុំមានការបញ្ចូលជាន់ស្ទួនឡើយ)',
        synced_count: insertedCount,
        skipped_duplicates: skippedDuplicates,
        total_in_sheet: Math.max(0, sheet.getLastRow() - 1)
      });
    }

    // =========================================================================
    // 🧹 ACTION: CLEAR POD SHEET
    // =========================================================================
    if (action === 'clear_pod_sheet') {
      sheet.clear();
      sheet.getRange(1, 1, 1, POD_HEADERS.length).setValues([POD_HEADERS]);
      applyHeaderStyle(sheet);

      return createJsonResponse({
        ok: true,
        message: '✓ បានសម្អាត Sheet រួចរាល់!',
        total_in_sheet: 0
      });
    }

    return createJsonResponse({ ok: false, message: 'Unknown action: ' + action }, 400);
  } catch (err) {
    return createJsonResponse({ ok: false, message: err.message }, 500);
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {}
  }
}

/**
 * 🔍 ស្វែងរក Spreadsheet
 */
function getSpreadsheet(customId) {
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) {}

  const id = customId || POD_CONFIG.SPREADSHEET_ID;
  if (id) {
    return SpreadsheetApp.openById(id);
  }
  throw new Error('រកមិនឃើញ Spreadsheet ID ទេ');
}

/**
 * 📑 បង្កើត ឬទាញយក Sheet Tab
 */
function getOrCreatePodSheet(ss, customTabName) {
  const tabName = customTabName || POD_CONFIG.SHEET_NAME;
  let sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, POD_HEADERS.length).setValues([POD_HEADERS]);
    applyHeaderStyle(sheet);
  }
  return sheet;
}

/**
 * 🎨 រចនាម៉ូដ Header ឱ្យមានសោភ័ណភាពស្រស់ស្អាត (Dark Theme)
 */
function applyHeaderStyle(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, POD_HEADERS.length);
  headerRange
    .setBackground('#0F172A') // Slate Dark Navy
    .setFontColor('#FFFFFF') // White text
    .setFontWeight('bold')
    .setFontFamily('Arial')
    .setFontSize(10)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  sheet.setRowHeight(1, 35);
  sheet.setFrozenRows(1);
}

/**
 * 📤 បង្កើត JSON Response ត្រឹមត្រូវ
 */
function createJsonResponse(data, statusCode) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
