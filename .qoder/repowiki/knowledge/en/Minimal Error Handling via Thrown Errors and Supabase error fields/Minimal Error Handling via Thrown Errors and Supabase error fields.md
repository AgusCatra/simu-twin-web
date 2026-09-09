---
kind: error_handling
name: Minimal Error Handling via Thrown Errors and Supabase error fields
category: error_handling
scope:
    - '**'
source_files:
    - src/services/visitasService.ts
    - src/lib/supabase.ts
---

## What system/approach is used

This repository uses a minimal, unstructured error-handling approach built on native JavaScript `Error` objects. There is no custom error class hierarchy, no centralized error codes, no middleware or global error boundary, and no `try/catch` blocks at the call sites. Errors are surfaced by throwing them directly from service functions, relying on Next.js's default error rendering to handle them.

## Key files and packages

- `src/services/visitasService.ts` — the only file in the codebase that performs error handling. It contains all three business operations (`obtenerEscuelas`, `verificarTurnoDisponible`, `crearSolicitudVisita`) and is where every error path lives.
- `src/lib/supabase.ts` — creates the Supabase client; it does not wrap errors, so failures bubble up as-is.
- `src/app/layout.tsx` and `src/app/page.tsx` — contain no error handling logic; they render UI without catching errors thrown by services.

## Architecture and conventions

1. **Supabase error propagation**: Every Supabase call destructures `{ data, error }` and immediately checks `if (error) throw error;`. This pattern appears in `obtenerEscuelas` (line 15), `verificarTurnoDisponible` (line 31), and `crearSolicitudVisita` (line 55). The service layer therefore never returns an error object — it either returns data or throws.

2. **Domain validation via thrown strings**: Business-rule violations are raised with `throw new Error('El turno seleccionado ya se encuentra ocupado');` (line 42 of `visitasService.ts`). This is a plain string message rather than a typed domain error, so callers cannot distinguish between a network/database error and a business-rule violation.

3. **No `try/catch` at call sites**: Neither `page.tsx` nor `layout.tsx` import or invoke these services, so there is no local error handling in this starter template. In a real app using these services, callers would need to add their own `try/catch` blocks since the services throw rather than return results.

4. **No global error boundaries or middleware**: There is no `error.tsx` / `global-error.tsx` route segment, no `middleware.ts`, no `unhandledrejection` handler, and no logging library configured. Errors will be handled by Next.js's default development error overlay and production error page.

5. **No `panic`/`recover` equivalent**: As a TypeScript/JavaScript project, there is no Go-style panic/recover; the only escape mechanism is `throw`.

## Conventions and constraints

Observed conventions (descriptive):
- Service functions adopt a "fail-fast" style: any Supabase `error` field causes an immediate `throw`, so successful calls always return typed data.
- Business-rule failures use `new Error(message)` with Spanish user-facing messages, which means callers must parse or inspect the message text to recognize specific conditions.
- The Supabase client is instantiated once in `lib/supabase.ts` and reused; no retry, timeout, or error transformation is applied at that layer.

Constraints enforced by the current code:
- Callers of `visitasService.ts` functions must be prepared to catch `Error` instances; there is no guarantee of a returned result.
- No structured error type exists yet, so distinguishing error categories (network vs. business rule) requires string comparison against the error message.

Gaps relative to typical Next.js apps:
- No `app/error.tsx` or `app/global-error.tsx` to present a user-friendly error page.
- No React Error Boundary wrapping components that call these services.
- No request-scoped error context or logging.