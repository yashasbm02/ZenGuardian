# ──────────────────────────────────────────────────────────────────────────
# ZenGuardian — single-container monolith for Cloud Run
# Express serves the API under /api and the built React bundle for everything
# else, all on $PORT (default 8080).
# ──────────────────────────────────────────────────────────────────────────

# Stage 1 — build the React/Vite frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2 — compile the TypeScript backend
FROM node:20-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Stage 3 — slim production runtime (prod deps only)
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /usr/src/app

COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev && npm cache clean --force

COPY --from=backend-build /app/backend/dist ./backend/dist
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 8080
USER node
CMD ["node", "backend/dist/server.js"]
