import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  FolderLock, 
  Send, 
  Code, 
  Check, 
  Copy, 
  ExternalLink,
  ChevronRight,
  Sparkles
} from 'lucide-react';

interface SetupGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCode: () => void;
}

export const SetupGuideModal: React.FC<SetupGuideModalProps> = ({
  isOpen,
  onClose,
  onOpenCode
}) => {
  const [activeTab, setActiveTab] = useState<'SHEETS' | 'DRIVE' | 'TELEGRAM' | 'SCRIPT' | 'CONNECT'>('SHEETS');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const sheetHeaders = 'Timestamp\tDate\tType\tCategory\tParty\tOperator\tAmount\tCurrency\tPayment_Method\tNote\tReceipt_URL';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 max-w-3xl w-full rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Step-by-Step Architecture Setup Guide</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Set up Google Sheets, Drive, Apps Script, and Telegram in under 5 minutes
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white font-bold p-1"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-950/40 p-1.5 gap-1 overflow-x-auto">
          {[
            { id: 'SHEETS', label: '1. Google Sheets', icon: FileSpreadsheet },
            { id: 'DRIVE', label: '2. Google Drive', icon: FolderLock },
            { id: 'TELEGRAM', label: '3. Telegram Bot', icon: Send },
            { id: 'SCRIPT', label: '4. Apps Script (Code.gs)', icon: Code },
            { id: 'CONNECT', label: '5. Connect to App', icon: Sparkles }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
                  isActive
                    ? 'bg-white dark:bg-slate-900 text-[#0d1b3e] dark:text-white shadow-xs border border-slate-200 dark:border-slate-800'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-red-600 dark:text-red-400' : ''}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-600 dark:text-slate-300 flex-1">
          
          {/* STEP 1: GOOGLE SHEETS */}
          {activeTab === 'SHEETS' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400 flex items-center justify-center font-bold text-sm">
                  1
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Create Google Sheet Database</h4>
                  <p className="text-slate-500">Spreadsheet will store every transaction row persistently.</p>
                </div>
              </div>

              <ol className="list-decimal list-inside space-y-2.5 leading-relaxed pl-1">
                <li>
                  Go to <a href="https://sheets.new" target="_blank" rel="noreferrer" className="text-red-600 dark:text-red-400 font-semibold underline inline-flex items-center gap-1">sheets.new <ExternalLink className="w-3 h-3" /></a> to create a new spreadsheet.
                </li>
                <li>
                  Rename the sheet tab at the bottom to <b>Transactions</b> (or keep Sheet1).
                </li>
                <li>
                  Paste the 11 required columns in Row 1:
                  <div className="my-2 p-3 bg-slate-100 dark:bg-slate-800 rounded-xl font-mono text-[11px] text-slate-800 dark:text-slate-200 flex items-center justify-between">
                    <code>Timestamp, Date, Type, Category, Party, Operator, Amount, Currency, Payment_Method, Note, Receipt_URL</code>
                    <button
                      onClick={() => copyToClipboard(sheetHeaders, 'headers')}
                      className="ml-2 px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-1 hover:bg-slate-50 shrink-0 cursor-pointer"
                    >
                      {copiedKey === 'headers' ? <Check className="w-3 h-3 text-red-600" /> : <Copy className="w-3 h-3" />}
                      {copiedKey === 'headers' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </li>
                <li>
                  Extract your <b>Spreadsheet ID</b> from your browser address bar:
                  <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl mt-1 text-amber-900 dark:text-amber-200 font-mono text-[11px]">
                    https://docs.google.com/spreadsheets/d/<b>&lt;SPREADSHEET_ID&gt;</b>/edit
                  </div>
                </li>
              </ol>
            </div>
          )}

          {/* STEP 2: GOOGLE DRIVE FOLDER */}
          {activeTab === 'DRIVE' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-sm">
                  2
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Create Google Drive Folder for Receipts</h4>
                  <p className="text-slate-500">Stores WebP receipt files with instant viewable links.</p>
                </div>
              </div>

              <ol className="list-decimal list-inside space-y-2.5 leading-relaxed pl-1">
                <li>
                  Open <a href="https://drive.google.com" target="_blank" rel="noreferrer" className="text-blue-600 font-semibold underline inline-flex items-center gap-1">Google Drive <ExternalLink className="w-3 h-3" /></a>.
                </li>
                <li>
                  Click <b>New</b> &gt; <b>New folder</b>. Name it e.g. <b>Accounting Receipts</b>.
                </li>
                <li>
                  Right-click folder &gt; <b>Share</b> &gt; Change General Access to <b>"Anyone with the link can view"</b> (so receipt links in your sheet & Telegram can be viewed).
                </li>
                <li>
                  Open the folder and copy the <b>Folder ID</b> from the URL:
                  <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl mt-1 text-blue-900 dark:text-blue-200 font-mono text-[11px]">
                    https://drive.google.com/drive/folders/<b>&lt;FOLDER_ID&gt;</b>
                  </div>
                </li>
              </ol>
            </div>
          )}

          {/* STEP 3: TELEGRAM BOT */}
          {activeTab === 'TELEGRAM' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold text-sm">
                  3
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Setup Telegram Bot (BotFather & Chat ID)</h4>
                  <p className="text-slate-500">Sends instant alerts to your private chat or team channel.</p>
                </div>
              </div>

              <div className="space-y-3 pl-1">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <p className="font-bold text-slate-900 dark:text-white">Part A: Get Telegram Bot Token</p>
                  <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
                    <li>In Telegram, search for <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-sky-600 font-semibold underline">@BotFather</a>.</li>
                    <li>Send command: <code>/newbot</code>.</li>
                    <li>Follow prompts to choose a Name (e.g. <i>My Accounting Bot</i>) and a Username (e.g. <i>my_acct_ledger_bot</i>).</li>
                    <li>BotFather will reply with your <b>HTTP API Token</b> (e.g., <code>7123456789:AAH...</code>). Copy this token!</li>
                  </ol>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <p className="font-bold text-slate-900 dark:text-white">Part B: Get Your Chat ID</p>
                  <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
                    <li>Open your new bot in Telegram and press <b>Start</b> (or send it any message like "hello").</li>
                    <li>Search for <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" className="text-sky-600 font-semibold underline">@userinfobot</a> and send it a message to get your personal <b>Id</b> (e.g. <code>987654321</code>).</li>
                    <li><i>For a Channel/Group:</i> Add your bot as Admin, send a test message in the group, and visit: <code>https://api.telegram.org/bot&lt;BOT_TOKEN&gt;/getUpdates</code> to see your group <code>"chat":&#123;"id":-100...&#125;</code>.</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: GOOGLE APPS SCRIPT */}
          {activeTab === 'SCRIPT' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-sm">
                  4
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Deploy Google Apps Script Web App</h4>
                  <p className="text-slate-500">Hosts your serverless API on Google's free infrastructure.</p>
                </div>
              </div>

              <ol className="list-decimal list-inside space-y-2.5 leading-relaxed pl-1">
                <li>
                  Open your Google Sheet &gt; Click <b>Extensions</b> &gt; <b>Apps Script</b>.
                </li>
                <li>
                  Delete any existing code in the editor, and paste the code from <code>Code.gs</code>.
                  <button
                    onClick={onOpenCode}
                    className="ml-2 px-2.5 py-0.5 rounded bg-emerald-600 text-white font-semibold text-[11px] inline-flex items-center gap-1"
                  >
                    View / Copy Code.gs <ChevronRight className="w-3 h-3" />
                  </button>
                </li>
                <li>
                  Update the <code>CONFIG</code> constants at top of <code>Code.gs</code>:
                  <ul className="list-disc list-inside pl-4 mt-1 text-[11px] font-mono text-slate-600 dark:text-slate-400 space-y-1">
                    <li><code>SPREADSHEET_ID</code></li>
                    <li><code>DRIVE_FOLDER_ID</code></li>
                    <li><code>TELEGRAM_BOT_TOKEN</code></li>
                    <li><code>TELEGRAM_CHAT_ID</code></li>
                  </ul>
                </li>
                <li>
                  Click <b>Deploy</b> (top right) &gt; <b>New deployment</b>.
                </li>
                <li>
                  Click gear icon (⚙️) next to "Select type" &gt; Select <b>Web app</b>.
                </li>
                <li>
                  Fill in deployment settings:
                  <ul className="list-disc list-inside pl-4 mt-1 text-slate-600 dark:text-slate-400">
                    <li><b>Execute as:</b> Me (your Google account)</li>
                    <li><b>Who has access:</b> Anyone <i>(required for the SPA to post transactions)</i></li>
                  </ul>
                </li>
                <li>
                  Click <b>Deploy</b>, approve the Google permission screen ("Advanced" &gt; "Go to ... (unsafe)"), and copy the generated <b>Web App URL</b>!
                </li>
              </ol>
            </div>
          )}

          {/* STEP 5: CONNECT APP */}
          {activeTab === 'CONNECT' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
                  5
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Connect Web App URL & Start Recording!</h4>
                  <p className="text-slate-500">Paste your Web App URL into this application.</p>
                </div>
              </div>

              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-2">
                <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                  You are all set!
                </p>
                <p className="leading-relaxed text-emerald-800 dark:text-emerald-300">
                  Click the <b>Settings</b> gear icon in the top right navbar, paste your Web App URL, and save. Every time you enter a transaction with a receipt:
                </p>
                <ul className="list-disc list-inside pl-2 space-y-1 text-emerald-800 dark:text-emerald-300">
                  <li>Client-side Canvas compresses receipt to tiny WebP</li>
                  <li>Google Drive saves the receipt and returns a viewable URL</li>
                  <li>Google Sheets appends the new transaction row</li>
                  <li>Telegram Bot sends instant notification with emoji badges!</li>
                </ul>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
          <button
            onClick={onOpenCode}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition flex items-center gap-1.5"
          >
            <Code className="w-4 h-4" />
            Inspect Code.gs & Standalone HTML
          </button>
          
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 transition"
          >
            Got It!
          </button>
        </div>

      </div>
    </div>
  );
};
