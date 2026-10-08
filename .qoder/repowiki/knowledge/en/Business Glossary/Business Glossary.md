---
kind: business_term
name: Business Glossary
category: business_term
scope:
    - '**'
---

### Centro de Entrenamiento en Simuladores
- Definition: The municipal heavy machinery and vocational training center established by the Government of Venado Tuerto in the city's Industrial Park.
- Aliases: Centro de Simuladores, Hub Simuladores, Centro Municipal de Simulación

### Gemelo Digital (Digital Twin)
- Definition: The 3D WebGL virtual replica of the 28m x 22m simulation warehouse, developed in Three.js and embedded into the application to visualize active bays, machine statuses, and facility infrastructure.
- Aliases: 3D Twin, Gemelo Galpón, Nave 3D

### SCADA (Supervisory Control and Data Acquisition)
- Definition: The industrial telemetry overlay that monitors total simulators, active training sessions, estimated electrical power draw (kWh), cabin temperatures, and session runtimes in real time.
- Aliases: SCADA HUD, Telemetría SCADA

### TUP (Transporte Urbano de Pasajeros)
- Definition: The public bus transit network of Venado Tuerto that provides free school transit for educational visits to the Industrial Park, managed via an operational driver dashboard in `/admin/tup`.
- Aliases: Logística TUP, Colectivo Municipal, Traslado TUP

### Visitas Educativas (H4)
- Definition: The educational outreach program receiving 5th and 6th-year secondary school students for vocational training and simulator immersion, capped at 40 attendees per shift.
- Aliases: módulo de Visitas Educativas, H4, Jornadas Escolares

### Rack de Simuladores
- Definition: The physical equipment controller in `/admin/registro-actividades` displaying live LED status lights for each machine and enabling operators to toggle states between 'libre', 'en_operacion', and 'mantenimiento'.
- Aliases: Rack en Vivo, Rack

### Sesión en Vivo
- Definition: A live training session conducted for a company or educational cohort, featuring an active stopwatch, linked simulator IDs, and participant roster tracking.
- Aliases: Live Session, Sesión Activa

### Operario 3D
- Definition: The animated 3D human worker model in Three.js equipped with work overalls, safety hardhat, and a VR headset, cycling through a kinematic state machine (espera, caminando, sentandose, operando, levantandose, retornando).
- Aliases: 3D Operator, Operario

### TurnoVisita
- Definition: A typed enum of allowed visit shifts ('Mañana' or 'Tarde') used to enforce single-booking-per-slot availability on the `visitas_educativas` table.
- Aliases: turno, shift

### SolicitudVisitaInput
- Definition: The input contract for creating an educational visit request, carrying school ID, visit date, shift, student count, contact info, legal waivers, and attendee rosters.
- Aliases: visit request input, solicitud

### VisitaEducativa
- Definition: The persisted visit record extending the input with server-side fields: unique booking code (`VT-XXXX`), operational checks, and TUP transit schedules.
- Aliases: visit record, reserva

### CampoCheckOperativo
- Definition: The administrative boolean verification checklist columns on `visitas_educativas`: `check_poliza` (insurance), `check_tup` (transit), `check_facturas` (invoicing), and `check_drive_sum` (Drive upload).
- Aliases: checks operativos, operational checklist

### GeneroParticipante
- Definition: Categorization for training attendees (`hombre`, `mujer`, `otro`, `no_especifica`) used by municipal administrators to track gender inclusion in heavy machinery and technical trades.
- Aliases: género, gender equity metric
