import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Loader2,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
  ScrollText,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { AuthUser } from '../types';
import {
  RegulationBlock,
  RegulationKind,
  deleteRegulation,
  fetchRegulations,
  moveRegulation,
  saveRegulation,
} from '../services/regulationService';

interface RegulationsPageProps {
  currentUser: AuthUser | null;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const KIND_LABEL: Record<RegulationKind, string> = {
  CHAPTER: 'ជំពូក',
  SECTION: 'ផ្នែក',
  ARTICLE: 'ប្រការ / ភារកិច្ច',
  NOTE: 'អត្ថបទ',
};

// ── Body text → elements ────────────────────────────────────────────────────
// "- " bullet, "-- " sub bullet, "### " sub heading, "! " highlighted note, **bold**

const Inline: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') && p.length > 4 ? (
          <strong key={i} className="font-bold text-slate-900 dark:text-white">
            <Highlight text={p.slice(2, -2)} query={query} />
          </strong>
        ) : (
          <Highlight key={i} text={p} query={query} />
        )
      )}
    </>
  );
}

const Highlight: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const out: React.ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(query, from);
  while (at >= 0) {
    if (at > from) out.push(text.slice(from, at));
    out.push(
      <mark key={at} className="bg-amber-200/80 dark:bg-amber-500/40 text-inherit rounded px-0.5">
        {text.slice(at, at + query.length)}
      </mark>
    );
    from = at + query.length;
    at = lower.indexOf(query, from);
  }
  if (from < text.length) out.push(text.slice(from));
  return <>{out}</>;
}

function Body({ text, query }: { text: string; query: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 text-[13.5px] leading-7 text-slate-700 dark:text-slate-300">
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={i} className="h-1" />;
        if (line.startsWith('-- ')) {
          return (
            <div key={i} className="flex gap-2 pl-9">
              <span className="mt-[11px] w-1.5 h-1.5 rounded-full border border-slate-400 shrink-0" />
              <span><Inline text={line.slice(3)} query={query} /></span>
            </div>
          );
        }
        if (line.startsWith('- ')) {
          return (
            <div key={i} className="flex gap-2 pl-3">
              <span className="mt-[11px] w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
              <span><Inline text={line.slice(2)} query={query} /></span>
            </div>
          );
        }
        if (line.startsWith('### ')) {
          return (
            <div key={i} className="pt-1 font-bold text-slate-900 dark:text-white">
              <Inline text={line.slice(4)} query={query} />
            </div>
          );
        }
        if (line.startsWith('! ')) {
          return (
            <div key={i} className="mt-1 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200">
              <Inline text={line.slice(2)} query={query} />
            </div>
          );
        }
        return (
          <p key={i}>
            <Inline text={line} query={query} />
          </p>
        );
      })}
    </div>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────

interface EditorState {
  block: RegulationBlock;
  /** New blocks only: where to put it (0 = top, id = after that block, null = end) */
  afterId: number | null;
}

function EditorModal({
  state,
  saving,
  onClose,
  onSave,
}: {
  state: EditorState;
  saving: boolean;
  onClose: () => void;
  onSave: (b: RegulationBlock) => void;
}) {
  const [draft, setDraft] = useState<RegulationBlock>(state.block);
  const isNew = !state.block.id;
  const needsTitle = draft.kind !== 'NOTE';
  const canSave = (needsTitle ? draft.title.trim() : draft.title.trim() || draft.body.trim()) && !saving;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const input =
    'w-full rounded-lg text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600';

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => !saving && onClose()}>
      <div
        className="w-full sm:max-w-5xl max-h-[92dvh] flex flex-col bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <Pencil className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-black text-slate-900 dark:text-white flex-1">{isNew ? 'បន្ថែមខ្លឹមសារថ្មី' : 'កែប្រែខ្លឹមសារ'}</h3>
          <button type="button" onClick={onClose} disabled={saving} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer" title="បិទ">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto grid lg:grid-cols-2 gap-4 p-4">
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
              <div className="col-span-2 sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-500 mb-1 whitespace-nowrap">ប្រភេទ</label>
                <select
                  value={draft.kind}
                  onChange={(e) => setDraft({ ...draft, kind: e.target.value as RegulationKind })}
                  className={`${input} h-9 px-2`}
                >
                  {(Object.keys(KIND_LABEL) as RegulationKind[]).map((k) => (
                    <option key={k} value={k}>{KIND_LABEL[k]}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 sm:col-span-4">
                <label className="block text-[11px] font-bold text-slate-500 mb-1 whitespace-nowrap">ចំណងជើង{needsTitle ? ' *' : ''}</label>
                <input
                  autoFocus
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder={draft.kind === 'CHAPTER' ? 'ឧ. ជំពូកទី៥ ៖ ...' : draft.kind === 'SECTION' ? 'ឧ. ផ្នែកទី៥ ...' : 'ឧ. ប្រការ២០'}
                  className={`${input} h-9 px-3`}
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1 whitespace-nowrap">ខ្លឹមសារ</label>
              <textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                rows={14}
                placeholder="សរសេរខ្លឹមសារនៅទីនេះ..."
                className={`${input} px-3 py-2 leading-7 font-[inherit] resize-y min-h-[220px]`}
              />
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                <span><code className="font-mono font-bold text-blue-600">- </code> ចំណុច (bullet)</span>
                <span><code className="font-mono font-bold text-blue-600">-- </code> ចំណុចរង</span>
                <span><code className="font-mono font-bold text-blue-600">### </code> ចំណងជើងរង</span>
                <span><code className="font-mono font-bold text-blue-600">! </code> កំណត់សម្គាល់ពិសេស</span>
                <span><code className="font-mono font-bold text-blue-600">**អក្សរ**</code> អក្សរដិត</span>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-500 mb-1">មើលជាមុន</div>
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-950/30">
              <BlockView block={draft} query="" />
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="h-9 px-4 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
            បោះបង់
          </button>
          <button
            type="button"
            onClick={() => onSave({ ...draft, title: draft.title.trim(), body: draft.body.trim() })}
            disabled={!canSave}
            className="h-9 px-4 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            រក្សាទុក
          </button>
        </div>
      </div>
    </div>
  );
}

// ── One block ───────────────────────────────────────────────────────────────

function BlockView({ block, query }: { block: RegulationBlock; query: string }) {
  if (block.kind === 'CHAPTER') {
    return (
      <div className="pt-4 pb-1 text-center">
        <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white"><Highlight text={block.title} query={query} /></h2>
        {block.body && <div className="mt-1 text-left"><Body text={block.body} query={query} /></div>}
        <div className="mx-auto mt-2 h-0.5 w-16 rounded-full bg-blue-600/70" />
      </div>
    );
  }
  if (block.kind === 'SECTION') {
    return (
      <div className="pt-3">
        <h3 className="text-[15px] sm:text-base font-black text-blue-700 dark:text-blue-400 border-l-4 border-blue-600 pl-3"><Highlight text={block.title} query={query} /></h3>
        {block.body && <div className="mt-1.5"><Body text={block.body} query={query} /></div>}
      </div>
    );
  }
  if (block.kind === 'ARTICLE') {
    const isNumbered = /^ប្រការ/.test(block.title);
    return (
      <div className={isNumbered ? 'sm:flex gap-3' : ''}>
        <div className={isNumbered ? 'shrink-0 sm:w-24 mb-1 sm:mb-0' : 'mb-1.5'}>
          <span
            className={
              isNumbered
                ? 'inline-block px-2 py-0.5 rounded-md text-xs font-black bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-800/60 whitespace-nowrap'
                : 'text-[14px] font-black text-slate-900 dark:text-white'
            }
          >
            <Highlight text={block.title} query={query} />{isNumbered ? ' ៖' : ''}
          </span>
        </div>
        {block.body && <div className="flex-1 min-w-0"><Body text={block.body} query={query} /></div>}
      </div>
    );
  }
  return <Body text={block.body || block.title} query={query} />;
}

// ── Page ────────────────────────────────────────────────────────────────────

export function RegulationsPage({ currentUser, onShowToast }: RegulationsPageProps) {
  const canEdit = currentUser?.role === 'ADMIN';
  const [blocks, setBlocks] = useState<RegulationBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const docRef = useRef<HTMLDivElement>(null);
  const query = search.trim().toLowerCase();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBlocks(await fetchRegulations());
    } catch (e: any) {
      setError(e?.message || 'មិនអាចទាញទិន្នន័យបាន');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Searching: show matching blocks plus the chapter / section they belong to
  const visible = useMemo(() => {
    if (!query) return blocks;
    const hit = (b: RegulationBlock) => `${b.title}\n${b.body}`.toLowerCase().includes(query);
    const keep = new Set<number>();
    let chapter = -1;
    let section = -1;
    blocks.forEach((b, i) => {
      if (b.kind === 'CHAPTER') { chapter = i; section = -1; }
      if (b.kind === 'SECTION') section = i;
      if (hit(b)) {
        keep.add(i);
        if (chapter >= 0) keep.add(chapter);
        if (section >= 0) keep.add(section);
      }
    });
    return blocks.filter((_, i) => keep.has(i));
  }, [blocks, query]);

  const matchCount = useMemo(
    () => (query ? blocks.filter((b) => `${b.title}\n${b.body}`.toLowerCase().includes(query)).length : 0),
    [blocks, query]
  );

  const toc = useMemo(() => blocks.filter((b) => b.kind === 'CHAPTER' || b.kind === 'SECTION'), [blocks]);

  const run = async (id: number | null, task: () => Promise<RegulationBlock[]>, okMsg?: string) => {
    setBusyId(id);
    try {
      setBlocks(await task());
      if (okMsg) onShowToast(okMsg, 'success');
      return true;
    } catch (e: any) {
      onShowToast(e?.message || 'មានបញ្ហា', 'error');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handleSave = async (b: RegulationBlock) => {
    if (!editor) return;
    setSaving(true);
    const ok = await run(null, () => saveRegulation(b, b.id ? null : editor.afterId), 'បានរក្សាទុក');
    setSaving(false);
    if (ok) setEditor(null);
  };

  const handleDelete = (b: RegulationBlock) => {
    if (!b.id) return;
    const name = b.title || (b.body || '').slice(0, 40);
    if (!window.confirm(`លុប «${name}» មែនទេ?`)) return;
    run(b.id, () => deleteRegulation(b.id!), 'បានលុប');
  };

  const addAfter = (afterId: number | null, kind: RegulationKind = 'ARTICLE') =>
    setEditor({ block: { kind, title: '', body: '' }, afterId });

  const scrollTo = (id?: number) => {
    if (!id) return;
    document.getElementById(`reg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handlePrint = () => {
    const node = docRef.current;
    if (!node) return;
    const w = window.open('', '_blank');
    if (!w) {
      onShowToast('Browser បានបិទ Pop-up សូមអនុញ្ញាតហើយសាកម្តងទៀត', 'error');
      return;
    }
    const clone = node.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-noprint]').forEach((el) => el.remove());
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map((el) => el.outerHTML).join('');
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>បទបញ្ជាផ្ទៃក្នុង</title>${styles}<style>body{background:#fff;padding:24px}@page{margin:14mm}</style></head><body>${clone.outerHTML}</body></html>`
    );
    w.document.close();
    w.onload = () => {
      w.focus();
      w.print();
    };
  };

  const iconBtn =
    'w-7 h-7 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-blue-600 hover:border-blue-300 disabled:opacity-40 cursor-pointer';

  return (
    <div className="w-full space-y-2 animate-in fade-in duration-200 pb-24 lg:pb-4">
      {/* Toolbar */}
      <div className="sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs px-2.5 sm:px-3 py-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0">
            <ScrollText className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-sm font-black text-slate-900 dark:text-white tracking-tight whitespace-nowrap">បទបញ្ជាផ្ទៃក្នុង</h2>
        </div>

        <div className="order-last sm:order-none basis-full sm:basis-auto flex-1 min-w-0 sm:min-w-[200px] relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ស្វែងរកក្នុងបទបញ្ជា..."
            className="w-full pl-8 pr-16 h-9 lg:h-8 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
          {search && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <span className="text-[10px] font-bold text-slate-400">{matchCount}</span>
              <button type="button" onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer" title="សម្អាត">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={load} disabled={loading} className="h-8 px-2.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer" title="ទាញទិន្នន័យម្តងទៀត">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={handlePrint} disabled={loading || blocks.length === 0} className="h-8 px-2.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">បោះពុម្ព</span>
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className={`h-8 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
                editMode ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {editMode ? <Save className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
              {editMode ? 'រួចរាល់' : 'កែប្រែ'}
            </button>
          )}
        </div>
      </div>

      {editMode && (
        <div className="p-2 sm:p-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-xl flex flex-wrap items-center gap-2 text-xs text-blue-800 dark:text-blue-300">
          <Pencil className="w-4 h-4 shrink-0" />
          <span className="flex-1 min-w-[200px]">របៀបកែប្រែ៖ ប្រើប៊ូតុងនៅជ្រុងស្តាំនៃខ្លឹមសារនីមួយៗ ដើម្បីកែ ផ្លាស់ទីតាំង បន្ថែមខាងក្រោម ឬលុប។ ការផ្លាស់ប្តូររក្សាទុកភ្លាមៗ។</span>
          <button type="button" onClick={() => addAfter(0, 'CHAPTER')} className="h-7 px-2.5 rounded-lg font-bold bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 inline-flex items-center gap-1 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> បន្ថែមនៅខាងលើគេ
          </button>
          <button type="button" onClick={() => addAfter(null, 'CHAPTER')} className="h-7 px-2.5 rounded-lg font-bold bg-blue-600 text-white inline-flex items-center gap-1 cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> បន្ថែមនៅខាងចុង
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl flex items-center gap-2 text-xs text-rose-800 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={load} className="font-bold underline cursor-pointer">សាកម្តងទៀត</button>
        </div>
      )}

      <div className="flex gap-3 items-start">
        {/* Table of contents (PC) */}
        {toc.length > 0 && (
          <nav className="hidden xl:block sticky top-14 w-64 shrink-0 max-h-[calc(100dvh-5rem)] overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3">
            <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2">មាតិកា</div>
            <ul className="space-y-0.5">
              {toc.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => scrollTo(b.id)}
                    className={`w-full text-left rounded-md px-2 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer ${
                      b.kind === 'CHAPTER' ? 'font-bold text-slate-900 dark:text-white mt-1.5' : 'pl-4 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {b.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Document */}
        <div ref={docRef} className="flex-1 min-w-0 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="w-full px-4 sm:px-8 lg:px-12 py-6 sm:py-10">
            {/* Letterhead */}
            <header className="text-center space-y-1 mb-6">
              <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white">ព្រះរាជាណាចក្រកម្ពុជា</div>
              <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white">ជាតិ សាសនា ព្រះមហាក្សត្រ</div>
              <div className="text-slate-400 text-xs tracking-[0.3em]">✦✦✦</div>
              <div className="pt-3 text-sm font-bold text-slate-700 dark:text-slate-300">អ៊ែរ អិច ប្រេស វើលវ៉ាយ ដ៍ អ៊ិន</div>
              <div className="text-[11px] font-bold tracking-wide text-slate-500">INTERNATIONAL AIR LAND EXPRESS CO., LTD.</div>
              <div className="pt-5 text-base font-bold text-slate-800 dark:text-slate-200">សេចក្តីសម្រេច</div>
              <div className="text-sm text-slate-600 dark:text-slate-400">ស្តីពី</div>
              <h1 className="text-2xl sm:text-3xl font-black text-blue-700 dark:text-blue-400 leading-snug">បទបញ្ជាផ្ទៃក្នុង សម្រាប់បុគ្គលិក</h1>
            </header>

            {loading && blocks.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> កំពុងទាញទិន្នន័យ...
              </div>
            ) : visible.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-500">
                {query ? 'រកមិនឃើញខ្លឹមសារដែលត្រូវនឹងការស្វែងរក' : 'មិនទាន់មានខ្លឹមសារ'}
                {!query && canEdit && (
                  <div className="mt-3">
                    <button type="button" onClick={() => addAfter(null, 'CHAPTER')} className="h-8 px-3 rounded-lg text-xs font-bold bg-blue-600 text-white inline-flex items-center gap-1.5 cursor-pointer">
                      <Plus className="w-3.5 h-3.5" /> បន្ថែមខ្លឹមសារ
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {visible.map((b) => {
                  const pos = blocks.findIndex((x) => x.id === b.id);
                  const busy = busyId === b.id;
                  return (
                    <section
                      key={b.id}
                      id={`reg-${b.id}`}
                      className={`relative scroll-mt-16 ${editMode ? 'group rounded-xl -mx-2 px-2 py-1 ring-1 ring-transparent hover:ring-blue-200 dark:hover:ring-blue-900 hover:bg-blue-50/30 dark:hover:bg-blue-950/20' : ''} ${busy ? 'opacity-50' : ''}`}
                    >
                      {editMode && (
                        <div data-noprint className="flex justify-end gap-1 mb-1 sm:absolute sm:right-2 sm:-top-3 sm:mb-0 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 transition z-10">
                          <span className="hidden sm:inline-flex items-center px-1.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">{KIND_LABEL[b.kind]}</span>
                          <button type="button" className={iconBtn} title="ផ្លាស់ឡើងលើ" disabled={busy || pos <= 0 || !!query} onClick={() => run(b.id!, () => moveRegulation(b.id!, 'up'))}>
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" className={iconBtn} title="ផ្លាស់ចុះក្រោម" disabled={busy || pos >= blocks.length - 1 || !!query} onClick={() => run(b.id!, () => moveRegulation(b.id!, 'down'))}>
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" className={iconBtn} title="បន្ថែមខាងក្រោម" disabled={busy} onClick={() => addAfter(b.id!, b.kind === 'CHAPTER' ? 'SECTION' : 'ARTICLE')}>
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" className={iconBtn} title="កែប្រែ" disabled={busy} onClick={() => setEditor({ block: { ...b, body: b.body || '' }, afterId: null })}>
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" className={`${iconBtn} hover:!text-rose-600 hover:!border-rose-300`} title="លុប" disabled={busy} onClick={() => handleDelete(b)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <BlockView block={{ ...b, body: b.body || '' }} query={query} />
                    </section>
                  );
                })}
              </div>
            )}

            {!query && blocks.length > 0 && (
              <footer className="mt-12 text-center space-y-1">
                <div className="text-sm font-bold text-slate-700 dark:text-slate-300">បានអាន និងយល់ស្រប</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">ភ្នំពេញ ថ្ងៃទី.......... ខែ.......... ឆ្នាំ..........</div>
                <div className="pt-14 text-slate-400">..................................................</div>
                <div className="text-sm font-bold text-slate-700 dark:text-slate-300">ឈ្មោះបុគ្គលិក</div>
                <div className="pt-10 text-2xl sm:text-4xl font-black tracking-wide text-orange-600 dark:text-orange-500 leading-tight">
                  COME TO WORK ON TIME
                  <br />
                  IS THE BEST ATTITUDE.
                </div>
              </footer>
            )}
          </div>
        </div>
      </div>

      {editor && <EditorModal state={editor} saving={saving} onClose={() => setEditor(null)} onSave={handleSave} />}
    </div>
  );
}
