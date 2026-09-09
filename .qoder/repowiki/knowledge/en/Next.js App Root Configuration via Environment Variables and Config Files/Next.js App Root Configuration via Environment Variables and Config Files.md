---
kind: configuration_system
name: Next.js App Root Configuration via Environment Variables and Config Files
category: configuration_system
scope:
    - '**'
source_files:
    - next.config.ts
    - src/lib/supabase.ts
    - package.json
---

This repository is a Next.js 15 application (Turbopack-enabled) that uses the framework's built-in configuration system rather than a custom configuration library. The configuration approach consists of three layers:

**1. Build-time configuration file (`next.config.ts`)**
The project defines a TypeScript-based Next.js config at `next.config.ts`. It currently exports an empty `NextConfig` object, indicating no custom build-time overrides (e.g., rewrites, redirects, webpack tweaks) are applied. This follows Next.js convention where `next.config.ts` is auto-discovered at the project root.

**2. Runtime environment variables**
Runtime configuration is loaded exclusively through Node.js `process.env`, with values consumed directly in source code. The only usage found is in `src/lib/supabase.ts`, which reads two Supabase credentials via `process.env.NEXT_PUBLIC_SUPABASE_URL` and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`. These use the `NEXT_PUBLIC_` prefix, which tells Next.js to bundle them into the client-side JavaScript — appropriate for public-facing Supabase endpoints and anonymous keys. No `.env`, `.env.local`, or dotenv initialization files exist in the repo; environment variables are expected to be provided by the deployment/runtime environment.

**3. Project metadata and tooling config**
- `package.json` declares scripts (`dev`, `build`, `start`, `lint`) that drive the dev/build/start lifecycle and embeds runtime flags like `--turbopack`.
- `tsconfig.json`, `eslint.config.mjs`, and `postcss.config.mjs` configure TypeScript, linting, and CSS processing respectively — these are static tooling configs, not runtime configuration.

**Conventions observed:**
- All runtime secrets/URLs are externalized via environment variables; no hardcoded credentials appear in source.
- Client-accessible env vars follow the `NEXT_PUBLIC_` naming convention as required by Next.js.
- There is no centralized config loader, validation layer, or default-fallback mechanism — missing env vars will cause runtime errors (the Supabase client is constructed with non-null assertions `!`).
- No feature flags, per-environment config files (e.g., `.env.development`), or secret management integration (e.g., Vercel Secrets, AWS SSM) are present beyond raw `process.env` access.