import { authFetch } from './apiClient';

/**
 * Customer Details (Hostinger MySQL tbl_customers via /api/remote-mysql actions).
 */

export type CustomerType = 'INDIVIDUAL' | 'BUSINESS';
export type CustomerStatus = 'ACTIVE' | 'INACTIVE';

export interface Customer {
  id?: number;
  customer_code: string | null;
  name: string;
  company: string | null;
  customer_type: CustomerType;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  telegram: string | null;
  address: string | null;
  province: string | null;
  status: CustomerStatus;
  /** Linked user account (tbl_permissions.user_id) */
  sale_user_id: string | null;
  /** Sale's current account name; or typed / imported text when not linked to an account */
  sale_handle: string | null;
  /** Server: sale_user_id points to an existing account */
  sale_linked?: boolean;
  notes: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

const ENDPOINT = '/api/remote-mysql';

async function request<T>(method: 'GET' | 'POST', params: Record<string, any>): Promise<T> {
  let res: Response;
  if (method === 'GET') {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
    res = await authFetch(`${ENDPOINT}?${qs.toString()}`);
  } else {
    res = await authFetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  }
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // non-JSON error page
  }
  if (!res.ok || !json?.ok) {
    throw new Error(json?.message || `Request failed (HTTP ${res.status})`);
  }
  return json.data as T;
}

/** User account a customer's sale can be linked to */
export interface SaleUser {
  user_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

export const fetchCustomers = () => request<Customer[]>('GET', { action: 'get_customers' });

export const fetchSaleUsers = () => request<SaleUser[]>('GET', { action: 'get_sale_users' });

/** Creates (no id) or updates a customer; returns the refreshed list. */
export const saveCustomer = (customer: Customer) =>
  request<Customer[]>('POST', { action: 'save_customer', customer });

export interface CustomerImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  /** Rows whose Sale_Handle matched no user account (kept as text, not linked) */
  unlinkedSale: number;
  customers: Customer[];
}

/**
 * Bulk import, sent in batches to stay under the serverless body limit.
 * Rows with an existing code update that customer; rows without a code that match an
 * existing name + phone are skipped by the server.
 */
export async function importCustomers(
  rows: Customer[],
  onProgress?: (done: number, total: number) => void
): Promise<CustomerImportResult> {
  const BATCH = 1000;
  const total: CustomerImportResult = { inserted: 0, updated: 0, skipped: 0, unlinkedSale: 0, customers: [] };
  for (let i = 0; i < rows.length; i += BATCH) {
    const res = await request<CustomerImportResult>('POST', { action: 'import_customers', customers: rows.slice(i, i + BATCH) });
    total.inserted += res.inserted;
    total.updated += res.updated;
    total.skipped += res.skipped;
    total.unlinkedSale += res.unlinkedSale;
    total.customers = res.customers;
    onProgress?.(Math.min(i + BATCH, rows.length), rows.length);
  }
  return total;
}

export const deleteCustomer = (id: number) => request<Customer[]>('POST', { action: 'delete_customer', id });

/** Deletes many customers at once; returns how many were removed and the refreshed list. */
export const deleteCustomers = (ids: number[]) =>
  request<{ deleted: number; customers: Customer[] }>('POST', { action: 'delete_customers', ids });
