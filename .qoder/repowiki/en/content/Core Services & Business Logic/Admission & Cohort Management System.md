# Admission & Cohort Management System

<cite>
**Referenced Files in This Document**
- [README.md](file://README.md)
- [WIKI.md](file://docs/WIKI.md)
- [package.json](file://package.json)
- [0004_modulo_admision_cohortes_evaluacion.sql](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql)
- [20261008_modulo_admision_v1.sql](file://supabase/migrations/20261008_modulo_admision_v1.sql)
- [actividades.ts](file://src/types/actividades.ts)
- [admin_layout.tsx](file://src/app/admin/layout.tsx)
- [admin_dashboard_page.tsx](file://src/app/admin/page.tsx)
- [visitas_admin_page.tsx](file://src/app/admin/visitas-educativas/page.tsx)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document describes the Admission and Cohort Management System for the Municipal Simulator Training Center in Venado Tuerto. The system models a complete training lifecycle: candidate admission, diagnostic scheduling, cabin evaluation, formal simulator sessions, real-machine practice, cohort management, and role-based access control. It is implemented as part of a Next.js application backed by Supabase PostgreSQL with Row Level Security (RLS), triggers, and generated columns to enforce business rules at the database layer.

The repository also includes other modules such as the 3D digital twin, educational visits portal, and TUP logistics panel; this document focuses specifically on the admission and cohort subsystem while referencing shared infrastructure where relevant.

**Section sources**
- [README.md:1-88](file://README.md#L1-L88)
- [WIKI.md:24-33](file://docs/WIKI.md#L24-L33)

## Project Structure
The admission and cohort module is primarily defined in the database schema migrations and supported by TypeScript types used across the administrative interface. The frontend currently exposes an admin shell and existing administrative pages; the admission/cohort UI routes are not yet present in the codebase but can be added under `src/app/admin` following the same patterns.

```mermaid
graph TB
subgraph "Frontend"
AdminLayout["Admin Layout<br/>src/app/admin/layout.tsx"]
AdminDashboard["Admin Dashboard<br/>src/app/admin/page.tsx"]
VisitasAdminPage["Educational Visits Admin Page<br/>src/app/admin/visitas-educativas/page.tsx"]
end
subgraph "Types"
ActividadesTypes["Activity Types<br/>src/types/actividades.ts"]
end
subgraph "Database"
Migrations["Admission & Cohort Migrations<br/>supabase/migrations/*.sql"]
end
AdminLayout --> AdminDashboard
AdminLayout --> VisitasAdminPage
AdminDashboard --> ActividadesTypes
VisitasAdminPage --> ActividadesTypes
AdminDashboard --> Migrations
VisitasAdminPage --> Migrations
```

**Diagram sources**
- [admin_layout.tsx:1-26](file://src/app/admin/layout.tsx#L1-L26)
- [admin_dashboard_page.tsx:1-38](file://src/app/admin/page.tsx#L1-L38)
- [visitas_admin_page.tsx:1-25](file://src/app/admin/visitas-educativas/page.tsx#L1-L25)
- [actividades.ts:1-177](file://src/types/actividades.ts#L1-L177)
- [0004_modulo_admision_cohortes_evaluacion.sql:1-444](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L1-L444)

**Section sources**
- [admin_layout.tsx:1-26](file://src/app/admin/layout.tsx#L1-L26)
- [admin_dashboard_page.tsx:1-38](file://src/app/admin/page.tsx#L1-L38)
- [visitas_admin_page.tsx:1-25](file://src/app/admin/visitas-educativas/page.tsx#L1-L25)
- [actividades.ts:1-177](file://src/types/actividades.ts#L1-L177)
- [0004_modulo_admision_cohortes_evaluacion.sql:1-444](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L1-L444)

## Core Components
The core of the Admission and Cohort Management System is the data model and its enforcement logic:

- User profiles and RBAC roles linked to authentication users.
- Operational configuration for shifts, capacity, and required simulator days.
- Student registry with lifecycle states.
- Cohorts and diagnostic scheduling with capacity validation.
- Cabin evaluation rubric with computed scores and hard-fail constraints.
- Formal training groups (“ternas”) and six simulator sessions per student.
- Real-machine practice records and private storage bucket.
- Row Level Security policies protecting all tables.

These components are defined in the migration files and complemented by TypeScript type contracts used by the admin UI.

**Section sources**
- [0004_modulo_admision_cohortes_evaluacion.sql:17-25](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L17-L25)
- [0004_modulo_admision_cohortes_evaluacion.sql:73-101](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L73-L101)
- [0004_modulo_admision_cohortes_evaluacion.sql:115-138](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L115-L138)
- [0004_modulo_admision_cohortes_evaluacion.sql:143-187](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L143-L187)
- [0004_modulo_admision_cohortes_evaluacion.sql:190-238](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L190-L238)
- [0004_modulo_admision_cohortes_evaluacion.sql:243-292](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L243-L292)
- [0004_modulo_admision_cohortes_evaluacion.sql:297-330](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L297-L330)
- [0004_modulo_admision_cohortes_evaluacion.sql:335-346](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L335-L346)
- [0004_modulo_admision_cohortes_evaluacion.sql:365-443](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L365-L443)

## Architecture Overview
The admission and cohort system follows a server-enforced architecture:

- Frontend admin pages render state and trigger Server Actions or API calls.
- Server-side logic interacts with Supabase using authenticated clients.
- Database-level triggers, constraints, and RLS enforce business rules regardless of client behavior.
- Generated columns compute derived values like total evaluation scores.

```mermaid
graph TB
Client["Admin UI<br/>Next.js Pages"]
Server["Server Layer<br/>Supabase Client / Server Actions"]
DB["PostgreSQL<br/>Migrations & Policies"]
Auth["Supabase Auth<br/>User Profiles & Roles"]
Client --> Server
Server --> DB
DB --> Auth
DB --> DB
```

**Diagram sources**
- [0004_modulo_admision_cohortes_evaluacion.sql:365-443](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L365-L443)
- [20261008_modulo_admision_v1.sql:364-416](file://supabase/migrations/20261008_modulo_admision_v1.sql#L364-L416)

## Detailed Component Analysis

### Data Model and Relationships
The admission and cohort system defines entities that model the full training pipeline:

- `perfiles_usuarios`: user profile and role mapping tied to `auth.users`.
- `config_centro`: operational configuration including morning/afternoon shifts, shift duration, simultaneous capacity, Friday morning blocking, and required simulator days.
- `feriados_municipales`: municipal holidays disabling scheduling.
- `alumnos`: central student record with unique DNI and lifecycle state.
- `cohortes`: training cohorts with phases and date ranges.
- `turnos_diagnostico`: diagnostic slots with capacity and blocking controls.
- `postulantes_diagnostico`: candidate-to-slot assignments with attendance tracking.
- `evaluaciones_diagnostico`: cabin evaluation rubric with criteria, second attempt evolution, bonus, computed score, preliminary and definitive judgments, and hard-fail constraint.
- `ternas_capacitacion` and `terna_miembros`: formal training groups and membership.
- `sesiones_simulador`: six scheduled simulator sessions per student with uniqueness constraints.
- `practica_real`: real-machine practice outcomes and PDF storage path.
- Storage bucket `expedientes-practica-real` for private PDFs.

```mermaid
erDiagram
PERFILES_USUARIOS {
uuid id PK
text email
text nombre_completo
text rol
boolean activo
timestamptz created_at
timestamptz updated_at
}
CONFIG_CENTRO {
uuid id PK
time[] turnos_manana
time[] turnos_tarde
int duracion_turno_minutos
int capacidad_simultanea
boolean bloqueo_viernes_manana
int dias_simulador_requeridos
timestamptz created_at
timestamptz updated_at
}
ALUMNOS {
uuid id PK
text dni UK
text nombre_completo
text telefono
text genero
text estado_general
timestamptz created_at
timestamptz updated_at
}
COHORTES {
uuid id PK
text codigo UK
text nombre
date fecha_inicio_diagnostico
date fecha_teoria
date fecha_inicio_simulador
date fecha_fin_estimada
text fase_actual
timestamptz created_at
timestamptz updated_at
}
TURNOS_DIAGNOSTICO {
uuid id PK
uuid cohorte_id FK
date fecha
time hora_inicio
time hora_fin
int capacidad_maxima
boolean bloqueado
text motivo_bloqueo
timestamptz created_at
}
POSTULANTES_DIAGNOSTICO {
uuid id PK
uuid alumno_id FK
uuid turno_id FK
text asistencia
timestamptz created_at
}
EVALUACIONES_DIAGNOSTICO {
uuid id PK
uuid alumno_id FK
uuid cohorte_id FK
text instructor_evaluador
date fecha_evaluacion
int criterio_lateralidad
int criterio_sensibilidad_mandos
int criterio_procedimiento_mastil
int criterio_autonomia
int criterio_control_emocional
text evolucion_segundo_intento
int bonus_segundo_intento
int score_total
text dictamen_preliminar
boolean hard_fail_disparado
text dictamen_definitivo
text resolucion_mesa_texto
boolean firmado_mesa
timestamptz created_at
timestamptz updated_at
}
TERNAS_CAPACITACION {
uuid id PK
uuid cohorte_id FK
text nombre_terna
time hora_fija
timestamptz created_at
}
TERNA_MIEMBROS {
uuid terna_id FK
uuid alumno_id FK
timestamptz created_at
}
SESIONES_SIMULADOR {
uuid id PK
uuid terna_id FK
uuid alumno_id FK
int numero_sesion
date fecha_programada
text asistencia
uuid apptitan_session_id
int score_titan
boolean cumplida
timestamptz created_at
}
PRACTICA_REAL {
uuid id PK
uuid alumno_id FK
text instructor_patio
date fecha_practica
text resultado
text storage_pdf_path
text observaciones
timestamptz created_at
}
PERFILES_USUARIOS ||--|| CONFIG_CENTRO : "operational config"
ALUMNOS ||--o{ POSTULANTES_DIAGNOSTICO : "assigned to"
COHORTES ||--o{ TURNOS_DIAGNOSTICO : "has"
TURNOS_DIAGNOSTICO ||--o{ POSTULANTES_DIAGNOSTICO : "receives"
ALUMNOS ||--o{ EVALUACIONES_DIAGNOSTICO : "evaluated"
COHORTES ||--o{ EVALUACIONES_DIAGNOSTICO : "linked"
COHORTES ||--o{ TERNAS_CAPACITACION : "groups"
TERNAS_CAPACITACION ||--o{ TERNA_MIEMBROS : "members"
TERNA_MIEMBROS ||--|| ALUMNOS : "enrolled"
TERNAS_CAPACITACION ||--o{ SESIONES_SIMULADOR : "sessions"
ALUMNOS ||--o{ SESIONES_SIMULADOR : "scheduled"
ALUMNOS ||--o{ PRACTICA_REAL : "real practice"
```

**Diagram sources**
- [0004_modulo_admision_cohortes_evaluacion.sql:17-25](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L17-L25)
- [0004_modulo_admision_cohortes_evaluacion.sql:73-101](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L73-L101)
- [0004_modulo_admision_cohortes_evaluacion.sql:115-138](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L115-L138)
- [0004_modulo_admision_cohortes_evaluacion.sql:143-187](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L143-L187)
- [0004_modulo_admision_cohortes_evaluacion.sql:243-330](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L243-L330)
- [0004_modulo_admision_cohortes_evaluacion.sql:335-346](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L335-L346)

**Section sources**
- [0004_modulo_admision_cohortes_evaluacion.sql:17-346](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L17-L346)

### Diagnostic Slot Capacity Validation
Assignment of candidates to diagnostic slots is enforced by a database trigger that:

- Skips capacity checks when no slot is assigned.
- Validates the existence of the diagnostic slot.
- Prevents assignment to blocked slots.
- Counts current assignments and rejects over-capacity inserts/updates.

```mermaid
flowchart TD
Start(["Insert or Update postulantes_diagnostico"]) --> CheckSlot{"Is turno_id NULL?"}
CheckSlot --> |Yes| ReturnNew["Return row unchanged"]
CheckSlot --> |No| LoadSlot["Load capacity_maxima and bloqueado"]
LoadSlot --> Exists{"Slot exists?"}
Exists --> |No| RaiseError["Raise exception: slot not found"]
Exists --> |Yes| Blocked{"Is slot blocked?"}
Blocked --> |Yes| RaiseBlocked["Raise exception: slot blocked"]
Blocked --> |No| CountAssignments["Count current assignments for turno_id"]
CountAssignments --> OverCap{"Count >= capacity_maxima?"}
OverCap --> |Yes| RaiseOvercap["Raise exception: capacity exceeded"]
OverCap --> |No| Accept["Accept row"]
RaiseError --> End(["End"])
RaiseBlocked --> End
RaiseOvercap --> End
Accept --> End
ReturnNew --> End
```

**Diagram sources**
- [0004_modulo_admision_cohortes_evaluacion.sql:190-238](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L190-L238)

**Section sources**
- [0004_modulo_admision_cohortes_evaluacion.sql:190-238](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L190-L238)

### Evaluation Rubric and Hard-Fail Constraint
The diagnostic evaluation table enforces:

- Enumerated criteria with fixed point values.
- Optional second attempt evolution and bonus.
- A stored generated column computing total score.
- Preliminary judgment constrained by hard-fail flag.
- Definitive judgment and mesa technical resolution fields.

```mermaid
flowchart TD
Input["Evaluation Criteria Inputs"] --> ComputeScore["Compute score_total"]
ComputeScore --> PrelimCheck{"hard_fail_disparado = TRUE?"}
PrelimCheck --> |Yes| EnforceNoApto["Enforce dictamen_preliminar = 'no_apto'"]
PrelimCheck --> |No| AllowPrelim["Allow 'apto', 'condicional', or 'no_apto'"]
EnforceNoApto --> Finalize["Persist evaluation"]
AllowPrelim --> Finalize
```

**Diagram sources**
- [0004_modulo_admision_cohortes_evaluacion.sql:243-292](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L243-L292)

**Section sources**
- [0004_modulo_admision_cohortes_evaluacion.sql:243-292](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L243-L292)

### Formal Training Groups and Simulator Sessions
Formal training uses “ternas” (groups) with fixed times and members:

- Each group belongs to a cohort.
- Memberships link students to groups.
- Six simulator sessions per student are modeled with uniqueness constraints ensuring one session number and one scheduled date per student.

```mermaid
classDiagram
class Cohort {
+id
+codigo
+nombre
+fecha_inicio_diagnostico
+fecha_teoria
+fecha_inicio_simulador
+fecha_fin_estimada
+fase_actual
}
class TernasCapacitacion {
+id
+cohorte_id
+nombre_terna
+hora_fija
}
class TernaMiembros {
+terna_id
+alumno_id
}
class SesionesSimulador {
+id
+terna_id
+alumno_id
+numero_sesion
+fecha_programada
+asistencia
+apptitan_session_id
+score_titan
+cumplida
}
Cohort "1" --> "many" TernasCapacitacion : "has"
TernasCapacitacion "1" --> "many" TernaMiembros : "members"
TernasCapacitacion "1" --> "many" SesionesSimulador : "sessions"
```

**Diagram sources**
- [0004_modulo_admision_cohortes_evaluacion.sql:297-330](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L297-L330)

**Section sources**
- [0004_modulo_admision_cohortes_evaluacion.sql:297-330](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L297-L330)

### Role-Based Access Control and User Profiles
User profiles are automatically synchronized with authentication users:

- A trigger creates or updates `perfiles_usuarios` on new auth users.
- Roles are validated against allowed values.
- Names are normalized from metadata or email prefix.
- RLS policies enable authenticated access to all admission-related tables.

```mermaid
sequenceDiagram
participant Auth as "Supabase Auth"
participant Trigger as "handle_nuevo_usuario()"
participant DB as "perfiles_usuarios"
Auth->>Trigger : New user inserted
Trigger->>Trigger : Normalize role and name
Trigger->>DB : Insert or update profile
DB-->>Trigger : Persisted profile
Trigger-->>Auth : Profile ready
```

**Diagram sources**
- [0004_modulo_admision_cohortes_evaluacion.sql:32-68](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L32-L68)
- [0004_modulo_admision_cohortes_evaluacion.sql:365-443](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L365-L443)

**Section sources**
- [0004_modulo_admision_cohortes_evaluacion.sql:32-68](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L32-L68)
- [0004_modulo_admision_cohortes_evaluacion.sql:365-443](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L365-L443)

### Administrative UI Integration Points
The admin layout provides the shell for protected routes, and the dashboard page is a placeholder for live telemetry and statistics. Existing administrative pages demonstrate how to structure content and metadata.

```mermaid
graph LR
Sidebar["Sidebar"] --> Main["Main Content Area"]
Topbar["Topbar"] --> Main
Main --> Dashboard["Admin Dashboard Placeholder"]
Main --> VisitasAdmin["Educational Visits Admin"]
```

**Diagram sources**
- [admin_layout.tsx:11-25](file://src/app/admin/layout.tsx#L11-L25)
- [admin_dashboard_page.tsx:5-35](file://src/app/admin/page.tsx#L5-L35)
- [visitas_admin_page.tsx:10-23](file://src/app/admin/visitas-educativas/page.tsx#L10-L23)

**Section sources**
- [admin_layout.tsx:1-26](file://src/app/admin/layout.tsx#L1-L26)
- [admin_dashboard_page.tsx:1-38](file://src/app/admin/page.tsx#L1-L38)
- [visitas_admin_page.tsx:1-25](file://src/app/admin/visitas-educativas/page.tsx#L1-L25)

## Dependency Analysis
The admission and cohort module depends on:

- Supabase Auth for identity and profile synchronization.
- PostgreSQL extensions (`uuid-ossp`, `pgcrypto`) for identifiers and cryptographic functions.
- RLS policies to restrict access to authenticated users.
- Triggers and constraints to enforce business rules.
- TypeScript types for consistent data contracts in the admin UI.

```mermaid
graph TB
Auth["Supabase Auth"]
Extensions["Extensions<br/>uuid-ossp, pgcrypto"]
Policies["RLS Policies"]
Triggers["Triggers & Constraints"]
Types["TypeScript Types"]
Schema["Admission Schema"]
Auth --> Schema
Extensions --> Schema
Policies --> Schema
Triggers --> Schema
Types --> Schema
```

**Diagram sources**
- [0004_modulo_admision_cohortes_evaluacion.sql:11-12](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L11-L12)
- [0004_modulo_admision_cohortes_evaluacion.sql:365-443](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L365-L443)
- [actividades.ts:1-177](file://src/types/actividades.ts#L1-L177)

**Section sources**
- [0004_modulo_admision_cohortes_evaluacion.sql:11-12](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L11-L12)
- [0004_modulo_admision_cohortes_evaluacion.sql:365-443](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L365-L443)
- [actividades.ts:1-177](file://src/types/actividades.ts#L1-L177)

## Performance Considerations
- Use indexes already defined on key columns (e.g., DNI, status, cohort-date combinations) to optimize queries for admissions dashboards and reporting.
- Prefer server-side filtering and pagination when building admission lists to reduce payload size.
- Avoid unnecessary re-renders in React components by memoizing stable objects and leveraging Next.js caching strategies.
- Keep database triggers focused on integrity checks; move heavy computations to server actions if needed.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:

- **Capacity exceeded during diagnostic assignment**: The trigger raises an exception when the number of assigned candidates reaches the maximum capacity for a slot. Verify slot capacity and unblock or remove conflicting assignments.
- **Hard-fail evaluation constraint violation**: If `hard_fail_disparado` is true, the preliminary judgment must be set to the disapproved value. Adjust the rubric accordingly.
- **Duplicate session scheduling**: Uniqueness constraints prevent assigning the same session number or date to a student. Ensure each student has distinct session numbers and dates.
- **RLS policy errors**: All admission tables require authenticated access. Confirm the user session is active and that policies are enabled.

**Section sources**
- [0004_modulo_admision_cohortes_evaluacion.sql:190-238](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L190-L238)
- [0004_modulo_admision_cohortes_evaluacion.sql:243-292](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L243-L292)
- [0004_modulo_admision_cohortes_evaluacion.sql:300-330](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L300-L330)
- [0004_modulo_admision_cohortes_evaluacion.sql:365-443](file://supabase/migrations/0004_modulo_admision_cohortes_evaluacion.sql#L365-L443)

## Conclusion
The Admission and Cohort Management System provides a robust, database-enforced foundation for managing the full training lifecycle of simulator trainees. Its design emphasizes security through RLS, integrity via triggers and constraints, and clarity through well-defined schemas and TypeScript contracts. Future frontend development should extend the admin shell with dedicated admission and cohort pages, integrating these data models into interactive workflows for scheduling, evaluation, and reporting.

[No sources needed since this section summarizes without analyzing specific files]