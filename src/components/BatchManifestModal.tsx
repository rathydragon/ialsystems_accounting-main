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
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 print:hidden">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm sm:text-base">
              មើល និងបោះពុម្ពប័ណ្ណប្រតិបត្តិការ (Batch Manifest)
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>បោះពុម្ព (Print)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Paper Canvas */}
        <div className="p-6 sm:p-8 text-slate-900 dark:text-white print:text-black print:p-0 print:m-0 print:bg-white text-xs">
          
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-4 mb-4">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-xl font-black tracking-tight text-slate-900 print:text-black">
                  IAL SYSTEMS LOGISTICS & WAREHOUSE
                </h1>
                <p className="text-[11px] text-slate-600 print:text-slate-700 font-medium">
                  ប្រព័ន្ធគ្រប់គ្រងប្រតិបត្តិការឃ្លាំង និងចែកចាយទំនិញ
                </p>
              </div>
              <div className="text-right">
                <span className="inline-block px-3 py-1 rounded-md bg-slate-900 text-white print:bg-black print:text-white font-mono font-bold text-xs uppercase">
                  {scanType}
                </span>
                <p className="text-[10px] text-slate-500 font-mono mt-1">
                  កាលបរិច្ឆេទ៖ {date}
                </p>
              </div>
            </div>

            <div className="mt-3 text-center">
              <h2 className="text-base font-bold text-slate-800 print:text-black">
                {title.km}
              </h2>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                {title.en}
              </p>
            </div>
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 print:bg-slate-50 print:border print:border-slate-300 mb-4 text-[11px]">
            {destination && (
              <div>
                <span className="text-slate-500 block text-[10px]">ទីតាំង / សាខា៖</span>
                <span className="font-bold text-slate-800 print:text-black flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-cyan-600 print:hidden" />
                  {destination}
                </span>
              </div>
            )}

            {(scanType === 'SCAN_IN' || scanType === 'SCAN_OUT') && (driverName || items.find((it) => it.driverName)?.driverName) && (
              <div>
                <span className="text-slate-500 block text-[10px]">Driver (អ្នកបើកបរ)៖</span>
                <span className="font-bold text-slate-800 print:text-black flex items-center gap-1">
                  <User className="w-3 h-3 text-cyan-600 print:hidden" />
                  {driverName || items.find((it) => it.driverName)?.driverName}
                </span>
              </div>
            )}

            {(scanType === 'SCAN_IN' || scanType === 'SCAN_OUT') && (truckNo || items.find((it) => it.truckNo)?.truckNo) && (
              <div>
                <span className="text-slate-500 block text-[10px]">Truck No (ស្លាកលេខឡាន)៖</span>
                <span className="font-mono font-bold text-slate-800 print:text-black flex items-center gap-1">
                  <Truck className="w-3 h-3 text-cyan-600 print:hidden" />
                  {truckNo || items.find((it) => it.truckNo)?.truckNo}
                </span>
              </div>
            )}

            {scanType === 'OUT_OF_DELIVERY' && (riderName || items.find((it) => it.riderName)?.riderName) && (
              <div>
                <span className="text-slate-500 block text-[10px]">Rider / អ្នកដឹក៖</span>
                <span className="font-bold text-slate-800 print:text-black flex items-center gap-1 text-xs">
                  <User className="w-3.5 h-3.5 text-cyan-600 print:hidden" />
                  {riderName || items.find((it) => it.riderName)?.riderName}
                </span>
              </div>
            )}

            {scanType === 'OUT_OF_DELIVERY' && (deliveryZone || items.find((it) => it.deliveryZone)?.deliveryZone) && (
              <div>
                <span className="text-slate-500 block text-[10px]">តំបន់ដឹក (Zone)៖</span>
                <span className="font-semibold text-slate-800 print:text-black">
                  {deliveryZone || items.find((it) => it.deliveryZone)?.deliveryZone}
                </span>
              </div>
            )}

            {scanType === 'HOLD_REMAINING' && holdReason && (
              <div>
                <span className="text-slate-500 block text-[10px]">មូលហេតុនៅសល់៖</span>
                <span className="font-bold text-amber-700 print:text-black flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 text-amber-600 print:hidden" />
                  {holdReason}
                </span>
              </div>
            )}

            {scanType === 'HOLD_REMAINING' && shelfLocation && (
              <div>
                <span className="text-slate-500 block text-[10px]">ធ្នើរ / កន្លែងទុក (Shelf)៖</span>
                <span className="font-bold text-purple-700 print:text-black flex items-center gap-1">
                  <Archive className="w-3 h-3 text-purple-600 print:hidden" />
                  {shelfLocation}
                </span>
              </div>
            )}

            <div>
              <span className="text-slate-500 block text-[10px]">អ្នករៀបចំ (Operator)៖</span>
              <span className="font-semibold text-slate-800 print:text-black">
                {operatorName || 'System'}
              </span>
            </div>

            <div>
              <span className="text-slate-500 block text-[10px]">ចំនួនកញ្ចប់សរុប៖</span>
              <span className="font-bold font-mono text-cyan-700 print:text-black text-xs">
                {items.length} កញ្ចប់
              </span>
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
          <div className="grid grid-cols-3 gap-6 pt-8 pb-4 text-center border-t border-slate-300 print:border-black text-[11px]">
            <div>
              <p className="font-bold text-slate-800 print:text-black mb-12">
                អ្នកប្រគល់ (Dispatched By)
              </p>
              <div className="border-t border-dashed border-slate-400 mx-4"></div>
              <p className="text-[10px] text-slate-500 mt-1">ហត្ថលេខា & ឈ្មោះ</p>
            </div>

            <div>
              <p className="font-bold text-slate-800 print:text-black mb-12">
                អ្នកទទួល (Driver / Rider)
              </p>
              <div className="border-t border-dashed border-slate-400 mx-4"></div>
              <p className="text-[10px] text-slate-500 mt-1">ហត្ថលេខា & ឈ្មោះ</p>
            </div>

            <div>
              <p className="font-bold text-slate-800 print:text-black mb-12">
                ប្រធានឃ្លាំង (Warehouse Supervisor)
              </p>
              <div className="border-t border-dashed border-slate-400 mx-4"></div>
              <p className="text-[10px] text-slate-500 mt-1">ហត្ថលេខា & ឈ្មោះ</p>
            </div>
          </div>

          <div className="mt-4 text-center text-[9px] text-slate-400 print:text-slate-600 font-mono">
            ប័ណ្ណនេះត្រូវបានបង្កើតដោយប្រព័ន្ធ IAL Accounting & Warehouse Hub ពេល៖ {new Date().toLocaleString('km-KH')}
          </div>
        </div>

      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
