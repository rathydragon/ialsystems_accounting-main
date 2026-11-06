# =========================================================================
# Multi-stage Production Dockerfile for IAL Systems Full-Stack App
# Stage 1: Build Frontend SPA
# Stage 2: Production Node.js Server & Static Assets
# =========================================================================

# --- STAGE 1: Frontend Build ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app

# Frontend deps live in the root package.json/lockfile (same as the Vercel build);
# frontend/ has no lockfile and its package.json misses some deps.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./frontend/
WORKDIR /app/frontend

# VITE_* values are baked into the JS bundle at build time, so the host
# (e.g. Coolify "Build Variable") must pass them as build args.
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_GOOGLE_WEBAPP_URL
ARG VITE_DATA_BM_SHEET_URL
ARG VITE_DATA_BM_SHEET_NAME
ARG VITE_DATA_REPORT_SHEET_URL
ARG VITE_DATA_REPORT_SHEET_NAME
ARG VITE_SOKIMEX_SHEET_URL
ARG VITE_SOKIMEX_SHEET_NAME
ARG VITE_METERIAL_OFFICE_SHEET_URL
ARG VITE_METERIAL_OFFICE_SHEET_NAME
ARG VITE_POD_BACKUP_WEBAPP_URL
ARG VITE_TELEGRAM_CHAT_ID
ARG VITE_TELEGRAM_PAYMENT_CHAT_ID
ARG VITE_TELEGRAM_DISTRIBUTION_CHAT_ID
ARG VITE_TELEGRAM_SLIP_CHAT_ID
ARG VITE_TELEGRAM_DAILY_SUMMARY_TIME
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_GOOGLE_WEBAPP_URL=$VITE_GOOGLE_WEBAPP_URL \
    VITE_DATA_BM_SHEET_URL=$VITE_DATA_BM_SHEET_URL \
    VITE_DATA_BM_SHEET_NAME=$VITE_DATA_BM_SHEET_NAME \
    VITE_DATA_REPORT_SHEET_URL=$VITE_DATA_REPORT_SHEET_URL \
    VITE_DATA_REPORT_SHEET_NAME=$VITE_DATA_REPORT_SHEET_NAME \
    VITE_SOKIMEX_SHEET_URL=$VITE_SOKIMEX_SHEET_URL \
    VITE_SOKIMEX_SHEET_NAME=$VITE_SOKIMEX_SHEET_NAME \
    VITE_METERIAL_OFFICE_SHEET_URL=$VITE_METERIAL_OFFICE_SHEET_URL \
    VITE_METERIAL_OFFICE_SHEET_NAME=$VITE_METERIAL_OFFICE_SHEET_NAME \
    VITE_POD_BACKUP_WEBAPP_URL=$VITE_POD_BACKUP_WEBAPP_URL \
    VITE_TELEGRAM_CHAT_ID=$VITE_TELEGRAM_CHAT_ID \
    VITE_TELEGRAM_PAYMENT_CHAT_ID=$VITE_TELEGRAM_PAYMENT_CHAT_ID \
    VITE_TELEGRAM_DISTRIBUTION_CHAT_ID=$VITE_TELEGRAM_DISTRIBUTION_CHAT_ID \
    VITE_TELEGRAM_SLIP_CHAT_ID=$VITE_TELEGRAM_SLIP_CHAT_ID \
    VITE_TELEGRAM_DAILY_SUMMARY_TIME=$VITE_TELEGRAM_DAILY_SUMMARY_TIME

RUN npm run build

# --- STAGE 2: Production Runner ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000
ENV HOST=0.0.0.0

# Install production dependencies for backend
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy backend source code
COPY backend/ ./backend/

# Copy built frontend production artifacts from builder stage
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose backend port
EXPOSE 5000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/api/health || exit 1

# Start production server
CMD ["node", "backend/server.js"]
