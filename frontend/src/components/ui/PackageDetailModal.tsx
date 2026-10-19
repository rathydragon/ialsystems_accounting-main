import React from 'react';
import {
  X, Copy, Check, DollarSign, Coins, User, MapPin, Navigation, Truck, ArrowRightLeft,
  Calendar, Hash, Boxes, Weight, StickyNote, CheckCircle2, Clock, ShieldCheck, RotateCcw,
  Layers, Package,
} from 'lucide-react';

type Accent = 'blue' | 'purple';

const ACCENTS: Record<Accent, {
  hero: string;
  heroIcon: string;
  chip: string;
  sectionIcon: string;
  remark: string;
  hoverRow: string;
  copyAll: string;
}> = {
  blue: {
    hero: 'from-blue-600 via-indigo-600 to-indigo-700',
    heroIcon: 'text-blue-100',
    chip: 'text-blue-50',
    sectionIcon: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400',
    remark: 'text-blue-700 dark:text-blue-300',
    hoverRow: 'hover:bg-blue-50/60 dark:hover:bg-blue-950/30',
    copyAll: 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/25',
  },
  purple: {
    hero: 'from-purple-600 via-violet-600 to-indigo-700',
    heroIcon: 'text-purple-100',
    chip: 'text-purple-50',
    sectionIcon: 'bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400',
    remark: 'text-purple-700 dark:text-purple-300',
    hoverRow: 'hover:bg-purple-50/60 dark:hover:bg-purple-950/30',
    copyAll: 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/25',
  },
};

export interface PackageDetailValues {
  awbn: string;
  usd: string;
  khm: string;
  receiver: string;
  address: string;
  dest: string;
  handleBy: string;
  transferTo: string;
  deliveryDate: string;
  custId: string;
  unit: string;
  kg: string;
  remarks: string;
  check: string;
  gotCod: string;
  clear: string;
  return: string;
}

export interface PackageDetailExtraField {
  id: string;
  label: string;
  value: string;
}

interface PackageDetailModalProps {
  accent?: Accent;
  rowNum: number | string;
  values: PackageDetailValues;
  extraFields: PackageDetailExtraField[];
  copiedCellId: string | null;
  rowCopied: boolean;
  onCopyCell: (text: string, id: string) => void;
  onCopyRow: () => void;
  onClose: () => void;
}

const isFilled = (v: string) => !!v && v.trim() !== '' && v.trim() !== '-' && v.trim() !== '—';

const CopiedTag: React.FC = () => (
  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
    <Check className="w-3 h-3" /> Copied
  </span>
);

const PackageDetailModal: React.FC<PackageDetailModalProps> = ({
  accent = 'blue',
  rowNum,
  values: v,
  extraFields,
  copiedCellId,
  rowCopied,
  onCopyCell,
  onCopyRow,
  onClose,
}) => {
  const a = ACCENTS[accent];
  const isCopied = (id: string) => copiedCellId === `modal_${id}`;
  const copyVal = (val: string, id: string) => {
    if (!isFilled(val)) return;
    onCopyCell(val, `modal_${id}`);
  };

  const usdDisplay = v.usd ? (v.usd.includes('$') ? v.usd : `$ ${v.usd}`) : '$ 0.00';
  const khmDisplay = v.khm ? (v.khm.includes('៛') ? v.khm : `${v.khm} ៛`) : '0 ៛';
  const isChecked = !!v.check && (v.check.toUpperCase() === 'TRUE' || v.check === '1');

  // Columns with no data are not shown at all
  const filledExtras = extraFields.filter(f => isFilled(f.value));
  const hasStatus = [v.check, v.gotCod, v.clear, v.return].some(isFilled);
  const hasReceiver = [v.receiver, v.address, v.dest].some(isFilled);
  const hasDelivery = [v.handleBy, v.transferTo, v.deliveryDate].some(isFilled);
  const hasSpecs = [v.custId, v.unit, v.kg, v.remarks].some(isFilled);

  // Label/value row used inside the two info sections
  const InfoRow = ({ id, icon: Icon, iconClass, label, value, mono, strong }: {
    id: string; icon: React.ElementType; iconClass: string; label: string; value: string; mono?: boolean; strong?: boolean;
  }) => !isFilled(value) ? null : (
    <button
      type="button"
      onClick={() => copyVal(value, id)}
      className={`group w-full flex items-start gap-2 px-2 py-1 rounded-lg text-left transition cursor-pointer ${a.hoverRow}`}
      title={`ចុចដើម្បីចម្លង ${label}`}
    >
      <span className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${iconClass}`}>
        <Icon className="w-3 h-3" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2 text-[10px] leading-tight font-medium text-slate-400 dark:text-slate-500">
          <span className="truncate">{label}</span>
          {isCopied(id) ? <CopiedTag /> : <Copy className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-60 transition" />}
        </span>
        <span className={`block text-xs leading-snug break-words text-slate-900 dark:text-white ${strong ? 'font-bold' : 'font-medium'} ${mono ? 'font-mono' : ''}`}>
          {value || <span className="text-slate-300 dark:text-slate-600">—</span>}
        </span>
      </span>
    </button>
  );

  const SpecTile = ({ id, icon: Icon, label, value, valueClass = '' }: {
    id: string; icon: React.ElementType; label: string; value: string; valueClass?: string;
  }) => !isFilled(value) ? null : (
    <button
      type="button"
      onClick={() => copyVal(value, id)}
      className="group flex-1 basis-[calc(50%-0.375rem)] sm:basis-0 text-left px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition cursor-pointer min-w-0"
      title={`ចុចដើម្បីចម្លង ${label}`}
    >
      <span className="flex items-center justify-between gap-1 text-[9.5px] leading-tight font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <span className="flex items-center gap-1 min-w-0">
          <Icon className="w-3 h-3 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        {isCopied(id) && <Check className="w-3 h-3 text-emerald-500 shrink-0" />}
      </span>
      <span className={`block text-xs font-bold truncate text-slate-800 dark:text-slate-100 ${valueClass}`}>
        {value || <span className="text-slate-300 dark:text-slate-600">—</span>}
      </span>
    </button>
  );

  const StatusPill = ({ id, icon: Icon, label, value, active, activeClass }: {
    id: string; icon: React.ElementType; label: string; value: string; active: boolean; activeClass: string;
  }) => !isFilled(value) ? null : (
    <button
      type="button"
      onClick={() => copyVal(value, id)}
      className={`flex-1 basis-[calc(50%-0.375rem)] sm:basis-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition cursor-pointer min-w-0 ${
        active
          ? activeClass
          : 'bg-slate-50 dark:bg-slate-800/40 border-dashed border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500'
      }`}
      title={`ចុចដើម្បីចម្លង ${label}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="text-[9.5px] font-semibold uppercase tracking-wider opacity-75 shrink-0">{label}</span>
      <span className="ml-auto text-[11px] font-bold truncate">
        {isCopied(id) ? 'Copied!' : (value || '—')}
      </span>
    </button>
  );

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-slate-50 dark:bg-slate-950 rounded-2xl shadow-2xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[94vh]"
      >
        {/* Hero header with AWBN + COD amounts */}
        <div className={`relative shrink-0 bg-gradient-to-br ${a.hero} px-4 sm:px-5 py-3 text-white overflow-hidden`}>
          <div className="pointer-events-none absolute -top-16 -right-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 w-56 h-56 rounded-full bg-white/5 blur-2xl" />

          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-white/15 ring-1 ring-white/25 flex items-center justify-center shrink-0">
                <Package className={`w-4 h-4 ${a.heroIcon}`} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-white/70">
                  <span className="px-1.5 py-px rounded-md bg-white/15 font-mono">#{rowNum}</span>
                  <span className="truncate">ព័ត៌មានលម្អិតកញ្ចប់</span>
                </div>
                {v.awbn ? (
                  <button
                    type="button"
                    onClick={() => copyVal(v.awbn, 'awbn_header')}
                    className={`group inline-flex items-center gap-2 font-mono text-base sm:text-lg font-black leading-tight tracking-wide ${a.chip} hover:text-white transition cursor-pointer`}
                    title="ចុចដើម្បីចម្លង AWBN"
                  >
                    <span className="truncate">{v.awbn}</span>
                    {isCopied('awbn_header')
                      ? <Check className="w-4 h-4 text-emerald-300" />
                      : <Copy className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition" />}
                  </button>
                ) : (
                  <div className="mt-0.5 text-lg font-black">—</div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer shrink-0"
              title="បិទ (ESC)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative mt-2.5 grid grid-cols-2 gap-2">
            {([
              { id: 'usd', label: 'USD (COD)', value: v.usd, display: usdDisplay, Icon: DollarSign },
              { id: 'khm', label: 'KHM (COD)', value: v.khm, display: khmDisplay, Icon: Coins },
            ] as const).map(({ id, label, value, display, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => copyVal(value, id)}
                className="group text-left px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 ring-1 ring-white/20 backdrop-blur-sm transition cursor-pointer min-w-0"
                title={`ចុចដើម្បីចម្លងទឹកប្រាក់ ${label}`}
              >
                <span className="flex items-center justify-between gap-2 text-[10.5px] font-semibold uppercase tracking-wider text-white/70">
                  <span className="flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5" />
                    ទឹកប្រាក់ {label}
                  </span>
                  {isCopied(id)
                    ? <Check className="w-3.5 h-3.5 text-emerald-300" />
                    : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-70 transition" />}
                </span>
                <span className="block font-mono text-lg sm:text-xl font-black leading-tight tracking-tight truncate">
                  {display}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-2">

          {/* Status strip (empty statuses hidden) */}
          {hasStatus && <div className="flex flex-wrap gap-1.5">
            <StatusPill
              id="check" icon={CheckCircle2} label="Check" value={v.check} active={isChecked}
              activeClass="bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300"
            />
            <StatusPill
              id="gotCod" icon={Clock} label="Got COD" value={v.gotCod} active={isFilled(v.gotCod)}
              activeClass="bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800/60 text-sky-700 dark:text-sky-300"
            />
            <StatusPill
              id="clear" icon={ShieldCheck} label="Clear" value={v.clear} active={isFilled(v.clear)}
              activeClass="bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300"
            />
            <StatusPill
              id="return" icon={RotateCcw} label="Return" value={v.return} active={isFilled(v.return)}
              activeClass="bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300"
            />
          </div>}

          {/* Receiver & delivery sections */}
          {(hasReceiver || hasDelivery) && <div className={`grid grid-cols-1 gap-2 ${hasReceiver && hasDelivery ? 'sm:grid-cols-2' : ''}`}>
            {hasReceiver && <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-1 shadow-2xs">
              <h4 className="flex items-center gap-2 px-2 pt-1 pb-0.5 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                <User className="w-3.5 h-3.5 text-slate-400" />
                ព័ត៌មានអ្នកទទួល
              </h4>
              <InfoRow id="receiver" icon={User} iconClass={a.sectionIcon} label="អ្នកទទួល (Receiver)" value={v.receiver} strong />
              <InfoRow id="address" icon={MapPin} iconClass="bg-rose-50 text-rose-500 dark:bg-rose-950/50 dark:text-rose-400" label="អាសយដ្ឋាន (Address)" value={v.address} />
              <InfoRow id="dest" icon={Navigation} iconClass="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400" label="គោលដៅ (DEST)" value={v.dest} strong />
            </section>}

            {hasDelivery && <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-1 shadow-2xs">
              <h4 className="flex items-center gap-2 px-2 pt-1 pb-0.5 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                <Truck className="w-3.5 h-3.5 text-slate-400" />
                ការចាត់ចែងដឹកជញ្ជូន
              </h4>
              <InfoRow id="handleBy" icon={Truck} iconClass={a.sectionIcon} label="Handle By" value={v.handleBy} strong />
              <InfoRow id="transferTo" icon={ArrowRightLeft} iconClass="bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400" label="Transfer To" value={v.transferTo} />
              <InfoRow id="deliveryDate" icon={Calendar} iconClass="bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400" label="កាលបរិច្ឆេទដឹក (Date)" value={v.deliveryDate} mono strong />
            </section>}
          </div>}

          {/* Specs */}
          {hasSpecs && <div className="flex flex-wrap gap-1.5">
            <SpecTile id="custId" icon={Hash} label="Customer ID" value={v.custId} valueClass="font-mono" />
            <SpecTile id="unit" icon={Boxes} label="Unit" value={v.unit} />
            <SpecTile id="kg" icon={Weight} label="ទម្ងន់ (KG)" value={v.kg ? `${v.kg} kg` : ''} />
            <SpecTile id="remarks" icon={StickyNote} label="ចំណាំ" value={v.remarks} valueClass={a.remark} />
          </div>}

          {/* Extra sheet columns */}
          {filledExtras.length > 0 && (
            <section className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden">
              <h4 className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                ជួរទិន្នន័យបន្ថែម
                <span className="ml-auto px-2 py-px rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  {filledExtras.length}
                </span>
              </h4>
              {/* -mb-px hides the bottom border of the last row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 -mb-px">
                {filledExtras.map((f, i) => {
                  const cellId = `extra_${f.id}`;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => copyVal(f.value, cellId)}
                      className={`group flex items-start justify-between gap-3 px-3 py-1 text-left border-b border-slate-100 dark:border-slate-800 transition cursor-pointer ${a.hoverRow} ${i % 2 === 0 ? 'sm:border-r' : ''}`}
                      title={`ចុចដើម្បីចម្លង ${f.label}`}
                    >
                      <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 leading-snug min-w-0 max-w-[45%] break-words">
                        {f.label}
                      </span>
                      <span className="flex items-center gap-1.5 min-w-0 justify-end text-right">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 break-words">
                          {f.value || <span className="text-slate-300 dark:text-slate-600">—</span>}
                        </span>
                        {isCopied(cellId)
                          ? <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                          : <Copy className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-50 transition" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-3 sm:px-4 py-2 border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onCopyRow}
            className={`px-3.5 py-1.5 rounded-lg text-white font-semibold text-xs flex items-center gap-1.5 shadow-md transition cursor-pointer ${
              rowCopied ? 'bg-emerald-600 hover:bg-emerald-600 shadow-emerald-600/25' : a.copyAll
            }`}
            title="ចម្លងទិន្នន័យជួរនេះទាំងអស់"
          >
            {rowCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{rowCopied ? 'បានចម្លងទាំងអស់!' : 'ចម្លងទាំងអស់'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold text-xs text-slate-700 dark:text-slate-200 transition cursor-pointer"
          >
            បិទ
          </button>
        </div>
      </div>
    </div>
  );
};

export default PackageDetailModal;
