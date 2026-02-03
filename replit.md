# Remaker

## Overview

Remaker is a web application for verifying unique IDs and managing lists with instant duplicate detection. Users can create documents, add numbered entries, and the system guarantees uniqueness within each document. The app provides real-time feedback when duplicates are attempted, along with export functionality.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style)
- **Animations**: Framer Motion for smooth transitions
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Pattern**: RESTful endpoints defined in `shared/routes.ts`
- **Validation**: Zod schemas shared between client and server

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts`
- **Migrations**: Drizzle Kit (`db:push` command)
- **Tables**:
  - `documents`: Stores list metadata (id, name, createdAt)
  - `numbers`: Stores entries with unique constraint per document

### Key Design Patterns
- **Shared Types**: Schema and route definitions in `shared/` directory are used by both frontend and backend
- **Type-Safe API**: Zod schemas validate both request inputs and response outputs
- **Monorepo Structure**: Client code in `client/`, server in `server/`, shared types in `shared/`

### File Structure
```
client/src/       - React application
  components/     - Reusable UI components
  pages/          - Route page components
  hooks/          - Custom React hooks including API mutations
  lib/            - Utility functions and query client
server/           - Express backend
  routes.ts       - API endpoint handlers
  storage.ts      - Database operations
  db.ts           - Drizzle connection
shared/           - Shared between client and server
  schema.ts       - Drizzle table definitions and Zod schemas
  routes.ts       - API route definitions with types
```

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connection via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database queries and schema management

### UI Components
- **shadcn/ui**: Pre-built accessible components based on Radix UI primitives
- **Radix UI**: Headless UI primitives for dialogs, tooltips, forms, etc.
- **Lucide React**: Icon library

### Client Libraries
- **TanStack React Query**: Async state management and caching
- **Framer Motion**: Animation library
- **canvas-confetti**: Celebration effects
- **date-fns**: Date formatting utilities

### Development
- **Vite**: Frontend build and dev server with HMR
- **esbuild**: Server bundling for production
- **TypeScript**: Type checking across the entire codebase