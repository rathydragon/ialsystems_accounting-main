import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';
import { WarehouseScanType } from '../types';
import { lookupKgFromDataReport } from '../services/warehouseScanService';

export interface ManifestItem {
  id: string;
  barcode: string;
  shipper?: string;
  consignee?: string;
  origin?: string;
  destination?: string;
  payment?: string;
  customerName?: string;
  customerPhone?: string;
  codAmount?: number;
  currency?: 'USD' | 'KHR';
  shelfLocation?: string;
  holdReason?: string;
  /** Return: company / shop the parcel goes back to */
  sendToCustomer?: string;
  remarks?: string;
  scannedAt?: string;
  driverName?: string;
  truckNo?: string;
  transferBy?: string;
  riderName?: string;
  deliveryZone?: string;
  weightKg?: number;
  sourceOperationCode?: string; // Arrived Hub: OP-OUT being received
  arrivalStatus?: 'MATCHED' | 'UNEXPECTED';
}

export interface BatchManifestModalProps {
  isOpen: boolean;
  onClose: () => void;
  scanType: WarehouseScanType;
  items: ManifestItem[];
  date: string;
  operationCode?: string;
  destination?: string;
  driverName?: string;
  truckNo?: string;
  transferBy?: string;
  riderName?: string;
  deliveryZone?: string;
  holdReason?: string;
  shelfLocation?: string;
  sendToCustomer?: string;
  operatorName?: string;
}

export const BatchManifestModal: React.FC<BatchManifestModalProps> = ({
  isOpen,
  onClose,
  scanType,
  items,
  date,
  operationCode,
  destination,
  driverName,
  truckNo,
  transferBy,
  riderName,
  deliveryZone,
  holdReason,
  shelfLocation,
  sendToCustomer,
  operatorName
}) => {
  if (!isOpen) return null;

  const totalUSD = items.reduce((acc, it) => (it.currency !== 'KHR' && it.codAmount ? acc + it.codAmount : acc), 0);
  const totalKHR = items.reduce((acc, it) => (it.currency === 'KHR' && it.codAmount ? acc + it.codAmount : acc), 0);

  const getItemKg = (it: ManifestItem): number => {
    if (it.weightKg !== undefined && it.weightKg !== null && !isNaN(it.weightKg)) {
      return it.weightKg;
    }
    return lookupKgFromDataReport(it.barcode) || 0;
  };

  const totalKg = React.useMemo(() => {
    const sum = items.reduce((acc, it) => acc + getItemKg(it), 0);
    return Math.round(sum * 100) / 100;
  }, [items]);

  const getManifestTitle = () => {
    switch (scanType) {
      case 'SCAN_IN':
        return {
          km: 'ប័ណ្ណបញ្ជីទំនិញចូលឃ្លាំង (SCAN-IN MANIFEST)',
          en: 'Warehouse Inbound Goods Receipt'
        };
      case 'SCAN_OUT':
        return {
          km: 'ប័ណ្ណបញ្ជូនទំនិញចេញពីឃ្លាំង (SCAN-OUT MANIFEST)',
          en: 'Warehouse Outbound Transfer Manifest'
        };
      case 'OUT_OF_DELIVERY':
        return {
          km: 'ប័ណ្ណប្រគល់ទំនិញចែកចាយ (OUT-OF-DELIVERY MANIFEST)',
          en: 'Last-Mile Delivery Dispatch Manifest'
        };
      case 'HOLD_REMAINING':
        return {
          km: 'ប័ណ្ណទំនិញផ្អាក / នៅសល់ក្នុងឃ្លាំង (WAREHOUSE HOLD MANIFEST)',
          en: 'Warehouse Hold & Remaining Inventory Audit'
        };
      case 'RETURN_SHIPMENTS':
        return {
          km: 'ប័ណ្ណទំនិញបង្វិលត្រឡប់ទៅម្ចាស់ (RETURN MANIFEST)',
          en: 'Return-to-Shipper Manifest'
        };
      case 'ARRIVED_HUB':
      default:
        return {
          km: 'ប័ណ្ណទទួលទំនិញចូលឃ្លាំង (ARRIVED HUB MANIFEST)',
          en: 'Hub Arrival Receipt (verified against ScanOut)'
        };
    }
  };

  const title = getManifestTitle();

  const uniqueJoin = (values: (string | undefined)[]) => Array.from(new Set(values.filter(Boolean))).join(', ');
  const isTruckType = scanType === 'SCAN_IN' || scanType === 'SCAN_OUT' || scanType === 'ARRIVED_HUB';
  // Hold and Return both list a reason instead of a destination (only Hold has a shelf)
  const isReasonType = scanType === 'HOLD_REMAINING' || scanType === 'RETURN_SHIPMENTS';
  const unexpectedCount = items.filter((it) => it.arrivalStatus === 'UNEXPECTED').length;
  const metaFields: { label: string; value: string; mono?: boolean; tone?: string; stat?: boolean }[] = [
    ...(scanType === 'ARRIVED_HUB' ? [{ label: 'ទទួលពី (OP-OUT)', value: uniqueJoin(items.map((it) => it.sourceOperationCode)), mono: true }] : []),
    ...(isTruckType
      ? [
          { label: 'ប្រភព (Origin)', value: uniqueJoin(items.map((it) => it.origin)) },
          { label: 'គោលដៅ (Destination)', value: destination || uniqueJoin(items.map((it) => it.destination)) },
          { label: 'អ្នកបើកបរ (Driver)', value: driverName || uniqueJoin(items.map((it) => it.driverName)) },
          { label: 'លេខឡាន (Truck)', value: truckNo || uniqueJoin(items.map((it) => it.truckNo)), mono: true }
        ]
      : []),
    ...(scanType === 'SCAN_IN' ? [{ label: 'Transfer By', value: transferBy || uniqueJoin(items.map((it) => it.transferBy)) }] : []),
    ...(scanType === 'OUT_OF_DELIVERY'
      ? [
          { label: 'Rider', value: riderName || uniqueJoin(items.map((it) => it.riderName)), tone: 'text-blue-700 dark:text-blue-400' },
          { label: 'Zone', value: deliveryZone || uniqueJoin(items.map((it) => it.deliveryZone)) }
        ]
      : []),
    ...(scanType === 'HOLD_REMAINING'
      ? [
          { label: 'មូលហេតុ', value: holdReason || '', tone: 'text-amber-700 dark:text-amber-400' },
          { label: 'ធ្នើរ', value: shelfLocation || '', tone: 'text-purple-700 dark:text-purple-400' }
        ]
      : []),
    ...(scanType === 'RETURN_SHIPMENTS'
      ? [{ label: 'បញ្ជូនទៅ (Send to)', value: sendToCustomer || uniqueJoin(items.map((it) => it.sendToCustomer)), tone: 'text-rose-700 dark:text-rose-400' }, { label: 'មូលហេតុបង្វិល', value: holdReason || uniqueJoin(items.map((it) => it.holdReason)), tone: 'text-rose-700 dark:text-rose-400' }]
      : []),
    { label: 'អ្នករៀបចំ', value: operatorName || 'System' },
    ...(unexpectedCount > 0
      ? [{ label: 'លើស/ខុសបញ្ជី', value: `${unexpectedCount}`, mono: true, stat: true, tone: 'text-amber-700 dark:text-amber-300' }]
      : []),
    { label: 'កញ្ចប់', value: `${items.length}`, mono: true, stat: true, tone: 'text-cyan-700 dark:text-cyan-300' },
    {
      label: 'KG',
      value: totalKg > 0 ? totalKg.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '0',
      mono: true,
      stat: true,
      tone: 'text-amber-700 dark:text-amber-300'
    }
  ].filter((f) => f.value);

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('manifest-modal-open');
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.classList.remove('manifest-modal-open');
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  const handlePrint = () => {
    window.print();
  };

  const modalContent = (
    <div
      id="manifest-portal-root"
      className="printable-manifest-container fixed inset-0 z-[99999] bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:p-0 print:m-0 print:bg-white print:static print:z-auto"
    >
      <div className="printable-manifest-card bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-4xl w-full my-auto overflow-hidden print:border-none print:shadow-none print:max-w-none print:w-full print:rounded-none">
        
        {/* Header toolbar (Hidden in print) */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 print:hidden">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-xs sm:text-sm">
              មើល និងបោះពុម្ពប័ណ្ណប្រតិបត្តិការ (Batch Manifest)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>បោះពុម្ព (Print)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Paper Canvas */}
        <div className="p-4 sm:p-6 text-slate-900 dark:text-white print:text-black print:p-0 print:m-0 print:bg-white text-xs">
          
          {/* Header: brand + document title (left) • type, code & date (right) */}
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 pb-2 mb-2 border-b-2 border-slate-800 dark:border-slate-300 print:border-black">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-600 to-blue-700 flex items-center justify-center text-white font-black text-xs shadow-xs print:border print:border-black print:bg-black print:text-white shrink-0">
                IAL
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-[15px] font-black tracking-tight text-slate-900 dark:text-white print:text-black leading-tight">
                  IAL SYSTEMS LOGISTICS & WAREHOUSE
                </h1>
                <h2 className="text-[11.5px] font-bold text-cyan-700 dark:text-cyan-300 print:text-black leading-tight mt-0.5">
                  {title.km}
                </h2>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-slate-900 dark:bg-slate-700 text-white print:bg-black print:text-white font-mono font-bold text-[10px] uppercase tracking-wide">
                  {scanType}
                </span>
                <span className="text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-200 print:text-black">{date}</span>
              </div>
              {operationCode && (
                <span className="font-mono font-bold text-[10.5px] text-cyan-800 dark:text-cyan-200 print:text-black">
                  {operationCode}
                </span>
              )}
            </div>
          </div>

          {/* Metadata strip: label above value, one compact row */}
          <div className="flex flex-wrap items-stretch rounded-lg border border-slate-200 dark:border-slate-700 print:border-slate-400 bg-slate-50 dark:bg-slate-800/40 print:bg-transparent mb-2.5 divide-x divide-slate-200 dark:divide-slate-700 print:divide-slate-400">
            {metaFields.map((f) => (
              <div key={f.label} className={`px-2.5 py-1.5 min-w-0 ${f.stat ? 'flex-none text-right' : 'flex-1 min-w-[96px]'}`}>
                <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 print:text-slate-600 whitespace-nowrap">
                  {f.label}
                </div>
                <div
                  className={`text-[11.5px] font-bold leading-snug break-words print:text-black ${f.mono ? 'font-mono' : ''} ${f.tone || 'text-slate-900 dark:text-slate-100'}`}
                >
                  {f.value}
                </div>
              </div>
            ))}
          </div>

          {/* Table of Items */}
          <div className="overflow-x-auto border border-slate-300 dark:border-slate-700 rounded-lg print:border-black mb-4">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800 print:bg-slate-200 text-slate-700 print:text-black font-bold border-b border-slate-300 print:border-black">
                <tr>
                  <th className="py-2 px-2.5 w-10 text-center border-r border-slate-300 print:border-black">#</th>
                  <th className="py-2 px-3 border-r border-slate-300 print:border-black">លេខ Barcode / Tracking</th>
                  <th className="py-2 px-3 border-r border-slate-300 print:border-black">SHIPPER (អ្នកផ្ញើ)</th>
                  <th className="py-2 px-3 border-r border-slate-300 print:border-black">CONSIGNEE (អ្នកទទួល)</th>
                  {!isReasonType && (
                    <th className="py-2 px-2.5 border-r border-slate-300 print:border-black">DESTINATION (គោលដៅ)</th>
                  )}
                  {isReasonType && (
                    <>
                      <th className="py-2 px-3 border-r border-slate-300 print:border-black text-amber-800 print:text-black">
                        {scanType === 'RETURN_SHIPMENTS' ? 'មូលហេតុបង្វិល (Return Reason)' : 'មូលហេតុនៅសល់ក្នុងឃ្លាំង (Reason)'}
                      </th>
                      {scanType === 'HOLD_REMAINING' && (
                        <th className="py-2 px-2.5 border-r border-slate-300 print:border-black">
                          ធ្នើរ (Shelf)
                        </th>
                      )}
                    </>
                  )}
                  <th className="py-2 px-3 text-right">PAYMENT / COD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 print:divide-black font-sans">
                {items.map((item, idx) => (
                  <tr key={item.id} className="print:text-black">
                    <td className="py-1.5 px-2.5 text-center font-mono border-r border-slate-300 print:border-black">
                      {idx + 1}
                    </td>
                    <td className="py-1.5 px-3 font-mono font-bold border-r border-slate-300 print:border-black">
                      {item.barcode}
                    </td>
                    <td className="py-1.5 px-3 border-r border-slate-300 print:border-black truncate max-w-[140px]">
                      {item.shipper || '—'}
                    </td>
                    <td className="py-1.5 px-3 border-r border-slate-300 print:border-black font-semibold truncate max-w-[150px]">
                      {item.consignee || item.customerName || '—'}
                      {item.customerPhone ? ` (${item.customerPhone})` : ''}
                    </td>
                    {!isReasonType && (
                      <td className="py-1.5 px-2.5 border-r border-slate-300 print:border-black truncate max-w-[130px]">
                        {item.destination || destination || '—'}
                      </td>
                    )}
                    {isReasonType && (
                      <>
                        <td className="py-1.5 px-3 border-r border-slate-300 print:border-black font-semibold text-amber-800 dark:text-amber-300 print:text-black max-w-[200px]">
                          <div>{item.holdReason || holdReason || '—'}</div>
                          {scanType === 'RETURN_SHIPMENTS' && (item.sendToCustomer || sendToCustomer) && (
                            <div className="text-[10.5px] text-slate-700 print:text-black font-semibold mt-0.5">
                              បញ្ជូនទៅ: {item.sendToCustomer || sendToCustomer}
                            </div>
                          )}
                          {item.remarks && (
                            <div className="text-[10px] text-slate-500 print:text-gray-700 font-normal italic mt-0.5">
                              ចំណាំ: {item.remarks}
                            </div>
                          )}
                        </td>
                        {scanType === 'HOLD_REMAINING' && (
                          <td className="py-1.5 px-2.5 border-r border-slate-300 print:border-black font-mono font-medium text-purple-800 dark:text-purple-300 print:text-black">
                            {item.shelfLocation || shelfLocation || '—'}
                          </td>
                        )}
                      </>
                    )}
                    <td className="py-1.5 px-3 text-right font-mono font-bold">
                      {item.payment ? (
                        <span>{item.payment}</span>
                      ) : item.codAmount !== undefined ? (
                        item.currency === 'KHR'
                          ? `${item.codAmount.toLocaleString()} ៛`
                          : `$${item.codAmount.toFixed(2)}`
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-900 print:border-black bg-slate-50 print:bg-slate-100 font-bold">
                <tr>
                  <td
                    colSpan={
                      scanType === 'HOLD_REMAINING'
                        ? 6
                        : 5
                    }
                    className="py-2 px-3 text-right"
                  >
                    សរុបទឹកប្រាក់ COD (Total COD):
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-xs">
                    {totalUSD > 0 && <span>${totalUSD.toFixed(2)}</span>}
                    {totalUSD > 0 && totalKHR > 0 && <span> | </span>}
                    {totalKHR > 0 && <span>{totalKHR.toLocaleString()} ៛</span>}
                    {totalUSD === 0 && totalKHR === 0 && <span>$0.00</span>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Signatures Section */}
          <div className="grid grid-cols-3 gap-6 pt-5 pb-2 text-center border-t border-slate-300 print:border-black text-[11px]">
            <div>
              <p className="font-bold text-slate-800 print:text-black mb-10">
                អ្នកប្រគល់ (Dispatched By)
              </p>
              <div className="border-t border-dashed border-slate-400 mx-4"></div>
              <p className="text-[10px] text-slate-500 mt-1">ហត្ថលេខា & ឈ្មោះ</p>
            </div>

            <div>
              <p className="font-bold text-slate-800 print:text-black mb-10">
                អ្នកទទួល (Driver / Rider)
              </p>
              <div className="border-t border-dashed border-slate-400 mx-4"></div>
              <p className="text-[10px] text-slate-500 mt-1">ហត្ថលេខា & ឈ្មោះ</p>
            </div>

            <div>
              <p className="font-bold text-slate-800 print:text-black mb-10">
                ប្រធានឃ្លាំង (Warehouse Supervisor)
              </p>
              <div className="border-t border-dashed border-slate-400 mx-4"></div>
              <p className="text-[10px] text-slate-500 mt-1">ហត្ថលេខា & ឈ្មោះ</p>
            </div>
          </div>

          <div className="mt-2.5 text-center text-[9px] text-slate-400 print:text-slate-600 font-mono">
            ប័ណ្ណនេះត្រូវបានបង្កើតដោយប្រព័ន្ធ IAL Accounting & Warehouse Hub ពេល៖ {new Date().toLocaleString('km-KH')}
          </div>
        </div>

      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
