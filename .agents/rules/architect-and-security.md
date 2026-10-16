# Antigravity AI Architect & Security Rules

## 1. Global Security Guardrails (Always Active)
- **STRICT FILE READ BAN:** NEVER open, read, `cat`, grep, or inspect `.env`, `.env.*` (except `.env.example` or `.env.template`), `*.pem`, `*.key`, `*.pfx`, `*.cert`, `*.p12`, credential files, secret configs, or database dumps.
- **SAFE ENV DISCOVERY:** Identify environment variables strictly by searching source code references (e.g., `process.env`, `os.environ`, `import.meta.env`) or reading `.env.example`.
- **REDACTION:** Never output passwords, API keys, tokens, private URLs, connection strings, or PII. Always replace sensitive values with `<REDACTED>`.
- **READ-ONLY ANALYSIS:** During code analysis or documentation tasks, do not modify existing source files, run database migrations, or execute destructive commands.

---

## 2. Evidence & Labelling Standard
For all architectural and technical analysis, classify findings using:
- `Confirmed`: Directly supported by source code or configuration (cite file paths).
- `Inferred`: Strongly suggested by code patterns but not directly verified.
- `Not verified`: Cannot be confirmed safely without inspecting restricted files/systems.

---

## 3. Workflow Trigger: `@generate-docs`
When the user types `@generate-docs` or asks to generate the Technical Project Summary:
Act as a Senior Software Architect and generate the following 8 files **sequentially (one file at a time)** inside the `project-documentation/` directory (do not overwrite existing files without asking):

1. `PROJECT_OVERVIEW.md` — Purpose, problems solved, user roles, modules, app type, and implementation status (`Confirmed` vs incomplete).
2. `TECH_STACK.md` — Languages, frontend/backend frameworks, UI libraries, build tools, auth, testing, and 3rd-party integrations with file path evidence.
3. `ARCHITECTURE.md` — Component interactions (Frontend, API, Service Layer, DB, Auth, Middleware) and a safe Mermaid architecture diagram.
4. `DATABASE_AND_DATA_FLOW.md` — DB engine, ORM/client, entities/relationships, caching/storage, and sanitized config placeholders (e.g., `DATABASE_URL=<REDACTED>`).
5. `ROUTES_AND_USER_FLOWS.md` — Page routes, UI components, role permissions, API calls, step-by-step navigation flows, and a Mermaid user journey flowchart.
6. `API_REFERENCE.md` — HTTP methods, endpoints, auth requirements, synthetic request/response payloads, validation, and error handling.
7. `PROJECT_STRUCTURE.md` — Clean directory tree (excluding secrets and `node_modules`) explaining key entry points, services, schemas, and configs.
8. `AI_PROJECT_CONTEXT.md` — High-signal, self-contained summary designed for handoff to other AI assistants (architecture, conventions, key files to inspect, and known unknowns).

### Post-Generation Summary
After generating all 8 files, output a concise final summary in chat covering:
1. Project purpose & main architecture.
2. Confirmed tech stack & database.
3. Primary user workflows.
4. List of created files & unverified limitations.
5. Explicit confirmation that secret files (`.env`, keys) were not read and outputs were sanitized.
