import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileSpreadsheet,
  FileUp,
  Hash,
  Layers,
  Loader2,
  MapPin,
  PackagePlus,
  Pencil,
  RefreshCw,
  ScanLine,
  Search,
  Send,
  Server,
  Ticket,
  Trash2,
  X,
} from 'lucide-react';
import { AuthUser, Payer } from '../types';
import { CAMBODIA_PROVINCES } from '../data/cambodiaProvinces';
import { Customer, fetchCustomers } from '../services/customerService';
import { downloadCsv, formatCsv } from '../utils/csvHelper';
import { playScanSound, playWarningSound } from '../utils/scannerSound';
import { ParsedInvoiceFile, downloadInvoiceTemplate, parseInvoiceFile } from '../utils/invoiceExcelImport';
import {
  INVOICE_STATUS_META,
  InvoiceFields,
  InvoiceGroup,
  InvoiceLookup,
  InvoiceNumber,
  InvoiceStatus,
  LocalDbUnavailableError,
  NO_PREP_CODE,
  PrepCodeSummary,
  createInvoiceNumbers,
  deleteInvoiceNumbers,
  exportInvoiceNumbers,
  fetchInvoiceGroups,
  fetchInvoiceNumbers,
  fetchNextPrepCode,
  fetchPrepCodes,
  importInvoiceNumbers,
  issueInvoiceNumbers,
  lookupInvoiceNumbers,
  lookupPrepCode,
  parseTrackingInput,
  updateInvoiceNumber,
} from '../services/invoiceNumberService';

interface InvoiceNumbersPageProps {
  currentUser: AuthUser | null;
  /** Company Staff — suggested as the receiver (CUSTOMER) when issuing */
  payers?: Payer[];
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

type Step = 'PREPARE' | 'ISSUE';

const STATUSES = Object.keys(INVOICE_STATUS_META) as InvoiceStatus[];
const PAGE_SIZES = [50, 100, 200, 500];
const PAGE_SIZE_KEY = 'inv_page_size';
// Off unless the user turned it on (numbers saved before prep codes existed would all sit in one group)
const GROUP_MODE_KEY = 'inv_group_mode_v2';
// Most numbers shown when a group is opened
const GROUP_ROWS_MAX = 500;
const groupKey = (code: string | null) => code || NO_PREP_CODE;

interface OpenGroup {
  rows: InvoiceNumber[];
  total: number;
  loading: boolean;
}

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const showDate = (d?: string | null) => (d ? d.split('-').reverse().join('/') : '—');

const inputCls =
  'w-full h-9 px-2.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-600';
const labelCls = 'block text-[10.5px] font-bold text-slate-700 dark:text-slate-300 mb-0.5';

// The scan queue survives a page reload (per browser), so a half-scanned batch isn't lost
const queueKey = (email: string, step: Step) => `inv_queue_${email.toLowerCase().trim()}_${step}`;
const loadQueue = (key: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const saveQueue = (key: string, list: string[]) => {
  try {
    if (list.length) localStorage.setItem(key, JSON.stringify(list));
    else localStorage.removeItem(key);
  } catch {
    /* storage blocked */
  }
};

interface ScanFeedback {
  ok: boolean;
  text: string;
}

export const InvoiceNumbersPage: React.FC<InvoiceNumbersPageProps> = ({ currentUser, payers = [], onShowToast }) => {
  const isAdmin = String(currentUser?.role || '').toUpperCase() === 'ADMIN';
  const email = currentUser?.email || 'guest';

  const [rows, setRows] = useState<InvoiceNumber[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({ ALL: 0, PREPARED: 0, ISSUED: 0, CANCELLED: 0 });
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  // ---- Scan panel ----
  const [step, setStep] = useState<Step>('PREPARE');
  const [queues, setQueues] = useState<Record<Step, string[]>>(() => ({
    PREPARE: loadQueue(queueKey(email, 'PREPARE')),
    ISSUE: loadQueue(queueKey(email, 'ISSUE')),
  }));
  // What the server said about each scanned number (shown as a tooltip on the chips)
  const queueInfo = useRef(new Map<string, InvoiceLookup>());
  const [scanText, setScanText] = useState('');
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [checking, setChecking] = useState(false);
  const [namePrepare, setNamePrepare] = useState(currentUser?.name || '');
  const [prepareDate, setPrepareDate] = useState(todayStr());
  // Batch code: typed in step 1, then step 2 can queue the whole batch by this code
  const [prepCode, setPrepCode] = useState('');
  const [issueCode, setIssueCode] = useState('');
  const [prepCodes, setPrepCodes] = useState<PrepCodeSummary[]>([]);
  const [customer, setCustomer] = useState('');
  const [company, setCompany] = useState('');
  const [province, setProvince] = useState('');
  const [issueDate, setIssueDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  // ---- List (one page at a time from the server) ----
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | InvoiceStatus>('PREPARED');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(PAGE_SIZE_KEY));
      return PAGE_SIZES.includes(v) ? v : 100;
    } catch {
      return 100;
    }
  });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Group view: one row per prep code, opened to show its numbers
  const [groupMode, setGroupMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(GROUP_MODE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [groups, setGroups] = useState<InvoiceGroup[]>([]);
  const [openGroups, setOpenGroups] = useState<Record<string, OpenGroup>>({});
  const openGroupsRef = useRef(openGroups);
  openGroupsRef.current = openGroups;
  const [editing, setEditing] = useState<{ id: number; tracking: string; fields: InvoiceFields } | null>(null);
  const [exporting, setExporting] = useState(false);

  // ---- Import of old records ----
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<{ fileName: string; parsed: ParsedInvoiceFile; existing: number | null } | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [importProgress, setImportProgress] = useState<number | null>(null);

  // Search waits until typing pauses
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filters = useMemo(
    () => ({ search: searchQuery, status: statusFilter === 'ALL' ? '' : statusFilter, startDate, endDate }),
    [searchQuery, statusFilter, startDate, endDate]
  );

  /** Fetches the numbers of one prep-code group (shown when the group is opened). */
  const loadGroupRows = useCallback(
    (key: string) => {
      setOpenGroups((p) => ({ ...p, [key]: { rows: p[key]?.rows || [], total: p[key]?.total || 0, loading: true } }));
      fetchInvoiceNumbers({ ...filters, prepCode: key, page: 1, pageSize: GROUP_ROWS_MAX })
        .then((r) => setOpenGroups((p) => (p[key] ? { ...p, [key]: { rows: r.rows, total: r.total, loading: false } } : p)))
        .catch((err: any) => {
          onShowToast(err.message || 'ទាញទិន្នន័យមិនបាន', 'error');
          setOpenGroups((p) => {
            const next = { ...p };
            delete next[key];
            return next;
          });
        });
    },
    [filters, onShowToast]
  );

  const requestId = useRef(0);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      if (groupMode) {
        const r = await fetchInvoiceGroups({ ...filters, page, pageSize });
        if (id !== requestId.current) return; // a newer request is on its way
        setGroups(r.groups);
        setTotal(r.total);
        setCounts(r.counts);
        setUnavailable(null);
        // Groups left open show fresh numbers too
        Object.keys(openGroupsRef.current).forEach(loadGroupRows);
        return;
      }
      const r = await fetchInvoiceNumbers({ ...filters, page, pageSize });
      if (id !== requestId.current) return; // a newer request is on its way
      setRows(r.rows);
      setTotal(r.total);
      setCounts(r.counts);
      setUnavailable(null);
    } catch (err: any) {
      if (id !== requestId.current) return;
      if (err instanceof LocalDbUnavailableError) setUnavailable(err.message);
      else onShowToast(err.message || 'ទាញទិន្នន័យមិនបាន', 'error');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [filters, page, pageSize, groupMode, loadGroupRows, onShowToast]);

  // A new filter starts again from page 1. When we're on another page, jump to page 1 first
  // and let that change do the fetch, so one filter change sends one request (not two).
  const filterKey = `${JSON.stringify(filters)}|${pageSize}|${groupMode}`;
  const lastFilterKey = useRef(filterKey);
  useEffect(() => {
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(() => {
    setSelected(new Set());
  }, [rows]);

  useEffect(() => {
    saveQueue(queueKey(email, 'PREPARE'), queues.PREPARE);
    saveQueue(queueKey(email, 'ISSUE'), queues.ISSUE);
  }, [queues, email]);

  // Prep codes still in stock — suggestions for the code boxes
  const loadPrepCodes = useCallback(() => {
    fetchPrepCodes()
      .then((list) => setPrepCodes(Array.isArray(list) ? list : []))
      .catch(() => {
        /* suggestions only */
      });
  }, []);
  useEffect(() => {
    loadPrepCodes();
  }, [loadPrepCodes]);

  // Preview of the code the next save will get (the server assigns the real one when saving)
  const loadNextPrepCode = useCallback(() => {
    fetchNextPrepCode()
      .then((code) => setPrepCode(code))
      .catch(() => setPrepCode(''));
  }, []);
  useEffect(() => {
    loadNextPrepCode();
  }, [loadNextPrepCode]);

  const changePageSize = (n: number) => {
    setPageSize(n);
    try {
      localStorage.setItem(PAGE_SIZE_KEY, String(n));
    } catch {
      /* storage blocked */
    }
  };

  const toggleGroupMode = () => {
    const next = !groupMode;
    setGroupMode(next);
    setOpenGroups({});
    try {
      localStorage.setItem(GROUP_MODE_KEY, next ? '1' : '0');
    } catch {
      /* storage blocked */
    }
  };

  const toggleGroup = (key: string) => {
    if (openGroups[key]) {
      setOpenGroups((p) => {
        const next = { ...p };
        delete next[key];
        return next;
      });
    } else loadGroupRows(key);
  };

  const copyCode = (code: string) => {
    navigator.clipboard
      ?.writeText(code)
      .then(() => onShowToast(`បានចម្លង ${code}`, 'info'))
      .catch(() => {
        /* clipboard blocked */
      });
  };

  // Customer info list (ព័ត៌មានអតិថិជន) — suggestions for the COMPANY box; typing a new name still works
  const [customerList, setCustomerList] = useState<Customer[]>([]);
  useEffect(() => {
    let alive = true;
    fetchCustomers()
      .then((list) => alive && setCustomerList(Array.isArray(list) ? list : []))
      .catch(() => {
        /* suggestions only — the box still accepts typed names */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Active customers, A→Z, one entry per name
  const companyOptions = useMemo(() => {
    const seen = new Map<string, Customer>();
    customerList
      .filter((c) => c.status !== 'INACTIVE' && c.name?.trim())
      .forEach((c) => {
        const k = c.name.trim().toLowerCase();
        if (!seen.has(k)) seen.set(k, c);
      });
    return [...seen.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({
        value: c.name.trim(),
        label: [c.customer_code, c.nickname, c.province].filter(Boolean).join(' • '),
        province: c.province?.trim() || '',
      }));
  }, [customerList]);

  /** Picking a known customer also fills an empty PROVINCE. */
  const changeCompany = (v: string) => {
    setCompany(v);
    const hit = companyOptions.find((o) => o.value.toLowerCase() === v.trim().toLowerCase());
    if (hit?.province && !province.trim()) setProvince(hit.province);
  };

  // Active Company Staff, A→Z, one entry per name
  const staffOptions = useMemo(() => {
    const seen = new Set<string>();
    return payers
      .filter((p) => p.status !== 'INACTIVE' && p.name?.trim())
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((p) => {
        const k = p.name.trim().toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((p) => ({ value: p.name.trim(), label: [p.category, p.area, p.phone].filter(Boolean).join(' • ') }));
  }, [payers]);

  const switchStep = (s: Step) => {
    setStep(s);
    setFeedback(null);
    setScanText('');
    setStatusFilter(s === 'PREPARE' ? 'PREPARED' : 'ISSUED');
    if (s === 'ISSUE') loadPrepCodes();
    setTimeout(() => scanRef.current?.focus(), 50);
  };

  /** Why this number can't go into the current step's queue, or null when it can. */
  const rejectReason = (t: string, r: InvoiceLookup | undefined): string | null => {
    if (step === 'PREPARE') {
      return r ? `${t} បានរៀបចំទុករួចហើយ (${INVOICE_STATUS_META[r.status]?.label || r.status})` : null;
    }
    if (!r) return `${t} មិនទាន់បានរៀបចំទុកទេ — សូមស្កេននៅផ្នែក ① ជាមុនសិន`;
    if (r.status === 'ISSUED') return `${t} បានបើកឲ្យ «${r.customer || '—'}» រួចហើយ`;
    if (r.status === 'CANCELLED') return `${t} ត្រូវបានបោះបង់ មិនអាចបើកឲ្យបានទេ`;
    return null;
  };

  /** Adds the numbers that pass the step's checks to its queue; returns what was added and why the rest weren't. */
  const enqueue = (scanStep: Step, trackings: string[], info: Map<string, InvoiceLookup>) => {
    const queued = new Set(queues[scanStep]);
    const added: string[] = [];
    const rejected: string[] = [];
    for (const t of trackings) {
      const why = queued.has(t) ? `${t} មានក្នុងបញ្ជីស្កេនរួចហើយ` : rejectReason(t, info.get(t));
      if (why) rejected.push(why);
      else {
        added.push(t);
        queued.add(t);
        const r = info.get(t);
        if (r) queueInfo.current.set(t, r);
      }
    }
    // Functional update: another scan may have finished while we were checking
    if (added.length) {
      setQueues((prev) => ({ ...prev, [scanStep]: [...prev[scanStep], ...added.filter((t) => !prev[scanStep].includes(t))] }));
    }
    return { added, rejected };
  };

  /** Step 2: queue every number in stock under a prep code. */
  const addByPrepCode = async (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code) return;
    setChecking(true);
    let found: InvoiceLookup[];
    try {
      found = await lookupPrepCode(code);
    } catch (err: any) {
      setFeedback({ ok: false, text: err.message || 'ពិនិត្យកូដរៀបចំមិនបាន' });
      playWarningSound();
      return;
    } finally {
      setChecking(false);
    }
    if (found.length === 0) {
      setFeedback({ ok: false, text: `រកមិនឃើញកូដរៀបចំ «${code}» ទេ` });
      playWarningSound();
      return;
    }
    // A code is used once any of its numbers has been issued — it can't be issued by code again
    const issued = found.filter((r) => r.status === 'ISSUED');
    if (issued.length) {
      const who = [...new Set(issued.map((r) => r.customer).filter(Boolean))].slice(0, 2).join(', ');
      setFeedback({ ok: false, text: `កូដ «${code}» បានប្រើរួចហើយ (បានបើកឲ្យ${who ? ` «${who}»` : ''} ${issued.length} លេខ)` });
      playWarningSound();
      setIssueCode('');
      return;
    }
    const info = new Map(found.map((r) => [r.tracking, r]));
    const { added, rejected } = enqueue('ISSUE', found.map((r) => r.tracking), info);
    setIssueCode('');
    if (added.length === 0) {
      playWarningSound();
      setFeedback({ ok: false, text: `កូដ «${code}»: គ្មានលេខនៅក្នុងស្តុកទេ (${found.length} លេខ បានបើកឲ្យ/បោះបង់ ឬមានក្នុងបញ្ជីរួចហើយ)` });
      return;
    }
    if (rejected.length) playWarningSound();
    else playScanSound();
    setFeedback({
      ok: rejected.length === 0,
      text: `✓ កូដ «${code}»: បានបន្ថែម ${added.length} លេខ` + (rejected.length ? ` • រំលង ${rejected.length} លេខ (បានបើកឲ្យ/បោះបង់ ឬមានក្នុងបញ្ជីរួច)` : ''),
    });
    setTimeout(() => scanRef.current?.focus(), 50);
  };

  const handleScan = async () => {
    const raw = scanText.trim();
    if (!raw) return;
    const { trackings, error } = parseTrackingInput(raw);
    setScanText('');
    if (error) {
      setFeedback({ ok: false, text: error });
      playWarningSound();
      return;
    }
    const scanStep = step;
    const queued = new Set(queues[scanStep]);
    const fresh = trackings.filter((t) => !queued.has(t));
    let info = new Map<string, InvoiceLookup>();
    if (fresh.length) {
      setChecking(true);
      try {
        info = await lookupInvoiceNumbers(fresh);
      } catch (err: any) {
        setFeedback({ ok: false, text: err.message || 'ពិនិត្យលេខមិនបាន' });
        playWarningSound();
        return;
      } finally {
        setChecking(false);
      }
    }
    // Step 2: a value that isn't a tracking number but is a prep code queues its whole batch
    if (scanStep === 'ISSUE' && trackings.length === 1 && fresh.length === 1 && !info.has(trackings[0]) && prepCodes.some((c) => c.code === trackings[0])) {
      await addByPrepCode(trackings[0]);
      return;
    }
    const { added, rejected } = enqueue(scanStep, trackings, info);
    if (rejected.length) {
      playWarningSound();
      setFeedback({
        ok: false,
        text: (added.length ? `បានបន្ថែម ${added.length} • ` : '') + rejected.slice(0, 2).join(' • ') + (rejected.length > 2 ? ` • (+${rejected.length - 2})` : ''),
      });
    } else if (added.length) {
      playScanSound();
      setFeedback({ ok: true, text: added.length === 1 ? `✓ ${added[0]}` : `✓ បានបន្ថែម ${added.length} លេខ` });
    }
  };

  const removeFromQueue = (t: string) => setQueues((prev) => ({ ...prev, [step]: prev[step].filter((x) => x !== t) }));
  const clearQueue = () => {
    if (queues[step].length > 5 && !window.confirm(`សម្អាតបញ្ជីស្កេនទាំង ${queues[step].length} លេខ?`)) return;
    setQueues((prev) => ({ ...prev, [step]: [] }));
    setFeedback(null);
  };

  const saveQueueToDb = async () => {
    const list = queues[step];
    if (list.length === 0) return;
    if (step === 'ISSUE' && !customer.trim()) {
      onShowToast('សូមបញ្ចូលឈ្មោះអ្នកទទួល (CUSTOMER) មុនរក្សាទុក', 'error');
      return;
    }
    setSaving(true);
    try {
      if (step === 'PREPARE') {
        const { added, duplicates, prepCode: savedCode } = await createInvoiceNumbers(list, {
          namePrepare,
          date: prepareDate,
          prepCode: prepCode.trim().toUpperCase(),
          autoPrepCode: true,
        });
        // Keep anything the server refused in the queue so it stays visible
        setQueues((prev) => ({ ...prev, PREPARE: duplicates }));
        const codeNote = savedCode ? ` • កូដ ${savedCode}` : '';
        if (duplicates.length) onShowToast(`បានរក្សាទុក ${added.length} លេខ${codeNote}។ ${duplicates.length} លេខមានរួចហើយ (នៅសល់ក្នុងបញ្ជី)`, 'info');
        else onShowToast(`✓ បានរៀបចំទុក ${added.length} លេខ${codeNote}`, 'success');
        // Next batch gets the next auto code
        loadNextPrepCode();
      } else {
        const { issued, skipped } = await issueInvoiceNumbers(list, { customer: customer.trim(), company: company.trim(), province: province.trim(), issuedDate: issueDate });
        setQueues((prev) => ({ ...prev, ISSUE: skipped.map((s) => s.tracking) }));
        if (skipped.length) {
          onShowToast(`បានបើកឲ្យ ${issued.length} លេខ។ ${skipped.length} លេខមិនអាចបើកបាន (នៅសល់ក្នុងបញ្ជី)`, 'info');
        } else {
          onShowToast(`✓ បានបើកឲ្យ «${customer.trim()}» ចំនួន ${issued.length} លេខ`, 'success');
          setCustomer('');
          setCompany('');
          setProvince('');
        }
      }
      setFeedback(null);
      load();
      loadPrepCodes();
    } catch (err: any) {
      onShowToast(err.message || 'រក្សាទុកមិនបាន', 'error');
    } finally {
      setSaving(false);
      scanRef.current?.focus();
    }
  };

  const openEdit = (r: InvoiceNumber) =>
    setEditing({
      id: r.id,
      tracking: r.tracking,
      fields: {
        customer: r.customer || '',
        company: r.company || '',
        province: r.province || '',
        namePrepare: r.namePrepare || '',
        prepCode: r.prepCode || '',
        date: r.date || '',
        status: r.status,
        issuedDate: r.issuedDate || '',
      },
    });

  const saveEdit = async () => {
    if (!editing) return;
    if (!editing.tracking.trim()) {
      onShowToast('សូមបញ្ចូលលេខ TRACKING', 'error');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateInvoiceNumber(editing.id, editing.tracking.trim(), editing.fields);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      if (groupMode) load(); // the change can move a number to another group
      onShowToast('✓ បានកែប្រែរួចរាល់', 'success');
      setEditing(null);
    } catch (err: any) {
      onShowToast(err.message || 'រក្សាទុកមិនបាន', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (ids: number[]) => {
    if (ids.length === 0) return;
    const label = ids.length === 1 ? `លេខ ${rows.find((r) => r.id === ids[0])?.tracking || ''}` : `${ids.length} លេខ`;
    if (!window.confirm(`លុប ${label} មែនទេ? មិនអាចយកមកវិញបានទេ។`)) return;
    try {
      const { deleted } = await deleteInvoiceNumbers(ids);
      onShowToast(`✓ បានលុប ${deleted} លេខ`, 'success');
      load();
    } catch (err: any) {
      onShowToast(err.message || 'លុបមិនបាន', 'error');
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be picked again
    if (!file) return;
    try {
      const parsed = await parseInvoiceFile(file);
      if (parsed.rows.length === 0) throw new Error('File នេះគ្មានលេខ TRACKING សម្រាប់នាំចូលទេ');
      setOverwrite(false);
      setImporting({ fileName: file.name, parsed, existing: null });
      // Count numbers the database already has (in the background)
      lookupInvoiceNumbers(parsed.rows.map((r) => r.tracking))
        .then((found) => setImporting((cur) => (cur && cur.parsed === parsed ? { ...cur, existing: found.size } : cur)))
        .catch(() => setImporting((cur) => (cur && cur.parsed === parsed ? { ...cur, existing: -1 } : cur)));
    } catch (err: any) {
      onShowToast(err.message || 'អាន File មិនបាន', 'error');
    }
  };

  const runImport = async () => {
    if (!importing) return;
    const all = importing.parsed.rows;
    const CHUNK = 2000;
    const sum = { inserted: 0, updated: 0, skipped: 0 };
    setImportProgress(0);
    try {
      for (let i = 0; i < all.length; i += CHUNK) {
        const r = await importInvoiceNumbers(all.slice(i, i + CHUNK), overwrite);
        sum.inserted += r.inserted;
        sum.updated += r.updated;
        sum.skipped += r.skipped;
        setImportProgress(Math.min(i + CHUNK, all.length));
      }
      const parts = [`បន្ថែមថ្មី ${sum.inserted}`];
      if (sum.updated) parts.push(`ធ្វើបច្ចុប្បន្នភាព ${sum.updated}`);
      if (sum.skipped) parts.push(`រំលង ${sum.skipped} (មានរួចហើយ)`);
      onShowToast(`✓ នាំចូលរួចរាល់៖ ${parts.join(' • ')}`, 'success');
      setImporting(null);
      setStatusFilter('ALL');
      load();
    } catch (err: any) {
      onShowToast(`នាំចូលមិនបានពេញលេញ (បានធ្វើ ${sum.inserted + sum.updated} ជួរ)៖ ${err.message}`, 'error');
      load();
    } finally {
      setImportProgress(null);
    }
  };

  const importSummary = useMemo(() => {
    if (!importing) return null;
    const c: Record<InvoiceStatus, number> = { PREPARED: 0, ISSUED: 0, CANCELLED: 0 };
    importing.parsed.rows.forEach((r) => c[r.status]++);
    return { byStatus: c, existing: importing.existing };
  }, [importing]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await exportInvoiceNumbers(filters);
      const headers = ['TRACKING', 'CUSTOMER', 'COMPANY', 'PROVINCE', 'NAME PREPAIRE', 'PREP CODE', 'DATE', 'STATUS', 'ISSUED DATE', 'ISSUED BY'];
      const data = all.map((r) => [r.tracking, r.customer || '', r.company || '', r.province || '', r.namePrepare || '', r.prepCode || '', r.date || '', r.status, r.issuedDate || '', r.issuedBy || '']);
      downloadCsv(`invoice-numbers-${todayStr()}.csv`, formatCsv(headers, data));
    } catch (err: any) {
      onShowToast(err.message || 'ទាញយក CSV មិនបាន', 'error');
    } finally {
      setExporting(false);
    }
  };

  const pill = (active: boolean, activeCls: string) =>
    `h-7 px-2.5 rounded-md font-bold transition cursor-pointer whitespace-nowrap ${
      active ? `${activeCls} text-white shadow-2xs` : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
    }`;

  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = !!(searchQuery || startDate || endDate || statusFilter !== 'ALL');

  // Latest handlers for the memoised rows below
  const openEditRef = useRef(openEdit);
  openEditRef.current = openEdit;
  const removeRef = useRef(remove);
  removeRef.current = remove;

  // Phones: one card per number instead of a wide table
  const mobileCards = useMemo(
    () => (
      <div className="md:hidden">
        {isAdmin && rows.length > 0 && (
          <label className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-slate-500 border-b border-slate-100 dark:border-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={rows.every((r) => selected.has(r.id))}
              onChange={() => setSelected(rows.every((r) => selected.has(r.id)) ? new Set() : new Set(rows.map((r) => r.id)))}
              className="cursor-pointer"
            />
            ជ្រើសទាំងអស់ក្នុងទំព័រនេះ
          </label>
        )}
        {loading && rows.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2 text-cyan-600" /> កំពុងទាញទិន្នន័យ...
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 px-4 text-center text-xs text-slate-500">
            <AlertCircle className="w-4 h-4 inline mr-1.5 text-slate-400" />
            {hasFilters || counts.ALL > 0 ? 'គ្មានទិន្នន័យតាមតម្រងនេះទេ' : 'មិនទាន់មានលេខវិក័យប័ត្រទេ'}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r, i) => (
              <li key={r.id} className={`px-3 py-2.5 flex gap-2.5 ${selected.has(r.id) ? 'bg-cyan-50/60 dark:bg-cyan-950/30' : ''}`}>
                {isAdmin && (
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(r.id)) next.delete(r.id);
                        else next.add(r.id);
                        return next;
                      })
                    }
                    className="mt-1 w-4 h-4 shrink-0 cursor-pointer"
                    aria-label={`ជ្រើស ${r.tracking}`}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-black text-[13px] text-slate-900 dark:text-white truncate">
                      <span className="text-[10px] font-normal text-slate-400 mr-1">{(page - 1) * pageSize + i + 1}.</span>
                      {r.tracking}
                    </span>
                    <span
                      className={`shrink-0 inline-flex items-center h-5 px-2 rounded-full border text-[10px] font-bold whitespace-nowrap ${INVOICE_STATUS_META[r.status]?.pill || ''}`}
                    >
                      {INVOICE_STATUS_META[r.status]?.label || r.status}
                    </span>
                  </div>
                  <div className={`mt-0.5 text-xs leading-snug line-clamp-2 ${r.customer ? 'text-slate-700 dark:text-slate-200 font-semibold' : 'text-slate-400 italic'}`}>
                    {r.customer || 'មិនទាន់មានអ្នកទទួល'}
                    {r.company && <span className="font-normal text-slate-500 dark:text-slate-400"> · {r.company}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
                    {r.province && (
                      <span className="inline-flex items-center gap-0.5 min-w-0">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate max-w-[160px]">{r.province}</span>
                      </span>
                    )}
                    <span>
                      រៀបចំ {showDate(r.date)}
                      {r.namePrepare ? ` • ${r.namePrepare}` : ''}
                    </span>
                    {r.prepCode && <span className="font-mono font-bold text-amber-700 dark:text-amber-400">#{r.prepCode}</span>}
                    {r.issuedDate && <span className="text-emerald-700 dark:text-emerald-400">បើកឲ្យ {showDate(r.issuedDate)}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditRef.current(r)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-950/50 cursor-pointer"
                    title="កែប្រែ"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => removeRef.current([r.id])}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                      title="លុប"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    ),
    [rows, selected, isAdmin, loading, page, pageSize, hasFilters, counts.ALL]
  );

  const tableBody = useMemo(
    () => (
    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
      {loading && rows.length === 0 ? (
        <tr>
          <td colSpan={12} className="py-12 text-center text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2 text-cyan-600" /> កំពុងទាញទិន្នន័យ...
          </td>
        </tr>
      ) : rows.length === 0 ? (
        <tr>
          <td colSpan={12} className="py-12 text-center text-slate-500">
            <AlertCircle className="w-4 h-4 inline mr-1.5 text-slate-400" />
            {hasFilters || counts.ALL > 0 ? 'គ្មានទិន្នន័យតាមតម្រងនេះទេ' : 'មិនទាន់មានលេខវិក័យប័ត្រទេ — ស្កេនលេខនៅផ្នែក ① រៀបចំទុកជាមុន ខាងលើ'}
          </td>
        </tr>
      ) : (
        rows.map((r, i) => (
          <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
            {isAdmin && (
              <td className="px-2 py-1.5 text-center">
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(r.id)) next.delete(r.id);
                      else next.add(r.id);
                      return next;
                    })
                  }
                  className="cursor-pointer"
                  aria-label={`ជ្រើស ${r.tracking}`}
                />
              </td>
            )}
            <td className="px-2 py-1.5 text-slate-400 font-mono">{(page - 1) * pageSize + i + 1}</td>
            <td className="px-3 py-1.5 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">{r.tracking}</td>
            <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{r.customer || '—'}</td>
            <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{r.company || '—'}</td>
            <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{r.province || '—'}</td>
            <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{r.namePrepare || '—'}</td>
            <td className="px-3 py-1.5 font-mono font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap">{r.prepCode || '—'}</td>
            <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400 font-mono whitespace-nowrap">{showDate(r.date)}</td>
            <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400 font-mono whitespace-nowrap" title={r.issuedBy ? `ដោយ ${r.issuedBy}` : undefined}>
              {showDate(r.issuedDate)}
            </td>
            <td className="px-3 py-1.5">
              <span className={`inline-flex items-center h-6 px-2 rounded-full border text-[10.5px] font-bold whitespace-nowrap ${INVOICE_STATUS_META[r.status]?.pill || ''}`}>
                {INVOICE_STATUS_META[r.status]?.label || r.status}
              </span>
            </td>
            <td className="px-2 py-1.5 text-center whitespace-nowrap">
              <button
                type="button"
                onClick={() => openEditRef.current(r)}
                className="p-1 rounded text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-950/50 cursor-pointer"
                title="កែប្រែ"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => removeRef.current([r.id])}
                  className="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                  title="លុប"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </td>
          </tr>
        ))
      )}
    </tbody>
    ),
    [rows, selected, isAdmin, loading, page, pageSize, hasFilters, counts.ALL]
  );

  /** Status of one group: how many of its numbers were issued. */
  const groupProgress = (g: InvoiceGroup) => {
    if (g.issued === 0 && g.cancelled === 0) {
      return (
        <span className="inline-flex items-center h-5 px-2 rounded-md text-[10.5px] font-black bg-amber-500 text-white whitespace-nowrap">
          រៀបចំទុក {g.prepared}
        </span>
      );
    }
    const pct = Math.round((g.issued / Math.max(g.count, 1)) * 100);
    const done = g.issued === g.count;
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`inline-flex items-center h-5 px-2 rounded-md text-[10.5px] font-black text-white whitespace-nowrap ${done ? 'bg-emerald-600' : 'bg-cyan-600'}`}
        >
          បានបើកឲ្យ {g.issued}/{g.count}
        </span>
        <span className="w-14 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <span className={`block h-full ${done ? 'bg-emerald-500' : 'bg-cyan-500'}`} style={{ width: `${pct}%` }} />
        </span>
        {g.cancelled > 0 && <span className="text-[10px] font-bold text-rose-600">បោះបង់ {g.cancelled}</span>}
      </span>
    );
  };

  const groupNumbers = (key: string, compact: boolean) => {
    const og = openGroups[key];
    if (!og) return null;
    if (og.loading && og.rows.length === 0) {
      return (
        <div className="py-4 text-center text-xs text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2 text-cyan-600" /> កំពុងទាញលេខ...
        </div>
      );
    }
    if (og.rows.length === 0) return <div className="py-3 text-center text-xs text-slate-500">គ្មានលេខតាមតម្រងនេះទេ</div>;
    return (
      <div className={og.loading ? 'opacity-60' : ''}>
        {compact ? (
          <div className="flex flex-wrap gap-1.5">
            {og.rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => openEditRef.current(r)}
                className={`inline-flex items-center gap-1 px-2 h-6 rounded-md border text-[10.5px] font-mono font-bold cursor-pointer ${INVOICE_STATUS_META[r.status]?.pill || ''}`}
                title={r.customer ? `បានបើកឲ្យ ${r.customer}` : 'ចុចដើម្បីកែប្រែ'}
              >
                {r.tracking}
              </button>
            ))}
          </div>
        ) : (
          <table className="w-full text-[11.5px]">
            <thead className="text-[10px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="w-10 px-2 py-1 text-left">#</th>
                <th className="px-2 py-1 text-left">Tracking</th>
                <th className="px-2 py-1 text-left">Customer</th>
                <th className="px-2 py-1 text-left">ក្រុមហ៊ុន / ហាង</th>
                <th className="px-2 py-1 text-left">Province</th>
                <th className="px-2 py-1 text-left">ថ្ងៃបើកឲ្យ</th>
                <th className="px-2 py-1 text-left">Status</th>
                <th className="w-16 px-2 py-1 text-center">សកម្មភាព</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {og.rows.map((r, i) => (
                <tr key={r.id} className="hover:bg-white dark:hover:bg-slate-900">
                  <td className="px-2 py-1 text-slate-400 font-mono">{i + 1}</td>
                  <td className="px-2 py-1 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">{r.tracking}</td>
                  <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{r.customer || '—'}</td>
                  <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{r.company || '—'}</td>
                  <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{r.province || '—'}</td>
                  <td className="px-2 py-1 text-slate-600 dark:text-slate-400 font-mono whitespace-nowrap">{showDate(r.issuedDate)}</td>
                  <td className="px-2 py-1">
                    <span className={`inline-flex items-center h-5 px-2 rounded-full border text-[10px] font-bold whitespace-nowrap ${INVOICE_STATUS_META[r.status]?.pill || ''}`}>
                      {INVOICE_STATUS_META[r.status]?.label || r.status}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-center whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEditRef.current(r)}
                      className="p-1 rounded text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-950/50 cursor-pointer"
                      title="កែប្រែ"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => removeRef.current([r.id])}
                        className="p-1 rounded text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                        title="លុប"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {og.total > og.rows.length && (
          <div className="pt-1.5 text-[10.5px] text-slate-500">
            បង្ហាញ {og.rows.length.toLocaleString()} ដំបូង នៃ {og.total.toLocaleString()} លេខ — បិទ Group ឬស្វែងរក ដើម្បីមើលទាំងអស់
          </div>
        )}
      </div>
    );
  };

  const groupView =
    loading && groups.length === 0 ? (
      <div className="py-12 text-center text-xs text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin inline mr-2 text-cyan-600" /> កំពុងទាញទិន្នន័យ...
      </div>
    ) : groups.length === 0 ? (
      <div className="py-12 px-4 text-center text-xs text-slate-500">
        <AlertCircle className="w-4 h-4 inline mr-1.5 text-slate-400" />
        {hasFilters || counts.ALL > 0 ? 'គ្មានទិន្នន័យតាមតម្រងនេះទេ' : 'មិនទាន់មានលេខវិក័យប័ត្រទេ'}
      </div>
    ) : (
      <>
        {/* Phones */}
        <ul className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {groups.map((g, i) => {
            const key = groupKey(g.code);
            const open = !!openGroups[key];
            return (
              <li key={key} className="px-3 py-2.5">
                <button type="button" onClick={() => toggleGroup(key)} className="w-full flex items-start gap-2 text-left cursor-pointer">
                  {open ? <ChevronDown className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-mono font-black text-[12.5px] truncate ${g.code ? 'text-violet-700 dark:text-violet-300' : 'text-slate-400 italic'}`}>
                        <span className="text-[10px] font-normal text-slate-400 mr-1">{(page - 1) * pageSize + i + 1}.</span>
                        {g.code || 'គ្មានកូដ (ទិន្នន័យចាស់)'}
                      </span>
                      <span className="shrink-0 text-[11px] font-black text-slate-700 dark:text-slate-200">{g.count.toLocaleString()} លេខ</span>
                    </div>
                    <div className="mt-1">{groupProgress(g)}</div>
                    <div className="mt-1 text-[10.5px] text-slate-500 dark:text-slate-400">
                      រៀបចំ {showDate(g.date)}
                      {g.preparers.length ? ` • ${g.preparers.join(', ')}` : ''}
                      {g.customers.length ? ` • ទទួល: ${g.customers.join(', ')}${g.customerCount > g.customers.length ? ` +${g.customerCount - g.customers.length}` : ''}` : ''}
                    </div>
                  </div>
                </button>
                {open && <div className="mt-2 pl-6">{groupNumbers(key, true)}</div>}
              </li>
            );
          })}
        </ul>

        {/* Desktop */}
        <table className="hidden md:table w-full text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-950 text-[10.5px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="w-10 px-2 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">កូដរៀបចំ (Prep Code)</th>
              <th className="px-3 py-2 text-left">ជួរលេខ</th>
              <th className="px-3 py-2 text-left">Name Prepaire</th>
              <th className="px-3 py-2 text-left">ថ្ងៃរៀបចំ</th>
              <th className="px-3 py-2 text-left">អ្នកទទួល</th>
              <th className="px-3 py-2 text-left">ថ្ងៃបើកឲ្យ</th>
              <th className="px-3 py-2 text-right">ចំនួនលេខ</th>
              <th className="w-28 px-2 py-2 text-center">សកម្មភាព</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {groups.map((g, i) => {
              const key = groupKey(g.code);
              const open = !!openGroups[key];
              const canIssue = !!g.code && g.prepared > 0 && g.issued === 0;
              return (
                <React.Fragment key={key}>
                  <tr className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${open ? 'bg-violet-50/40 dark:bg-violet-950/20' : ''}`}>
                    <td className="px-2 py-2 text-slate-400 font-mono align-top">{(page - 1) * pageSize + i + 1}</td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleGroup(key)}
                          className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                          title={open ? 'បិទ' : 'មើលលេខក្នុងក្រុមនេះ'}
                        >
                          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleGroup(key)}
                          className={`inline-flex items-center gap-1 h-6 px-2 rounded-md border font-mono font-black text-[11.5px] cursor-pointer ${
                            g.code
                              ? 'border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
                              : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-400 italic'
                          }`}
                        >
                          <Hash className="w-3 h-3" />
                          {g.code || 'គ្មានកូដ (ទិន្នន័យចាស់)'}
                        </button>
                        {g.code && (
                          <button
                            type="button"
                            onClick={() => copyCode(g.code!)}
                            className="p-1 rounded text-slate-400 hover:text-violet-600 cursor-pointer"
                            title="ចម្លងកូដ"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="mt-1 pl-6">{groupProgress(g)}</div>
                    </td>
                    <td className="px-3 py-2 align-top font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {g.count === 1 ? g.firstTracking : `${g.firstTracking} → ${g.lastTracking}`}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-700 dark:text-slate-300">{g.preparers.join(', ') || '—'}</td>
                    <td className="px-3 py-2 align-top text-slate-600 dark:text-slate-400 font-mono whitespace-nowrap">{showDate(g.date)}</td>
                    <td className="px-3 py-2 align-top text-slate-700 dark:text-slate-300 font-semibold">
                      {g.customers.length ? (
                        <>
                          {g.customers.join(', ')}
                          {g.customerCount > g.customers.length && <span className="font-normal text-slate-400"> +{g.customerCount - g.customers.length}</span>}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-slate-600 dark:text-slate-400 font-mono whitespace-nowrap">{showDate(g.issuedDate)}</td>
                    <td className="px-3 py-2 align-top text-right">
                      <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 font-black text-[11px] whitespace-nowrap">
                        {g.count.toLocaleString()} លេខ
                      </span>
                    </td>
                    <td className="px-2 py-2 align-top text-center whitespace-nowrap">
                      {canIssue && (
                        <button
                          type="button"
                          onClick={() => {
                            switchStep('ISSUE');
                            addByPrepCode(g.code!);
                          }}
                          className="h-7 px-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          title="ដាក់លេខទាំងអស់ក្នុងកូដនេះ ចូលផ្នែក ② បើកឲ្យ"
                        >
                          <Send className="w-3 h-3" /> បើកឲ្យ
                        </button>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={9} className="px-4 pb-3 pt-1 bg-slate-50/70 dark:bg-slate-950/40">
                        {groupNumbers(key, false)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </>
    );

  const queue = queues[step];
  // Codes still offered in step 2: unused, and not already sitting in the scan queue
  const queuedCodes = new Set(queues.ISSUE.map((t) => queueInfo.current.get(t)?.prepCode).filter(Boolean));
  const openCodes = prepCodes.filter((c) => !queuedCodes.has(c.code));
  const isPrepare = step === 'PREPARE';

  if (unavailable) {
    return (
      <div className="w-full p-6 sm:p-10 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center text-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center justify-center">
          <Server className="w-6 h-6" />
        </div>
        <h2 className="text-base font-black text-slate-900 dark:text-white">មិនអាចភ្ជាប់ Database លើម៉ាស៊ីនបាន</h2>
        <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md leading-relaxed">{unavailable}</p>
        <button
          type="button"
          onClick={load}
          className="mt-1 h-9 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> ព្យាយាមម្ដងទៀត
        </button>
      </div>
    );
  }

  const stepBtn = (s: Step, n: string, title: string, short: string, sub: string, Icon: React.ElementType, color: string) => {
    const active = step === s;
    return (
      <button
        type="button"
        onClick={() => switchStep(s)}
        title={sub}
        className={`flex-1 sm:flex-none min-w-0 h-8 flex items-center justify-center gap-1.5 px-3 rounded-md text-xs font-black transition cursor-pointer ${
          active
            ? `${color} text-white shadow-sm`
            : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
        }`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">
          {n} <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{title}</span>
        </span>
        {queues[s].length > 0 && (
          <span className={`px-1.5 py-px rounded-full text-[10px] ${active ? 'bg-white/25' : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-200'}`}>
            {queues[s].length}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="page-fill w-full space-y-2 animate-in fade-in duration-200 pb-24 lg:pb-0">
      {/* ===== Scan panel ===== */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-2.5 sm:p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 flex items-center justify-center shrink-0">
              <Ticket className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white tracking-tight whitespace-nowrap">លេខវិក័យប័ត្រ</h2>
            <span
              className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
              title="ទិន្នន័យរក្សាទុកក្នុង PostgreSQL លើកុំព្យូទ័រការិយាល័យ (មិនមែន Hostinger)"
            >
              <Server className="w-2.5 h-2.5" /> Local DB
            </span>
          </div>

          <div className="w-full sm:w-auto flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {stepBtn('PREPARE', '①', 'រៀបចំទុកជាមុន', 'រៀបចំទុក', 'ស្កេនលេខដែលបានព្រីន ទុកក្នុងស្តុក', PackagePlus, 'bg-amber-600')}
            {stepBtn('ISSUE', '②', 'បើកឲ្យអ្នកប្រើប្រាស់', 'បើកឲ្យ', 'ស្កេនលេខពីស្តុក ប្រគល់ឲ្យអតិថិជន/បុគ្គលិក', Send, 'bg-emerald-600')}
          </div>

          <p className="hidden lg:block text-[11px] text-slate-500 dark:text-slate-400 truncate min-w-0 flex-1">
            {isPrepare ? 'ស្កេនលេខដែលបានព្រីន ទុកក្នុងស្តុក' : 'ស្កេនលេខពីស្តុក ប្រគល់ឲ្យអតិថិជន/បុគ្គលិក'}
          </p>
        </div>

        {/* Fields for this step */}
        <div className="grid grid-cols-2 lg:grid-cols-12 gap-2 items-end">
          {isPrepare ? (
            <>
              <div className="col-span-1 lg:col-span-3">
                <label className={labelCls}>NAME PREPAIRE (អ្នករៀបចំ)</label>
                <input value={namePrepare} onChange={(e) => setNamePrepare(e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-1 lg:col-span-2">
                <label className={labelCls}>DATE (ថ្ងៃរៀបចំ)</label>
                <input type="date" value={prepareDate} onChange={(e) => setPrepareDate(e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2 lg:col-span-2">
                <label className={labelCls}>
                  កូដរៀបចំ (PREP CODE) <span className="font-normal text-emerald-600">• ស្វ័យប្រវត្តិ</span>
                </label>
                <div className="relative">
                  <Hash className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-600" />
                  {/* Read-only: the server assigns the next IAL_BILL code when saving */}
                  <input
                    value={prepCode}
                    readOnly
                    tabIndex={-1}
                    className={`${inputCls} pl-7 font-mono font-bold bg-slate-50 dark:bg-slate-800/60 cursor-default focus:ring-0`}
                    placeholder="IAL_BILL000001"
                    title="កូដបង្កើតដោយស្វ័យប្រវត្តិពេលរក្សាទុក — នៅផ្នែក ② ជ្រើសកូដនេះ ដើម្បីបើកឲ្យទាំងក្រុមម្ដង"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="col-span-2 lg:col-span-3 2xl:col-span-2">
                <label className={labelCls}>
                  CUSTOMER (អ្នកទទួល) <span className="text-red-500">*</span>
                </label>
                <input
                  list="invoice-staff-list"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  className={inputCls}
                  placeholder={staffOptions.length ? `ជ្រើសពី Company Staff (${staffOptions.length}) ឬវាយឈ្មោះ` : 'ឈ្មោះអតិថិជន ឬបុគ្គលិក'}
                />
              </div>
              <div className="col-span-2 lg:col-span-3 2xl:col-span-2">
                <label className={labelCls}>COMPANY (ក្រុមហ៊ុន / ហាង)</label>
                <input
                  list="invoice-company-list"
                  value={company}
                  onChange={(e) => changeCompany(e.target.value)}
                  className={inputCls}
                  placeholder={companyOptions.length ? `ជ្រើសពីអតិថិជន (${companyOptions.length}) ឬវាយឈ្មោះ` : 'ឈ្មោះក្រុមហ៊ុន ឬហាង'}
                />
              </div>
              <div className="col-span-1 lg:col-span-3 2xl:col-span-1">
                <label className={labelCls}>PROVINCE (ខេត្ត)</label>
                <input
                  list="invoice-province-list"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className={inputCls}
                  placeholder="ជ្រើស ឬវាយ"
                />
              </div>
              <div className="col-span-1 lg:col-span-3 2xl:col-span-1">
                <label className={labelCls}>DATE (ថ្ងៃបើកឲ្យ)</label>
                <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2 lg:col-span-3 2xl:col-span-2">
                <label className={labelCls}>
                  បើកតាមកូដរៀបចំ <span className="font-normal text-slate-400">({openCodes.length})</span>
                </label>
                <div className="flex gap-1">
                  <div className="relative flex-1 min-w-0">
                    <Hash className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-600 pointer-events-none" />
                    {/* Picking a code queues its whole batch straight away */}
                    <select
                      value={issueCode}
                      onChange={(e) => {
                        const code = e.target.value;
                        setIssueCode(code);
                        if (code) addByPrepCode(code).finally(() => setIssueCode(''));
                      }}
                      disabled={checking || openCodes.length === 0}
                      className={`${inputCls} h-11 sm:h-9 pl-7 pr-2 font-mono font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
                      title="ជ្រើសកូដ ដើម្បីដាក់លេខទាំងអស់ក្នុងកូដនោះ (ដែលនៅក្នុងស្តុក) ចូលបញ្ជីស្កេនតែម្ដង"
                    >
                      <option value="">{openCodes.length ? '— ជ្រើសកូដរៀបចំ —' : 'មិនទាន់មានកូដ'}</option>
                      {openCodes.map((c) => (
                        <option key={c.code} value={c.code}>
                          {[`${c.code} (${c.count} លេខ)`, c.namePrepare, c.date ? showDate(c.date) : ''].filter(Boolean).join(' • ')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={loadPrepCodes}
                    className="h-11 sm:h-9 w-9 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-emerald-600 flex items-center justify-center cursor-pointer"
                    title="ទាញបញ្ជីកូដឡើងវិញ"
                  >
                    {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </>
          )}

          <div className={`col-span-2 ${isPrepare ? 'lg:col-span-3' : 'lg:col-span-7 2xl:col-span-3'}`}>
            <label className={labelCls}>
              ស្កេន / វាយលេខ TRACKING <span className="hidden sm:inline font-normal text-slate-400">(Enter • ជាជួរ ឧ. INV0001-INV0050)</span>
            </label>
            <div className="relative">
              {checking ? (
                <Loader2 className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-cyan-600 animate-spin" />
              ) : (
                <ScanLine className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-cyan-600" />
              )}
              <input
                ref={scanRef}
                value={scanText}
                onChange={(e) => setScanText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleScan();
                  }
                }}
                autoFocus
                placeholder="ស្កេន Barcode បន្តបន្ទាប់..."
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                className={`${inputCls} h-11 sm:h-9 pl-8 font-mono text-sm border-2 border-cyan-500/60 focus:ring-cyan-500`}
              />
            </div>
          </div>

          <div className={`col-span-2 ${isPrepare ? 'lg:col-span-2' : 'lg:col-span-2 2xl:col-span-1'}`}>
            <button
              type="button"
              onClick={saveQueueToDb}
              disabled={saving || queue.length === 0}
              className={`w-full h-11 sm:h-9 rounded-lg text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed ${
                isPrepare ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              រក្សាទុក ({queue.length})
            </button>
          </div>
        </div>
        <datalist id="invoice-staff-list">
          {staffOptions.map((s) => (
            <option key={s.value} value={s.value} label={s.label || undefined} />
          ))}
        </datalist>
        <datalist id="invoice-company-list">
          {companyOptions.map((o) => (
            <option key={o.value} value={o.value} label={o.label || undefined} />
          ))}
        </datalist>
        <datalist id="invoice-prepcode-list">
          {openCodes.map((c) => (
            <option key={c.code} value={c.code} label={[`${c.count} លេខ`, c.namePrepare, showDate(c.date)].filter(Boolean).join(' • ')} />
          ))}
        </datalist>
        <datalist id="invoice-province-list">
          {CAMBODIA_PROVINCES.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>

        {feedback && (
          <div
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${
              feedback.ok
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
            }`}
          >
            {feedback.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
            <span className="min-w-0">{feedback.text}</span>
          </div>
        )}

        {/* Scanned, not saved yet */}
        {queue.length > 0 && (
          <div className="rounded-xl border border-dashed border-cyan-300 dark:border-cyan-800 bg-cyan-50/40 dark:bg-cyan-950/20 p-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-black text-cyan-800 dark:text-cyan-200">
                បញ្ជីស្កេន (មិនទាន់រក្សាទុក): {queue.length} លេខ
              </span>
              <button type="button" onClick={clearQueue} className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> សម្អាតទាំងអស់
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {queue.map((t, i) => {
                const r = queueInfo.current.get(t);
                return (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 pl-2 pr-1 h-7 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-mono font-bold text-slate-800 dark:text-slate-100"
                    title={!isPrepare && r ? `រៀបចំដោយ ${r.namePrepare || '—'} ថ្ងៃ ${showDate(r.date)}${r.prepCode ? ` • កូដ ${r.prepCode}` : ''}` : undefined}
                  >
                    <span className="text-slate-400 font-normal">{i + 1}.</span> {t}
                    <button
                      type="button"
                      onClick={() => removeFromQueue(t)}
                      className="p-0.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                      title="ដកចេញ"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ===== Saved list ===== */}
      <div className="page-fill-body bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
        <div className="px-2.5 sm:px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[180px] relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ស្វែងរក TRACKING, អតិថិជន, ខេត្ត, អ្នករៀបចំ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-7 h-8 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-600"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                title="សម្អាត"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="w-full lg:w-auto overflow-x-auto scrollbar-none">
            <div className="inline-flex items-center gap-1 bg-white dark:bg-slate-800/90 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px]">
              <button type="button" onClick={() => setStatusFilter('ALL')} className={pill(statusFilter === 'ALL', 'bg-cyan-600')}>
                ទាំងអស់ ({counts.ALL.toLocaleString()})
              </button>
              {STATUSES.map((s) => (
                <button key={s} type="button" onClick={() => setStatusFilter(s)} className={pill(statusFilter === s, INVOICE_STATUS_META[s].solid)}>
                  {INVOICE_STATUS_META[s].label} ({counts[s].toLocaleString()})
                </button>
              ))}
            </div>
          </div>

          <div className="w-full lg:w-auto flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1 w-full sm:w-auto">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 px-2 flex-1 sm:flex-none min-w-0 rounded-lg text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                title="ពីថ្ងៃ"
              />
              <span className="text-[11px] text-slate-400">→</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 px-2 flex-1 sm:flex-none min-w-0 rounded-lg text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                title="ដល់ថ្ងៃ"
              />
            </div>
            <button
              type="button"
              onClick={toggleGroupMode}
              className={`h-8 px-2.5 shrink-0 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                groupMode
                  ? 'border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
              }`}
              title="បង្ហាញជាក្រុម តាមកូដរៀបចំ (PREP CODE)"
            >
              <Layers className="w-3.5 h-3.5" /> Group តាមកូដ:{' '}
              <span className={`px-1 rounded text-[10px] ${groupMode ? 'bg-violet-600 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>{groupMode ? 'ON' : 'OFF'}</span>
            </button>
            <button
              type="button"
              onClick={load}
              className="h-8 w-8 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center cursor-pointer hover:bg-slate-50"
              title="ទាញទិន្នន័យឡើងវិញ"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="h-8 px-2.5 shrink-0 rounded-lg border border-cyan-300 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer hover:bg-cyan-100"
              title="នាំចូលទិន្នន័យចាស់ពី Excel (.xlsx) ឬ CSV"
            >
              <FileUp className="w-3.5 h-3.5" /> <span className="hidden sm:inline">នាំចូល</span> Excel
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.csv" onChange={onPickFile} className="hidden" />
            <button
              type="button"
              onClick={() => downloadInvoiceTemplate().catch((err) => onShowToast(err?.message || 'បង្កើត File គំរូមិនបាន', 'error'))}
              className="h-8 px-2.5 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer hover:bg-slate-50"
              title="ទាញយក File Excel គំរូ សម្រាប់បំពេញទិន្នន័យចាស់ ហើយនាំចូល"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" /> <span className="hidden sm:inline">File</span> គំរូ
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={total === 0 || exporting}
              className="h-8 px-2.5 shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              title="ទាញយកជា CSV (តាមតម្រងបច្ចុប្បន្ន)"
            >
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} CSV
            </button>
          </div>
        </div>

        {isAdmin && !groupMode && selected.size > 0 && (
          <div className="px-3 py-1.5 bg-cyan-50 dark:bg-cyan-950/40 border-b border-cyan-100 dark:border-cyan-900 flex items-center gap-2 text-xs">
            <span className="font-bold text-cyan-800 dark:text-cyan-200">បានជ្រើស {selected.size}</span>
            <button
              type="button"
              onClick={() => remove([...selected])}
              className="h-7 px-2.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" /> លុប
            </button>
            <button type="button" onClick={() => setSelected(new Set())} className="text-[11px] text-slate-500 hover:underline cursor-pointer">
              បោះបង់
            </button>
          </div>
        )}

        <div
          className={`flex-1 min-h-0 overflow-auto transition-opacity ${loading && (groupMode ? groups.length : rows.length) > 0 ? 'opacity-50' : ''}`}
        >
          {groupMode ? (
            groupView
          ) : (
          <>
          {mobileCards}
          <table className="hidden md:table w-full text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-950 text-[10.5px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <tr className="border-b border-slate-200 dark:border-slate-800">
                {isAdmin && (
                  <th className="w-8 px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                      className="cursor-pointer"
                      aria-label="ជ្រើសទាំងអស់"
                    />
                  </th>
                )}
                <th className="w-10 px-2 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Tracking</th>
                <th className="px-3 py-2 text-left">Customer</th>
                <th className="px-3 py-2 text-left">ក្រុមហ៊ុន / ហាង</th>
                <th className="px-3 py-2 text-left">Province</th>
                <th className="px-3 py-2 text-left">Name Prepaire</th>
                <th className="px-3 py-2 text-left">កូដរៀបចំ</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">ថ្ងៃបើកឲ្យ</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="w-20 px-2 py-2 text-center">សកម្មភាព</th>
              </tr>
            </thead>
            {tableBody}
          </table>
          </>
          )}
        </div>

        {/* Pages */}
        <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex flex-col sm:flex-row items-center justify-between gap-1.5 sm:gap-2 text-[11px] text-slate-600 dark:text-slate-400">
          <span className="text-center">
            {total === 0
              ? `0 ${groupMode ? 'ក្រុម' : 'ជួរ'}`
              : `បង្ហាញ ${((page - 1) * pageSize + 1).toLocaleString()}–${Math.min(page * pageSize, total).toLocaleString()} នៃ ${total.toLocaleString()} ${groupMode ? 'ក្រុម' : 'ជួរ'}`}
          </span>
          <div className="flex items-center gap-1.5">
            <select
              value={pageSize}
              onChange={(e) => changePageSize(Number(e.target.value))}
              className="h-7 px-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] cursor-pointer"
              title="ចំនួនជួរក្នុងមួយទំព័រ"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} / ទំព័រ
                </option>
              ))}
            </select>
            {[
              { label: '«', to: 1, title: 'ទំព័រដំបូង' },
              { label: '‹', to: page - 1, title: 'ថយក្រោយ' },
            ].map((b) => (
              <button
                key={b.label}
                type="button"
                onClick={() => setPage(b.to)}
                disabled={page <= 1 || loading}
                className="h-8 w-8 sm:h-7 sm:w-7 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title={b.title}
              >
                {b.label}
              </button>
            ))}
            <span className="px-1.5 font-semibold whitespace-nowrap">
              ទំព័រ {page.toLocaleString()} / {pageCount.toLocaleString()}
            </span>
            {[
              { label: '›', to: page + 1, title: 'បន្ទាប់' },
              { label: '»', to: pageCount, title: 'ទំព័រចុងក្រោយ' },
            ].map((b) => (
              <button
                key={b.label}
                type="button"
                onClick={() => setPage(b.to)}
                disabled={page >= pageCount || loading}
                className="h-8 w-8 sm:h-7 sm:w-7 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title={b.title}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Import preview ===== */}
      {importing && importSummary && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => importProgress === null && setImporting(null)}>
          <div
            className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-1.5 min-w-0">
                <FileSpreadsheet className="w-4 h-4 text-cyan-600 shrink-0" />
                <span className="truncate">នាំចូលពី «{importing.fileName}»</span>
              </h3>
              {importProgress === null && (
                <button type="button" onClick={() => setImporting(null)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer" title="បិទ">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="p-4 space-y-3 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-2.5">
                  <div className="text-[10.5px] text-slate-500">សរុប</div>
                  <div className="text-lg font-black text-slate-900 dark:text-white">{importing.parsed.rows.length}</div>
                </div>
                {STATUSES.map((s) => (
                  <div key={s} className={`rounded-xl border p-2.5 ${INVOICE_STATUS_META[s].pill}`}>
                    <div className="text-[10.5px]">{INVOICE_STATUS_META[s].label}</div>
                    <div className="text-lg font-black">{importSummary.byStatus[s]}</div>
                  </div>
                ))}
              </div>

              <ul className="text-[11.5px] text-slate-600 dark:text-slate-400 space-y-0.5 list-disc pl-4">
                {importSummary.existing === null ? (
                  <li className="text-slate-500">
                    <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> កំពុងពិនិត្យលេខដែលមានក្នុង Database រួចហើយ...
                  </li>
                ) : importSummary.existing > 0 ? (
                  <li className="text-amber-700 dark:text-amber-400 font-semibold">{importSummary.existing.toLocaleString()} លេខមានក្នុង Database រួចហើយ</li>
                ) : null}
                {importing.parsed.duplicatesInFile > 0 && <li>{importing.parsed.duplicatesInFile} ជួរស្ទួនក្នុង File (យកតែជួរទីមួយ)</li>}
                {importing.parsed.missingTracking > 0 && <li>{importing.parsed.missingTracking} ជួរគ្មានលេខ TRACKING (មិននាំចូល)</li>}
                {importing.parsed.ignoredHeaders.length > 0 && <li>ជួរឈរដែលមិនស្គាល់ (មិនយក)៖ {importing.parsed.ignoredHeaders.join(', ')}</li>}
                <li>STATUS ទទេ៖ មាន CUSTOMER → «បានបើកឲ្យ», គ្មាន → «រៀបចំទុក»</li>
              </ul>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 uppercase text-[10px]">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Tracking</th>
                      <th className="px-2 py-1.5 text-left">Customer</th>
                      <th className="px-2 py-1.5 text-left">Province</th>
                      <th className="px-2 py-1.5 text-left">Prepaire</th>
                      <th className="px-2 py-1.5 text-left">Date</th>
                      <th className="px-2 py-1.5 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {importing.parsed.rows.slice(0, 8).map((r) => (
                      <tr key={r.tracking}>
                        <td className="px-2 py-1 font-mono font-bold whitespace-nowrap">{r.tracking}</td>
                        <td className="px-2 py-1">{r.customer || '—'}</td>
                        <td className="px-2 py-1">{r.province || '—'}</td>
                        <td className="px-2 py-1">{r.namePrepare || '—'}</td>
                        <td className="px-2 py-1 font-mono whitespace-nowrap">{showDate(r.date)}</td>
                        <td className="px-2 py-1">{INVOICE_STATUS_META[r.status].label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importing.parsed.rows.length > 8 && (
                  <div className="px-2 py-1 text-[10.5px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
                    … និង {importing.parsed.rows.length - 8} ជួរទៀត
                  </div>
                )}
              </div>

              {(importSummary.existing ?? 0) !== 0 && (
                <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="mt-0.5 cursor-pointer" />
                  <span>
                    <b>សរសេរជាន់</b> លេខដែលមានរួចហើយ ដោយទិន្នន័យក្នុង File
                    <span className="block text-[10.5px] text-slate-500">បើមិនធីក លេខដែលមានរួចហើយនឹងត្រូវរំលង (មិនប៉ះពាល់)</span>
                  </span>
                </label>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => downloadInvoiceTemplate()}
                className="text-[11px] font-bold text-cyan-700 dark:text-cyan-400 hover:underline cursor-pointer flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> ទាញយក File គំរូ
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setImporting(null)}
                  disabled={importProgress !== null}
                  className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  បោះបង់
                </button>
                <button
                  type="button"
                  onClick={runImport}
                  disabled={importProgress !== null}
                  className="h-9 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {importProgress !== null ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> {importProgress}/{importing.parsed.rows.length}
                    </>
                  ) : (
                    <>
                      <FileUp className="w-3.5 h-3.5" /> នាំចូល {importing.parsed.rows.length} ជួរ
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Edit dialog (corrections) ===== */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => !saving && setEditing(null)}>
          <div
            className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">កែប្រែលេខវិក័យប័ត្រ</h3>
              <button type="button" onClick={() => setEditing(null)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer" title="បិទ">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                saveEdit();
              }}
            >
              <div className="sm:col-span-2">
                <label className={labelCls}>TRACKING</label>
                <input value={editing.tracking} onChange={(e) => setEditing({ ...editing, tracking: e.target.value })} className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className={labelCls}>CUSTOMER</label>
                <input
                  list="invoice-staff-list"
                  value={editing.fields.customer}
                  onChange={(e) => setEditing({ ...editing, fields: { ...editing.fields, customer: e.target.value } })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>COMPANY (ក្រុមហ៊ុន / ហាង)</label>
                <input
                  list="invoice-company-list"
                  value={editing.fields.company || ''}
                  onChange={(e) => setEditing({ ...editing, fields: { ...editing.fields, company: e.target.value } })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>PROVINCE</label>
                <input
                  list="invoice-province-list"
                  value={editing.fields.province}
                  onChange={(e) => setEditing({ ...editing, fields: { ...editing.fields, province: e.target.value } })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>NAME PREPAIRE</label>
                <input
                  value={editing.fields.namePrepare}
                  onChange={(e) => setEditing({ ...editing, fields: { ...editing.fields, namePrepare: e.target.value } })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>កូដរៀបចំ</label>
                <input
                  list="invoice-prepcode-list"
                  value={editing.fields.prepCode || ''}
                  onChange={(e) => setEditing({ ...editing, fields: { ...editing.fields, prepCode: e.target.value.toUpperCase() } })}
                  className={`${inputCls} font-mono`}
                />
              </div>
              <div>
                <label className={labelCls}>DATE (ថ្ងៃរៀបចំ)</label>
                <input
                  type="date"
                  value={editing.fields.date}
                  onChange={(e) => setEditing({ ...editing, fields: { ...editing.fields, date: e.target.value } })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>ថ្ងៃបើកឲ្យ</label>
                <input
                  type="date"
                  value={editing.fields.issuedDate || ''}
                  onChange={(e) => setEditing({ ...editing, fields: { ...editing.fields, issuedDate: e.target.value } })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>STATUS</label>
                <select
                  value={editing.fields.status}
                  onChange={(e) => setEditing({ ...editing, fields: { ...editing.fields, status: e.target.value as InvoiceStatus } })}
                  className={inputCls}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {INVOICE_STATUS_META[s].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2 pt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="h-9 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  បោះបង់
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-9 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} រក្សាទុក
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
