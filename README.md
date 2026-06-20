# 🛡️ ZenGuardian

A GenAI-powered **student mental wellness tracker** for those grinding through
high-stakes entrance exams (NEET, JEE, CAT, UPSC, GATE). Students journal how
they feel; Gemini extracts structured wellbeing signals, retrieves their own
past entries via vector search (RAG), and streams back a grounded, empathetic
companion reply.

> Built for the *Google Build with AI* hackathon. Monolithic deployment
> (Express serves the React bundle) in a single Cloud Run container.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Cloud Run container (port 8080)                             │
│                                                              │
│   React/Vite bundle  ──served by──►  Express                 │
│                                        ├─ /api/auth   (JWT in HTTP-only cookie)
│                                        └─ /api/journal (SSE stream)
│                                              │               │
│                         ┌────────────────────┼─────────────┐ │
│                         ▼                    ▼             ▼ │
│                  Gemini embed         Gemini analyze   Gemini stream
│                  (text-embedding-004) (gemini-2.5-flash JSON)  (gemini-2.5-flash)
│                         │                                     │
│                         ▼                                     │
│              MongoDB Atlas Vector Search (per-user RAG memory)│
└──────────────────────────────────────────────────────────────┘
```

**Stack:** React 18 + Vite (TS) · Express + Mongoose (TS) · MongoDB Atlas Vector
Search · `@google/genai` (Gemini) · JWT auth in HTTP-only cookies · Docker.

---

## Prerequisites

- Node.js 20+
- A **MongoDB Atlas** cluster (Vector Search needs Atlas — local `mongod` won't work)
- A **Google AI Studio** API key for Gemini

---

## Local development

```bash
# 1. Backend
cd backend
cp .env.example .env          # then fill in real values
npm install
npm run dev                   # http://localhost:8080

# 2. Frontend (separate terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173  (proxies /api → :8080)
```

Open **http://localhost:5173**. Vite proxies `/api` to the backend, so the
browser sees one origin and the auth cookie works without CORS.

Generate a strong JWT secret for `.env`:

```bash
openssl rand -hex 32
```

---

## MongoDB Atlas Vector Search index

Create a **Vector Search** index named **`journal_vector_index`** (must match
`VECTOR_INDEX_NAME`) on the **`journals`** collection:

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
    { "type": "filter", "path": "userId" }
  ]
}
```

> The `userId` **filter** field is required: per-user retrieval is done inside
> `$vectorSearch` via `filter`, not a post-hoc `$match` (which would drop most
> results). If the index is missing, the app still runs — it just skips RAG
> history until you create it.

`numDimensions` must equal `EMBEDDING_DIMENSIONS`. If you switch
`GEMINI_EMBEDDING_MODEL` to `gemini-embedding-001`, keep
`EMBEDDING_DIMENSIONS=768` (the service passes `outputDimensionality` and
re-normalizes) or change both the env var and the index to match.

---

## Production build & Docker

```bash
# one container, both tiers
docker build -t zenguardian .
docker run -p 8080:8080 --env-file backend/.env zenguardian
# → http://localhost:8080
```

### Deploy to Cloud Run

```bash
gcloud run deploy zenguardian \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars "MONGODB_URI=...,JWT_SECRET=...,GEMINI_API_KEY=..."
```

Cloud Run injects `PORT`; the server reads it (defaults to 8080).

---

## API

| Method | Path                | Auth | Description                                   |
| ------ | ------------------- | ---- | --------------------------------------------- |
| GET    | `/api/health`       | —    | Liveness probe                                |
| POST   | `/api/auth/register`| —    | Create account, set session cookie            |
| POST   | `/api/auth/login`   | —    | Sign in, set session cookie                   |
| POST   | `/api/auth/logout`  | —    | Clear session cookie                          |
| GET    | `/api/auth/me`      | ✓    | Current user                                  |
| POST   | `/api/journal`      | ✓    | Analyze + persist entry; **SSE** stream reply |
| GET    | `/api/journal`      | ✓    | Recent entries (for history + trend)          |

`POST /api/journal` streams Server-Sent Events:
`analysis` → `token`… → optional `crisis` → `done` (or `error`).

---

## Corrections applied vs. the original blueprint

The blueprint's architecture was kept; these runtime/security bugs were fixed:

1. **Embedding model** — `gemini-embedding-2` doesn't exist (would 404). Now
   `text-embedding-004` (768-dim), model + dimension configurable, vectors
   re-normalized for non-3072 widths.
2. **Per-user vector search** — `$vectorSearch` returns *global* neighbors, so a
   trailing `$match` on `userId` returned ~nothing. Filtering now happens inside
   `$vectorSearch`, with `userId` added to the index as a `filter` field. We also
   retrieve history **before** inserting the new entry so it can't match itself.
3. **`numCandidates`** raised from 10 → 150 (Atlas wants ≫ `limit`).
4. **Password length** — model `minlength: 12` validated the bcrypt *hash*, not
   the plaintext (enforced nothing). Now enforced with Zod before hashing;
   bcrypt stays at 12 rounds.
5. **JWT secret** — removed the insecure `|| 'emergency_fallback'`; a ≥32-char
   secret is validated at boot and the process fails closed without it.
6. **SSE framing** — proper `data: <json>\n\n` frames with typed events.

Plus: a deterministic **crisis safety net** (surfaces India helplines — Tele-MANAS
14416, iCall 9152987821), `helmet`, rate-limited auth endpoints, and `select:false`
on password + embedding fields.

---

## Project layout

```
backend/
  src/
    config/      env (Zod-validated) + Mongo connection
    models/      user, journal (Mongoose + TS interfaces)
    services/    gemini.service.ts  (embed / analyze / stream)
    middleware/  auth (cookie JWT), error handler
    controllers/ auth, journal
    routes/      auth, journal
    utils/       validation (Zod), safety (crisis detection)
    app.ts  server.ts
frontend/
  src/
    api/         client.ts (fetch + SSE reader)
    context/     AuthContext.tsx
    components/   AnalysisCard, StressTrend
    pages/       AuthPage, Dashboard
    styles.css
Dockerfile
```
