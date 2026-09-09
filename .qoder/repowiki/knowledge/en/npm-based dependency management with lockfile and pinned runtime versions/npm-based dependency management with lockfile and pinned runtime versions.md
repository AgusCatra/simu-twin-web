---
kind: dependency_management
name: npm-based dependency management with lockfile and pinned runtime versions
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - package-lock.json
---

This Next.js application manages dependencies using **npm** (evidenced by `package-lock.json` at the repository root). There is no vendoring, no private registry configuration, and no monorepo workspace setup — it is a single-package project.

### What system/approach is used
- **Package manager**: npm, declared via `package.json` and locked by `package-lock.json` (lockfileVersion 3).
- **Runtime dependencies** are pinned to exact versions in `dependencies`: `next` `15.5.25`, `react` `19.1.0`, `react-dom` `19.1.0`, and `@supabase/supabase-js` `^2.116.0`.
- **Development dependencies** use caret ranges (`^`) for tooling: `eslint ^9`, `typescript ^5`, `tailwindcss ^4`, `@tailwindcss/postcss ^4`, `@types/* ^19/20`, `@eslint/eslintrc ^3`. The `eslint-config-next` devDependency is pinned to the same version as `next` (`15.5.25`) to keep the linter aligned with the framework.
- **Build scripts** in `scripts.dev`, `build`, `start`, and `lint` invoke `next dev --turbopack`, `next build --turbopack`, `next start`, and `eslint` respectively, so dependency resolution happens through npm during these commands.

### Key files
- `package.json` — declares all runtime and dev dependencies, scripts, and project metadata.
- `package-lock.json` — deterministic lockfile that pins every transitive dependency (including integrity hashes) resolved from the public npm registry; this is the source of truth for reproducible installs.
- `.gitignore` — implicitly excludes `node_modules/`, so dependencies are not committed beyond the lockfile.

### Architecture and conventions
- **Single package, flat structure**: No workspaces or sub-packages; all dependencies live under one `package.json`.
- **Exact pinning for critical runtime packages**: `next`, `react`, and `react-dom` are pinned to exact versions to avoid accidental drift between framework and UI libraries.
- **Caret ranges for tooling**: Dev-only tools (ESLint, TypeScript, Tailwind, types) use `^` ranges, allowing minor/patch updates without breaking the toolchain.
- **No vendoring or private registries**: All packages resolve from the default public npm registry (confirmed by `resolved` URLs like `https://registry.npmjs.org/...` in the lockfile). There is no `.npmrc`, no `npmrc` config, no `GOPRIVATE`, no `vendor/` directory, and no custom registry overrides.
- **Lockfile-driven reproducibility**: The presence of `package-lock.json` means CI or any developer environment should run `npm ci` (or equivalent) to install an exact snapshot of the dependency tree rather than resolving fresh.

### Conventions and constraints
- Runtime dependencies (`next`, `react`, `react-dom`) are pinned to exact versions in `package.json`; devDependencies use caret ranges.
- The lockfile is committed to version control and serves as the canonical dependency graph; `node_modules` is ignored.
- No private/internal packages are referenced — all imports resolve to public npm packages.
- Scripts tie dependency usage directly to the Next.js CLI (`next dev --turbopack`, `next build --turbopack`), so dependency upgrades must be coordinated around the Next.js release cycle.