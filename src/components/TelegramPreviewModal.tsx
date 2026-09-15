import React, { useState } from 'react';
import { Send, CheckCircle2, MessageSquare, Bot, ExternalLink } from 'lucide-react';
import { Transaction } from '../types';
import { formatCurrency } from '../utils/compression';

interface TelegramPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  latestTransaction?: Transaction;
  telegramChatId?: string;
  webAppUrl?: string;
}

export const TelegramPreviewModal: React.FC<TelegramPreviewModalProps> = ({
  isOpen,
  onClose,
  latestTransaction,
  telegramChatId,
  webAppUrl
}) => {
  const [testSent, setTestSent] = useState(false);

  if (!isOpen) return null;

  // Use provided transaction or realistic default sample
  const tx = latestTransaction || {
    id: 'demo-tx',
    type: 'EXPENSE',
    category: 'Equipment & Software',
    amount: 149.0,
    currency: 'USD',
    date: new Date().toISOString().split('T')[0],
    note: 'Office Monitor & Ergonomic Chair',
    receiptUrl: 'https://drive.google.com/file/d/demo12345/view',
    timestamp: new Date().toISOString()
  };

  const isIncome = tx.type === 'INCOME';
  const badge = isIncome ? '🟢 NEW INCOME' : '🔴 NEW EXPENSE';
  const formattedAmount = formatCurrency(tx.amount, tx.currency);

  const handleSendTestAlert = () => {
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 max-w-lg w-full rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-sky-500 text-white flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Telegram Bot Alert Preview
              </h3>
              <p className="text-[11px] text-slate-500">
                Real-time instant notification format
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-semibold p-1"
          >
            ✕
          </button>
        </div>

        {/* Mock Telegram Chat View */}
        <div className="p-5 bg-slate-100 dark:bg-slate-950 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-sky-400 to-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
              <Bot className="w-5 h-5" />
            </div>

            <div className="flex-1 max-w-md">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-xs font-bold text-slate-900 dark:text-white">Accounting Bot</span>
                <span className="text-[10px] text-slate-400">BOT • today at 10:45 AM</span>
              </div>

              {/* Message Bubble */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl rounded-tl-sm p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2 text-xs text-slate-800 dark:text-slate-200 font-sans">
                
                <div className="font-extrabold tracking-wide flex items-center gap-1.5 text-sm">
                  <span>{badge}</span>
                </div>

                <div className="h-px bg-slate-100 dark:bg-slate-800 my-1"></div>

                <div className="space-y-1 font-mono text-[11px]">
                  <div>
                    <span className="text-slate-400 font-sans">💰 Amount: </span>
                    <span className="font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                      {formattedAmount}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 font-sans">🏷️ Category: </span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{tx.category}</span>
                  </div>

                  {tx.personName && (
                    <div>
                      <span className="text-slate-400 font-sans">
                        {isIncome ? '👤 អ្នកចំណូល:' : '👤 អ្នកចំណាយ:'}{' '}
                      </span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{tx.personName}</span>
                    </div>
                  )}

                  {tx.operator && (
                    <div>
                      <span className="text-slate-400 font-sans">✍️ អ្នកធ្វើប្រតិបត្តិការ: </span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{tx.operator}</span>
                    </div>
                  )}

                  <div>
                    <span className="text-slate-400 font-sans">📅 Date: </span>
                    <span>{tx.date}</span>
                  </div>

                  {tx.note && (
                    <div>
                      <span className="text-slate-400 font-sans">📝 Note: </span>
                      <span className="italic font-sans text-slate-600 dark:text-slate-300">"{tx.note}"</span>
                    </div>
                  )}

                  {tx.receiptUrl && (
                    <div className="pt-1">
                      <span className="text-slate-400 font-sans">📎 Receipt: </span>
                      <span className="text-sky-600 dark:text-sky-400 font-sans font-medium underline inline-flex items-center gap-1">
                        View in Google Drive <ExternalLink className="w-2.5 h-2.5" />
                      </span>
                    </div>
                  )}
                </div>

                <div className="h-px bg-slate-100 dark:bg-slate-800 my-1"></div>

                <div className="text-[10px] text-slate-400 italic">
                  ⚡ Logged via Accounting SPA Web App
                </div>
              </div>

            </div>
          </div>

          {/* Configuration Note */}
          <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900/60 text-[11px] text-sky-800 dark:text-sky-300 space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              How it works:
            </p>
            <p className="leading-relaxed">
              Google Apps Script calls Telegram's <code>/sendMessage</code> or <code>/sendPhoto</code> endpoint via <code>UrlFetchApp</code> instantly whenever a transaction is posted.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
          <span className="text-xs text-slate-500">
            Chat ID: <code className="text-slate-700 dark:text-slate-300">{telegramChatId || 'Not set'}</code>
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Close
            </button>
            <button
              onClick={handleSendTestAlert}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-sky-500 hover:bg-sky-600 text-white shadow-sm flex items-center gap-1.5"
            >
              {testSent ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Sent Preview!
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Simulate Alert
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
