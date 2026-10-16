import bcrypt from 'bcryptjs';

// Pre-hashed passwords for deterministic testing
export const TEST_PASSWORDS = {
  rawAdmin: 'AdminPass123!',
  rawUser: 'UserPass456!',
  hashAdmin: bcrypt.hashSync('AdminPass123!', 10),
  hashUser: bcrypt.hashSync('UserPass456!', 10),
  legacyPlain: 'plain123'
};

export const MOCK_USERS = [
  {
    id: 'u-admin-1',
    email: 'admin@ialsystems.com',
    name: 'Test Administrator',
    role: 'ADMIN',
    status: 'ACTIVE',
    canCreate: true,
    canEdit: true,
    canDelete: true,
    password: TEST_PASSWORDS.hashAdmin,
    createdAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'u-user-2',
    email: 'user@ialsystems.com',
    name: 'Normal Operator',
    role: 'USER',
    status: 'ACTIVE',
    canCreate: true,
    canEdit: false,
    canDelete: false,
    password: TEST_PASSWORDS.hashUser,
    createdAt: '2026-01-02T00:00:00.000Z'
  },
  {
    id: 'u-legacy-3',
    email: 'legacy@ialsystems.com',
    name: 'Legacy Plain User',
    role: 'USER',
    status: 'ACTIVE',
    canCreate: false,
    canEdit: false,
    canDelete: false,
    password: TEST_PASSWORDS.legacyPlain, // will test auto-migration to bcrypt
    createdAt: '2026-01-03T00:00:00.000Z'
  },
  {
    id: 'u-suspended-4',
    email: 'suspended@ialsystems.com',
    name: 'Suspended Account',
    role: 'USER',
    status: 'SUSPENDED',
    canCreate: false,
    canEdit: false,
    canDelete: false,
    password: TEST_PASSWORDS.hashUser,
    createdAt: '2026-01-04T00:00:00.000Z'
  }
];

export const MOCK_BATCHES = [
  {
    batch_id: 'BATCH-2026-001',
    batch_date: '2026-03-01',
    operator: 'Rath Operator',
    total_items: 2,
    total_usd: '150.00',
    total_khr: '615000.00',
    bank_usd: '50.00',
    bank_khr: '0.00',
    cash_usd: '100.00',
    cash_khr: '615000.00',
    reconciliation: 'Balanced',
    notes: 'Morning shift collection',
    created_at: '2026-03-01 10:00:00'
  },
  {
    batch_id: 'BATCH-2026-002',
    batch_date: '2026-03-02',
    operator: 'Borey Operator',
    total_items: 1,
    total_usd: '80.00',
    total_khr: '0.00',
    bank_usd: '80.00',
    bank_khr: '0.00',
    cash_usd: '0.00',
    cash_khr: '0.00',
    reconciliation: 'Balanced',
    notes: 'Afternoon collection',
    created_at: '2026-03-02 15:30:00'
  }
];

export const MOCK_COLLECTION_ITEMS = [
  {
    id: 101,
    batch_id: 'BATCH-2026-001',
    tracking: 'IAL-TRK-9001',
    customer_name: 'Sok San Co',
    payment: 'CASH',
    usd: '100.00',
    khm: '0.00',
    item_date: '2026-03-01',
    created_at: '2026-03-01 10:05:00'
  },
  {
    id: 102,
    batch_id: 'BATCH-2026-001',
    tracking: 'IAL-TRK-9002',
    customer_name: 'Dara Express',
    payment: 'BANK',
    usd: '50.00',
    khm: '615000.00',
    item_date: '2026-03-01',
    created_at: '2026-03-01 10:10:00'
  },
  {
    id: 103,
    batch_id: 'BATCH-2026-002',
    tracking: 'IAL-TRK-9003',
    customer_name: 'Phnom Penh Mart',
    payment: 'BANK',
    usd: '80.00',
    khm: '0.00',
    item_date: '2026-03-02',
    created_at: '2026-03-02 15:35:00'
  }
];

export const MOCK_PAYERS = [
  {
    id: 'payer-1',
    name: 'Sokha Delivery Team',
    phone: '012345678',
    category: 'Rider',
    area: 'Toul Kork',
    status: 'ACTIVE',
    notes: 'Zone A',
    created_at: '2026-01-10',
    updated_at: '2026-02-15'
  }
];

export const MOCK_SHIPMENTS = [
  {
    id: 10001,
    tracking_number: 'TRK-202603-01',
    sign_by: 'Chea Vichea',
    delivery_on: '01-03-2026 14:20:00',
    issue_by: 'Phnom Penh Branch',
    status: 'Delivered',
    destination: 'Phnom Penh',
    shipper: 'IAL Systems',
    cnee: 'Acleda Bank'
  },
  {
    id: 10002,
    tracking_number: 'TRK-202603-02',
    sign_by: 'Maly Meas',
    delivery_on: '02-03-2026 09:15:00',
    issue_by: 'Siem Reap Branch',
    status: 'Delivered',
    destination: 'Siem Reap',
    shipper: 'IAL Systems',
    cnee: 'Angkor Mart'
  }
];
