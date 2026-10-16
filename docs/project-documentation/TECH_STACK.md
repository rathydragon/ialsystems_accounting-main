# Technical Stack & Infrastructure: IAL SYSTEMS

All specifications below are cataloged with direct source file citations and verified against workspace manifests and dependencies.

---

## 1. Programming Languages & Runtimes

| Technology | Classification | Evidence File Path | Purpose |
| :--- | :--- | :--- | :--- |
| **TypeScript (~5.8.2)** | `Confirmed` | [package.json](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/package.json#L44), [tsconfig.json](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/tsconfig.json) | Strong typing across models, API clients, and React components |
| **JavaScript (ES Modules)** | `Confirmed` | [package.json](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/package.json#L5), [api/remote-mysql.js](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/api/remote-mysql.js#L1-L15) | Node.js backend handlers, CLI migration scripts, and tools |
| **Google Apps Script (V8)** | `Confirmed` | [Code.gs](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/Code.gs#L1-L60) | Serverless cloud backend running inside Google Workspace environment |
| **SQL (MySQL & PostgreSQL)** | `Confirmed` | [scripts/hostinger_mysql_schema.sql](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/scripts/hostinger_mysql_schema.sql), [scripts/init_schema.sql](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/scripts/init_schema.sql) | DDL schemas, indexes, and queries for multi-tier persistence |
| **HTML5 & CSS3** | `Confirmed` | [index.html](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/index.html), [src/index.css](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/index.css) | Semantic layouts, PWA metadata, custom scrollbars, and Khmer typography |

---

## 2. Frontend Framework & Architecture

- **Core Library:** React 19 (`^19.0.1`) & ReactDOM (`^19.0.1`) (`Confirmed` - [package.json](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/package.json#L32-L33)).
- **Architecture:** Client-side SPA with React Hooks, Error Boundaries, and `React.lazy` code-splitting with automated stale-chunk reload fallback (`Confirmed` - [src/App.tsx](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/App.tsx#L68-L116)).
- **PWA Capabilities:** Service worker registration hooks, home-screen installation prompt (`src/components/PWAInstallPrompt.tsx`), and responsive mobile layout (`src/components/MobileBottomNav.tsx`).

---

## 3. UI, Styling & Animation

- **CSS Framework:** Tailwind CSS v4 (`@tailwindcss/vite` ^4.1.14, `tailwindcss` ^4.1.14) (`Confirmed` - [package.json](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/package.json#L23,L42), [vite.config.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/vite.config.ts#L1)).
- **Motion & Animations:** `motion` (`^12.23.24`) for fluid micro-interactions, modal transitions, and slide-in panels (`Confirmed` - [package.json](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/package.json#L29)).
- **Iconography:** `lucide-react` (`^0.546.0`) for standard and crisp iconography across all pages (`Confirmed` - [package.json](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/package.json#L28)).
- **Typography & Localization:** Dual-language UI supporting English and Khmer with Kantumruy Pro / Battambang font integration (`Confirmed` - [index.html](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/index.html), [src/index.css](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/index.css)).

---

## 4. Build Tools & Dev Server

- **Bundler & Dev Server:** Vite 6 (`^6.2.3`) (`Confirmed` - [package.json](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/package.json#L34), [vite.config.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/vite.config.ts#L5)).
- **Transpilation:** `esbuild` (`^0.25.0`) & `tsx` (`^4.21.0`) (`Confirmed` - [package.json](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/package.json#L41,L43)).
- **Optimization & Code Splitting:**
  - Configured manual Rollup chunks in [vite.config.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/vite.config.ts#L297-L305):
    - `vendor`: `['react', 'react-dom']`
    - `icons`: `['lucide-react']`
    - `scanner`: `['html5-qrcode']`
  - High chunk warning limit: 1600 KB.
- **SSL Support:** `@vitejs/plugin-basic-ssl` (`^2.3.0`) for local HTTPS testing (enabling mobile camera permissions over LAN).

---

## 5. Backend, Server Middleware & API Handlers

- **Development Middleware:** Vite's internal Connect middleware engine extended via custom `postgresBackupPlugin` (`Confirmed` - [vite.config.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/vite.config.ts#L7-L263)).
- **Production Server:** Express 4 (`^4.21.2`) (`Confirmed` - [package.json](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/package.json#L26)).
- **Vercel Serverless Hosting:** Configured routing and rewrites in [vercel.json](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/vercel.json) directing `/api/(.*)` to serverless server functions.

---

## 6. Database Systems & Connectors

### A. Remote MySQL / MariaDB (Primary Master Database)
- **Engine:** MySQL 8 / MariaDB on Hostinger Cloud (`Confirmed` - [api/remote-mysql.js](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/api/remote-mysql.js#L21-L51)).
- **Driver:** `mysql2/promise` (`^3.24.6`) with connection pooling, keep-alive, and Asia/Phnom_Penh (`+07:00`) timezone.
- **Tables (15 tables):** `tbl_batches`, `tbl_collection_items`, `tbl_medicine_batches`, `tbl_medicine_items`, `tbl_cod_collections`, `tbl_list_name`, `tbl_distribution_reports`, `tbl_bank_slips`, `tbl_permissions`, `tbl_user_logs`, `tbl_scan_in`, `tbl_scan_out`, `tbl_out_of_delivery`, `tbl_hold_remaining`, `tbl_settings`, `tbl_data` (`Confirmed` - [scripts/hostinger_mysql_schema.sql](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/scripts/hostinger_mysql_schema.sql)).

### B. Local PostgreSQL (Automated Redundancy & Historical Backup)
- **Engine:** PostgreSQL 14+ (`Confirmed` - [package.json](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/package.json#L31), [scripts/init_schema.sql](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/scripts/init_schema.sql)).
- **Driver:** `pg` (`^8.23.1`) Pool.
- **Automation:** Built-in scheduler inside Vite dev server checking every 45s for interval or daily time triggers (`Confirmed` - [vite.config.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/vite.config.ts#L13-L65)).

### C. Google Sheets & Google Drive (Document Storage & Legacy Sync)
- **Platform:** Google Apps Script (`Code.gs`).
- **Integration:** Web App endpoint handling JSON over HTTP POST, appending rows into sheets, and uploading base64 receipts to Google Drive folders.

---

## 7. Authentication, Security & Hardware

- **Google OAuth 2.0:** Integrated Google Identity Services client script for single-sign-on verification (`Confirmed` - [src/components/LoginView.tsx](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/components/LoginView.tsx)).
- **Direct PIN Authentication:** Fallback administrative PIN login (`Confirmed` - [src/components/LoginView.tsx](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/components/LoginView.tsx#L50-L75)).
- **Email & Local Password:** Dedicated credentials for intranet Wi-Fi kiosk stations without internet access (`Confirmed` - [src/types.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/types.ts#L85)).
- **Camera Barcode Scanning:** `html5-qrcode` (`^2.3.8`) for scanning 1D/2D barcodes directly via device camera (`Confirmed` - [package.json](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/package.json#L27), [src/components/BarcodeScannerModal.tsx](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/components/BarcodeScannerModal.tsx)).
- **Audio Feedback Engine:** Web Audio API generating procedural audio beeps (Low/High pitch frequency synthesis) for rapid barcode entry validation (`Confirmed` - [src/utils/scannerSound.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/utils/scannerSound.ts#L1-L150)).

---

## 8. Third-Party Integrations & External APIs

- **Google Gemini AI SDK:** `@google/genai` (`^2.4.0`) used in `src/services/geminiOcrService.ts` for extracting payment amounts, banks, and transaction references from receipt photographs (`Confirmed` - [package.json](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/package.json#L22)).
- **Telegram Bot API:** Direct HTTPS REST integration supporting 4 independent bots:
  1. Main Batch Notifications Bot (`Confirmed` - [src/services/telegramService.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/services/telegramService.ts#L10-L40)).
  2. Payment Alert Bot.
  3. Activity & Audit Logs Bot.
  4. Bank Slip & Receipt Alert Bot.
- **Google Sheets GVIZ API:** In-memory tabular data fetching via Google Visualization API (`https://docs.google.com/spreadsheets/d/{ID}/gviz/tq?tqx=out:json`) (`Confirmed` - [src/utils/googleSheetFetcher.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/utils/googleSheetFetcher.ts#L1-L120)).

---

## 9. Testing & Quality Assurance

| Tool | Status | Findings |
| :--- | :--- | :--- |
| **Type Checking** | `Confirmed` | `npm run lint` executes `tsc --noEmit` ([package.json](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/package.json#L14)) |
| **Database Connection Test** | `Confirmed` | `npm run test:remote-db` executes [scripts/test-remote-mysql.js](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/scripts/test-remote-mysql.js) |
| **Master Data Healthcheck** | `Confirmed` | `npm run sync:master` queries all master tables ([package.json](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/package.json#L17)) |
| **Automated Unit Tests** | `Inferred` | Jest / Vitest / Playwright configurations are absent; testing is driven by linting and CLI healthcheck scripts |
