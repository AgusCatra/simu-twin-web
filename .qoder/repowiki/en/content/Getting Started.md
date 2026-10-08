# Getting Started

<cite>
**Referenced Files in This Document**
- [package.json](file:///c:/Users/catra/Desktop/simu-twin-web/package.json)
- [README.md](file:///c:/Users/catra/Desktop/simu-twin-web/README.md)
- [docs/WIKI.md](file:///c:/Users/catra/Desktop/simu-twin-web/docs/WIKI.md)
- [next.config.ts](file:///c:/Users/catra/Desktop/simu-twin-web/next.config.ts)
- [tsconfig.json](file:///c:/Users/catra/Desktop/simu-twin-web/tsconfig.json)
- [src/lib/supabase/client.ts](file:///c:/Users/catra/Desktop/simu-twin-web/src/lib/supabase/client.ts)
- [src/lib/supabase/server.ts](file:///c:/Users/catra/Desktop/simu-twin-web/src/lib/supabase/server.ts)
- [src/services/visitasService.ts](file:///c:/Users/catra/Desktop/simu-twin-web/src/services/visitasService.ts)
- [supabase/migrations/0001_rls_visitas_educativas.sql](file:///c:/Users/catra/Desktop/simu-twin-web/supabase/migrations/0001_rls_visitas_educativas.sql)
- [supabase/migrations/0003_agregar_columnas_tup.sql](file:///c:/Users/catra/Desktop/simu-twin-web/supabase/migrations/0003_agregar_columnas_tup.sql)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Database & Migrations Setup](#database--migrations-setup)
5. [Environment Configuration](#environment-configuration)
6. [Running the Application](#running-the-application)
7. [Development Workflow & Scripts](#development-workflow--scripts)
8. [Conclusion](#conclusion)

---

## Introduction
This guide walks you through setting up and running **Simu-Twin Web** locally. The platform combines a Three.js 3D Digital Twin, public booking for educational visits, municipal transit logistics (TUP), and a live simulator equipment rack with administrative controls.

---

## Prerequisites
Before starting, ensure you have:
- **Node.js**: `v20.x` or higher (LTS recommended)
- **Package Manager**: `npm` (bundled with Node.js) or `pnpm`
- **Supabase Account**: A Supabase project with PostgreSQL database access
- **Modern Web Browser**: Chrome, Edge, Firefox, or Safari with WebGL enabled for 3D graphics

---

## Installation

```bash
# 1. Clone the repository
git clone <repository-url>
cd simu-twin-web

# 2. Install dependencies
npm install
```

---

## Database & Migrations Setup

In your Supabase project dashboard, open the **SQL Editor** and execute the migration files located in `supabase/migrations/` in sequential order:

1. [`supabase/migrations/0001_rls_visitas_educativas.sql`](file:///c:/Users/catra/Desktop/simu-twin-web/supabase/migrations/0001_rls_visitas_educativas.sql):
   - Enables Row-Level Security (RLS) on `visitas_educativas`, `visita_asistentes`, `escuelas`, and `fechas_habilitadas`.
   - Protects student personal information (DNI and birthdate) from anonymous reads.
   - Installs the `trg_forzar_checks_no_autenticados` trigger.
2. [`supabase/migrations/0003_agregar_columnas_tup.sql`](file:///c:/Users/catra/Desktop/simu-twin-web/supabase/migrations/0003_agregar_columnas_tup.sql):
   - Adds municipal transit columns (`tup_horario_ida_desde`, `tup_chofer_nombre`, `tup_estado_traslado`, etc.).
   - Adds time range validation checks and partial index `idx_visitas_tup_panel`.

---

## Environment Configuration

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

---

## Running the Application

### Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

- **`/`**: Institutional Landing Page with embedded Three.js 3D Digital Twin and SCADA HUD.
- **`/visitas`**: Public 5-step Educational Visits reservation wizard.
- **`/login`**: Administrative authentication portal.
- **`/admin`**: Protected admin hub.
- **`/admin/visitas-educativas`**: Educational visits approval, operational checklist, and Excel export.
- **`/admin/tup`**: Mobile dispatch board for municipal bus drivers.
- **`/admin/registro-actividades`**: Real-time simulator equipment rack and session tracker.

---

## Development Workflow & Scripts

| Script | Command | Purpose |
| :--- | :--- | :--- |
| `dev` | `next dev` | Starts development server with hot reloading |
| `build` | `next build --turbopack` | Compiles optimized production bundle with Turbopack |
| `start` | `next start` | Runs the compiled production server |
| `lint` | `eslint` | Executes ESLint static code quality checks |

---

## Conclusion
You are now ready to develop, test, and deploy Simu-Twin Web. For in-depth architectural and functional documentation in Spanish, refer to the **[Wiki Oficial (docs/WIKI.md)](file:///c:/Users/catra/Desktop/simu-twin-web/docs/WIKI.md)**.