import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { InvoiceHandover, WAREHOUSE_STEP_LABEL } from '../services/invoiceHandoverService';

/** One batch (Operation Code) to print; several batches print one after another, each on its own page. */
export interface HandoverManifestGroup {
  key: string;
  /** OP-INV-… ; empty for records saved before batches */
  code: string;
  date: string; // YYYY-MM-DD
  staff: string;
  operator: string;
  rows: InvoiceHandover[];
}

interface Props {
  groups: HandoverManifestGroup[];
  onClose: () => void;
}

const showDate = (d: string) => (d ? d.split('-').reverse().join('/') : '');
const money = (n: number, c: 'USD' | 'KHR') =>
  c === 'USD' ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${n.toLocaleString('en-US')} ៛`;

function totals(rows: InvoiceHandover[]) {
  let usd = 0;
  let khr = 0;
  for (const h of rows) {
    if (h.amount) h.currency === 'KHR' ? (khr += h.amount) : (usd += h.amount);
  }
  return { usd, khr };
}

export const HandoverManifestModal: React.FC<Props> = ({ groups, onClose }) => {
  useEffect(() => {
    document.body.classList.add('manifest-modal-open');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('manifest-modal-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const count = groups.reduce((s, g) => s + g.rows.length, 0);

  return createPortal(
    <div
      id="manifest-portal-root"
      className="printable-manifest-container fixed inset-0 z-[99999] bg-slate-900/75 flex items-start justify-center p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static"
    >
      <div className="printable-manifest-card bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-4xl w-full my-auto overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 print:hidden">
          <div className="flex items-center gap-2 min-w-0">
            <Printer className="w-4 h-4 text-cyan-600 shrink-0" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-xs sm:text-sm truncate">
              ប័ណ្ណប្រគល់វិក័យប័ត្រ (Manifest) · {groups.length} ប្រតិបត្តិការ · {count} វិក័យប័ត្រ
            </h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> បោះពុម្ព (Print)
            </button>
            <button type="button" onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {groups.map((g, gi) => {
          const t = totals(g.rows);
          return (
            <div
              key={g.key}
              className="p-4 sm:p-6 text-xs text-slate-900 dark:text-white bg-white dark:bg-slate-900 print:text-black print:p-0 print:bg-white"
              style={gi < groups.length - 1 ? { breakAfter: 'page' } : undefined}
            >
              <div className="flex flex-wrap items-start justify-between gap-2 pb-2 mb-2 border-b-2 border-slate-800 print:border-black">
                <div>
                  <h1 className="text-sm sm:text-[15px] font-black leading-tight">ប័ណ្ណប្រគល់វិក័យប័ត្រ (INVOICE HANDOVER MANIFEST)</h1>
                  <h2 className="text-[11.5px] font-bold text-cyan-700 print:text-black mt-0.5">Invoices received from staff</h2>
                </div>
                <div className="text-right">
                  {g.code && (
                    <div className="px-2 py-0.5 rounded-md bg-slate-900 text-white print:bg-black font-mono font-bold text-[10.5px] inline-block">{g.code}</div>
                  )}
                  <div className="font-mono font-semibold text-[11px] mt-0.5">{showDate(g.date)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-lg overflow-hidden border border-slate-200 print:border-slate-400 bg-slate-200 print:bg-slate-400 mb-2.5">
                {[
                  ['អ្នកប្រគល់ (Staff)', g.staff || '—'],
                  ['អ្នកទទួល / កត់ត្រា', g.operator || '—'],
                  ['ចំនួន', `${g.rows.length} វិក័យប័ត្រ`],
                  ['សរុបទឹកប្រាក់', [t.usd ? money(t.usd, 'USD') : '', t.khr ? money(t.khr, 'KHR') : ''].filter(Boolean).join(' · ') || '—'],
                ].map(([label, value]) => (
                  <div key={label} className="bg-slate-50 dark:bg-slate-800 print:bg-white px-2.5 py-1.5">
                    <div className="text-[9px] font-semibold uppercase text-slate-500 print:text-slate-600">{label}</div>
                    <div className="text-[11.5px] font-bold break-words">{value}</div>
                  </div>
                ))}
              </div>

              <table className="w-full border border-slate-300 print:border-black text-left text-[11px] mb-4">
                <thead className="bg-slate-100 dark:bg-slate-800 print:bg-slate-200 font-bold">
                  <tr className="border-b border-slate-300 print:border-black">
                    <th className="py-1.5 px-2 w-8 text-center border-r border-slate-300 print:border-black">#</th>
                    <th className="py-1.5 px-2 border-r border-slate-300 print:border-black">Barcode</th>
                    <th className="py-1.5 px-2 border-r border-slate-300 print:border-black">អ្នកផ្ញើ → អ្នកទទួល</th>
                    <th className="py-1.5 px-2 border-r border-slate-300 print:border-black">អ្នកចែក</th>
                    <th className="py-1.5 px-2 border-r border-slate-300 print:border-black">ឃ្លាំង / Prep Code</th>
                    <th className="py-1.5 px-2 text-right border-r border-slate-300 print:border-black">ទឹកប្រាក់</th>
                    <th className="py-1.5 px-2">ចំណាំ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 print:divide-black">
                  {g.rows.map((h, i) => (
                    <tr key={h.id}>
                      <td className="py-1 px-2 text-center font-mono border-r border-slate-300 print:border-black">{i + 1}</td>
                      <td className="py-1 px-2 font-mono font-bold border-r border-slate-300 print:border-black whitespace-nowrap">{h.barcode}</td>
                      <td className="py-1 px-2 border-r border-slate-300 print:border-black">
                        {h.linkInfo?.shipper || h.linkInfo?.consignee ? `${h.linkInfo?.shipper || '—'} → ${h.linkInfo?.consignee || '—'}` : '—'}
                      </td>
                      <td className="py-1 px-2 border-r border-slate-300 print:border-black">{h.linkInfo?.warehousePerson || '—'}</td>
                      <td className="py-1 px-2 border-r border-slate-300 print:border-black">
                        {[h.linkInfo?.warehouseType ? WAREHOUSE_STEP_LABEL[h.linkInfo.warehouseType] || h.linkInfo.warehouseType : '', h.linkInfo?.prepCode]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </td>
                      <td className="py-1 px-2 text-right font-mono border-r border-slate-300 print:border-black whitespace-nowrap">
                        {h.amount === null ? '—' : money(h.amount, h.currency)}
                      </td>
                      <td className="py-1 px-2">{h.note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="grid grid-cols-3 gap-6 pt-5 pb-2 text-center border-t border-slate-300 print:border-black text-[11px]">
                {['អ្នកប្រគល់ (Handed over by)', 'អ្នកទទួល (Received by)', 'ប្រធាន (Supervisor)'].map((label) => (
                  <div key={label}>
                    <p className="font-bold">{label}</p>
                    <div className="mt-9 border-t border-dashed border-slate-400 mx-4" />
                    <p className="text-[10px] text-slate-500 mt-1">ហត្ថលេខា & ឈ្មោះ</p>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-center text-[9px] text-slate-400 print:text-slate-600 font-mono">
                ប័ណ្ណនេះបង្កើតដោយប្រព័ន្ធ IAL Accounting ពេល៖ {new Date().toLocaleString('km-KH')}
              </div>
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  );
};
