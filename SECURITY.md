# Security Policy — IAL Systems Accounting

## 1. Overview
IAL Systems Accounting is an enterprise-grade logistics and accounting progressive web application (PWA). Because this system processes sensitive financial and customer logistics data, security is an ongoing core priority.

---

## 2. Supported Versions

| Version | Supported          | Security Maintenance Level |
| :------ | :----------------- | :------------------------- |
| `1.x`   | :white_check_mark: | Active Security Hardening  |
| `< 1.0` | :x:                | End of Life (Unsupported)  |

---

## 3. Reporting a Vulnerability

If you discover a potential security vulnerability within this repository, please follow responsible disclosure practices:

1. **Do NOT open a public GitHub issue.** Public issues disclose vulnerabilities before patches can be deployed.
2. Submit your report privately to the repository administrator or email: `security@ialsystems.com`.
3. Please include:
   - Vulnerability description and potential impact.
   - Step-by-step reproduction instructions or Proof of Concept (PoC).
   - Affected endpoints, files, or components.

### Response Timelines
- **Initial Acknowledgement:** Within 24 hours.
- **Triage & Severity Assessment:** Within 72 hours.
- **Patch Deployment:** Critical issues are patched with emergency priority; standard issues within 7 business days.

---

## 4. Security Architecture & Defenses

### A. Authentication & Session Management
- **Stateless JWT Tokens:** Authentication tokens are cryptographically signed using pinned `HS256` algorithms with explicit expiration.
- **Brute-Force Mitigation:** Login endpoints enforce sliding-window rate limiting (maximum 5 failed attempts per 15 minutes per IP/account) returning HTTP 429 Too Many Requests.
- **Client Storage Isolation:** Access tokens and cached user permissions are cleared from local storage and memory immediately on logout or session expiration.

### B. Authorization & Data Isolation (Anti-IDOR)
- **Server-Side Enforcement:** Data access scopes (`ADMIN`, `ACCOUNTANT`, `DELIVERY`, `HUB`, `VIEWER`) and `viewOnlyOwn` data filters are enforced in backend database handlers, preventing Insecure Direct Object References (IDOR).
- **Administrative Action Guards:** Mass-deletion, user permission updates, and system configuration modifications require verified `ADMIN` privileges on the server side.

### C. Injection Prevention
- **SQL Injection:** All database queries to MySQL and PostgreSQL utilize parameterized queries.
- **CSV / Spreadsheet Formula Injection (CWE-1236):** All client-side CSV and Excel exports pass through a centralized sanitizer that neutralizes formula trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`) by prepending a single quote (`'`) and adhering to RFC 4180 double-quote escaping.

### D. Credential & Secrets Hygiene
- **Server-Side Telegram Proxy:** Telegram Bot tokens are kept securely in backend environment variables (`TELEGRAM_BOT_TOKEN`), and client requests are proxied via `/api/telegram-alert` to avoid exposing tokens in browser DevTools.
- **Git Hygiene:** Local configuration files (`.env`, `user_permissions.json`, `backup-schedule.json`) are strictly excluded via `.gitignore` with provided `.example` templates.
- **Transit Encryption:** Remote MySQL and PostgreSQL database pools are configured with TLS/SSL encryption for data in transit.

---

## 5. Security Checklist for Deployments

- [ ] Ensure `JWT_SECRET` is set to a secure, randomly generated 64-character hex string in production.
- [ ] Configure `REMOTE_DB_SSL=true` on all production backend deployments.
- [ ] Set `TELEGRAM_BOT_TOKEN` in the backend environment, avoiding hardcoded tokens in frontend settings.
- [ ] Verify that `CORS_ORIGIN` matches only authorized application domains.
