import { CollectionBatch } from '../types';

export const AUTO_PRINT_RECEIPT_KEY = 'accounting_auto_print_receipt_v1';

export function getAutoPrintReceipt(): boolean {
  try {
    return localStorage.getItem(AUTO_PRINT_RECEIPT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAutoPrintReceipt(on: boolean) {
  try {
    localStorage.setItem(AUTO_PRINT_RECEIPT_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const usd = (n?: number) => `$${(Number(n) || 0).toFixed(2)}`;
const khr = (n?: number) => `${Math.round(Number(n) || 0).toLocaleString()}៛`;

type ReceiptBatch = Pick<CollectionBatch, 'batchNumber' | 'totalItems' | 'totalUSD' | 'totalKHR' | 'items' | 'operator'> &
  Partial<CollectionBatch>;

/** Prints an 80mm thermal-style receipt for a saved collection batch via a hidden iframe. */
export function printCollectionReceipt(batch: ReceiptBatch, title = 'វិក្កយបត្រទទួលប្រាក់') {
  const created = batch.createdAt ? new Date(batch.createdAt) : new Date();
  const when = isNaN(created.getTime()) ? String(batch.createdAt) : created.toLocaleString('en-GB');
  const payer = Array.from(new Set((batch.items || []).map(i => (i.name || '').trim()).filter(Boolean))).join(', ');

  const rows = (batch.items || [])
    .map(
      (it, i) => `<tr>
        <td>${i + 1}</td>
        <td class="trk">${esc(it.tracking)}</td>
        <td class="r">${[Number(it.usd) ? usd(it.usd) : '', Number(it.khm) ? khr(it.khm) : ''].filter(Boolean).join(' / ')}</td>
      </tr>`
    )
    .join('');

  const paid: string[] = [];
  if (batch.bankUSD || batch.bankKHR) paid.push(`<div class="kv"><span>Bank</span><b>${[batch.bankUSD ? usd(batch.bankUSD) : '', batch.bankKHR ? khr(batch.bankKHR) : ''].filter(Boolean).join(' / ')}</b></div>`);
  if (batch.cashUSD || batch.cashKHR) paid.push(`<div class="kv"><span>Cash</span><b>${[batch.cashUSD ? usd(batch.cashUSD) : '', batch.cashKHR ? khr(batch.cashKHR) : ''].filter(Boolean).join(' / ')}</b></div>`);

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(batch.batchNumber)}</title>
  <style>
    @page{size:80mm auto;margin:3mm;}
    *{box-sizing:border-box;}
    body{margin:0;font-family:'Kantumruy Pro','Battambang','Khmer OS',Arial,sans-serif;font-size:11px;color:#000;width:74mm;}
    h1{font-size:14px;text-align:center;margin:0 0 2px;}
    .c{text-align:center;}
    .muted{font-size:10px;}
    hr{border:0;border-top:1px dashed #000;margin:5px 0;}
    .kv{display:flex;justify-content:space-between;gap:6px;margin:1px 0;}
    table{width:100%;border-collapse:collapse;}
    th,td{padding:2px 1px;vertical-align:top;text-align:left;}
    th{border-bottom:1px solid #000;font-size:10px;}
    .r{text-align:right;white-space:nowrap;}
    .trk{font-family:monospace;word-break:break-all;}
    .tot{font-size:13px;font-weight:bold;}
  </style></head><body>
    <h1>${esc(title)}</h1>
    <div class="c muted">Payment Collection Receipt</div>
    <hr>
    <div class="kv"><span>លេខកញ្ចប់</span><b>${esc(batch.batchNumber)}</b></div>
    <div class="kv"><span>កាលបរិច្ឆេទ</span><span>${esc(when)}</span></div>
    ${payer ? `<div class="kv"><span>អ្នកប្រគល់ប្រាក់</span><b>${esc(payer)}</b></div>` : ''}
    <div class="kv"><span>អ្នកកត់ត្រា</span><span>${esc(batch.operator)}</span></div>
    <hr>
    <table><thead><tr><th>#</th><th>Tracking</th><th class="r">ទឹកប្រាក់</th></tr></thead><tbody>${rows}</tbody></table>
    <hr>
    <div class="kv"><span>ចំនួនកញ្ចប់</span><b>${batch.totalItems}</b></div>
    <div class="kv tot"><span>សរុប USD</span><span>${usd(batch.totalUSD)}</span></div>
    <div class="kv tot"><span>សរុប KHR</span><span>${khr(batch.totalKHR)}</span></div>
    ${paid.length ? `<hr>${paid.join('')}` : ''}
    ${batch.reconciliation ? `<div class="kv"><span>ផ្ទៀងផ្ទាត់</span><span>${esc(batch.reconciliation)}</span></div>` : ''}
    ${batch.notes ? `<hr><div class="muted">ចំណាំ៖ ${esc(batch.notes)}</div>` : ''}
    <hr>
    <div class="c muted">សូមអរគុណ!</div>
  </body></html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } finally {
      setTimeout(() => iframe.remove(), 60_000);
    }
  }, 250);
}
