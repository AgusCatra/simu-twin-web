---
kind: frontend_style
name: Tailwind CSS v4 with CSS-based Design Tokens and Dark Mode
category: frontend_style
scope:
    - '**'
source_files:
    - src/app/globals.css
    - postcss.config.mjs
    - package.json
    - next.config.ts
---

## Styling System Overview

The project uses **Tailwind CSS v4** integrated via the new `@tailwindcss/postcss` plugin (PostCSS) rather than a traditional `tailwind.config.js`. Styles are authored in a single global stylesheet at `src/app/globals.css`, which is imported by the Next.js App Router layout.

## Key Files and Packages

- `src/app/globals.css` — the sole source of styling, importing Tailwind and declaring design tokens.
- `postcss.config.mjs` — registers `@tailwindcss/postcss` as the only PostCSS plugin.
- `package.json` — declares `tailwindcss: ^4` and `@tailwindcss/postcss: ^4` as dev dependencies; no UI component library or CSS-in-JS runtime is installed.
- `next.config.ts` — empty Next.js config; no custom CSS/asset pipeline overrides.

## Architecture and Conventions

### Tailwind CSS v4 approach
- Uses the v4 import syntax `@import "tailwindcss"` instead of the older `@tailwind base/components/utilities` directives.
- No `tailwind.config.js` exists; configuration is expected to be inline or theme-driven via CSS variables, consistent with Tailwind v4’s shift toward CSS-first theming.

### Design tokens via CSS custom properties
- Light-mode defaults are declared on `:root`: `--background: #ffffff` and `--foreground: #171717`.
- These are exposed to Tailwind through an `@theme inline` block that maps `--color-background` / `--color-foreground` and sets `--font-sans` / `--font-mono` to Geist fonts (`--font-geist-sans`, `--font-geist-mono`).
- The `body` rule applies these tokens directly (`background: var(--background); color: var(--foreground)`), making the root colors available throughout the app without Tailwind utility classes.

### Dark mode strategy
- A `@media (prefers-color-scheme: dark)` media query redefines `--background` to `#0a0a0a` and `--foreground` to `ededed`, enabling automatic system-preference–driven dark mode. No explicit class toggling or JS dark-mode logic is present.

### Typography
- The `body` font stack is explicitly set to `Arial, Helvetica, sans-serif`, overriding the Geist font family for body text despite the token mapping in `@theme inline`. This suggests the Geist fonts may be intended for headings or other elements while body text falls back to system sans-serif.

### Component-level styling
- There are no component-scoped CSS files, SCSS modules, styled-components, or emotion/styled-jsx usage visible. All visual styling appears to be applied via Tailwind utility classes directly in JSX components (the App Router pages/layouts), keeping the styling surface minimal and centralized.

## Constraints and Enforced Rules

- **Single global stylesheet**: All styles flow through `src/app/globals.css`; there are no per-component CSS files or module imports observed.
- **No third-party UI library**: The dependency list contains only React, Next.js, Supabase client, and Tailwind tooling — no Shadcn, Material UI, Ant Design, Chakra, etc.
- **PostCSS-only pipeline**: Styling is processed exclusively through PostCSS with the `@tailwindcss/postcss` plugin; no Sass/Less preprocessors are configured.
- **Dark mode is automatic**: Theme switching relies solely on the browser’s `prefers-color-scheme` media query; no programmatic dark-mode toggle is implemented in the codebase reviewed.
- **Font tokens point to Geist but body uses system fonts**: The `@theme inline` block maps `--font-sans` to `var(--font-geist-sans)`, yet the `body` rule hardcodes `Arial, Helvetica, sans-serif`, creating a slight inconsistency between token intent and runtime behavior.