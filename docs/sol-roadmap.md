# fpl-cli Roadmap — for openclaw/hermes on DigitalOcean

Source: Sol (analysis.sol, `openrouter/openai/gpt-5.6-sol`), read-only analysis.
Driven by user answers: cron+user cadence, human first-login, all mutations need human approval, single team, openclaw owns alerting.

## Re-prioritization decisions

**Up:**
- C2 (captain/vice-captain dry-run) → immediate safety blocker (answer 3 forbids autonomous mutation)
- N4 (mutation plans + stale-state guards) → secures the human-approval gap between dry-run and confirm
- C1/C4/I4 (structured errors, fail-closed auth, exit taxonomy) → cron + on-demand need deterministic JSON
- F3/I3 (retry/timeout, concurrency-safe state) → cron + openclaw can overlap
- N2 (deadline + squad status polling) → openclaw needs a compact payload to alert from

**Down:**
- I1 (headless secret injection) → human does first login; only unattended refresh remains mandatory
- N1/N3 (snapshot, batch reads) → purpose-built status payload meets the need with less surface
- N5 (versioned success envelope) → typed errors solve it with less contract disruption
- F6/F7 (shared maps, bootstrap cache) → maintenance debt, not safety-critical

**Dropped:**
- I2 (multi-profile) → one server = one team (answer 4)
- In-CLI webhooks/schedulers/notifications → cron owns cadence, openclaw owns alerts (answer 5)
- Fully unattended first-login infra → interactive human bootstrap is fine (answer 2)

## Final sequenced roadmap

1. **[FIX] Process-level JSON error + fail-closed auth contract** — M, `src/api.ts` + `src/index.ts`
2. **[FIX] Every mutation dry-run by default + human-confirmed** (captain/vice-captain get `--confirm`) — M, `src/index.ts` + `src/commands/team.ts` + `CONTEXT.md`
3. **[FEAT] Approval-bound mutation plans with stale-state guards** (dry-run returns plan/fingerprint; confirm requires match) — L, `src/commands/{team,transfers}.ts` + `src/api.ts`
4. **[INFRA] Bounded timeout, retry/backoff, rate-limit handling** (no blind retry on mutations) — M, `src/api.ts` + `src/auth.ts`
5. **[FEAT] One clean deadline + squad-status polling command** (read-only: next GW, deadline, source/caveat, per-player status/news/chance) — M, `src/commands/status.ts` + `src/index.ts`
6. **[INFRA] Atomic + concurrency-safe token/config persistence** (temp+rename, lock around refresh, keep 0o600) — M, `src/auth.ts` + `src/config.ts`
7. **[FIX] Regression tests + static-quality gates** (Vitest: JSON errors, auth-required, dry-runs, stale-plan rejection, retry classification, validation, token persistence) — M, `package.json` + `tests/`
8. **[FIX] Remove stored plaintext password after successful human login** — S, `src/auth.ts` + `src/config.ts`

## First work item: structured errors + fail-closed auth

**Outcome:** every `--json` command returns exactly one JSON error object + documented non-zero exit code, for network failures, 429/5xx, expired/missing auth, invalid input.

**Steps:**
1. Define error taxonomy in `src/api.ts` — class with stable code, safe message, HTTP status, retryability. Codes: `AUTH_REQUIRED`, `NETWORK_ERROR`, `TIMEOUT`, `RATE_LIMITED`, `API_ERROR`. Keep all FPL HTTP in `api.ts`.
2. Fail-closed auth in `src/api.ts` — `authGet`/`authPost` call `getAccessToken()`; throw `AUTH_REQUIRED` if null ("Not logged in. Run: fpl login"). Never send authed request without `Authorization` header. Preserve `getLiveSquadState()`'s unauthenticated historical fallback + `source`/`caveat`.
3. Normalize fetch/HTTP failures in `src/api.ts` — catch rejected `fetch()`; classify 401/403=auth, 429=rate-limited, 5xx=retryable, other non-2xx=non-retryable. No retries here (that's item 4).
4. One async process boundary in `src/index.ts` — `program.parseAsync()`; catch all rejected actions; emit contract-compliant JSON error in json mode, concise human error otherwise. Replace `console.error()`/`process.exit()` validation branches.
5. Stable exit-code mapping in `src/index.ts` — input/config=2, auth=3, retryable net/rate-limit=4, remote API/permanent=5, unexpected=1. JSON keeps existing `error` string + adds `code` + `retryable`. Update `CONTEXT.md` (current "always exits 1" claim will be false).
6. Verify — `npm run build` passes; `npm run dev -- --json team --gw nope` → one JSON object + input-error exit; authed mutation with no token → `AUTH_REQUIRED`, no stack, no FPL request; mock fetch 401/429/500/reject → correct code+retryability+exit; one successful read → JSON shape unchanged.

**Invariants not to break:**
- Output: machine errors stay JSON under `--json`; no uncaught exceptions (`AGENTS.md`, `CONTEXT.md`)
- Layering: FPL HTTP stays in `src/api.ts`; no raw `fetch()` in commands (`AGENTS.md`)
- Live fallback: unauthenticated `team` may still return historical picks with `caveat: "no_auth_pending_changes_unknown"` — don't convert that fallback into an auth error
- Mutation safety: don't alter existing transfer/chip dry-run behavior
- Surface stability: retain existing `error` property; add fields, don't replace
