# 3D Cockpit Simulation

<cite>
**Referenced Files in This Document**
- [README.md](file://README.md)
- [package.json](file://package.json)
- [src/app/layout.tsx](file://src/app/layout.tsx)
- [src/app/page.tsx](file://src/app/page.tsx)
- [src/middleware.ts](file://src/middleware.ts)
- [src/app/login/page.tsx](file://src/app/login/page.tsx)
- [src/app/admin/page.tsx](file://src/app/admin/page.tsx)
- [src/app/visitas/page.tsx](file://src/app/visitas/page.tsx)
- [src/components/auth/FormularioLogin.tsx](file://src/components/auth/FormularioLogin.tsx)
- [src/components/admin/Sidebar.tsx](file://src/components/admin/Sidebar.tsx)
- [src/components/admin/Topbar.tsx](file://src/components/admin/Topbar.tsx)
- [src/lib/supabase/client.ts](file://src/lib/supabase/client.ts)
- [src/lib/supabase/server.ts](file://src/lib/supabase/server.ts)
- [src/services/visitasService.ts](file://src/services/visitasService.ts)
- [src/types/actividades.ts](file://src/types/actividades.ts)
</cite>

## Table of Contents
1. Introduction
2. Project Structure
3. Core Components
4. Architecture Overview
5. Detailed Component Analysis
6. Dependency Analysis
7. Performance Considerations
8. Troubleshooting Guide
9. Conclusion

## Introduction
This project is a Next.js application that provides an administrative hub and public booking portal for a simulation center. It includes authentication, admin navigation, and services to manage educational visits and activities. While the repository currently focuses on administration and visit management, it is structured to support future integration of a 3D cockpit simulation (e.g., via assets like GLB/GLTF referenced in middleware). The app uses Supabase for session management and data operations, Tailwind CSS for styling, and modern Next.js features including server components and middleware-based routing guards.

## Project Structure
The application follows a feature-oriented layout under src/app with shared UI components, Supabase client utilities, typed models, and services. Key areas:
- App routes: login, admin dashboard, and public visitas form
- Admin UI: sidebar and topbar for navigation and session controls
- Supabase clients: browser and server variants for consistent session handling
- Services and types: domain logic for visits and activity modeling

```mermaid
graph TB
A["Next.js App<br/>src/app"] --> B["Routes<br/>login, admin, visitas"]
A --> C["Shared Layout<br/>layout.tsx"]
B --> D["Admin UI<br/>Sidebar, Topbar"]
B --> E["Auth Form<br/>FormularioLogin"]
B --> F["Public Form<br/>Visitas Page"]
D --> G["Supabase Client<br/>client.ts / server.ts"]
E --> G
F --> H["Services<br/>visitasService.ts"]
H --> I["Types<br/>actividades.ts, visitas.ts"]
```

**Diagram sources**
- [src/app/layout.tsx:1-35](file://src/app/layout.tsx#L1-L35)
- [src/app/login/page.tsx:1-31](file://src/app/login/page.tsx#L1-L31)
- [src/app/admin/page.tsx:1-38](file://src/app/admin/page.tsx#L1-L38)
- [src/app/visitas/page.tsx:1-28](file://src/app/visitas/page.tsx#L1-L28)
- [src/components/admin/Sidebar.tsx:1-113](file://src/components/admin/Sidebar.tsx#L1-L113)
- [src/components/admin/Topbar.tsx:1-132](file://src/components/admin/Topbar.tsx#L1-L132)
- [src/components/auth/FormularioLogin.tsx:1-107](file://src/components/auth/FormularioLogin.tsx#L1-L107)
- [src/lib/supabase/client.ts:1-34](file://src/lib/supabase/client.ts#L1-L34)
- [src/lib/supabase/server.ts:1-41](file://src/lib/supabase/server.ts#L1-L41)
- [src/services/visitasService.ts:1-105](file://src/services/visitasService.ts#L1-L105)
- [src/types/actividades.ts:1-177](file://src/types/actividades.ts#L1-L177)

**Section sources**
- [README.md:1-37](file://README.md#L1-L37)
- [package.json:1-32](file://package.json#L1-L32)
- [src/app/layout.tsx:1-35](file://src/app/layout.tsx#L1-L35)

## Core Components
- Authentication flow: Login form interacts with Supabase auth; middleware protects admin routes and redirects appropriately.
- Admin panel: Sidebar defines navigation; Topbar shows current section, live clock, and logout action.
- Public visit booking: Visitas page renders a form backed by services that query and update Supabase tables.
- Data layer: Services encapsulate Supabase queries; types define contracts for activities and visits.

Key responsibilities:
- Middleware enforces session state and route protection.
- Supabase clients provide authenticated sessions across client and server contexts.
- Services centralize database interactions and business rules (e.g., capacity checks).
- Types ensure consistency between UI and backend schemas.

**Section sources**
- [src/middleware.ts:1-100](file://src/middleware.ts#L1-L100)
- [src/components/auth/FormularioLogin.tsx:1-107](file://src/components/auth/FormularioLogin.tsx#L1-L107)
- [src/components/admin/Sidebar.tsx:1-113](file://src/components/admin/Sidebar.tsx#L1-L113)
- [src/components/admin/Topbar.tsx:1-132](file://src/components/admin/Topbar.tsx#L1-L132)
- [src/services/visitasService.ts:1-105](file://src/services/visitasService.ts#L1-L105)
- [src/types/actividades.ts:1-177](file://src/types/actividades.ts#L1-L177)

## Architecture Overview
The system combines Next.js routing, Supabase authentication, and service-layer data access. Middleware secures routes and refreshes sessions. Client and server Supabase clients share cookie-based sessions. Services abstract database operations and expose typed APIs to components.

```mermaid
sequenceDiagram
participant U as "User"
participant M as "Middleware"
participant L as "LoginPage"
participant F as "LoginForm"
participant S as "Supabase Client"
participant R as "Router"
U->>M : Request /admin
M->>S : getSession/getUser
alt Not authenticated
M-->>U : Redirect to /login
else Authenticated
M-->>U : Continue to /admin
end
U->>L : Open /login
U->>F : Submit credentials
F->>S : signInWithPassword
S-->>F : Session established
F->>R : Navigate to /admin
R-->>U : Render Admin Dashboard
```

**Diagram sources**
- [src/middleware.ts:14-85](file://src/middleware.ts#L14-L85)
- [src/app/login/page.tsx:1-31](file://src/app/login/page.tsx#L1-L31)
- [src/components/auth/FormularioLogin.tsx:21-51](file://src/components/auth/FormularioLogin.tsx#L21-L51)
- [src/lib/supabase/client.ts:20-33](file://src/lib/supabase/client.ts#L20-L33)

## Detailed Component Analysis

### Authentication and Session Management
- Middleware validates protected routes (/admin/*, /login), refreshes sessions for public routes, and handles missing environment variables gracefully by redirecting or passing through.
- Server-side Supabase client synchronizes cookies for server components and actions.
- Browser-side Supabase client is singleton per tab and used by forms and interactive UI.

```mermaid
flowchart TD
Start(["Request"]) --> CheckEnv{"Env vars present?"}
CheckEnv --> |No| RouteType{"Route type?"}
RouteType --> |Protected| Redirect["Redirect to /login"]
RouteType --> |Public| Pass["Continue request"]
CheckEnv --> |Yes| CreateClient["Create Supabase client"]
CreateClient --> SessionCheck{"Authenticated?"}
SessionCheck --> |No & Protected| Redirect
SessionCheck --> |Yes| Allow["Allow request"]
SessionCheck --> |Public| Refresh["Refresh session"] --> Allow
```

**Diagram sources**
- [src/middleware.ts:14-85](file://src/middleware.ts#L14-L85)
- [src/lib/supabase/server.ts:11-40](file://src/lib/supabase/server.ts#L11-L40)
- [src/lib/supabase/client.ts:7-33](file://src/lib/supabase/client.ts#L7-L33)

**Section sources**
- [src/middleware.ts:1-100](file://src/middleware.ts#L1-L100)
- [src/lib/supabase/server.ts:1-41](file://src/lib/supabase/server.ts#L1-L41)
- [src/lib/supabase/client.ts:1-34](file://src/lib/supabase/client.ts#L1-L34)

### Admin Navigation and Dashboard
- Sidebar defines a single source of truth for admin routes and active state detection.
- Topbar displays breadcrumb-like context, live clock, and logout functionality using the Supabase client.
- Admin dashboard placeholder indicates where digital twin and telemetry will connect.

```mermaid
classDiagram
class Sidebar {
+RUTAS_ADMIN
+esRutaActiva(pathname, href) bool
+obtenerRutaActiva(pathname) RutaAdmin?
}
class Topbar {
+RelojEnVivo()
+cerrarSesion() void
}
class AdminDashboard {
+render()
}
Sidebar <.. Topbar : "shared routes"
Topbar --> AdminDashboard : "navigates within"
```

**Diagram sources**
- [src/components/admin/Sidebar.tsx:16-45](file://src/components/admin/Sidebar.tsx#L16-L45)
- [src/components/admin/Topbar.tsx:56-72](file://src/components/admin/Topbar.tsx#L56-L72)
- [src/app/admin/page.tsx:5-35](file://src/app/admin/page.tsx#L5-L35)

**Section sources**
- [src/components/admin/Sidebar.tsx:1-113](file://src/components/admin/Sidebar.tsx#L1-L113)
- [src/components/admin/Topbar.tsx:1-132](file://src/components/admin/Topbar.tsx#L1-L132)
- [src/app/admin/page.tsx:1-38](file://src/app/admin/page.tsx#L1-L38)

### Public Visit Booking Flow
- Visitas page renders a form that leverages services to fetch schools, available dates, and check slot availability.
- Services interact with Supabase to enforce constraints such as maximum student capacity per shift.

```mermaid
sequenceDiagram
participant U as "User"
participant V as "VisitasPage"
participant S as "visitasService"
participant DB as "Supabase"
U->>V : Open /visitas
V->>S : obtenerEscuelas()
S->>DB : SELECT escuelas
DB-->>S : Escuela[]
S-->>V : Escuela[]
U->>V : Select date and shift
V->>S : verificarTurnoDisponible(fecha, turno)
S->>DB : SELECT visitas_educativas WHERE fecha=... AND turno=...
DB-->>S : [] or records
S-->>V : boolean (available?)
```

**Diagram sources**
- [src/app/visitas/page.tsx:10-24](file://src/app/visitas/page.tsx#L10-L24)
- [src/services/visitasService.ts:11-51](file://src/services/visitasService.ts#L11-L51)

**Section sources**
- [src/app/visitas/page.tsx:1-28](file://src/app/visitas/page.tsx#L1-L28)
- [src/services/visitasService.ts:1-105](file://src/services/visitasService.ts#L1-L105)

### Activity Modeling and Types
- Types define enumerations and interfaces for activities, participants, and simulator states, aligning UI with database schema.
- Labels and enums standardize display values and validations across components.

```mermaid
classDiagram
class ActividadInput {
+tipo
+entidad_nombre
+contacto_nombre
+contacto_telefono
+fecha_actividad
+hora_inicio
+hora_fin
+duracion_minutos
+estado
+observaciones
+participantes
+simuladores_ids
}
class Simulador {
+id
+nombre
+estado
+horas_uso_totales
+actividad_actual_id
}
class ParticipanteActividad {
+id
+actividad_id
+apellido_nombre
+dni
+genero
+puesto
}
ActividadInput --> ParticipanteActividad : "contains"
ActividadInput --> Simulador : "references"
```

**Diagram sources**
- [src/types/actividades.ts:32-104](file://src/types/actividades.ts#L32-L104)
- [src/types/actividades.ts:59-73](file://src/types/actividades.ts#L59-L73)

**Section sources**
- [src/types/actividades.ts:1-177](file://src/types/actividades.ts#L1-L177)

## Dependency Analysis
- Routing and protection: Middleware depends on Supabase server client and environment variables; it matches specific paths and excludes static assets, including potential 3D model files.
- UI components depend on shared navigation definitions and Supabase client for session actions.
- Services depend on Supabase client and types to enforce contracts.

```mermaid
graph LR
MW["middleware.ts"] --> SC["server.ts"]
MW --> BC["client.ts"]
LOGIN["FormularioLogin.tsx"] --> BC
TOPBAR["Topbar.tsx"] --> BC
SIDEBAR["Sidebar.tsx"] --> NAV["Rutas Admin"]
VISITAS["visitasService.ts"] --> BC
VISITAS --> TYPES["types/actividades.ts"]
```

**Diagram sources**
- [src/middleware.ts:1-100](file://src/middleware.ts#L1-L100)
- [src/lib/supabase/server.ts:1-41](file://src/lib/supabase/server.ts#L1-L41)
- [src/lib/supabase/client.ts:1-34](file://src/lib/supabase/client.ts#L1-L34)
- [src/components/auth/FormularioLogin.tsx:1-107](file://src/components/auth/FormularioLogin.tsx#L1-L107)
- [src/components/admin/Topbar.tsx:1-132](file://src/components/admin/Topbar.tsx#L1-L132)
- [src/components/admin/Sidebar.tsx:1-113](file://src/components/admin/Sidebar.tsx#L1-L113)
- [src/services/visitasService.ts:1-105](file://src/services/visitasService.ts#L1-L105)
- [src/types/actividades.ts:1-177](file://src/types/actividades.ts#L1-L177)

**Section sources**
- [src/middleware.ts:1-100](file://src/middleware.ts#L1-L100)
- [src/services/visitasService.ts:1-105](file://src/services/visitasService.ts#L1-L105)
- [src/components/admin/Sidebar.tsx:1-113](file://src/components/admin/Sidebar.tsx#L1-L113)

## Performance Considerations
- Use Next.js build optimizations and Turbopack for faster builds.
- Keep middleware matcher minimal to avoid unnecessary processing on static assets and API payloads.
- Prefer server components and server actions for data-heavy operations to reduce client bundle size.
- Cache frequently accessed data (e.g., schools, enabled dates) at the service layer or via caching strategies if needed.
- For future 3D assets (GLB/GLTF), consider lazy loading and asset optimization pipelines to minimize initial payload.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Missing Supabase environment variables: Both client and server clients throw explicit errors when NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY are absent. Ensure .env.local is configured correctly.
- Middleware redirects: If environment variables are missing at the edge, protected routes redirect to login; verify env setup and redeploy.
- Authentication failures: The login form maps Supabase error messages to user-friendly text; check credentials and network connectivity.
- Session sync: Logout triggers sign-out and navigates back to login; ensure router refresh occurs to clear cached state.

**Section sources**
- [src/lib/supabase/client.ts:7-18](file://src/lib/supabase/client.ts#L7-L18)
- [src/lib/supabase/server.ts:11-19](file://src/lib/supabase/server.ts#L11-L19)
- [src/middleware.ts:20-32](file://src/middleware.ts#L20-L32)
- [src/components/auth/FormularioLogin.tsx:21-51](file://src/components/auth/FormularioLogin.tsx#L21-L51)
- [src/components/admin/Topbar.tsx:62-72](file://src/components/admin/Topbar.tsx#L62-L72)

## Conclusion
The application provides a robust foundation for managing simulation center operations, including secure admin access, navigation, and public visit bookings. Its architecture cleanly separates concerns across routing, authentication, UI, and data layers, making it straightforward to extend with additional modules such as a 3D cockpit simulation. Future enhancements can integrate real-time telemetry and immersive simulations while leveraging the existing session and data infrastructure.

[No sources needed since this section summarizes without analyzing specific files]