---
kind: logging_system
name: Logging System — Ad-hoc console.log Usage
category: logging_system
scope:
    - '**'
source_files:
    - src/app/admin/registro-actividades/actions.ts
    - src/app/admin/visitas-educativas/actions.ts
    - src/app/visitas/actions.ts
    - src/app/admin/tup/actions.ts
    - src/app/admin/registro-actividades/page.tsx
    - src/app/admin/tup/page.tsx
    - src/components/admin/actividades/RackSimuladores.tsx
    - src/components/admin/tup/CardTrasladoTup.tsx
---

## What system/approach is used

The repository does not use any logging framework or library. There are no dependencies for structured logging (no `pino`, `winston`, `bunyan`, `debug`, `@sentry`, etc.) and no logger initialization code. All diagnostics go through the built-in browser/Node `console` API (`console.error`, `console.warn`).

## Key files and packages

- `src/app/admin/registro-actividades/actions.ts` — server actions log errors with a context string plus an object payload.
- `src/app/admin/visitas-educativas/actions.ts` — same pattern as above.
- `src/app/visitas/actions.ts` — same pattern.
- `src/app/admin/tup/actions.ts` — logs update failures via `console.error`.
- `src/app/admin/registro-actividades/page.tsx` — logs load failures with bracketed module tags like `[registro-actividades]`.
- `src/app/admin/tup/page.tsx` — similar bracketed tag pattern.
- `src/components/admin/actividades/RackSimuladores.tsx` — client-side error logging.
- `src/components/admin/tup/CardTrasladoTup.tsx` — client-side warning logging.

No dedicated logging utility, config, or middleware exists; each file imports nothing for logging.

## Architecture and conventions

Observed patterns across the codebase:

1. **Console-only output**: Every diagnostic call uses `console.error` or `console.warn`; there is no `console.info` / `console.debug` usage.
2. **Contextual first argument**: Server action files pass a human-readable context string as the first argument to `console.error`, e.g. `contexto` variable or inline strings like `[actualizarEstadoTrasladoAction] Error al actualizar:`.
3. **Structured payload as second argument**: Errors include a plain object literal as the second argument, e.g. `{ error: resultado.error }`, giving a minimal structured shape even though it is emitted via `console.error` rather than a structured logger.
4. **Bracketed module tags on the client**: Frontend components prefix messages with a bracketed identifier such as `[RackSimuladores]`, `[CardTrasladoTup]`, `[registro-actividades]`, `[/admin/tup]` to distinguish sources in the browser console.
5. **Error vs. warning distinction**: `console.error` is used for failure paths (DB errors, rejected mutations); `console.warn` is used for non-fatal issues (e.g. inability to update state).
6. **No log levels, sinks, or transport configuration**: There is no central place to set log levels, rotate files, or route output to external services.
7. **No suppression of production logs**: The codebase contains no environment-based gating (e.g. `if (process.env.NODE_ENV !== 'production')`) around console calls.

## Conventions and constraints

- **Convention observed**: When logging an error from a server action, the call follows the shape `console.error(contexto, { error })`, where `contexto` is a descriptive string and the second argument is a single-property object carrying the error value.
- **Convention observed**: Client-side component logs use a bracketed module-name prefix inside the message string.
- **Constraint enforced by absence**: No third-party logging dependency is declared in `package.json`; adding one would require updating the manifest and importing it explicitly.
- **No documented logging policy** was found in `README.md` or elsewhere in the repo.