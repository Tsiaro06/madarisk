# AGENTS.md

Monorepo (no shared tooling) for **MadaRisk Map**, a crisis-management GIS platform:
- `backend/` — Express + TypeScript REST API (PostgreSQL 16 + PostGIS), port 5000 under `/api/v1`, Swagger at `/api/docs`
- `frontend/` — React 19 + Vite + Tailwind v4 SPA, port 5173

Both packages must be handled independently (`cd backend` / `cd frontend`).

## Commands

### backend (`D:\MadaRisk\backend`)
- `npm run dev` — start API (`tsx watch src/server.ts`), requires running DB + `.env`
- `npm run db:migrate` / `npm run db:seed` / `npm run db:check` — DB via `tsx`
- `npm run db:seed` creates demo account `admin@madarisk.mg` / `Admin@123!`
- Verification order: `npm run lint` (eslint, `--max-warnings 0`) → `npm run typecheck` (`tsc --noEmit`) → `npm test` (vitest)
- Formatting is Prettier (`npm run format`), enforced separately from lint; run `npm run format:check` too

### frontend (`D:\MadaRisk\frontend`)
- `npm run dev` — Vite on 5173, proxies `/api` and `/health` to `http://localhost:5000`
- `npm run build` = `tsc -b && vite build` — this IS the typecheck; there is no separate typecheck script
- `npm run lint` is **oxlint** (not eslint); config in `.oxlintrc.json`
- **No test framework/script exists** — verify with `npm run lint` then `npm run build`

## Frontend conventions
- Path alias `@/*` → `src/*` (configured in both `vite.config.ts` and tsconfig); always use `@/...` imports
- TS strict + `noUnusedLocals`/`noUnusedParameters`; `verbatimModuleSyntax` is on, so type-only imports MUST use `import type`
- Types: `src/types/` (`ApiSuccess<T>`, `ApiError`, per-module API types); Zod schemas in `src/schemas/` mirror backend validators
- XHR goes through `src/api/client.ts` only — it unwraps `{ success, message, data, meta }`, throws `ApiClientError` (`status`, `errors[]`, `retryAfter`), and auto-refreshes on 401 (retry once, then logout). Never bypass it with raw axios.
- Auth: `accessToken` in memory, `refreshToken` in `localStorage` under `madarisk_refresh_token` (handled by `src/stores/authStore.ts` via `bindAuthHandlers`)
- UI copy / field labels / toasts are in **French** (crisis-room UX); keep that when adding UI strings
- Use TanStack Query for server state (staleTime 30s, retry 1, no refetch on window focus — set in `src/App.tsx`)

## Contracts & data
- API contract source of truth is `backend/src/docs/openapi.yaml` (served at `/api/docs`); regenerate/update the frontend when the backend spec changes
- Backend responses: success `{ success: true, message, data, meta? }`, error `{ success: false, message, errors?: [{ field, message }] }`; map 422 `errors[]` onto form fields, respect `Retry-After` on 429

## Gotchas
- `backend/.env` is gitignored but `docker-compose.yml` mounts it as read-only — missing it breaks docker runs
- Frontend has no test setup; do not invent one unless asked
- The backend API must be running for frontend dev work (proxy target `localhost:5000`); `VITE_API_URL` defaults to `/api/v1`