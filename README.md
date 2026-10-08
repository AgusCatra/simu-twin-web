# Centro de Entrenamiento en Simuladores — Venado Tuerto

> Plataforma web oficial del Centro Municipal de Entrenamiento en Simuladores del **Gobierno de Venado Tuerto** (Santa Fe, Argentina), ubicado en el Parque Industrial. Integra formación técnica en maquinaria pesada, un gemelo digital 3D interactivo con telemetría SCADA, gestión de visitas escolares y logística de traslados municipales (TUP).

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.1-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL-black?logo=three.js)](https://threejs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_%26_Auth-3ecf8e?logo=supabase)](https://supabase.com/)

---

## 📖 Documentación Completa

Para acceder a la documentación técnica exhaustiva, diagramas de arquitectura, modelos de datos, políticas de seguridad RLS y flujos de trabajo, consulta la **[Wiki Oficial del Proyecto](file:///c:/Users/catra/Desktop/simu-twin-web/docs/WIKI.md)**.

---

## 🚀 Módulos Principales

### 1. 🏭 Gemelo Digital 3D y Nave SCADA ([`src/components/gemelo/`](file:///c:/Users/catra/Desktop/simu-twin-web/src/components/gemelo/))
- **Nave Industrial Procedural**: Modelado en Three.js con dimensiones reales (28m x 22m x 7.5m), cerchas, columnas de acero y demarcación perimetral de seguridad continua.
- **7 Puestos de Simulación**: Autoelevador, pala frontal, retroexcavadora, grúa telescópica, tractor, camión articulado y cabina SimSpray.
- **Operarios 3D Animados**: Cinemática directa con mameluco de trabajo, casco de seguridad y visor VR, alternando estados entre descanso, caminata y operación.
- **HUD SCADA**: Telemetría en tiempo real de consumo eléctrico (kWh), temperatura de cabina y puestos activos.

### 2. 🎓 Reserva de Visitas Educativas H4 ([`src/app/visitas/`](file:///c:/Users/catra/Desktop/simu-twin-web/src/app/visitas/))
- Formulario público para contingentes de 5° y 6° año de escuelas secundarias (cupo máximo: 40 alumnos).
- Validación de disponibilidad contra calendario municipal (`fechas_habilitadas`).
- Carga dinámica de nóminas de alumnos y docentes con DNI argentino.
- Consentimientos de póliza de seguro, registro fotográfico y medidas judiciales.

### 3. 🚌 Logística TUP ([`src/app/admin/tup/`](file:///c:/Users/catra/Desktop/simu-twin-web/src/app/admin/tup/))
- Panel móvil para choferes y coordinadores del Transporte Urbano de Pasajeros de Venado Tuerto.
- Control de franjas horarias de retiro y retorno de estudiantes.
- Estados de viaje en tiempo real (`pendiente`, `en_camino`, `en_destino`, `completado`, `cancelado`).
- Botón de enlace directo a WhatsApp con los docentes a cargo.

### 4. ⚙️ Rack de Simuladores y Sesiones en Vivo ([`src/app/admin/registro-actividades/`](file:///c:/Users/catra/Desktop/simu-twin-web/src/app/admin/registro-actividades/))
- Conmutador en vivo del estado de cada puesto físico (`libre`, `en_operacion`, `mantenimiento`).
- Panel de sesión activa con cronómetro, registro de empresa/institución y nómina de participantes.
- **Métricas de Inclusión**: Registro tipado por género (Hombre, Mujer, Otro, N/E) para estadísticas de equidad en oficios.
- Acumulación automática de horas de uso en cada máquina física al finalizar la sesión.

### 5. 🛡️ Seguridad y Control de Acceso ([`src/middleware.ts`](file:///c:/Users/catra/Desktop/simu-twin-web/src/middleware.ts))
- Autenticación administrativa mediante Supabase Auth y Middleware en el Edge.
- **Row Level Security (RLS)**: Nóminas y datos personales de menores inaccesibles para usuarios anónimos.
- Trigger PL/pgSQL que blinda checks operativos contra manipulaciones externas.

---

## 🛠️ Puesta en Marcha

### Prerrequisitos
- Node.js 20+ (LTS recomendado)
- Cuenta o instancia de Supabase con las migraciones aplicadas

### Instalación
```bash
# 1. Clonar el repositorio
git clone <url-del-repo>
cd simu-twin-web

# 2. Configurar variables de entorno (.env.local)
NEXT_PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu-anon-key>

# 3. Instalar dependencias
npm install

# 4. Iniciar servidor de desarrollo
npm run dev
```

La aplicación se ejecuta localmente en [http://localhost:3000](http://localhost:3000).

### Scripts Disponibles
- `npm run dev`: Inicia el servidor de desarrollo con Next.js.
- `npm run build`: Compila la aplicación optimizada para producción con Turbopack.
- `npm run start`: Inicia el servidor compilado de producción.
- `npm run lint`: Ejecuta el linter ESLint sobre el proyecto.

---

## 🏛️ Créditos Institucionales
Desarrollado para el **Gobierno de Venado Tuerto** — Secretaría de Desarrollo Productivo / Educación y Modernización, en articulación con el **Parque Industrial de Venado Tuerto**.
