# IAL Systems Accounting

Production-ready accounting and logistics management application with client-side WebP compression, offline PWA capabilities, Google Sheets & Drive synchronization, Telegram bot alerts, and a standalone Node.js/Express API service connected to Hostinger MySQL & local PostgreSQL.

---

## 📁 Project Architecture

The codebase is cleanly separated into two standalone services:

```text
ialsystems_accounting/
├── frontend/                 # React 19 + Vite + Tailwind CSS Client
│   ├── public/               # PWA icons, manifest, service worker
│   ├── src/                  # React UI components, services, and utils
│   ├── index.html            # SPA entry point
│   ├── vite.config.ts        # Bundler configuration + dev API proxy
│   ├── package.json          # Frontend dependencies
│   ├── .env.example          # Public frontend environment template
│   └── vercel.json           # Vercel SPA routing rules
│
├── backend/                  # Standalone Node.js + Express Server
│   ├── api/                  # API route handlers & controllers
│   │   ├── app-config.js
│   │   ├── backup-postgres.js
│   │   ├── distribution-reports.js
│   │   ├── mysql-master-handlers.js
│   │   ├── permissions.js
│   │   ├── pod-background-sync.js
│   │   ├── remote-mysql.js
│   │   ├── sheet-proxy.js
│   │   └── routes.js         # Central Express router
│   ├── scripts/              # Database migrations, backups & SQL schemas
│   ├── server.js             # Express server with CORS & background sync
│   ├── package.json          # Backend dependencies
│   └── .env.example          # Private backend environment template
│
├── docs/                     # Architecture docs, Google Apps Script & utilities
│   ├── gas/                  # Google Apps Script files
│   ├── project-documentation/# System guides & specifications
│   └── utilities/            # Network diagnostic utilities
│
├── dev.js                    # Cross-platform runner (runs Frontend + Backend together)
├── package.json              # Root orchestrator scripts
└── README.md
```

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
Run from root (or in each subfolder for isolated setups):
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` in both `frontend` and `backend`:
```bash
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

### 3. Run Both Services Concurrently
From the project root:
```bash
npm run dev
# or
npm start
```
* **Frontend**: `http://localhost:3000` (automatically proxies `/api/*` calls to port 5000)
* **Backend API**: `http://localhost:5000` (API status at `http://localhost:5000/api/health`)

---

## 🛠️ Individual Service Commands

### Frontend (`/frontend`)
```bash
cd frontend
npm run dev          # Start Vite dev server on port 3000
npm run build        # Build production bundle to frontend/dist
npm run preview      # Preview production build locally
npm run lint         # TypeScript type check (tsc --noEmit)
```

### Backend (`/backend`)
```bash
cd backend
npm run dev          # Start Express API server on port 5000
npm start            # Production server startup
npm run test:remote-db   # Test Hostinger Remote MySQL connection
npm run backup:pg        # Run manual PostgreSQL backup
npm run migrate:mysql    # Run Hostinger MySQL migrations
```

---

## 🌐 Independent Deployment Guide

### Deploying Frontend
The frontend is a static Single Page Application (SPA). It can be deployed to **Vercel**, **Netlify**, **Cloudflare Pages**, or an **AWS S3 / CloudFront** bucket.
1. Root directory in hosting provider: `frontend`
2. Build command: `npm run build`
3. Output directory: `dist`
4. Set environment variable `VITE_BACKEND_URL` to your deployed backend API URL (e.g., `https://api.yourdomain.com`).

### Deploying Backend
The backend is a standard Node.js Express server. It can be deployed to **Render**, **Railway**, **Fly.io**, **Hostinger VPS**, or **Docker/EC2**.
1. Root directory in hosting provider: `backend`
2. Install command: `npm install`
3. Start command: `node server.js`
4. Configure environment variables from `backend/.env.example` (`PORT`, `CORS_ORIGIN`, `REMOTE_DB_*`, `PG_*`).