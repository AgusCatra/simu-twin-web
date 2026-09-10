# Data Models & Type System

<cite>
**Referenced Files in This Document**
- [visitas.ts](file://src/types/visitas.ts)
- [visitasService.ts](file://src/services/visitasService.ts)
- [FormularioVisita.tsx](file://src/components/visitas/FormularioVisita.tsx)
- [GridNomina.tsx](file://src/components/visitas/GridNomina.tsx)
- [supabase.ts](file://src/lib/supabase.ts)
</cite>

## Update Summary
**Changes Made**
- Updated SolicitudVisitaInput interface to reflect simplified turno field (changed from required TurnoVisita to optional string)
- Removed drive_nomina_url field references throughout the documentation
- Enhanced comments explaining automatic TUP calculation logic in service layer
- Updated validation rules and business logic descriptions to match current implementation
- Revised entity relationship diagrams to reflect current data model structure

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
This document describes the comprehensive data models and type system used in the Simu-Twin-Web project. It focuses on the TypeScript interfaces and types that define entities such as Escuela (schools), VisitaEducativa (educational visits), and supporting types like TurnoVisita (visit shifts), AnioEscolar (school year), AsistenteInput (assistant input), and FechaHabilitada (enabled dates). The system has been enhanced with robust form functionality, assistant management capabilities, and sophisticated validation rules to ensure data integrity across the service layer and UI components. Recent updates have simplified the type definitions by making the turno field optional and removing the drive_nomina_url field, while enhancing the automatic TUP calculation logic in the service layer.

## Project Structure
The data model is centralized under src/types and consumed by the service layer under src/services. The Supabase client is configured in src/lib and used to interact with the database. UI components in src/components utilize these types to ensure consistent data handling throughout the application.

```mermaid
graph TB
A["src/types/visitas.ts"] --> B["src/services/visitasService.ts"]
C["src/lib/supabase.ts"] --> B
B --> D["Supabase Database<br/>escuelas, visitas_educativas, fechas_habilitadas, visita_asistentes"]
A --> E["src/components/visitas/FormularioVisita.tsx"]
A --> F["src/components/visitas/GridNomina.tsx"]
E --> G["UI Form Components"]
F --> H["Assistant Management Grid"]
```

**Diagram sources**
- [visitas.ts:1-60](file://src/types/visitas.ts#L1-L60)
- [visitasService.ts:1-114](file://src/services/visitasService.ts#L1-L114)
- [FormularioVisita.tsx:1-698](file://src/components/visitas/FormularioVisita.tsx#L1-L698)
- [GridNomina.tsx:1-246](file://src/components/visitas/GridNomina.tsx#L1-L246)

**Section sources**
- [visitas.ts:1-60](file://src/types/visitas.ts#L1-L60)
- [visitasService.ts:1-114](file://src/services/visitasService.ts#L1-L114)
- [FormularioVisita.tsx:1-698](file://src/components/visitas/FormularioVisita.tsx#L1-L698)
- [GridNomina.tsx:1-246](file://src/components/visitas/GridNomina.tsx#L1-L246)

## Core Components
This section documents the primary data models and their relationships with enhanced functionality.

### Core Entity Types

- **Escuela**: Represents a school entity with identifiers and descriptive fields.
- **FechaHabilitada**: Defines available visit dates with availability status and optional observations.
- **TurnoVisita**: Controlled union type restricting visit shift values to 'Mañana' or 'Tarde'.
- **AnioEscolar**: Restricted union type for school years ('5°' or '6°').
- **RolAsistente**: Enumerated role type distinguishing between 'Alumno' (student) and 'Docente' (teacher).
- **AsistenteInput**: Input contract for managing assistants attending educational visits.
- **SolicitudVisitaInput**: Comprehensive input contract for creating educational visit requests with enhanced validation and simplified turno handling.
- **VisitaEducativa**: Extended entity representing a created visit record with full lifecycle management.

Key relationships:
- VisitaEducativa extends SolicitudVisitaInput, adding persistent identifiers and status fields.
- Escuela is referenced by SolicitudVisitaInput through id_escuela, establishing logical links between schools and visit requests.
- AsistenteInput arrays are embedded within SolicitudVisitaInput for comprehensive assistant tracking.
- FechaHabilitada provides controlled date selection for visit scheduling.

Validation and constraints enforced by types:
- Union types (TurnoVisita, AnioEscolar, RolAsistente) restrict allowed values at compile time.
- Optional fields (fecha_nacimiento, observaciones) enable flexible data entry.
- Numeric constraints (cant_alumnos ≤ 40) ensure proper resource allocation.
- Boolean flags (acepta_imagenes, acepta_medidas_judiciales) enforce legal compliance.
- Array validation (asistentes[]) ensures structured assistant data collection.
- Simplified turno field allows for more flexible scheduling scenarios.

Type safety across layers:
- Services import and use these types to guarantee consistent shapes for API calls and responses.
- UI components leverage types for form validation and state management.
- Return types of service functions are explicitly declared, enabling predictable consumption.

**Section sources**
- [visitas.ts:1-60](file://src/types/visitas.ts#L1-L60)

## Architecture Overview
The type system defines clear boundaries between domain models and service operations with enhanced form processing capabilities. Services validate inputs, perform business checks, manage assistant data, and return typed results. The service layer now includes enhanced automatic TUP calculation logic based on school selection.

```mermaid
sequenceDiagram
participant UI as "FormularioVisita.tsx"
participant Grid as "GridNomina.tsx"
participant Service as "visitasService.ts"
participant DB as "Supabase"
UI->>Service : crearSolicitudVisita(SolicitudVisitaInput)
Service->>Service : Calculate requires_tup automatically
Service->>Service : verificarTurnoDisponible(fecha, turno)
Service->>DB : Query visitas_educativas by fecha and turno
DB-->>Service : Results or error
Service->>Service : Validate capacity and legal agreements
Service->>DB : Insert visita record with default statuses
DB-->>Service : Created VisitaEducativa
Service->>DB : Insert asistentes array if present
DB-->>Service : Assistant records created
Service-->>UI : VisitaEducativa with confirmation
```

**Diagram sources**
- [visitasService.ts:56-114](file://src/services/visitasService.ts#L56-L114)
- [FormularioVisita.tsx:124-191](file://src/components/visitas/FormularioVisita.tsx#L124-L191)
- [GridNomina.tsx:51-83](file://src/components/visitas/GridNomina.tsx#L51-L83)

## Detailed Component Analysis

### Escuela
Purpose:
- Defines the shape of a school record returned from the database.

Fields:
- id: string — unique identifier for the school.
- nombre_institucion: string — full institution name.
- nombre_corto: string — short name or abbreviation.
- direccion: string — physical address.

Usage examples:
- Function parameter: Not directly used as input here; primarily returned by service functions.
- Return value: obtenerEscuelas returns an array of Escuela objects.

Validation notes:
- All fields are required strings; no optional fields.
- No enum constraints; free-form text for names and address.

**Section sources**
- [visitas.ts:1-6](file://src/types/visitas.ts#L1-L6)
- [visitasService.ts:10-19](file://src/services/visitasService.ts#L10-L19)

### FechaHabilitada
Purpose:
- Manages available visit dates with availability status and optional observations.

Fields:
- id: string — unique identifier for the date record.
- fecha: string — ISO date string representing the visit date.
- habilitada: boolean — indicates whether the date is currently available for bookings.
- observaciones?: string | null — optional field for additional notes about the date.

Usage examples:
- Parameter: Used in UI components to populate date selection dropdowns.
- Return value: obtenerFechasHabilitadas returns filtered array of enabled dates.

Validation notes:
- Boolean habilitada field enables/disables dates dynamically.
- Optional observaciones allows for contextual information display.
- Date filtering ensures only available dates are presented to users.

**Section sources**
- [visitas.ts:8-13](file://src/types/visitas.ts#L8-L13)
- [visitasService.ts:21-31](file://src/services/visitasService.ts#L21-L31)

### TurnoVisita
Purpose:
- Controls allowed visit shift values to prevent invalid inputs.

Values:
- 'Mañana' (Morning shift)
- 'Tarde' (Afternoon shift)

Usage examples:
- Parameter: verificarTurnoDisponible accepts a TurnoVisita argument.
- Input: While the type exists, the actual turno field in SolicitudVisitaInput is now optional string for flexibility.

Validation notes:
- Compile-time enforcement prevents typos or unsupported values when using the type.
- Simplifies UI selection options and backend validation logic.
- Note: Current implementation uses optional string for turno to allow more flexible scheduling scenarios.

**Section sources**
- [visitas.ts:15](file://src/types/visitas.ts#L15)
- [visitasService.ts:33-47](file://src/services/visitasService.ts#L33-L47)

### AnioEscolar
Purpose:
- Restricts school year selection to specific grade levels for educational visits.

Values:
- '5°' (5th grade)
- '6°' (6th grade)

Usage examples:
- Parameter: SolicitudVisitaInput.anio field enforces valid school year selection.
- UI: Form components provide radio buttons or select options bound to this type.

Validation notes:
- Ensures consistency in grade level representation across the application.
- Prevents invalid grade level entries at compile time.

**Section sources**
- [visitas.ts:17](file://src/types/visitas.ts#L17)
- [FormularioVisita.tsx:37](file://src/components/visitas/FormularioVisita.tsx#L37)

### RolAsistente
Purpose:
- Defines the role classification for assistants attending educational visits.

Values:
- 'Alumno' (Student)
- 'Docente' (Teacher)

Usage examples:
- Parameter: AsistenteInput.rol field specifies assistant role.
- UI: GridNomina component uses this type for role selection dropdowns.

Validation notes:
- Enables different handling logic based on assistant role.
- Supports attendance tracking and permission management.

**Section sources**
- [visitas.ts:19](file://src/types/visitas.ts#L19)
- [GridNomina.tsx:11](file://src/components/visitas/GridNomina.tsx#L11)

### AsistenteInput
Purpose:
- Defines the structure for individual assistants attending educational visits.

Fields:
- apellido_nombre: string — full name of the assistant (surname and given name).
- dni: string — national identification number for the assistant.
- fecha_nacimiento?: string — optional birth date for age verification purposes.
- rol: RolAsistente — mandatory role classification (Alumno or Docente).

Usage examples:
- Parameter: SolicitudVisitaInput.asistentes array contains multiple AsistenteInput objects.
- Return value: GridNomina component manages arrays of AsistenteInput for form state.

Validation notes:
- Required fields ensure complete assistant information capture.
- Optional fecha_nacimiento supports flexible data entry while maintaining core requirements.
- Array-based structure enables bulk assistant management.

**Section sources**
- [visitas.ts:21-26](file://src/types/visitas.ts#L21-L26)
- [GridNomina.tsx:17-19](file://src/components/visitas/GridNomina.tsx#L17-L19)

### SolicitudVisitaInput
Purpose:
- Comprehensive input contract for creating educational visit requests with enhanced validation and assistant management.

**Updated** Simplified turno field from required TurnoVisita to optional string for more flexible scheduling scenarios.

Fields:
- id_escuela?: string | null — optional reference to the requesting school.
- otra_institucion_nombre?: string | null — alternative institution name when not using predefined schools.
- fecha_visita: string — mandatory date of the visit (ISO format).
- turno?: string — optional field for visit timing (simplified from required TurnoVisita).
- anio: AnioEscolar — mandatory school year selection ('5°' or '6°').
- division: string — class or group designation.
- cant_alumnos: number — student count with maximum limit of 40.
- requiere_tup: boolean — transportation requirement flag, automatically calculated based on school selection.
- nombre_director: string — director's full name.
- cel_director: string — director's contact number.
- nombre_docente: string — teacher's full name.
- cel_docente: string — teacher's contact number.
- email_contacto: string — contact email address.
- acepta_imagenes: boolean — mandatory consent for image usage.
- acepta_medidas_judiciales: boolean — mandatory legal compliance acknowledgment.
- asistentes: AsistenteInput[] — array of assistant records.

Usage examples:
- Parameter: crearSolicitudVisita accepts this comprehensive object.
- Validation: Extensive runtime validation ensures data integrity before database insertion.

Validation notes:
- Mandatory legal agreements (acepta_imagenes, acepta_medidas_judiciales) enforced at service level.
- Student capacity limit (40 students maximum) validated before submission.
- Optional fields support flexible data entry scenarios.
- Array validation ensures assistant data completeness.
- Automatic TUP calculation: When a school is selected from the official list, requires_tup is automatically set to true; when using "+ Otra institución", it's set to false.

**Section sources**
- [visitas.ts:28-47](file://src/types/visitas.ts#L28-L47)
- [visitasService.ts:56-73](file://src/services/visitasService.ts#L56-L73)

### VisitaEducativa
Purpose:
- Represents a persisted educational visit record with complete lifecycle management and scheduling information.

Fields:
- Inherits all fields from SolicitudVisitaInput.
- id: string — unique identifier assigned upon creation.
- codigo_reserva: string — generated reservation code for tracking.
- estado_visita: string — visit status (e.g., 'Confirmada', 'Cancelada').
- estado_poliza: string — insurance policy status (e.g., 'Pendiente', 'Aceptada').
- tup_horario_ida_desde: string — outbound transportation departure time.
- tup_horario_ida_hasta: string — outbound transportation arrival time.
- tup_horario_vuelta_desde: string — return transportation departure time.
- tup_horario_vuelta_hasta: string — return transportation arrival time.
- created_at: string — timestamp of record creation.

Usage examples:
- Return value: crearSolicitudVisita returns a complete VisitaEducativa instance.
- Consumption: UI displays confirmation details and manages workflow based on status fields.

Validation notes:
- Extends input shape, ensuring all required input fields are present.
- Adds persistent identifiers and state fields necessary for workflow management.
- Scheduling fields provide structured transportation coordination.

**Section sources**
- [visitas.ts:49-60](file://src/types/visitas.ts#L49-L60)
- [visitasService.ts:75-95](file://src/services/visitasService.ts#L75-L95)

### Enhanced Entity Relationship Diagram
```mermaid
erDiagram
ESCUELA {
string id PK
string nombre_institucion
string nombre_corto
string direccion
}
FECHAS_HABILITADAS {
string id PK
string fecha
boolean habilitada
string observaciones
}
VISITA_EDUCATIVA {
string id PK
string codigo_reserva
string id_escuela FK
string fecha_visita
string turno
enum anio
string division
number cant_alumnos
boolean requiere_tup
string nombre_director
string cel_director
string nombre_docente
string cel_docente
string email_contacto
boolean acepta_imagenes
boolean acepta_medidas_judiciales
string estado_visita
string estado_poliza
string tup_horario_ida_desde
string tup_horario_ida_hasta
string tup_horario_vuelta_desde
string tup_horario_vuelta_hasta
timestamp created_at
}
VISITA_ASISTENTES {
string id_visita FK
string apellido_nombre
string dni
string fecha_nacimiento
enum rol
}
ESCUELA ||--o{ VISITA_EDUCATIVA : "requested_by"
FECHAS_HABILITADAS ||--o{ VISITA_EDUCATIVA : "scheduled_for"
VISITA_EDUCATIVA ||--o{ VISITA_ASISTENTES : "includes"
```

**Diagram sources**
- [visitas.ts:1-60](file://src/types/visitas.ts#L1-L60)

## Dependency Analysis
Types are defined centrally and imported by services and UI components. The service layer depends on these types to ensure consistent data contracts with the database and UI, while components leverage types for form validation and state management.

```mermaid
graph LR
Types["types/visitas.ts"] --> Service["services/visitasService.ts"]
Types --> UI["components/visitas/FormularioVisita.tsx"]
Types --> Grid["components/visitas/GridNomina.tsx"]
Supabase["lib/supabase.ts"] --> Service
Service --> DB["Database Tables"]
UI --> Service
Grid --> UI
```

- Direct dependencies:
  - visitasService imports Escuela, FechaHabilitada, SolicitudVisitaInput, TurnoVisita, VisitaEducativa from types.
  - FormularioVisita imports all types for form state management and validation.
  - GridNomina imports AsistenteInput and RolAsistente for assistant management.
  - visitasService uses supabase client to query and insert records.
- Cohesion:
  - Types encapsulate domain concepts; services encapsulate business logic using those types.
  - UI components maintain type-safe state management aligned with data models.
- Coupling:
  - Services depend on types for compile-time safety; changes to types propagate automatically.
  - Components depend on types for consistent user experience and validation.

**Diagram sources**
- [visitas.ts:1-60](file://src/types/visitas.ts#L1-L60)
- [visitasService.ts:1-114](file://src/services/visitasService.ts#L1-L114)
- [FormularioVisita.tsx:1-698](file://src/components/visitas/FormularioVisita.tsx#L1-L698)
- [GridNomina.tsx:1-246](file://src/components/visitas/GridNomina.tsx#L1-L246)

**Section sources**
- [visitasService.ts:1-114](file://src/services/visitasService.ts#L1-L114)
- [visitas.ts:1-60](file://src/types/visitas.ts#L1-L60)

## Performance Considerations
- Minimal overhead: TypeScript types are erased at runtime; they do not impact performance.
- Efficient queries: Services select only needed fields and order results to reduce payload size.
- Availability checks: Verifying turn availability before insertion avoids unnecessary writes and reduces conflicts.
- Batch operations: Assistant data is inserted in batch operations to minimize database round trips.
- State optimization: React components use useMemo and useCallback for performance optimization.
- Simplified turno handling: Optional string field reduces validation overhead compared to strict enum checking.

## Troubleshooting Guide
Common issues and how types help:
- Invalid turno or anio values: Compile-time errors prevent passing unsupported strings; UI should provide dropdowns bound to respective types.
- Missing required fields: TypeScript enforces presence of all required fields in SolicitudVisitaInput; missing properties will cause build-time errors.
- Optional fields: fecha_nacimiento, observaciones, and turno are optional; omitting them is valid and will not break compilation.
- Runtime errors: Services throw errors on database failures; callers should handle exceptions appropriately.

Runtime validation patterns:
- Availability check: verificarTurnoDisponible queries existing visits for the same date and turno, excluding canceled visits, to ensure slot availability.
- Capacity validation: cant_alumnos is validated against CUPO_MAXIMO_ALUMNOS constant (40 students).
- Legal compliance: acepto_imagenes and acepta_medidas_judiciales must both be true before submission.
- Default statuses: When inserting a new visit, estado_visita and estado_poliza are set to predefined values to maintain consistent state transitions.
- Assistant processing: Empty assistant names are filtered out before database insertion.
- Automatic TUP calculation: Service layer automatically determines requires_tup based on school selection - true for official schools, false for custom institutions.

Error handling:
- If database operations fail, errors are thrown; consumers must catch and handle them.
- Business rule violations (e.g., exceeded capacity) result in explicit errors with descriptive messages.
- Form validation provides immediate feedback to users before submission.

**Section sources**
- [visitasService.ts:56-114](file://src/services/visitasService.ts#L56-L114)
- [FormularioVisita.tsx:124-191](file://src/components/visitas/FormularioVisita.tsx#L124-L191)

## Conclusion
The Simu-Twin-Web project employs a comprehensive, type-driven architecture centered around well-defined interfaces and union types. The enhanced type system now includes Escuela, FechaHabilitada, TurnoVisita, AnioEscolar, RolAsistente, AsistenteInput, SolicitudVisitaInput, and VisitaEducativa, forming a cohesive model that ensures type safety across the service layer and UI components. Recent updates have simplified the type definitions by making the turno field optional and removing the drive_nomina_url field, while enhancing the automatic TUP calculation logic in the service layer. Union types constrain controlled values, optional fields enable flexible data entry, and service-level validations complement compile-time guarantees. The addition of assistant management capabilities through AsistenteInput and the sophisticated date management system via FechaHabilitada demonstrates the evolution toward a more robust and feature-rich educational visit booking system. This approach improves reliability, maintainability, and developer experience while keeping runtime overhead minimal. The simplified turno handling and enhanced automatic TUP calculation make the system more flexible and user-friendly while maintaining data integrity.