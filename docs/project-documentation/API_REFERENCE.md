# API Specification & Endpoint Reference: IAL SYSTEMS

All endpoints below are serviced by the Vite/Node.js middleware layer ([vite.config.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/vite.config.ts#L7-L263), [api/](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/api/)) or the Google Apps Script Web App ([Code.gs](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/Code.gs)). All payloads are strictly synthetic/mock representations.

---

## 1. Master Remote MySQL API (`/api/master-db` & `/api/remote-mysql`)

- **Base URLs:** `/api/master-db`, `/api/remote-mysql` (`Confirmed` - [vite.config.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/vite.config.ts#L254-L255))
- **Content-Type:** `application/json`
- **Authentication:** Session role validation on client side; database authentication managed via server-side pool credentials.

### Endpoint: Health & DB Test
- **Method:** `GET /api/master-db?action=test` (or `POST` with `{"action": "TEST_CONNECTION"}`)
- **Description:** Verifies active connectivity to Remote Hostinger MySQL, checks timezone, version, and table counts.
- **Synthetic Response Payload (200 OK):**
```json
{
  "ok": true,
  "durationMs": 42,
  "details": {
    "result": 2,
    "current_db": "u112951411_iale_api",
    "mysql_version": "8.0.35",
    "time_zone": "+07:00",
    "db_time": "2026-10-16 08:30:00"
  },
  "tables": [
    "tbl_batches",
    "tbl_collection_items",
    "tbl_medicine_batches",
    "tbl_medicine_items",
    "tbl_cod_collections",
    "tbl_list_name",
    "tbl_distribution_reports",
    "tbl_bank_slips",
    "tbl_permissions",
    "tbl_user_logs",
    "tbl_scan_in",
    "tbl_scan_out",
    "tbl_out_of_delivery",
    "tbl_hold_remaining",
    "tbl_settings",
    "tbl_data"
  ],
  "message": "✓ ភ្ជាប់ទៅកាន់ Remote MySQL Database ជោគជ័យ!"
}
```

---

### Endpoint: Fast Master Data Retrieval (`GET_ALL_MASTER_DATA`)
- **Method:** `POST /api/master-db`
- **Synthetic Request Payload:**
```json
{
  "action": "GET_ALL_MASTER_DATA"
}
```
- **Synthetic Response Payload (200 OK):**
```json
{
  "ok": true,
  "data": {
    "batches": [
      {
        "id": "B-20261016-001",
        "batchNumber": "B-20261016-001",
        "date": "2026-10-16",
        "operator": "Accountant User",
        "totalItems": 15,
        "totalUSD": 120.50,
        "totalKHR": 500000.00,
        "bankUSD": 100.00,
        "bankKHR": 500000.00,
        "cashUSD": 20.50,
        "cashKHR": 0.00,
        "reconciliation": "BALANCED",
        "notes": "Morning rider collection batch",
        "createdAt": "2026-10-16T08:15:00.000Z",
        "items": [
          {
            "id": "1",
            "tracking": "TRK987654321",
            "name": "Sokha Mean",
            "paymentMethod": "ABA Pay",
            "usd": 25.00,
            "khm": 0.00,
            "date": "2026-10-16",
            "createdAt": "2026-10-16T08:10:00.000Z"
          }
        ]
      }
    ],
    "medicineBatches": [],
    "payers": [
      {
        "id": "PAY-01",
        "name": "Chanthy Delivery Rider",
        "phone": "012345678",
        "category": "RIDER",
        "area": "Phnom Penh Central",
        "status": "ACTIVE"
      }
    ],
    "permissions": [],
    "bankSlips": [],
    "warehouseScans": [],
    "distributionReports": [],
    "settings": {}
  }
}
```

---

### Endpoint: Save Collection Batch (`SAVE_BATCH`)
- **Method:** `POST /api/master-db`
- **Synthetic Request Payload:**
```json
{
  "action": "SAVE_BATCH",
  "isMedicine": false,
  "batch": {
    "id": "B-20261016-002",
    "batchNumber": "B-20261016-002",
    "date": "2026-10-16",
    "operator": "Accountant User",
    "operatorEmail": "accountant@ialsystems.com",
    "totalItems": 1,
    "totalUSD": 50.00,
    "totalKHR": 0.00,
    "bankUSD": 50.00,
    "bankKHR": 0.00,
    "cashUSD": 0.00,
    "cashKHR": 0.00,
    "reconciliation": "BALANCED",
    "notes": "Sample test batch",
    "items": [
      {
        "id": "item-01",
        "tracking": "TRK11223344",
        "name": "Kosal Chea",
        "paymentMethod": "CASH",
        "usd": 50.00,
        "khm": 0.00,
        "date": "2026-10-16"
      }
    ]
  }
}
```
- **Synthetic Response Payload (200 OK):**
```json
{
  "ok": true,
  "batchNumber": "B-20261016-002",
  "totalItems": 1,
  "message": "✓ បានរក្សាទុក Batch ចូល Master MySQL រួចរាល់!"
}
```

---

### Endpoint: Save Warehouse Scan Event (`SAVE_WAREHOUSE_SCAN`)
- **Method:** `POST /api/master-db`
- **Supported Modes:** `SCAN_IN`, `SCAN_OUT`, `OUT_OF_DELIVERY`, `HOLD_REMAINING`
- **Synthetic Request Payload:**
```json
{
  "action": "SAVE_WAREHOUSE_SCAN",
  "item": {
    "id": "SCAN-8899",
    "scanType": "SCAN_IN",
    "barcode": "AWB-KH-998877",
    "tracking": "AWB-KH-998877",
    "destination": "Battambang",
    "driverName": "Dara Driver",
    "truckNo": "3A-9988",
    "operatorEmail": "hub_operator@ialsystems.com",
    "createdBy": "Hub Operator",
    "date": "2026-10-16",
    "createdAt": "2026-10-16T08:25:00.000Z"
  }
}
```
- **Synthetic Response Payload (200 OK):**
```json
{
  "ok": true,
  "savedCount": 1,
  "message": "✓ បានរក្សាទុក Scan ចូល MySQL រួចរាល់!"
}
```

---

### Endpoint: IALE Remote Shipment Search (`GET_SHIPMENTS`)
- **Method:** `POST /api/master-db`
- **Description:** Queries indexed live shipment tracking table `shipment_detail` with B-Tree seek optimization.
- **Synthetic Request Payload:**
```json
{
  "action": "GET_SHIPMENTS",
  "search": "TRK987654321",
  "status": "Delivered",
  "page": 1,
  "limit": 25
}
```
- **Synthetic Response Payload (200 OK):**
```json
{
  "ok": true,
  "total": 1,
  "page": 1,
  "limit": 25,
  "totalPages": 1,
  "records": [
    {
      "id": 145020,
      "tracking_number": "TRK987654321",
      "sign_by": "Receiver Signature",
      "delivery_on": "16-10-2026 08:00:00",
      "issue_by": "Phnom Penh Hub",
      "delivery_by": "Rider Bunroeun",
      "status": "Delivered",
      "cod": 15.00,
      "remark": "Delivered in good condition"
    }
  ]
}
```

---

## 2. Automated PostgreSQL Backup API (`/api/backup-*`)

### Endpoint: Get / Set Backup Schedule (`/api/backup-schedule`)
- **GET:** Returns active schedule configuration from `scripts/backup-schedule.json`.
- **POST:** Updates schedule settings.
- **Synthetic Request Payload (POST):**
```json
{
  "enabled": true,
  "mode": "DAILY_TIME",
  "time": "18:00",
  "intervalHours": 1,
  "intervalMinutes": 0
}
```
- **Synthetic Response Payload (200 OK):**
```json
{
  "ok": true,
  "schedule": {
    "enabled": true,
    "mode": "DAILY_TIME",
    "time": "18:00",
    "intervalHours": 1,
    "intervalMinutes": 0,
    "updatedAt": "2026-10-16T08:28:00.000Z"
  },
  "message": "បានរក្សាទុកកាលវិភាគ Backup ស្វ័យប្រវត្តជោគជ័យ!"
}
```

---

### Endpoint: Trigger Immediate PostgreSQL Backup (`/api/backup-postgres`)
- **Method:** `POST /api/backup-postgres`
- **Description:** Executes on-demand database ETL extraction from MySQL to Local PostgreSQL.
- **Synthetic Response Payload (200 OK):**
```json
{
  "ok": true,
  "timestamp": "2026-10-16T08:29:15.000Z",
  "recordsBackedUp": {
    "batches": 240,
    "collectionItems": 1820,
    "scans": 9500,
    "bankSlips": 340
  },
  "durationMs": 1420,
  "message": "✓ ការ Backup ចូល Local PostgreSQL ទទួលបានជោគជ័យ!"
}
```

---

## 3. Google Apps Script Web App Endpoint (`VITE_GOOGLE_WEBAPP_URL`)

- **Transport:** HTTP POST with `Content-Type: text/plain;charset=utf-8` (bypasses browser pre-flight CORS).
- **Core Actions Handled in `Code.gs`:**
  - `commitBatch`: Appends batch row in "Batches" and rows in "Collection_Items".
  - `saveBankSlip`: Writes slip entry and uploads base64 receipt to Google Drive.
  - `savePayer`: Upserts rider/payer into "List_Name".
  - `syncPermissions`: Reconciles user permission records.
  - `telegramDailySummary`: Aggregates day's financials and posts to Telegram.

---

## 4. Error Handling & Validation Standards

| Error Scenario | HTTP Code | Response Structure | System Reaction |
| :--- | :---: | :--- | :--- |
| **MySQL Connection Timeout** | `500` | `{"ok": false, "message": "ETIMEDOUT / connection error"}` | Pool resets; frontend falls back to localStorage cache |
| **Invalid Action Name** | `400` | `{"ok": false, "message": "Unknown action specified"}` | Request rejected |
| **Google Apps Script Timeout** | N/A | Logged in background | Background sync suppresses error without crashing UI |
| **Forbidden Page Access** | `403` | Client redirect | `App.tsx` prevents route mount and notifies user via Toast |
| **Uncaught React Render Error** | N/A | Captured by `<ErrorBoundary>` | Renders recovery button and error details without white-screening |
