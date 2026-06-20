# ZenGuardian — CLAUDE.md

AI-facing reference for this codebase. Covers architecture decisions, invariants,
known gotchas, and patterns to follow when adding features or debugging.

---

## Stack at a glance

| Layer | Tech |
|---|---|
| Backend | Express 4, TypeScript → CommonJS (`tsc`), Node 20 |
| Frontend | React 18, Vite 5, TypeScript (ESM), plain CSS |
| Database | MongoDB Atlas (Vector Search requires Atlas, not local `mongod`) |
| AI (chat) | **NVIDIA** OpenAI-compatible API running Kimi (`moonshotai/kimi-k2.6`) via the `openai` SDK |
| AI (embeddings) | **Gemini** `gemini-embedding-001` via `@google/genai` (separate quota; keeps the 768-dim index valid) |
| Auth | JWT in HTTP-only cookie (`auth_token`), no `localStorage` |
| Deploy | Single Cloud Run container — Express serves `/api` + static `frontend/dist` |

---

## File map

```
backend/src/
  config/env.ts           Zod-validated env — ALL env reads go through here
  config/db.ts            Mongoose connect/disconnect
  models/user.model.ts    User schema + bcrypt pre-save + comparePassword()
  models/journal.model.ts Journal schema; embedding field is select:false
  services/gemini.service.ts  embed() · analyze() · streamCompanionReply()
  middleware/auth.middleware.ts  requireAuth — reads auth_token cookie
  middleware/error.middleware.ts HttpError class + central error handler
  controllers/auth.controller.ts  register · login · logout · me
  controllers/journal.controller.ts  createEntry (SSE) · listEntries
  routes/auth.routes.ts   rate-limited; wires auth controller
  routes/journal.routes.ts  requireAuth applied at router level
  utils/validation.ts     Zod schemas: credentialsSchema, journalEntrySchema
  utils/safety.ts         detectsCrisis() + CRISIS_RESOURCE_MESSAGE
  app.ts                  Express app factory (helmet, cookie-parser, routes, static)
  server.ts               connectDB → listen → graceful shutdown

frontend/src/
  types.ts                Shared TS interfaces (User, JournalEntry, StreamEvent …)
  api/client.ts           fetch wrapper (credentials:include) + streamJournalEntry()
  context/AuthContext.tsx Session state; calls /api/auth/me on mount
  pages/AuthPage.tsx      Combined sign-in / register
  pages/Dashboard.tsx     Composer + streaming reply + analysis card + history
  components/AnalysisCard.tsx  Stress meter, emotion, triggers, coping tip
  components/StressTrend.tsx   CSS-only sparkline (last 14 entries)
  styles.css              All styling; CSS custom properties for the color palette
```

---

## Invariants — never break these

### Auth
- The JWT is stored **only** in an HTTP-only cookie. Do not move it to
  `localStorage` or expose it via an API response body.
- `env.JWT_SECRET` is validated ≥32 chars at boot. There is **no fallback**
  default; omitting it kills the process. This is intentional.
- Login queries `.select('+password')` explicitly because `password` has
  `select: false` in the schema. Forget this and `comparePassword` always returns false.
- Auth routes are rate-limited (20 req / 15 min window). Don't remove the limiter.

### Embeddings / Vector Search
- Embedding model is `gemini-embedding-001` (GA). `text-embedding-004` is no
  longer served on the Gemini Developer API and returns 404. gemini-embedding-001
  defaults to 3072-dim; we request 768 via `outputDimensionality` and L2-normalize
  (it only pre-normalizes at the full 3072 width).
- The Atlas index **must** include a `filter` field for `userId`:
  ```json
  { "type": "filter", "path": "userId" }
  ```
  Without it, the per-user `filter` inside `$vectorSearch` throws and the app
  falls back to empty history. The index name must match `VECTOR_INDEX_NAME` env.
- Always embed **before** inserting the new entry so vector search history
  doesn't include the current entry matching itself.
- `numCandidates` in `$vectorSearch` is 150, `limit` is 4. Don't lower
  `numCandidates` below ~30× `limit` or Atlas returns sparse results.
- The `embedding` field has `select: false`. The aggregate pipeline in
  `$vectorSearch` bypasses this, but any `.find()` on journals **will not**
  return the embedding unless you add `.select('+embedding')`.

### SSE protocol
`POST /api/journal` responds as Server-Sent Events. The frontend parses frames
manually (EventSource can't POST with a body). Frame format:

```
data: {"type":"<event>","data":<payload>}\n\n
```

Event types in order: `analysis` → `token`* → `crisis` (optional) → `done`
(or `error` on failure). The `sse()` helper in `journal.controller.ts` writes
these. Do not change the frame format without updating `client.ts`.

### Password validation
Password length is enforced with Zod **before** hashing in
`utils/validation.ts`. Do **not** add `minlength` to the Mongoose schema —
it would validate the 60-char bcrypt hash, not the plaintext.

### Static serving
`app.ts` only enables the static-file middleware if `frontend/dist/index.html`
exists (`fs.existsSync` guard). In dev this is absent and Vite's proxy handles
routing. The SPA catch-all (`*`) is placed **after** the `/api` 404 handler so
API 404s return JSON, not `index.html`.

---

## Development commands

```bash
# Backend (watch mode, port 8080)
cd backend && npm run dev

# Frontend (HMR, port 5173 — proxies /api → :8080)
cd frontend && npm run dev

# Type-check backend only
cd backend && npm run typecheck

# Production build (both)
cd backend && npm run build
cd frontend && npm run build

# Docker (full monolith)
docker build -t zenguardian .
docker run -p 8080:8080 --env-file backend/.env zenguardian
```

---

## Environment variables

All defined and validated in `backend/src/config/env.ts`. Adding a new env var
means adding it there (Zod schema) **and** to `backend/.env.example`.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `MONGODB_URI` | ✓ | — | Atlas URI; local `mongod` won't have Vector Search |
| `JWT_SECRET` | ✓ | — | Min 32 chars; generate with `openssl rand -hex 32` |
| `JWT_EXPIRES_IN` | — | `7d` | Any `jsonwebtoken` duration string |
| `NVIDIA_API_KEY` | ✓ | — | `nvapi-...` inference key from build.nvidia.com (chat/generation) |
| `NVIDIA_BASE_URL` | — | `https://integrate.api.nvidia.com/v1` | OpenAI-compatible base URL |
| `NVIDIA_CHAT_MODEL` | — | `moonshotai/kimi-k2.6` | Kimi model id (k2-instruct is EOL) |
| `GEMINI_API_KEY` | ✓ | — | Google AI Studio key — **embeddings only** now |
| `GEMINI_EMBEDDING_MODEL` | — | `gemini-embedding-001` | Must produce 768-dim vectors or change `EMBEDDING_DIMENSIONS` and the Atlas index |
| `EMBEDDING_DIMENSIONS` | — | `768` | Must match Atlas index `numDimensions` |
| `VECTOR_INDEX_NAME` | — | `vector_index` | Must match the Atlas Search index name |
| `PORT` | — | `8080` | Injected by Cloud Run automatically |
| `NODE_ENV` | — | `development` | `production` enables `secure` cookie flag |

---

## Adding a new backend route

1. Create controller in `backend/src/controllers/`. Use `next(err)` for errors;
   throw `new HttpError(statusCode, message)` for expected failures.
2. Add Zod schema to `utils/validation.ts` if the route takes a body.
3. Add a router file in `routes/` (or extend an existing one).
4. Mount it in `app.ts` under `/api/...`.
5. If auth is required, apply `requireAuth` at the router level (see
   `journal.routes.ts`), not per-handler.

---

## Adding a new frontend page

1. Add types to `src/types.ts` if new API shapes are involved.
2. Add API calls to `src/api/client.ts` using the `request<T>()` wrapper
   (`credentials: 'include'` is handled automatically).
3. Create the page component under `src/pages/`.
4. Add a `<Route>` in `src/App.tsx`. Protect it by checking `user` from
   `useAuth()` and redirecting to `/welcome` if null.

---

## AI service patterns

Chat/generation lives in `backend/src/services/llm.service.ts` (singleton `llm`,
NVIDIA OpenAI-compatible client). Embeddings live in
`backend/src/services/embedding.service.ts` (singleton `embeddings`, Gemini).

- **New structured extraction:** add a method on `llm` that calls
  `completeJson(system, user, temp)` with `response_format: { type: 'json_object' }`;
  describe the exact JSON keys in the system prompt and parse with the tolerant
  `parseJsonObject<T>()` helper. Always coerce/clamp the result (arrays, enums)
  since `json_object` mode isn't strict-schema.
- **New streaming endpoint:** add a method returning `this.streamChatCompletion(messages, temp)`
  (an `AsyncGenerator<string>`); in the controller `for await (const token of …) sse(res,'token',token)`.
- **New embedding use case:** call `embeddings.embed(text)`. In request paths wrap
  it best-effort (see `embedSafe` in `journal.controller.ts`) so a throttled
  Gemini key never breaks the request.
- **Language:** Kimi drifts to Chinese without steering — every system prompt
  includes "respond in English". Keep that in any new prompt.

---

## Debugging guide

### "Vector search returns nothing for a user"
Most likely causes:
1. The Atlas index is missing the `userId` filter field — recreate the index with
   both the `vector` and `filter` entries.
2. The index name doesn't match `VECTOR_INDEX_NAME`.
3. `numCandidates` too low relative to `limit`.
The `findSimilarEntries` function in `journal.controller.ts` degrades gracefully
to `[]` on error and logs a warning — check the server logs for
`"Vector search unavailable"`.

### "Login always fails despite correct password"
The user query is missing `.select('+password')`. Since `password` has
`select: false`, Mongoose omits it by default; `comparePassword` then runs
`bcrypt.compare(candidate, undefined)` which always returns false.

### "Auth cookie not sent by browser in dev"
The Vite proxy in `vite.config.ts` rewrites `/api` to `localhost:8080`. If you
call a backend URL directly from the browser (e.g., `localhost:8080`) instead of
`localhost:5173`, the cookie domain won't match and the browser won't send it.
Always use the Vite port (`5173`) in dev.

### "SSE stream hangs / no events arrive"
- Check that Express isn't buffering — `res.flushHeaders()` is called immediately
  after setting SSE headers in `createEntry`.
- Ensure no middleware (e.g., a compression middleware added later) is buffering
  the response.
- The frontend `streamJournalEntry` splits on `\n\n`. If the server emits a
  different delimiter the buffer never flushes — confirm the `\n\n` in the
  `sse()` helper is intact.

### "Frontend build fails on TypeScript errors"
`frontend/tsconfig.json` covers both `src/` and `vite.config.ts` in a single
config (`noEmit: true`, Vite does the actual bundling). There is **no**
`tsconfig.node.json` — don't add one with `composite: true` and `noEmit: true`
together; that combination breaks `tsc -b`.

### "Repo size approaching 10 MB"
`.gitignore` excludes `node_modules/`, `dist/`, `.env`, and `*.tsbuildinfo`.
Current committed size is ~728 KB. If it grows, check for accidentally committed
lock files from sub-directories or binary assets.

### "Helmet blocks the frontend in production"
`helmet()` sets a strict `Content-Security-Policy`. If you add inline scripts,
external fonts, or CDN assets, you'll need to configure CSP explicitly in `app.ts`:
```ts
app.use(helmet({ contentSecurityPolicy: { directives: { /* … */ } } }));
```

---

## Crisis safety system

`utils/safety.ts` provides `detectsCrisis(text, stressScore)`. It checks regex
patterns (self-harm/suicidal ideation) and triggers on `stressScore >= 9`.
When triggered, the controller emits a `crisis` SSE event with
`CRISIS_RESOURCE_MESSAGE` (India: Tele-MANAS 14416, iCall 9152987821).

If you add more crisis patterns, keep them in the `CRISIS_PATTERNS` array in
`safety.ts` — don't scatter them across controllers.

---

## TypeScript conventions

- Backend compiles to **CommonJS** (`"module": "CommonJS"` in `tsconfig.json`).
  Do not use top-level `import.meta` or ESM-only packages.
- Frontend uses **ESM** (`"module": "ESNext"`, bundled by Vite).
- `AuthenticatedRequest` in `auth.middleware.ts` extends `Request` with
  `userId?: string`. All protected controllers accept this type, not plain `Request`.
- `HttpError` is the only intentional error class. Zod errors and `HttpError`
  are handled specially in `error.middleware.ts`; everything else becomes a 500.
