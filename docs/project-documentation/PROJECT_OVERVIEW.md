# Project Overview: IAL SYSTEMS Accounting & Logistics Platform

## 1. Executive Summary & Purpose
- **System Name:** IAL SYSTEMS Accounting & Logistics Platform (`Confirmed` - [metadata.json](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/metadata.json#L2), [package.json](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/package.json#L2))
- **Application Type:** Progressive Web Application (PWA) / Single Page Application (SPA) with embedded Node.js/Vite server API middleware (`Confirmed` - [vite.config.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/vite.config.ts#L7-L263), [index.html](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/index.html))
- **Primary Purpose:** Comprehensive accounting, parcel collection, distribution tracking, and warehouse operations management platform tailored for express logistics and delivery services in Cambodia (`Confirmed` - [metadata.json](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/metadata.json#L3), [src/types.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/types.ts#L1-L380)).

---

## 2. Core Problems Solved
1. **Multi-Currency Cash & COD Reconciliation:**
   - Seamlessly reconciles payments in both USD and KHR with configurable exchange rates, distinguishing between physical cash, bank transfers (ABA, Wing, ACLEDA), and COD parcels (`Confirmed` - [src/types.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/types.ts#L1-L35), [src/components/PaymentCollectionPage.tsx](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/components/PaymentCollectionPage.tsx)).
2. **High-Resolution Receipt & Bandwidth Optimization:**
   - Overcomes mobile upload bandwidth bottlenecks via client-side canvas-based WebP compression before uploading proof-of-payment receipts to Google Drive (`Confirmed` - [src/utils/compression.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/utils/compression.ts#L1-L85)).
3. **Multi-Tier Backend & Cloud Fallback Architecture:**
   - Implements a resilient 3-layer persistence model:
     - **Primary Master DB:** Remote MySQL on Hostinger (`Confirmed` - [api/remote-mysql.js](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/api/remote-mysql.js#L19-L51), [api/mysql-master-handlers.js](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/api/mysql-master-handlers.js#L1-L1073)).
     - **Spreadsheet Sync:** Google Apps Script Web App syncing to Google Sheets tabs (`Confirmed` - [Code.gs](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/Code.gs#L1-L60)).
     - **Automated Local Backup:** PostgreSQL database with automated scheduled cron/interval runner (`Confirmed` - [vite.config.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/vite.config.ts#L7-L65), [scripts/backup-to-postgres.js](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/scripts/backup-to-postgres.js)).
4. **Real-Time Operational Alerting:**
   - Integrates multi-channel Telegram Bots to broadcast instant batch collection manifests, bank slip verifications, activity logs, and daily financial summaries (`Confirmed` - [src/services/telegramService.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/services/telegramService.ts)).
5. **Granular Access Control (RBAC):**
   - Restricts sensitive accounting records, master configurations, and individual page routes based on user role and data scope (`Confirmed` - [src/types.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/types.ts#L45-L111), [src/services/userPermissionService.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/services/userPermissionService.ts)).

---

## 3. User Roles & Access Hierarchy
Defined in [src/types.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/types.ts#L45-L80) and enforced in [src/services/userPermissionService.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/services/userPermissionService.ts):

| Role Identifier | Khmer Description | Typical Access Scope | Implementation Status |
| :--- | :--- | :--- | :--- |
| `ADMIN` | អ្នកគ្រប់គ្រងប្រព័ន្ធជាន់ខ្ពស់ | Full system access, permissions management, settings, DB backups | `Confirmed` |
| `ACCOUNTANT_MANAGER` | ប្រធានគ្រប់គ្រងគណនេយ្យ | Full financial batch auditing, slip verification, summary reports | `Confirmed` |
| `ACCOUNTANT` | គណនេយ្យករ | Create & edit payment batches, review slips, export data | `Confirmed` |
| `CS_TEAMS` / `CS_TEAMS_OPT` | ក្រុមការងារបម្រើអតិថិជន | Tracking inquiry, delivery followups, customer lookups | `Confirmed` |
| `DELIVERY` / `DELIVERY_OPT` | ក្រុមអ្នកដឹកជញ្ជូន | Distribution report entry, Out-of-Delivery status | `Confirmed` |
| `HUB` / `HUB_OPT` | បុគ្គលិកឃ្លាំង / សាខា | Warehouse barcode scan-in, scan-out, hold remaining | `Confirmed` |
| `VIEWER` | អ្នកចូលមើលទូទៅ | Read-only view on permitted pages | `Confirmed` |

*Note on Data Scoping:* The system supports `viewOnlyOwn` (`OWN_ONLY` vs `ALL`) which filters visible batches and scans strictly to the logged-in operator (`Confirmed` - [src/types.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/types.ts#L88), [src/components/PaymentCollectionPage.tsx](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/components/PaymentCollectionPage.tsx)).

---

## 4. System Modules & Functional Capabilities

### A. Financial & Payment Collection (`Confirmed`)
- **General Batches (`tbl_batches`, `tbl_collection_items`):** Cashier entry of customer tracking numbers, multi-currency inputs, payment methods (`Cash`, `ABA Pay`, `Wing Bank`, `ACLEDA Mobile`, `Bank Transfer`).
- **Medicine Batches (`tbl_medicine_batches`, `tbl_medicine_items`):** Dedicated accounting channel for medical supply shipments (Buymed).
- **COD Batches (`tbl_cod_collections`):** Dedicated collection workflow for cash-on-delivery parcels.
- **Reconciliation Engine:** Real-time diff calculation (`diffUSD`, `diffKHR`) classifying statuses into `BALANCED`, `SHORTAGE`, or `SURPLUS`.

### B. Warehouse Operations (`Confirmed`)
- **High-Speed Barcode Scanning:** Integrated hardware scanner sound support (`src/utils/scannerSound.ts`) and camera scanner via `html5-qrcode` (`src/components/BarcodeScannerModal.tsx`).
- **4 Operational Modes:**
  1. `SCAN_IN`: Parcel receipt into warehouse hub with shelf/rack location tagging.
  2. `SCAN_OUT`: Inter-hub transfers or warehouse release.
  3. `OUT_OF_DELIVERY`: Hand-off to riders with COD amount verification.
  4. `HOLD_REMAINING`: Logging retained parcels with explicit hold reason codes.

### C. Bank Slips & AI Verification (`Confirmed`)
- **Digital Slip Archival:** Captures AWBN, bank name, beneficiary name, and payment amount.
- **Client-Side WebP Compression:** Reduces raw camera photos to lightweight thumbnails and optimized blobs.
- **Google Drive Storage:** Directly uploads receipts to designated Drive folders via Apps Script.
- **Gemini AI OCR:** Automated extraction and verification of transaction slip details using Google Gemini Vision API (`src/services/geminiOcrService.ts`).

### D. Logistics Sheets Integration (`Confirmed`)
- Direct bidirectional sync and proxy fetching for specialized business spreadsheets:
  - **Data BM (`DataBMPage.tsx`):** Pharmaceutical logistics data.
  - **Sokimex Postpaid (`SokimexPostpaidPage.tsx`):** Fuel and commercial postpaid logistics.
  - **Meterial Office (`MeterialOfficePage.tsx`):** Fleet (trucks, tuk-tuks) and internal office supplies.
  - **Data Report (`DataReportPage.tsx`):** Central logistics dispatch catalog.

### E. Remote Master Database & IALE API (`Confirmed`)
- Live connectivity to Hostinger Remote MySQL (`u112951411_iale_api`) supporting high-performance indexed queries across `booking` and `shipment_detail` tables (`api/remote-mysql.js`).
- Incremental POD (Proof of Delivery) batch synchronization to Google Sheets.

---

## 5. Implementation Status Matrix

| Module / Feature | Code Artifact Reference | Status |
| :--- | :--- | :--- |
| Payment Collection & Reconciliation | `src/components/PaymentCollectionPage.tsx` | `Confirmed` (Production Ready) |
| Warehouse Multi-Mode Scanner | `src/components/WarehouseManagementPage.tsx` | `Confirmed` (Production Ready) |
| Bank Slip Upload & WebP Compress | `src/components/BankSlipsPage.tsx`, `src/utils/compression.ts` | `Confirmed` (Production Ready) |
| Gemini AI Slip OCR | `src/services/geminiOcrService.ts` | `Confirmed` (Integration Present) |
| Telegram Bot Multi-Channel Alerts | `src/services/telegramService.ts` | `Confirmed` (Production Ready) |
| Remote MySQL Master DB Handlers | `api/mysql-master-handlers.js`, `api/remote-mysql.js` | `Confirmed` (Production Ready) |
| Local PostgreSQL Scheduled Backup | `vite.config.ts`, `scripts/backup-to-postgres.js` | `Confirmed` (Production Ready) |
| Google Apps Script Backend Sync | `Code.gs` | `Confirmed` (Production Ready) |
| User Permissions & Dynamic Routing | `src/services/userPermissionService.ts`, `src/App.tsx` | `Confirmed` (Production Ready) |
| Automated Unit/E2E Test Suite | Root workspace / `package.json` | `Inferred` (Manual script testing present; automated Jest/Vitest suite not configured) |
| External Payment Gateway Webhook | Backend APIs | `Not verified` (Manual slip upload & cashier reconciliation used instead of automated webhook callbacks) |
