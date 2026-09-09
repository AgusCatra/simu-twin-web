---
kind: build_system
name: Next.js Turbopack Build with npm Scripts and TypeScript/ESLint Toolchain
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - next.config.ts
    - tsconfig.json
    - eslint.config.mjs
    - postcss.config.mjs
---

## What system/approach is used

This project uses **Next.js 15** as its build and runtime framework, with **Turbopack** enabled for both development (`next dev --turbopack`) and production builds (`next build --turbopack`). The build pipeline is driven entirely by **npm scripts** defined in `package.json`, with no Makefile, Dockerfile, or CI configuration present. TypeScript compilation is delegated to Next.js (via the `next` tsconfig plugin) with `noEmit: true`, meaning TS is type-checked but not compiled to JS by tsc directly. Styling is processed through **PostCSS + Tailwind CSS v4** (`@tailwindcss/postcss`). Linting uses **ESLint 9 flat config** (`eslint.config.mjs`) extending `next/core-web-vitals` and `next/typescript`.

## Key files and packages

- `package.json` — defines all build/dev/lint scripts and dependency versions; pins Next.js 15.5.25, React 19.1.0, TypeScript 5.x, ESLint 9.x, Tailwind 4.x.
- `next.config.ts` — empty Next.js config object (default behavior); no custom webpack, output, or asset overrides.
- `tsconfig.json` — strict mode, ES2017 target, bundler module resolution, path alias `@/* → ./src/*`, incremental compilation, includes generated `.next/types`.
- `eslint.config.mjs` — flat config using `FlatCompat` to extend Next's recommended configs; ignores `node_modules`, `.next`, `out`, `build`, and `next-env.d.ts`.
- `postcss.config.mjs` — registers `@tailwindcss/postcss` as the sole PostCSS plugin.
- `public/` — static assets served at `/` during dev/build.

## Architecture and conventions

- **Script-driven workflow**: All build actions are npm scripts — `dev` for local development with Turbopack, `build` for production optimization, `start` for serving the built app, and `lint` for code quality checks. There is no separate packaging step; Next.js produces an optimized `.next` build directory.
- **TypeScript integration**: Types are enforced via `strict: true` and the Next.js tsconfig plugin; source files live under `src/` and are imported using the `@/*` path alias configured in `tsconfig.json`.
- **Styling pipeline**: CSS goes through PostCSS with Tailwind v4; no additional preprocessors (Sass/Less) are configured.
- **Linting rules**: Follows Next.js recommended web vitals and TypeScript rules via `eslint-config-next`; generated and third-party directories are excluded from linting.

## Conventions and constraints

- **No external build orchestrator**: There is no Makefile, shell-based build script, Dockerfile, or CI pipeline file (e.g., GitHub Actions, GitLab CI). Build and deployment must be performed via `npm run build` and `npm start` on a Node.js environment that supports Next.js 15.
- **Turbopack is mandatory for dev/build**: Both `dev` and `build` scripts explicitly pass `--turbopack`; omitting it would fall back to the legacy webpack-based pipeline.
- **Strict TypeScript enforcement**: `strict: true`, `isolatedModules: true`, and `noEmit: true` require all source files to be valid TypeScript and prevent accidental tsc output outside of Next.js's own build.
- **Path aliases**: Imports should use the `@/` prefix (e.g., `@/lib/supabase`) rather than relative paths into `src/`, as this is the only alias configured.
- **Static assets**: Files placed in `public/` are copied verbatim to the build output root; dynamic assets should go through Next.js image/font loaders instead.
- **Version pinning**: Dependencies are pinned to exact minor versions (e.g., `next: "15.5.25"`, `react: "19.1.0"`) in `package.json`, ensuring reproducible builds across environments.