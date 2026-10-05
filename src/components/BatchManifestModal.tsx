import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Printer,
  Package,
  Truck,
  User,
  Calendar,
  MapPin,
  Archive,
  AlertCircle
} from 'lucide-react';
import { WarehouseScanType } from '../types';

export interface ManifestItem {
  id: string;
  barcode: string;
  shipper?: string;
  consignee?: string;
  destination?: string;
  payment?: string;
  customerName?: string;
  customerPhone?: string;
  codAmount?: number;
  currency?: 'USD' | 'KHR';
  shelfLocation?: string;
  holdReason?: string;
  remarks?: string;
  scannedAt?: string;
  driverName?: string;
  truckNo?: string;
  riderName?: string;
  deliveryZone?: string;
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
  riderName?: string;
  deliveryZone?: string;
  holdReason?: string;
  shelfLocation?: string;
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
  riderName,
  deliveryZone,
  holdReason,
  shelfLocation,
  operatorName
}) => {
  if (!isOpen) return null;

  const totalUSD = items.reduce((acc, it) => (it.currency !== 'KHR' && it.codAmount ? acc + it.codAmount : acc), 0);
  const totalKHR = items.reduce((acc, it) => (it.currency === 'KHR' && it.codAmount ? acc + it.codAmount : acc), 0);

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
    }
  };

  const title = getManifestTitle();
  const displayDestination = destination || items.find((it) => it.destination)?.destination;

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
          
          {/* Compact Modern Header */}
          <div className="border-b border-slate-300 dark:border-slate-700/80 print:border-black pb-2.5 mb-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Brand & Subtitle */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-600 to-blue-700 flex items-center justify-center text-white font-black text-xs shadow-xs print:border print:border-black print:bg-black print:text-white shrink-0">
                  IAL
                </div>
                <div>
                  <h1 className="text-sm sm:text-base font-black tracking-tight text-slate-900 dark:text-white print:text-black leading-none">
                    IAL SYSTEMS LOGISTICS & WAREHOUSE
                  </h1>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 print:text-slate-600 font-medium mt-0.5">
                    ប្រព័ន្ធគ្រប់គ្រងប្រតិបត្តិការឃ្លាំង និងចែកចាយទំនិញ
                  </p>
                </div>
              </div>

              {/* Tag, Operation Code & Date */}
              <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 text-right">
                {operationCode && (
                  <span className="px-2 py-0.5 rounded-md bg-cyan-50 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-200 border border-cyan-300 dark:border-cyan-800 font-mono font-bold text-[10px] tracking-wide print:border-black print:bg-transparent print:text-black">
                    កូដប្រតិបត្តិការ៖ {operationCode}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-md bg-slate-900 dark:bg-slate-800 text-white print:bg-black print:text-white font-mono font-bold text-[10.5px] uppercase tracking-wide">
                  {scanType}
                </span>
                <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300 print:text-black font-semibold">
                  កាលបរិច្ឆេទ៖ {date}
                </span>
              </div>
            </div>

            {/* Manifest Document Title (Compact Banner) */}
            <div className="mt-2 py-1.5 px-3 rounded-lg bg-slate-100 dark:bg-slate-800/60 print:bg-slate-50 print:border print:border-slate-300 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-4 rounded-full bg-cyan-600 print:bg-black shrink-0" />
                <h2 className="text-xs sm:text-[13px] font-bold text-slate-900 dark:text-slate-100 print:text-black">
                  {title.km}
                </h2>
              </div>
              
              {displayDestination ? (
                <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900/90 px-2.5 py-0.5 rounded-md border border-slate-200/90 dark:border-slate-700/80 print:border-none print:bg-transparent shadow-2xs shrink-0">
                  <MapPin className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0 print:hidden" />
                  <span className="text-slate-500 dark:text-slate-400 print:text-black text-[10.5px] font-medium">
                    ទីតាំង:
                  </span>
                  <span className="text-xs sm:text-[12.5px] font-bold text-cyan-900 dark:text-cyan-200 print:text-black">
                    {displayDestination}
                  </span>
                </div>
              ) : (
                <span className="text-[9.5px] font-mono font-semibold text-slate-500 dark:text-slate-400 print:text-slate-600 uppercase tracking-wider hidden sm:inline">
                  {title.en}
                </span>
              )}
            </div>
          </div>

          {/* Compact Modern Metadata Strip (Single/Two row sleek bar) */}
          <div className="py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/90 dark:border-slate-700/60 print:bg-slate-50 print:border print:border-slate-300 mb-2.5 text-[11px]">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5">
              {(scanType === 'SCAN_IN' || scanType === 'SCAN_OUT') && (driverName || items.find((it) => it.driverName)?.driverName) && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <User className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0 print:hidden" />
                  <span className="text-slate-500 text-[10px] shrink-0 font-medium">Driver:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100 print:text-black truncate" title={driverName || items.find((it) => it.driverName)?.driverName}>
                    {driverName || items.find((it) => it.driverName)?.driverName}
                  </span>
                </div>
              )}

              {(scanType === 'SCAN_IN' || scanType === 'SCAN_OUT') && (truckNo || items.find((it) => it.truckNo)?.truckNo) && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <Truck className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0 print:hidden" />
                  <span className="text-slate-500 text-[10px] shrink-0 font-medium">Truck:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-100 print:text-black truncate" title={truckNo || items.find((it) => it.truckNo)?.truckNo}>
                    {truckNo || items.find((it) => it.truckNo)?.truckNo}
                  </span>
                </div>
              )}

              {scanType === 'OUT_OF_DELIVERY' && (riderName || items.find((it) => it.riderName)?.riderName) && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <User className="w-3 h-3 text-cyan-600 dark:text-cyan-400 shrink-0 print:hidden" />
                  <span className="text-slate-500 text-[10px] shrink-0 font-medium">Rider:</span>
                  <span className="font-bold text-blue-700 dark:text-blue-400 print:text-black truncate">
                    {riderName || items.find((it) => it.riderName)?.riderName}
                  </span>
                </div>
              )}

              {scanType === 'OUT_OF_DELIVERY' && (deliveryZone || items.find((it) => it.deliveryZone)?.deliveryZone) && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-slate-500 text-[10px] shrink-0 font-medium">Zone:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100 print:text-black truncate">
                    {deliveryZone || items.find((it) => it.deliveryZone)?.deliveryZone}
                  </span>
                </div>
              )}

              {scanType === 'HOLD_REMAINING' && holdReason && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <AlertCircle className="w-3 h-3 text-amber-600 shrink-0 print:hidden" />
                  <span className="text-slate-500 text-[10px] shrink-0 font-medium">មូលហេតុ:</span>
                  <span className="font-bold text-amber-700 dark:text-amber-400 print:text-black truncate">
                    {holdReason}
                  </span>
                </div>
              )}

              {scanType === 'HOLD_REMAINING' && shelfLocation && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <Archive className="w-3 h-3 text-purple-600 shrink-0 print:hidden" />
                  <span className="text-slate-500 text-[10px] shrink-0 font-medium">ធ្នើរ:</span>
                  <span className="font-bold text-purple-700 dark:text-purple-400 print:text-black truncate">
                    {shelfLocation}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-slate-500 text-[10px] shrink-0 font-medium">អ្នករៀបចំ:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100 print:text-black truncate" title={operatorName}>
                  {operatorName || 'System'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 min-w-0">
                <Package className="w-3 h-3 text-cyan-600 dark:text-cyan-400 shrink-0 print:hidden" />
                <span className="text-slate-500 text-[10px] shrink-0 font-medium">ចំនួនសរុប:</span>
                <span className="font-bold font-mono text-cyan-700 dark:text-cyan-300 print:text-black">
                  {items.length} កញ្ចប់
                </span>
              </div>
            </div>
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
                  <th className="py-2 px-2.5 border-r border-slate-300 print:border-black">DESTINATION (គោលដៅ)</th>
                  {scanType === 'HOLD_REMAINING' && (
                    <>
                      <th className="py-2 px-3 border-r border-slate-300 print:border-black text-amber-800 print:text-black">
                        មូលហេតុនៅសល់ក្នុងឃ្លាំង (Reason)
                      </th>
                      <th className="py-2 px-2.5 border-r border-slate-300 print:border-black">
                        ធ្នើរ (Shelf)
                      </th>
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
                    <td className="py-1.5 px-2.5 border-r border-slate-300 print:border-black truncate max-w-[130px]">
                      {item.destination || destination || '—'}
                    </td>
                    {scanType === 'HOLD_REMAINING' && (
                      <>
                        <td className="py-1.5 px-3 border-r border-slate-300 print:border-black font-semibold text-amber-800 dark:text-amber-300 print:text-black max-w-[200px]">
                          {item.holdReason || holdReason || '—'}
                        </td>
                        <td className="py-1.5 px-2.5 border-r border-slate-300 print:border-black font-mono font-medium text-purple-800 dark:text-purple-300 print:text-black">
                          {item.shelfLocation || shelfLocation || '—'}
                        </td>
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
                        ? 7
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
