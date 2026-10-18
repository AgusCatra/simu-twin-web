# Getting Started

<cite>
**Referenced Files in This Document**
- [package.json](file://package.json)
- [README.md](file://README.md)
- [next.config.ts](file://next.config.ts)
- [tsconfig.json](file://tsconfig.json)
- [src/lib/supabase.ts](file://src/lib/supabase.ts)
- [src/services/visitasService.ts](file://src/services/visitasService.ts)
- [src/types/visitas.ts](file://src/types/visitas.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Environment Setup](#environment-setup)
5. [Development Workflow](#development-workflow)
6. [Supabase Integration](#supabase-integration)
7. [Troubleshooting Guide](#troubleshooting-guide)
8. [Conclusion](#conclusion)

## Introduction

Simu-Twin-Web is a Next.js 15 application built with TypeScript, React 19, and Supabase for database functionality. The project follows modern web development practices with Turbopack for enhanced development performance and includes a complete educational visit management system with school data handling and visit scheduling capabilities.

This getting started guide will help you set up the development environment, configure Supabase integration, and begin building features for the educational visit management system.

## Prerequisites

Before setting up Simu-Twin-Web, ensure you have the following tools installed on your system:

### Node.js Requirements
- **Node.js**: Version 18.18 or later (recommended: latest LTS version)
- **npm**: Version 9+ (comes with Node.js)
- **Alternative package managers**: yarn, pnpm, or bun are also supported

### Database Requirements
- **Supabase Account**: Create a free account at [supabase.com](https://supabase.com)
- **Project Setup**: Create a new Supabase project to obtain your API credentials

### System Requirements
- **Operating System**: Windows, macOS, or Linux
- **Git**: For cloning the repository
- **Code Editor**: VS Code recommended with TypeScript and ESLint extensions

**Section sources**
- [package.json:11-16](file://package.json#L11-L16)
- [package.json:17-27](file://package.json#L17-L27)

## Installation

Follow these step-by-step instructions to install and set up the Simu-Twin-Web project:

### Step 1: Clone the Repository
```bash
git clone <repository-url>
cd simu-twin-web
```

### Step 2: Install Dependencies
Choose your preferred package manager:

**Using npm:**
```bash
npm install
```

**Using yarn:**
```bash
yarn install
```

**Using pnpm:**
```bash
pnpm install
```

**Using bun:**
```bash
bun install
```

### Step 3: Verify Installation
After installation completes, verify that all dependencies are properly installed by running:
```bash
npm run lint
```

The project uses ESLint for code quality checks and should run without errors if the setup is correct.

**Section sources**
- [package.json:5-10](file://package.json#L5-L10)
- [package.json:11-27](file://package.json#L11-L27)

## Environment Setup

### Creating Environment Variables

Create a `.env.local` file in the root directory of your project with the following variables:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Setting Up Supabase

1. **Create a Supabase Project:**
   - Go to [supabase.com](https://supabase.com)
   - Click "New Project"
   - Choose a name and region for your project
   - Wait for the project to be created

2. **Get Your API Credentials:**
   - Navigate to Settings → API in your Supabase dashboard
   - Copy the "Project URL" and "anon public" key
   - Add these values to your `.env.local` file

3. **Database Schema Setup:**
   The application expects the following tables in your Supabase database:

   **Escuelas Table:**
   - `id` (UUID, primary key)
   - `nombre_institucion` (text)
   - `nombre_corto` (text)
   - `direccion` (text)

   **Visitas_Educativas Table:**
   - `id` (UUID, primary key)
   - `id_escuela` (UUID, foreign key)
   - `fecha_visita` (date)
   - `turno` (enum: 'Mañana' | 'Tarde')
   - `division` (text)
   - `cant_alumnos` (integer)
   - `nombre_director` (text)
   - `cel_director` (text)
   - `nombre_docente` (text)
   - `cel_docente` (text)
   - `drive_nomina_url` (text, optional)
   - `estado_visita` (text, default: 'Confirmada')
   - `estado_poliza` (text, default: 'Pendiente')

**Section sources**
- [src/lib/supabase.ts:3-6](file://src/lib/supabase.ts#L3-L6)
- [src/services/visitasService.ts:9-18](file://src/services/visitasService.ts#L9-L18)
- [src/services/visitasService.ts:36-58](file://src/services/visitasService.ts#L36-L58)
- [src/types/visitas.ts:1-28](file://src/types/visitas.ts#L1-L28)

## Development Workflow

### Starting the Development Server

Run the development server with hot reloading enabled:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

The development server will start on `http://localhost:3000` with automatic page reload when you make changes to your files.

### Building for Production

Create an optimized production build:

```bash
npm run build
# or
yarn build
# or
pnpm build
# or
bun build
```

### Running the Production Build

Start the production server:

```bash
npm run start
# or
yarn start
# or
pnpm start
# or
bun start
```

### Code Quality and Linting

Run ESLint to check for code quality issues:

```bash
npm run lint
# or
yarn lint
# or
pnpm lint
# or
bun lint
```

### Development Features

The project uses several modern development features:

- **Turbopack**: Enhanced development and build performance
- **TypeScript**: Full type safety throughout the application
- **ESLint**: Code quality and consistency checks
- **Tailwind CSS**: Utility-first CSS framework
- **Next.js App Router**: Modern routing and server-side rendering

**Section sources**
- [package.json:5-10](file://package.json#L5-L10)
- [README.md:5-17](file://README.md#L5-L17)
- [next.config.ts:3-5](file://next.config.ts#L3-L5)

## Supabase Integration

### Client Configuration

The Supabase client is configured in `src/lib/supabase.ts` and provides a centralized way to interact with your Supabase database. The client automatically reads environment variables for authentication.

### Database Operations

The application includes a comprehensive service layer for managing educational visits:

#### School Management
- Retrieve schools with their details and addresses
- Sort institutions alphabetically
- Access school information for visit scheduling

#### Visit Scheduling
- Check availability for specific dates and time slots
- Prevent double bookings for the same time slot
- Validate visit requests before creation

#### Visit Creation
- Create new educational visit requests
- Automatically set initial status values
- Return complete visit objects with IDs

### Type Safety

The project uses TypeScript interfaces to ensure type safety across all database operations:

- **Escuela**: Represents school information
- **SolicitudVisitaInput**: Input validation for visit requests
- **VisitaEducativa**: Complete visit object with all fields
- **TurnoVisita**: Enumerated time slot options ('Mañana' | 'Tarde')

**Section sources**
- [src/lib/supabase.ts:1-7](file://src/lib/supabase.ts#L1-L7)
- [src/services/visitasService.ts:1-59](file://src/services/visitasService.ts#L1-L59)
- [src/types/visitas.ts:1-28](file://src/types/visitas.ts#L1-L28)

## Troubleshooting Guide

### Common Setup Issues

#### Port Conflicts
If port 3000 is already in use:
```bash
# Find processes using port 3000
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# Kill the process or change the port
PORT=3001 npm run dev
```

#### Database Connection Errors
Common Supabase connection issues:

1. **Missing Environment Variables:**
   - Ensure `.env.local` exists in the project root
   - Verify both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set correctly

2. **Invalid Credentials:**
   - Double-check your Supabase project URL format
   - Verify the anon key matches your project settings
   - Ensure your Supabase project is active

3. **Network Issues:**
   - Check your internet connection
   - Verify firewall settings aren't blocking Supabase connections
   - Try accessing your Supabase project URL directly in a browser

#### TypeScript Compilation Errors
If you encounter TypeScript errors:

1. **Restart the Development Server:**
   ```bash
   npm run dev
   ```

2. **Clear Cache:**
   ```bash
   rm -rf .next node_modules/.cache
   npm install
   ```

3. **Check Type Definitions:**
   - Ensure all required types are imported correctly
   - Verify interface definitions match your database schema

#### Build Failures
For production build issues:

1. **Memory Issues:**
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" npm run build
   ```

2. **Dependency Conflicts:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   npm run build
   ```

#### Performance Issues
If the development server is slow:

1. **Use Turbopack:**
   The project already uses Turbopack for faster builds and development

2. **Optimize Imports:**
   - Use absolute imports with the `@/*` path alias
   - Avoid importing large libraries unnecessarily

3. **Code Splitting:**
   - Next.js automatically handles code splitting
   - Use dynamic imports for heavy components

### Debugging Tips

#### Enable Detailed Logging
Add logging to your Supabase calls:
```typescript
// In your service files
const { data, error } = await supabase.from('table').select('*');
if (error) {
  console.error('Supabase Error:', error);
}
```

#### Check Network Requests
Use browser developer tools to inspect network requests to Supabase endpoints.

#### Test Database Connectivity
Verify your Supabase connection by testing queries directly in the Supabase dashboard.

**Section sources**
- [src/lib/supabase.ts:3-6](file://src/lib/supabase.ts#L3-L6)
- [src/services/visitasService.ts:10-17](file://src/services/visitasService.ts#L10-L17)
- [src/services/visitasService.ts:24-33](file://src/services/visitasService.ts#L24-L33)
- [src/services/visitasService.ts:45-57](file://src/services/visitasService.ts#L45-L57)

## Conclusion

You now have everything you need to get started with the Simu-Twin-Web project. The application provides a solid foundation for building educational visit management features with modern web technologies.

### Next Steps

1. **Explore the Codebase:** Familiarize yourself with the project structure and existing services
2. **Set Up Your Database:** Create the required tables in Supabase
3. **Build Your First Feature:** Start with simple CRUD operations using the existing patterns
4. **Learn More:** Check out the Next.js documentation for advanced features

### Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)

The project follows industry best practices and provides a scalable architecture for growing your application. With the development workflow established, you can focus on building features while maintaining code quality and performance.