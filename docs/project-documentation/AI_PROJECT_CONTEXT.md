# AI Assistant Project Context & Engineering Handoff: IAL SYSTEMS

> **Purpose of this Document:** High-signal, self-contained architectural brief designed specifically for incoming AI coding assistants (Gemini, Claude, GPT, Antigravity) working on the IAL SYSTEMS accounting and logistics codebase.

---

## 1. Fast Architecture Mental Model

- **Domain:** Cambodian express delivery parcel logistics, multi-currency accounting (USD & KHR), warehouse parcel scanning, and bank slip archival.
- **Frontend:** React 19 Single Page Application (SPA) styled with Tailwind CSS v4, dynamic view routing in [src/App.tsx](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/App.tsx), and Web Audio synthesizers for barcode scanners.
- **Backend APIs:** Embedded Node.js / Vite middleware in [vite.config.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/vite.config.ts) and [api/](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/api/) providing connection pooling to MySQL, proxying Google Sheets, and scheduling backups.
- **Primary Master Database:** Remote MySQL 8 / MariaDB on Hostinger Cloud (`srv1366.hstgr.io`, DB `u112951411_iale_api`) with 15 normalized tables running in Asia/Phnom_Penh timezone (`+07:00`).
- **Secondary Cloud Ledger:** Google Apps Script (`Code.gs`) writing to Google Sheets and uploading receipts to Google Drive.
- **Disaster Recovery:** Local PostgreSQL with an automated interval / daily background cron.

---

## 2. Core Engineering Conventions

1. **Dual-Currency Calculation Rule:**
   - Always track both `USD` and `KHR` values independently.
   - Standard exchange rate is stored in `settings.exchangeRate` (default: ~4,100 KHR/USD).
   - Never combine USD and KHR directly without explicit conversion.
2. **Cambodia Timezone Standard (`+07:00`):**
   - Database sessions must always execute with `SET time_zone = '+07:00'`.
   - Date formats are typically `YYYY-MM-DD` or `DD-MM-YYYY` with Cambodian locale support (`km-KH`).
3. **Strict Parameterized Queries:**
   - Never concatenate user strings into SQL queries. Always use placeholder arrays `[param1, param2]` with `pool.query()` or `connection.query()`.
4. **Client-Side Image Optimization:**
   - Always downsample camera receipts using [src/utils/compression.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/utils/compression.ts) to WebP format before streaming base64 to Google Drive or storing in databases.
5. **Khmer Localization First:**
   - User-facing status messages, toasts, table empty states, and Telegram bot alerts should provide primary descriptions in Khmer accompanied by standard English technical tags.

---

## 3. Key Files Reference by Development Task

### If you need to:
- **Add a new navigation view/page:**
  1. Add view key to `NavView` union in [src/types.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/types.ts).
  2. Register metadata & icon in `CONFIGURABLE_NAV_PAGES_META` in [src/services/userPermissionService.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/services/userPermissionService.ts).
  3. Add sidebar navigation link in [src/components/Sidebar.tsx](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/components/Sidebar.tsx).
  4. Render the page component lazily inside `currentView === '...'` in [src/App.tsx](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/App.tsx).

- **Add a new relational database entity:**
  1. Define DDL statement in [scripts/hostinger_mysql_schema.sql](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/scripts/hostinger_mysql_schema.sql).
  2. Implement CRUD handlers in [api/mysql-master-handlers.js](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/api/mysql-master-handlers.js).
  3. Dispatch actions via [src/services/mysqlMasterService.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/services/mysqlMasterService.ts).
  4. Declare TypeScript interface in [src/types.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/types.ts).

- **Modify Batch Collection or Reconciliation:**
  - Inspect [src/components/PaymentCollectionPage.tsx](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/components/PaymentCollectionPage.tsx) and [src/services/batchService.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/services/batchService.ts).

- **Adjust Warehouse Scanning Logic:**
  - Inspect [src/components/WarehouseManagementPage.tsx](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/components/WarehouseManagementPage.tsx), [src/services/warehouseScanService.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/services/warehouseScanService.ts), and [src/utils/scannerSound.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/utils/scannerSound.ts).

- **Update Telegram Alerts:**
  - Inspect [src/services/telegramService.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/services/telegramService.ts). The app supports 4 distinct bot tokens.

- **Configure PostgreSQL Auto-Backup:**
  - Inspect [vite.config.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/vite.config.ts#L7-L65), [scripts/backup-schedule.json](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/scripts/backup-schedule.json), and [scripts/backup-to-postgres.js](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/scripts/backup-to-postgres.js).

---

## 4. Security Guardrails Reminder for AI Assistants

- **Strict File Ban:** Under no circumstances should you inspect or output `.env`, `*.pem`, `*.key`, or credential files.
- **Safe ENV Discovery:** Rely solely on `.env.example` or code references (`process.env`, `import.meta.env`).
- **Redaction:** Always output sensitive connection strings and tokens as `<REDACTED>`.
- **Read-Only Analysis:** Do not execute database drop commands or overwrite existing application files without explicit user requests.

---

## 5. Known Unknowns & System Limitations

| Area | Current State / Known Unknown | Workaround / Architecture Solution |
| :--- | :--- | :--- |
| **Production Credentials** | Actual production database passwords and Telegram bot tokens reside exclusively in local private `.env` | Inspect [.env.example](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/.env.example) for exact variable names |
| **Offline Internet Loss** | If internet drops, Remote MySQL is unreachable | Cached state in `localStorage` allows offline batch creation; syncs upon reconnection |
| **Google Apps Script Execution Limit** | Apps Script has a 6-minute maximum execution quota on Google Workspace | Incremental syncing and batch chunking are implemented in `api/remote-mysql.js` (`getPodSyncBatch`) |
| **Camera Access in Intranet** | Browsers restrict camera permissions on plain HTTP over LAN | Use `@vitejs/plugin-basic-ssl` to run Vite on HTTPS when testing on mobile devices |
