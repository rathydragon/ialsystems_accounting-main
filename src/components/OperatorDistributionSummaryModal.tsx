import React, { useState, useMemo } from 'react';
import {
  X,
  Send,
  Users,
  Calendar,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  BarChart3,
  Filter
} from 'lucide-react';
import { DistributionReportItem, AppSettings, AuthUser, OperatorDistributionSummary } from '../types';
import {
  getOperatorDistributionStats,
  triggerManualDistributionSummary,
  getTodayDateStringPhnomPenh
} from '../services/distributionReportService';
import { isMasterAdmin } from '../services/userPermissionService';
import { formatDailyDistributionSummaryTelegramMessage } from '../services/telegramService';

interface OperatorDistributionSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  reports: DistributionReportItem[];
  settings?: AppSettings;
  currentUser?: AuthUser | null;
  isAdmin?: boolean;
  onFilterOperator?: (operatorEmail: string) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  auto6PMSentToday?: boolean;
}

export const OperatorDistributionSummaryModal: React.FC<OperatorDistributionSummaryModalProps> = ({
  isOpen,
  onClose,
  reports,
  settings,
  currentUser,
  isAdmin,
  onFilterOperator,
  onShowToast,
  auto6PMSentToday = false
}) => {
  const isUserAdmin =
    isAdmin ??
    (currentUser?.role === 'ADMIN' ||
      (currentUser?.email ? isMasterAdmin(currentUser.email) : false));

  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayDateStringPhnomPenh());
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'TABLE' | 'PREVIEW'>('TABLE');

  const notify = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (onShowToast) onShowToast(msg, type);
    else alert(msg);
  };

  // Group and count transactions for the selected date
  const { summaries, totalToday, totalAll } = useMemo(() => {
    return getOperatorDistributionStats(reports, selectedDate);
  }, [reports, selectedDate]);

  // Formatted Telegram Message
  const telegramPreviewText = useMemo(() => {
    return formatDailyDistributionSummaryTelegramMessage(summaries, totalToday, selectedDate);
  }, [summaries, totalToday, selectedDate]);

  // Handle Instant Send
  const handleSendTelegram = async () => {
    if (!isUserAdmin) {
      notify('⚠️ សិទ្ធិត្រូវបានកំណត់៖ មានតែ Admin ទើបអាចផ្ញើសរុបទៅកាន់ Telegram បាន!', 'error');
      return;
    }
    setIsSending(true);
    try {
      const res = await triggerManualDistributionSummary(reports, settings, selectedDate);
      if (res.success) {
        notify(res.message, 'success');
      } else {
        notify(res.message, 'error');
      }
    } catch (err: any) {
      notify('កំហុសពេលផ្ញើសរុបទៅ Telegram៖ ' + (err?.message || err), 'error');
    } finally {
      setIsSending(false);
    }
  };

  // Copy Telegram Message Text
  const handleCopyMessage = () => {
    try {
      // Strip basic HTML tags for clean clipboard text
      const clean = telegramPreviewText
        .replace(/<b>(.*?)<\/b>/g, '$1')
        .replace(/<i>(.*?)<\/i>/g, '$1')
        .replace(/<code>(.*?)<\/code>/g, '$1');
      navigator.clipboard.writeText(clean);
      setIsCopied(true);
      notify('✓ បានចម្លងអត្ថបទរបាយការណ៍សរុប!', 'success');
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      notify('បរាជ័យក្នុងការចម្លង', 'error');
    }
  };

  const configuredChatId =
    settings?.telegramDistributionChatId?.trim() ||
    settings?.telegramPaymentChatId?.trim() ||
    settings?.telegramChatId?.trim() ||
    '924306058';

  const isToday = selectedDate === getTodayDateStringPhnomPenh();

  if (!isOpen || !isUserAdmin) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-[#0d1629] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* ========================================================================= */}
        {/* 🏷️ MODAL HEADER */}
        {/* ========================================================================= */}
        <div className="p-3.5 sm:p-4 bg-gradient-to-r from-sky-600 via-indigo-600 to-amber-600 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center shadow-xs">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-black tracking-tight">
                  សរុបចំនួនប្រតិបត្តិការតាម EMAIL (អ្នកធ្វើប្រតិបត្តិការ)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-amber-400/25 text-amber-200 border border-amber-300/40 inline-flex items-center gap-1">
                  <ShieldCheck className="w-2.5 h-2.5 text-amber-300" />
                  Admin Only
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-white/20 text-white border border-white/30 hidden sm:inline-flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                  Telegram Bot
                </span>
              </div>
              <p className="text-[11px] text-white/80 line-clamp-1">
                រាប់ចំនួនប្រតិបត្តិការតាម EMAIL នីមួយៗ និងផ្ញើសរុបរៀងរាល់ថ្ងៃម៉ោង ៦ ល្ងាច (06:00 PM)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition active:scale-95 cursor-pointer"
            title="បិទ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ========================================================================= */}
        {/* ⏰ 6:00 PM AUTO SCHEDULE STATUS BANNER */}
        {/* ========================================================================= */}
        <div className="px-3.5 sm:px-4 py-2 bg-sky-50 dark:bg-sky-950/40 border-b border-sky-100 dark:border-sky-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 shrink-0 text-xs">
          <div className="flex items-center gap-2 text-sky-900 dark:text-sky-200">
            <Clock className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="font-semibold text-[11px] sm:text-xs">
              ស្វ័យប្រវត្តរៀងរាល់ថ្ងៃម៉ោង <strong>6:00 PM (18:00 ICT)</strong>៖ សរុបតាម EMAIL ចូល Telegram Bot
            </span>
          </div>
          <div className="flex items-center gap-1.5 self-end sm:self-center">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                auto6PMSentToday && isToday
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300'
                  : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  auto6PMSentToday && isToday ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                }`}
              />
              <span>
                {auto6PMSentToday && isToday
                  ? '✓ បានផ្ញើរួចរាល់ថ្ងៃនេះ'
                  : '⏳ រង់ចាំម៉ោង 6:00 PM'}
              </span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono hidden md:inline">
              (Chat ID: {configuredChatId})
            </span>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 🎛️ CONTROLS & DATE SELECTOR BAR */}
        {/* ========================================================================= */}
        <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0 bg-slate-50/50 dark:bg-slate-900/30">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1 shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <label htmlFor="dist-summary-date" className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400">
                កាលបរិច្ឆេទ៖
              </label>
              <input
                id="dist-summary-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent border-none text-xs font-bold text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              />
            </div>

            <button
              type="button"
              onClick={() => setSelectedDate(getTodayDateStringPhnomPenh())}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                isToday
                  ? 'bg-amber-500 text-white shadow-xs shadow-amber-500/25'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
              }`}
            >
              ថ្ងៃនេះ
            </button>
          </div>

          {/* View Tab Toggle */}
          <div className="flex items-center p-0.5 rounded-xl bg-slate-200/80 dark:bg-slate-800 border border-slate-300/60 dark:border-slate-700 self-start sm:self-center">
            <button
              type="button"
              onClick={() => setActiveTab('TABLE')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                activeTab === 'TABLE'
                  ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>តារាងរាប់ចំនួន</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('PREVIEW')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                activeTab === 'PREVIEW'
                  ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Preview Telegram</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 📊 STATS COUNTER SUMMARY CARDS */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-3 gap-2 p-3 sm:px-4 sm:py-2.5 bg-white dark:bg-[#0d1629] shrink-0 border-b border-slate-100 dark:border-slate-800">
          <div className="p-2 sm:p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200/70 dark:border-sky-800/50">
            <div className="text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
              ប្រតិបត្តិការកាលបរិច្ឆេទនេះ
            </div>
            <div className="text-base sm:text-xl font-black text-sky-900 dark:text-sky-100 font-mono mt-0.5">
              {totalToday} <span className="text-[10px] font-normal text-slate-500">កញ្ចប់</span>
            </div>
          </div>

          <div className="p-2 sm:p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/50">
            <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
              អ្នកធ្វើប្រតិបត្តិការ
            </div>
            <div className="text-base sm:text-xl font-black text-indigo-900 dark:text-indigo-100 font-mono mt-0.5">
              {summaries.length} <span className="text-[10px] font-normal text-slate-500">នាក់</span>
            </div>
          </div>

          <div className="p-2 sm:p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/50">
            <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
              ប្រតិបត្តិការសរុបទាំងអស់
            </div>
            <div className="text-base sm:text-xl font-black text-amber-900 dark:text-amber-100 font-mono mt-0.5">
              {totalAll} <span className="text-[10px] font-normal text-slate-500">កញ្ចប់</span>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 📜 MODAL BODY CONTENT */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3 custom-scrollbar">
          {activeTab === 'TABLE' ? (
            /* ==================== 1. OPERATOR BREAKDOWN TABLE ==================== */
            <div className="space-y-3">
              {summaries.length === 0 ? (
                <div className="p-8 text-center text-slate-400 space-y-2">
                  <Users className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
                  <p className="font-semibold text-xs text-slate-600 dark:text-slate-300">
                    មិនមានប្រតិបត្តិការចែកចាយសម្រាប់កាលបរិច្ឆេទ {selectedDate} ឡើយ
                  </p>
                  <p className="text-[11px] text-slate-400">
                    សូមជ្រើសរើសកាលបរិច្ឆេទផ្សេង ឬបញ្ចូលរបាយការណ៍ចែកចាយថ្មី
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700 text-[10.5px] uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3 w-12 text-center">ចំណាត់ថ្នាក់</th>
                        <th className="py-2.5 px-3 min-w-[200px]">EMAIL (អ្នកធ្វើប្រតិបត្តិការ)</th>
                        <th className="py-2.5 px-3 text-right">ប្រតិបត្តិការថ្ងៃនេះ</th>
                        <th className="py-2.5 px-3 w-28 text-center">ចំណែក (%)</th>
                        <th className="py-2.5 px-3 text-right">សរុបទាំងអស់</th>
                        <th className="py-2.5 px-3 text-center w-20">សកម្មភាព</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-[#0d1629]">
                      {summaries.map((op, index) => {
                        const rankBadge =
                          index === 0
                            ? '🥇 #1'
                            : index === 1
                            ? '🥈 #2'
                            : index === 2
                            ? '🥉 #3'
                            : `#${index + 1}`;
                        const isTop = index === 0 && op.todayCount > 0;

                        return (
                          <tr
                            key={op.operatorEmail || op.operatorName || index}
                            className={`hover:bg-sky-50/40 dark:hover:bg-sky-950/20 transition-colors ${
                              isTop ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                            }`}
                          >
                            <td className="py-2.5 px-3 text-center font-bold text-slate-500 font-mono text-xs">
                              {rankBadge}
                            </td>

                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold flex items-center justify-center text-xs shrink-0 font-mono">
                                  {(op.operatorName || 'U').charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                                    <span>{op.operatorName}</span>
                                    {isTop && (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500 text-white font-bold">
                                        Top
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10.5px] font-mono text-slate-400 truncate">
                                    {op.operatorEmail || 'No Email'}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="py-2.5 px-3 text-right">
                              <span className="font-mono font-bold text-sm text-sky-600 dark:text-sky-400">
                                {op.todayCount}
                              </span>
                              <span className="text-[10px] text-slate-400 ml-1">កញ្ចប់</span>
                            </td>

                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                                  <div
                                    className="bg-gradient-to-r from-sky-500 to-indigo-500 h-full rounded-full transition-all"
                                    style={{ width: `${Math.min(op.percentage, 100)}%` }}
                                  />
                                </div>
                                <span className="font-mono font-bold text-[10.5px] text-slate-600 dark:text-slate-300 w-10 text-right">
                                  {op.percentage}%
                                </span>
                              </div>
                            </td>

                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-500 text-xs">
                              {op.totalCount}
                            </td>

                            <td className="py-2.5 px-3 text-center">
                              {onFilterOperator && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onFilterOperator(op.operatorEmail || op.operatorName);
                                    onClose();
                                  }}
                                  className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-sky-50 dark:hover:bg-sky-950/40 text-slate-600 dark:text-slate-300 text-[10.5px] font-semibold flex items-center gap-1 mx-auto cursor-pointer"
                                  title="បង្ហាញរបាយការណ៍របស់បុគ្គលិកនេះ"
                                >
                                  <Filter className="w-3 h-3 text-sky-500" />
                                  <span>មើល</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            /* ==================== 2. TELEGRAM MESSAGE PREVIEW ==================== */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-sky-500" />
                  <span>ទម្រង់សារដែលនឹងផ្ញើទៅកាន់ Telegram Bot ម៉ោង 6:00 PM៖</span>
                </span>
                <button
                  type="button"
                  onClick={handleCopyMessage}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1 cursor-pointer transition"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-500" />
                      <span>បានចម្លង!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>ចម្លងសារ</span>
                    </>
                  )}
                </button>
              </div>

              {/* Mock Telegram Bubble View */}
              <div className="p-4 rounded-2xl bg-[#17212b] text-white border border-[#242f3d] font-sans text-xs sm:text-[13px] leading-relaxed shadow-lg max-h-[50vh] overflow-y-auto custom-scrollbar whitespace-pre-wrap select-text">
                <div
                  dangerouslySetInnerHTML={{
                    __html: telegramPreviewText
                  }}
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                <p className="font-bold text-slate-700 dark:text-slate-200">
                  💡 ដំណើរការស្វ័យប្រវត្ត (Automated Trigger)៖
                </p>
                <p>
                  - ប្រព័ន្ធនឹងពិនិត្យ និងផ្ញើរបាយការណ៍សរុបនេះទៅកាន់ Telegram Bot ដោយស្វ័យប្រវត្តរៀងរាល់ម៉ោង <strong>6:00 PM</strong> ជារៀងរាល់ថ្ងៃ។
                </p>
                <p>
                  - លោកអ្នកក៏អាចចុចប៊ូតុង <strong>«ផ្ញើសរុបទៅ Telegram ឥឡូវនេះ»</strong> ខាងក្រោម ដើម្បីផ្ញើសាកល្បង ឬផ្ញើមុនម៉ោងបានភ្លាមៗ។
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 🔘 MODAL FOOTER ACTIONS */}
        {/* ========================================================================= */}
        <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-xs font-semibold cursor-pointer text-center"
          >
            បិទ
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyMessage}
              className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>ចម្លងសារ</span>
            </button>

            <button
              type="button"
              onClick={handleSendTelegram}
              disabled={isSending || summaries.length === 0}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-700 hover:from-sky-700 hover:to-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-sky-600/30 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>កំពុងផ្ញើទៅ Telegram...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>🚀 ផ្ញើសរុបទៅ Telegram ឥឡូវនេះ</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
