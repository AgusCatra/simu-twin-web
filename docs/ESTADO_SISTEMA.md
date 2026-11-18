# Radiografía de Arquitectura, UX y Estado de Producción · SimuCore Twin

> **Fecha de auditoría:** 2026-11-18T17:28-03:00  
> **Repositorio:** `AgusCatra/simu-twin-web` (rama `main`)  
> **Entorno productivo:** `https://simu-twin-web.catramado17.workers.dev`

---

## 1. Árbol de Navegación y Layouts (`src/app` y `src/components`)

Todas las rutas internas (`/admin/*`, `/gestion/cohortes`, `/cabina/evaluacion`) comparten un único shell administrativo persistente ([PanelLayoutShell.tsx](file:///c:/Users/catra/Desktop/simu-twin-web/src/components/admin/PanelLayoutShell.tsx)), que renderiza el menú lateral persistente [Sidebar.tsx](file:///c:/Users/catra/Desktop/simu-twin-web/src/components/admin/Sidebar.tsx) (`hidden lg:flex lg:sticky lg:top-0 lg:h-screen`, oculto únicamente para el rol operativo móvil `chofer_tup`) y la barra superior [Topbar.tsx](file:///c:/Users/catra/Desktop/simu-twin-web/src/components/admin/Topbar.tsx) (con breadcrumb, reloj en vivo, badge de rol, navegación horizontal en pantallas chicas y cierre de sesión).

### Mapeo explícito Ruta → Layout → Contenedor

| Ruta interna | Archivo `page.tsx` | Layout asignado | Wrapper compartido | Menú lateral persistente |
| --- | --- | --- | --- | --- |
| `/admin` | `src/app/admin/page.tsx` | `src/app/admin/layout.tsx` | `PanelLayoutShell` (`Sidebar` + `Topbar`) | Sí (desktop sticky; móvil en `Topbar`) |
| `/admin/insumos` | `src/app/admin/insumos/page.tsx` | `src/app/admin/layout.tsx` | `PanelLayoutShell` (`Sidebar` + `Topbar`) | Sí + `NavegacionRapidaEscuelas` |
| `/admin/registro-actividades` | `src/app/admin/registro-actividades/page.tsx` | `src/app/admin/layout.tsx` | `PanelLayoutShell` (`Sidebar` + `Topbar`) | Sí |
| `/admin/tup` | `src/app/admin/tup/page.tsx` | `src/app/admin/layout.tsx` | `PanelLayoutShell` (`Sidebar` + `Topbar`) | Sí + `NavegacionRapidaEscuelas` |
| `/admin/visitas-educativas` | `src/app/admin/visitas-educativas/page.tsx` | `src/app/admin/layout.tsx` | `PanelLayoutShell` (`Sidebar` + `Topbar`) | Sí + `NavegacionRapidaEscuelas` |
| `/gestion/cohortes` | `src/app/gestion/cohortes/page.tsx` | `src/app/gestion/layout.tsx` | `PanelLayoutShell` + `max-w-7xl` (`Sidebar` + `Topbar`) | Sí |
| `/cabina/evaluacion` | `src/app/cabina/evaluacion/page.tsx` | `src/app/cabina/layout.tsx` | `PanelLayoutShell` (`Sidebar` + `Topbar`) | Sí |

*(Rutas públicas excluidas del shell administrativo: `/` [`src/app/page.tsx`], `/visitas` [`src/app/visitas/page.tsx`] y `/login` [`src/app/login/page.tsx`], que heredan solo `src/app/layout.tsx`).*

### Árbol real de archivos (`src/app` y `src/components`)

```text
src/
├── app/
│   ├── admin/
│   │   ├── layout.tsx                        # PanelLayoutShell (Sidebar + Topbar)
│   │   ├── page.tsx                          # Inicio del Centro (4 KPIs + InicioCentroTabs)
│   │   ├── insumos/
│   │   │   ├── actions.ts
│   │   │   └── page.tsx                      # Stock y Refrigerios (+ NavegacionRapidaEscuelas)
│   │   ├── registro-actividades/
│   │   │   ├── actions.ts
│   │   │   └── page.tsx                      # Bitácora y Simuladores
│   │   ├── tup/
│   │   │   ├── actions.ts
│   │   │   └── page.tsx                      # Colectivo TUP (+ NavegacionRapidaEscuelas)
│   │   └── visitas-educativas/
│   │       ├── actions.ts
│   │       └── page.tsx                      # Escuelas y Visitas (+ NavegacionRapidaEscuelas)
│   ├── cabina/
│   │   ├── layout.tsx                        # PanelLayoutShell (Sidebar + Topbar)
│   │   └── evaluacion/
│   │       └── page.tsx                      # Evaluar en Cabina / Patio (ConsolaTactil)
│   ├── gestion/
│   │   ├── layout.tsx                        # PanelLayoutShell + max-w-7xl (Sidebar + Topbar)
│   │   └── cohortes/
│   │       └── page.tsx                      # Cursos y Alumnos (CabeceraConfiguracion + PanelCohortesTabs)
│   ├── login/page.tsx                        # Pública (sin Sidebar/Topbar)
│   ├── visitas/                              # Pública (sin Sidebar/Topbar)
│   ├── layout.tsx                            # Root Layout
│   ├── globals.css                           # Estilos globales + @media print (.hoja-cronograma / .hoja-legajo-360)
│   └── page.tsx                              # Landing pública
└── components/
    ├── admin/
    │   ├── InicioCentroTabs.tsx
    │   ├── NavegacionRapidaEscuelas.tsx
    │   ├── PanelGestionRoles.tsx
    │   ├── PanelLayoutShell.tsx
    │   ├── Sidebar.tsx
    │   ├── Topbar.tsx
    │   ├── actividades/{FormularioActividadModal,PanelEstadisticasCentro,PanelSesionEnVivo,RackSimuladores,TablaActividades}.tsx
    │   ├── stock/PanelStock.tsx
    │   ├── tup/{CardTrasladoTup,PanelLogisticaTup}.tsx
    │   └── visitas/{ModalEditarVisita,ModalNominaVisita,TablaVisitasAdmin}.tsx
    ├── auth/{BadgeRolYSesion,FormularioLogin}.tsx
    ├── cabina/ConsolaTactil.tsx
    ├── empleo/
    │   ├── AccionesCohorte.tsx
    │   ├── BotonExportarCronograma.tsx
    │   ├── BotonLiberarPuesto.tsx
    │   ├── CabeceraConfiguracion.tsx
    │   ├── DrawerPostulante.tsx
    │   ├── GrillaDuplas.tsx
    │   ├── Legajo360Imprimible.tsx
    │   ├── ModalLoteTelemetria.tsx
    │   ├── ModalNuevaCohorte.tsx
    │   ├── ModalNuevoPostulante.tsx
    │   ├── PanelCohortesTabs.tsx
    │   ├── PanelDuplasYPostulantes.tsx
    │   ├── PanelImpactoIndustrialCohorte.tsx
    │   ├── ParrillaCabina.tsx
    │   ├── RadarCuatroEjes.tsx
    │   ├── SelectorCohorte.tsx
    │   ├── Sheet.tsx
    │   └── TablaPostulantes.tsx
    ├── gemelo/
    │   ├── GemeloGalponCanvas.tsx             # Lienzo WebGL 3D (única escena oscura preservada)
    │   └── VisorNave3D.tsx
    ├── landing/{CarruselExperiencias,Footer,MetricasCentro,Navbar,SeccionVisitas}.tsx
    ├── ui/BotonVolver.tsx
    └── visitas/{FormularioVisita,GridNomina}.tsx
```

---

## 2. Auditoría de Modo Claro Administrativo (Chequeo de Clases CSS)

Se ejecutó `git grep` sobre `src/app` y `src/components` excluyendo `src/components/gemelo/GemeloGalponCanvas.tsx` buscando los tokens solicitados (`slate-900`, `slate-950`, `zinc-900`, `zinc-950`, `gray-900`, `neutral-900`, `bg-black`):

- **Coincidencias totales (incluyendo tipografía `text-slate-900` y rutas públicas `/`, `/login`, `/visitas`):** `335` líneas en `src/app` + `src/components`, de las cuales `260` corresponden al ámbito interno y `75` a rutas/componentes públicos intactos (`/`, `/login`, `/visitas`).
- **Coincidencias de fondos/contenedores oscuros (`bg-slate-900`, `bg-slate-950`, `bg-zinc-900`, `bg-zinc-950`, `bg-gray-900`, `bg-neutral-900`, `bg-black`) dentro del ámbito administrativo interno** (`src/app/{admin,gestion,cabina}`, `src/components/{admin,empleo,cabina}`, `BadgeRolYSesion.tsx`, `BotonVolver.tsx`, `VisorNave3D.tsx`): **`14` líneas**, distribuidas exactamente así:
  - **0** contenedores o tarjetas de pantalla con `bg-slate-950`, `bg-zinc-900`, `bg-zinc-950`, `bg-gray-900`, `bg-neutral-900` o `bg-black` en UI renderizada (solo 1 comentario JSDoc en `src/components/admin/stock/PanelStock.tsx:34` menciona `bg-zinc-950`).
  - **10** backdrops semitransparentes de modales/draweres (`bg-slate-900/45`, `bg-slate-900/50`, `bg-slate-900/60` con `backdrop-blur-xs`).
  - **2** botones primarios de alto contraste (`bg-slate-900 text-white` en `ModalNominaVisita.tsx:323` y `DrawerPostulante.tsx:1032`).
  - **1** fallback de carga del visor WebGL 3D (`VisorNave3D.tsx:32`, `bg-slate-900` acompañando a `GemeloGalponCanvas.tsx`).

### Pestañas (Tabs) implementadas

- **`/admin` (`src/components/admin/InicioCentroTabs.tsx`):**
  1. `Accesos Rápidos y Agenda`
  2. `Galpón 3D en Vivo`
  3. `Usuarios y Permisos` *(visible solo para `superadmin`)*
- **`/gestion/cohortes` (`src/components/empleo/PanelCohortesTabs.tsx` + `CabeceraConfiguracion.tsx` colapsable por defecto detrás de `Configurar Días y Horarios`):**
  1. `Alumnos y Legajos` *(con botón destacado `Subir Reportes del Simulador` y `TablaPostulantes`)*
  2. `Turnos y Duplas` *(con cronograma semanal de duplas/recuperos y `GrillaDuplas`)*
  3. `Resultados para Empresas` *(con `PanelImpactoIndustrialCohorte`)*

---

## 3. Estado de Base de Datos y Esquema Titán

### Migraciones en `supabase/migrations/` (13 archivos)

| # | Archivo de migración | Estado |
| --- | --- | --- |
| 1 | `0001_rls_visitas_educativas.sql` | Versionada en repo |
| 2 | `0003_agregar_columnas_tup.sql` | Versionada en repo |
| 3 | `0004_modulo_admision_cohortes_evaluacion.sql` | Versionada en repo |
| 4 | `0005_gestion_empleo_sheets.sql` | Versionada en repo |
| 5 | `0006_extender_evaluacion_cabina.sql` | Versionada en repo |
| 6 | `0007_cupo_dinamico_titulares.sql` | Versionada en repo |
| 7 | `0008_evaluacion_multi_intento.sql` | Versionada en repo |
| 8 | `0008_modelo_duplas_16.sql` | Versionada en repo |
| 9 | `0009_unificacion_titan_roles_cohortes.sql` | Versionada en repo |
| 10 | `0010_legajo360_terreno_sesiones.sql` | Versionada en repo |
| 11 | `0011_terreno_horas_decision_instructor.sql` | Versionada en repo |
| 12 | `0012_etapa_practica_intermedia.sql` | **Aplicada y confirmada en Supabase Cloud** |
| 13 | `20261008_modulo_admision_v1.sql` | Versionada en repo |

*Verificación en vivo sobre Supabase Cloud (esquema OpenAPI PostgREST de `public.evaluacion_diagnostico.etapa`):* `"format": "character varying"`, `"maxLength": 32`, `"description"` actualizado con `'DIAG_INTENTO_1'`, `'DIAG_INTENTO_2'`, `'FINAL'` y `'PRACTICA_INTERMEDIA'`. Nota: la columna `exercise_name` no existe como columna top-level en `public.evaluacion_diagnostico`, sino que se almacena dentro de `telemetria_metricas` (JSONB).

### Conteo actual de registros en Supabase Cloud

| Tabla | Registros actuales | Desglose / Detalle |
| --- | ---: | --- |
| `public.postulantes` | **36** | Postulantes reales activos sincronizados |
| `public.cohorte_inscripciones` | **36** | Inscripciones vinculadas a la cohorte |
| `public.evaluacion_diagnostico` | **64** | `DIAG_INTENTO_1`: **34** · `DIAG_INTENTO_2`: **30** · `FINAL`: **0** · `PRACTICA_INTERMEDIA`: **0** |
| `public.simuladores` | **7** | `autoelevador`, `camion`, `excavadora`, `grua`, `retroexcavadora`, `simspray`, `tractor` (todos en estado `libre`, `horas_uso_totales`: `0`) |
| `public.stock_insumos` | **3** | Artículos cargados en el pañol de visitas/refrigerios |

---

## 4. Flujo de Datos y Reglas de Negocio Activas

| Regla / Módulo | Comportamiento implementado en código | Fuente de verdad |
| --- | --- | --- |
| **Discriminación de ejercicios** | `esMediumLoadOperation(exerciseName)` normaliza espacios/minúsculas y compara exacto contra `"medium load operation"`. Si coincide (o el reporte no informa `exerciseName`), clasifica cronológicamente en `DIAG_INTENTO_1` / `DIAG_INTENTO_2` (T0) o `FINAL` (T1). Cualquier otro `Exercise Name` se guarda como `PRACTICA_INTERMEDIA` con `es_mejor_diagnostico = false`, `Indice de Cuidado de la Máquina` y `delta_score = null`, **excluido** de `deltas_t0_t1` y percentiles del curso. | `src/lib/telemetria/analitica-predictiva.ts`, `src/services/empleo.ts`, `scripts/parse_simuladores.py`, `scripts/sync_supabase.py` |
| **Cómputo de horas (Duplas vs Odómetro `SIM-01`)** | Nunca se usa la duración del PDF (`tiempo_vuelta_seg`) para horas formativas ni para el odómetro de `SIM-01`. Cada sesión de 1 h en dupla acredita **`1.0 h` completa a cada alumno presente** (`horas_por_sesion_simulador = 1.0`, sumado a `2.0 h` teoría + `1.0 h` diag/final + `1.5 h` patio). Al marcar asistencia en `sesiones_practica`, `SIM-01` (`autoelevador`) suma **`+1.0 h` reloj una sola vez por turno de dupla** (transición `0 → >=1 PRESENTE`). | `src/lib/horas-capacitacion.ts`, `src/services/empleo.ts` |
| **Política Cero Storage ($0)** | Los reportes `.pdf` y `.json` del simulador se parsean en navegador (`pdfjs-dist`) o en lote local Python extrayendo únicamente métricas, curvas y `exerciseName` en JSONB/SQL sin subir archivos binarios a Supabase Storage. | `src/components/empleo/ModalLoteTelemetria.tsx`, `src/components/empleo/DrawerPostulante.tsx`, `scripts/parse_simuladores.py` |
| **Evaluación en Tablet (Cabina + Práctica Real en Patio)** | `ConsolaTactil` (`/cabina/evaluacion`) ofrece 4 modos táctiles: `DIAG_INTENTO_1`, `DIAG_INTENTO_2`, `FINAL` (con reloj Split `30/30` de 1800s/3600s, alarma sonora, ejes `0/10/20`, `Falta crítica` y conmutación de `SIM-01` en 3D) y `PRACTICA_REAL` (asistencia en patio, máquina física, predio, horas base/extra y decisión final del instructor directo a SQL sin adjuntos en Storage). | `src/components/cabina/ConsolaTactil.tsx`, `src/services/cabina.ts`, `src/services/empleo.ts` |

---

## 5. Estado de Despliegue en Producción

- **Último commit en `origin/main`:** `e77201c6e59b82bc8f4f9dd3790bfc332e1459d2` (`e77201c` · `feat(ui,telemetria): modo claro institucional, navegacion unificada, tabs y filtro PRACTICA_INTERMEDIA`)
- **URL activa en Cloudflare Workers:** `https://simu-twin-web.catramado17.workers.dev`
- **Version ID activa (100% tráfico en `npx wrangler deployments list`):** `eacc5fba-9a30-4888-9bcd-c078c29155b5` (`2026-11-18T17:34:00.217Z`; inmediatamente posterior al upload manual `f09c3891-99c6-4770-97ad-a763ec9df717` de las `17:33:07.361Z`)

### Verificación HTTP en vivo (`https://simu-twin-web.catramado17.workers.dev`)

| Ruta | HTTP Status | Redirección / Content-Type | Estado |
| --- | ---: | --- | --- |
| `/` | `200` | `text/html; charset=utf-8` | Activa |
| `/login` | `200` | `text/html; charset=utf-8` | Activa |
| `/visitas` | `200` | `text/html; charset=utf-8` | Activa |
| `/gestion/cohortes` | `307` | `Location: /login` | Protegida por sesión |
| `/cabina/evaluacion` | `307` | `Location: /login` | Protegida por sesión |
| `/admin` | `307` | `Location: /login` | Protegida por sesión |
| `/pdf.worker.min.mjs` | `200` | `text/javascript` | Asset estático activo |
