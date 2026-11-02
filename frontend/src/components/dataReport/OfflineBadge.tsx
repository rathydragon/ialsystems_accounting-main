import React, { useEffect, useState } from 'react';
import { CloudOff, Wifi } from 'lucide-react';
import { authFetch } from '../../services/apiClient';

/** What the office server reports about its local Data Report copy (backend/api/offline-store.js). */
interface OfflineStatus {
  enabled: boolean;
  online: boolean;
  lastSyncAt: string | null;
  pending?: number;
  failed?: number;
}

const POLL_MS = 30 * 1000;

const timeOf = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const same = d.toDateString() === new Date().toDateString();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return same ? hm : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hm}`;
};

/**
 * Online / Offline state of the Data Report data.
 * Online: green dot (+ last local sync on hover). Offline: amber chip with the time of the local copy
 * and how many edits wait to be sent to Hostinger. Shows just the dot when the server has no local copy.
 */
export const OfflineBadge: React.FC = () => {
  const [st, setSt] = useState<OfflineStatus | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await authFetch(`/api/remote-mysql?action=offline_status&t=${Date.now()}`);
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (res.ok && json?.ok) {
          setSt(json.data);
          setUnreachable(false);
        }
      } catch {
        if (alive) setUnreachable(true); // the office server itself can't be reached
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const pending = st?.pending || 0;
  const failed = st?.failed || 0;

  if (unreachable) {
    return (
      <span
        title="ភ្ជាប់ទៅ Server មិនបាន — សូមពិនិត្យ LAN / Wi-Fi"
        className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800 shrink-0"
      >
        <CloudOff className="w-3 h-3" /> Server
      </span>
    );
  }

  if (!st?.enabled || st.online) {
    const tip = st?.enabled
      ? `Online — Local copy sync ចុងក្រោយ ${timeOf(st.lastSyncAt)}${pending ? ` · រង់ចាំបញ្ជូន ${pending}` : ''}`
      : 'Online';
    return (
      <span className="inline-flex items-center gap-1 shrink-0" title={tip}>
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        {(pending > 0 || failed > 0) && (
          <span className="px-1.5 h-5 inline-flex items-center rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800">
            {failed > 0 ? `បរាជ័យ ${failed}` : `កំពុងបញ្ជូន ${pending}`}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      title={`គ្មាន Internet — កំពុងប្រើទិន្នន័យ Local (Sync ចុងក្រោយ ${timeOf(st.lastSyncAt)}). ការកែប្រែនឹងបញ្ជូនទៅ Hostinger ពេលមាន Internet វិញ`}
      className="inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800 shrink-0 whitespace-nowrap"
    >
      <Wifi className="w-3 h-3 opacity-60" />
      Offline · {timeOf(st.lastSyncAt)}
      {pending > 0 && <span className="px-1 rounded bg-amber-200/70 dark:bg-amber-800/60">រង់ចាំ {pending}</span>}
    </span>
  );
};
