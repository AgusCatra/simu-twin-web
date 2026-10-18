---
kind: business_term
name: Business Glossary
category: business_term
scope:
    - '**'
---

### Visitas Educativas
- Definition：The educational visit booking module (H4) that models school visits as requests with a date and shift (morning/afternoon), enforcing one active booking per slot and tracking visit and insurance policy statuses.
- Aliases：módulo de Visitas Educativas、H4

### TurnoVisita
- Definition：A typed enum of allowed visit shifts — 'Mañana' (morning) or 'Tarde' (afternoon) — used to enforce single-booking-per-slot availability on the `visitas_educativas` table.
- Aliases：turno、shift

### SolicitudVisitaInput
- Definition：The input contract for creating an educational visit request, carrying school id, visit date, shift, class division, student count, director and teacher contact info, and an optional roster drive link.
- Aliases：visit request input、solicitud

### VisitaEducativa
- Definition：The persisted visit record extending the input with server-side fields: row id, `estado_visita` ('Confirmada'/'Cancelada'), and `estado_poliza` ('Pendiente') indicating insurance policy status.
- Aliases：visit record、visita
