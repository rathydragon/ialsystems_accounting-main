/**
 * Data Report sync: Google Sheets «DATA» → Hostinger MySQL (tbl_data_report)
 *
 * Put this script in the DATA spreadsheet (Extensions → Apps Script), fill in the two settings
 * below, then run `setup` once and allow the permissions it asks for.
 *
 * How it works:
 *   - any change in the sheet marks it "changed" and syncs at once (at most every MIN_GAP_MIN)
 *   - a 1-minute timer syncs changes that are still waiting, and syncs anyway every
 *     SAFETY_EVERY_MIN, in case a change did not fire a trigger (e.g. formulas, other scripts)
 * The server only writes new / changed rows, and never deletes rows that left the sheet.
 */

// ---- Settings ---------------------------------------------------------------
var APP_URL = 'https://YOUR-APP.vercel.app'; // the app's address, without a trailing /
var SYNC_KEY = 'PASTE_SHEET_SYNC_SECRET_HERE'; // same value as SHEET_SYNC_SECRET on Vercel
var MIN_GAP_MIN = 2; // wait at least this long between two syncs
var SAFETY_EVERY_MIN = 15; // sync anyway this often
// -----------------------------------------------------------------------------

var PROP_DIRTY = 'DR_DIRTY';
var PROP_LAST = 'DR_LAST_SYNC';

/** Run once: creates the triggers (removes old copies first). */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'onSheetChange' || fn === 'onTimer') ScriptApp.deleteTrigger(t);
  });
  var ss = SpreadsheetApp.getActive();
  ScriptApp.newTrigger('onSheetChange').forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger('onTimer').timeBased().everyMinutes(1).create();
  var res = syncNow_('setup');
  Logger.log('Setup done. First sync: ' + JSON.stringify(res));
}

/** Installable onChange trigger (fires for typing, pasting, inserting / deleting rows). */
function onSheetChange() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_DIRTY, '1');
  if (minutesSinceLastSync_() >= MIN_GAP_MIN) syncNow_('change');
}

/** Every minute: sync waiting changes, and sync anyway every SAFETY_EVERY_MIN. */
function onTimer() {
  var props = PropertiesService.getScriptProperties();
  var since = minutesSinceLastSync_();
  var dirty = props.getProperty(PROP_DIRTY) === '1';
  if ((dirty && since >= MIN_GAP_MIN) || since >= SAFETY_EVERY_MIN) syncNow_(dirty ? 'change' : 'timer');
}

function minutesSinceLastSync_() {
  var last = Number(PropertiesService.getScriptProperties().getProperty(PROP_LAST) || 0);
  return (Date.now() - last) / 60000;
}

/** Calls the app; repeats while the server says a big import is only partly done. */
function syncNow_(reason) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) return { skipped: 'busy' }; // another run is syncing
  var props = PropertiesService.getScriptProperties();
  try {
    props.setProperty(PROP_LAST, String(Date.now()));
    props.deleteProperty(PROP_DIRTY); // edits made during the sync mark it again
    var body = null;
    for (var round = 0; round < 3; round++) {
      var res = UrlFetchApp.fetch(APP_URL + '/api/remote-mysql?action=data_report_db_hook', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'X-Sync-Key': SYNC_KEY },
        payload: JSON.stringify({ reason: reason }),
        muteHttpExceptions: true
      });
      body = JSON.parse(res.getContentText() || '{}');
      if (res.getResponseCode() !== 200) {
        props.setProperty(PROP_DIRTY, '1'); // try again on the next timer run
        Logger.log('Sync failed (' + res.getResponseCode() + '): ' + (body.message || ''));
        break;
      }
      if (!body.partial) break;
    }
    return body;
  } catch (err) {
    props.setProperty(PROP_DIRTY, '1');
    Logger.log('Sync error: ' + err);
    return { error: String(err) };
  } finally {
    lock.releaseLock();
  }
}
