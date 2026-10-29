# Project Structure & Directory Layout: IAL SYSTEMS

This directory layout details all critical source code files, configurations, scripts, and architecture components while strictly excluding transient dependencies (`node_modules/`), build outputs (`dist/`), and secret configuration files.

---

## 1. Directory Tree

```
ialsystems_accounting-main/
├── .agents/                                # Antigravity IDE Customizations & Workspace Rules
│   └── rules/
│       ├── architect-and-security.md       # AI Architect & Security Rules
│       └── responsive-ui-standards.md      # Khmer UI and Mobile Standards
├── api/                                    # Express & Vite Server Middleware Handlers
│   ├── app-config.js                       # Application Config API
│   ├── backup-postgres.js                  # PostgreSQL On-Demand Backup Handler
│   ├── distribution-reports.js             # Parcel Distribution Reports API
│   ├── mysql-master-handlers.js            # Comprehensive Master MySQL CRUD Services
│   ├── permissions.js                      # User Permissions & Roles Local API
│   ├── remote-mysql.js                     # MySQL Connection Pool & Query Executor
│   └── sheet-proxy.js                      # Google Sheets Proxy (Eliminates CORS)
├── scripts/                                # Database Schemas, ETL Migrations & Scheduled Scripts
│   ├── apply-backup-views.js               # SQL View Deployment Tool
│   ├── backup-schedule.json                # Active Scheduler Configuration JSON
│   ├── backup-to-postgres.js               # MySQL-to-PostgreSQL ETL Backup Runner
│   ├── create_backup_views.sql             # SQL Script for Analytics Views
│   ├── create_table_list_name.sql          # Payers / List Name DDL
│   ├── execute-deduplication.js            # Parcel Tracking Deduplication Utility
│   ├── export-postgres-csv.js              # PostgreSQL CSV Data Exporter
│   ├── get-backup-status.js                # Backup Health & Metrics Reporter
│   ├── hostinger_mysql_schema.sql          # Complete 15-Table Master MySQL DDL Schema
│   ├── init_schema.sql                     # PostgreSQL Initial Backup DDL Schema
│   ├── inspect-pg-scans.js                 # PostgreSQL Inspection CLI
│   ├── migrate-to-hostinger-mysql.js       # Data Migration Script (Sheets -> MySQL)
│   ├── migrate-warehouse-scans.js          # Warehouse Scans Migration Script
│   ├── reset-postgres-utf8.js              # PostgreSQL Database Encoding Reset
│   ├── run-backup-background.bat           # Windows Background Backup Launcher
│   ├── run-backup-silent.vbs               # Silent Background Task VBScript
│   ├── setup-hourly-backup.bat             # Windows Task Scheduler Configurator (Hourly)
│   ├── setup-scheduled-backup.bat          # Windows Task Scheduler Configurator (Daily)
│   ├── setup-wifi-access.bat               # Windows Local LAN/Wi-Fi Firewall Opener
│   ├── sync-code-gs.cjs                    # Google Apps Script Sync Tool
│   ├── test-remote-mysql.js                # Remote Hostinger MySQL Connection Test CLI
│   └── user_permissions.json               # Seed Permission Data
├── src/                                    # Frontend Application Source Code
│   ├── components/                         # React UI Pages, Modals & Navigation
│   │   ├── dataReport/                     # Sub-components for Data Reporting
│   │   │   ├── DataReportAnalytics.tsx     # Chart Visualizations & Trend Analytics
│   │   │   ├── DataReportFilterBar.tsx     # Date & Search Filter Controls
│   │   │   └── DataReportTable.tsx         # High-Performance Data Table
│   │   ├── BankSlipsPage.tsx               # Bank Slip Archival, WebP & OCR Page
│   │   ├── BarcodeScannerModal.tsx         # Camera Barcode Scanner Modal (html5-qrcode)
│   │   ├── BatchManifestModal.tsx          # Batch Printable Receipt & Manifest Dialog
│   │   ├── CodeViewerModal.tsx             # System Source Code Viewer
│   │   ├── DataBMPage.tsx                  # Buymed Pharmaceutical Logistics Page
│   │   ├── DataManagementPage.tsx          # Tracking Master Lookup & Data Sync Page
│   │   ├── DataReportPage.tsx              # Central Logistics Dispatch Catalog
│   │   ├── DistributionReportModal.tsx     # Distribution Entry & Editing Modal
│   │   ├── DistributionReportPage.tsx      # Rider Distribution Reports & Audit Page
│   │   ├── ErrorBoundary.tsx               # Top-Level React Crash Protection Boundary
│   │   ├── IaleTrackingPage.tsx            # IALE Live Tracking API & POD Sync Page
│   │   ├── LoginView.tsx                   # Google OAuth, PIN & Password Login
│   │   ├── MeterialOfficePage.tsx          # Fleet & Office Materials Logistics Page
│   │   ├── MobileBottomNav.tsx             # Responsive Mobile Navigation Bar
│   │   ├── Navbar.tsx                      # Top App Bar with User Profile & Dark Mode
│   │   ├── OperatorDistributionSummaryModal.tsx # Operator Performance Summary
│   │   ├── PackageTimelineModal.tsx        # Parcel Lifecycle History & Timeline
│   │   ├── PayerManagementPage.tsx         # Payers (Riders, Branches, Clients) Directory
│   │   ├── PaymentCollectionPage.tsx       # Core Cashier Payment Collection & Reconciliation
│   │   ├── PodSheetSyncModal.tsx           # Proof of Delivery Synchronization Modal
│   │   ├── PWAInstallPrompt.tsx            # PWA Home-Screen Install Prompt
│   │   ├── ScannerSoundSettingsPopover.tsx # Web Audio Synthesizer Controls
│   │   ├── SettingsModal.tsx               # Quick Configuration Modal
│   │   ├── SettingsPage.tsx                # System Settings, Schedulers & Integrations
│   │   ├── SetupGuideModal.tsx             # Interactive System Setup Manual
│   │   ├── Sidebar.tsx                     # Collapsible Desktop Sidebar Menu
│   │   ├── SokimexPostpaidPage.tsx         # Sokimex Postpaid Logistics Page
│   │   ├── TelegramPreviewModal.tsx        # Telegram Bot Payload Previewer
│   │   ├── UserManagementPage.tsx          # RBAC, User Permissions & Security Page
│   │   ├── WarehouseManagementPage.tsx     # Warehouse Scanning (ScanIn, Out, OOD, Hold)
│   │   └── WarehouseToolsDropdown.tsx      # Quick Warehouse Utility Actions Dropdown
│   ├── data/
│   │   └── initialData.ts                  # Static Seed Data & Fallbacks
│   ├── services/                           # Frontend Business Logic & Cloud Connectors
│   │   ├── activityLogService.ts           # Audit Trail & Activity Logging Client
│   │   ├── bankSlipService.ts              # Bank Slip CRUD & Verification Client
│   │   ├── batchFirestoreService.ts        # Legacy Firestore Connector Stub
│   │   ├── batchService.ts                 # Collection Batches Management & Sync
│   │   ├── dataBMService.ts                # Buymed Sheet Fetching & Formatting
│   │   ├── dataReportService.ts            # Data Report Fetching & Aggregations
│   │   ├── distributionReportService.ts    # Distribution Reports Client Service
│   │   ├── geminiOcrService.ts             # Google Gemini Vision OCR AI Client
│   │   ├── localDbService.ts               # LocalStorage & Payers Directory Cache
│   │   ├── meterialOfficeService.ts        # Fleet & Materials Logistics Service
│   │   ├── mysqlMasterService.ts           # Remote MySQL Master API Bridge
│   │   ├── sokimexPostpaidService.ts       # Sokimex Sheet Connector
│   │   ├── telegramService.ts              # Telegram Bot API Formatting & Dispatch
│   │   ├── userPermissionService.ts        # RBAC Authorization & Roles Engine
│   │   └── warehouseScanService.ts         # Warehouse Barcode Scan In/Out Services
│   ├── utils/                              # Reusable Utility Functions
│   │   ├── compression.ts                  # HTML5 Canvas WebP Image Compressor
│   │   ├── dateFormatter.ts                # Date Formatting & Timezone Helpers (+07:00)
│   │   ├── googleSheetFetcher.ts           # Google Sheets GVIZ API Data Extractor
│   │   ├── sanitizeTracking.ts             # Barcode & Tracking Sanitizer
│   │   └── scannerSound.ts                 # Web Audio API Synthesizer (Beep Generation)
│   ├── App.tsx                             # Master State Orchestrator & View Switcher
│   ├── index.css                           # Global Styles, Tailwind Imports & Fonts
│   ├── main.tsx                            # React DOM Entrypoint
│   └── types.ts                            # Global TypeScript Interfaces & Enums
├── project-documentation/                  # 8 Architectural Documentation Suite
├── public/                                 # Public Static Assets & PWA Icons
├── Code.gs                                 # Google Apps Script Production Backend (4,900+ Lines)
├── ialsystems_backup_pod.gs                # Google Apps Script POD Backup Routine
├── index.html                              # HTML5 Host Template & Meta Headers
├── metadata.json                           # Application Capabilities & Manifest
├── package.json                            # Node.js Dependencies & Command Scripts
├── tsconfig.json                           # TypeScript Compiler Options
├── vercel.json                             # Vercel Deployment & Route Rewrites
└── vite.config.ts                          # Vite Config, Manual Chunks & Middleware Plugin
```

---

## 2. Key Entry Points & Role Summaries

| Entrypoint | Type | Description |
| :--- | :--- | :--- |
| [src/main.tsx](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/main.tsx) | Client Entry | Mounts React application root with `<React.StrictMode>` |
| [src/App.tsx](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/App.tsx) | App Core | Controls user session, RBAC route guarding, toast alerts, and view rendering |
| [vite.config.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/vite.config.ts) | Server Entry | Configures dev server, Vite build settings, and mounts all `/api/*` endpoints |
| [Code.gs](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/Code.gs) | Cloud Entry | Serverless Apps Script web handler powering Google Sheets and Google Drive |
| [src/types.ts](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/src/types.ts) | Type System | Canonical data contracts, enums, and models across the entire application |
| [scripts/backup-to-postgres.js](file:///c:/Users/ASUS/OneDrive/Desktop/ialsystems_accounting-main/scripts/backup-to-postgres.js) | ETL Script | Autonomous script extracting delta records from MySQL into PostgreSQL |
