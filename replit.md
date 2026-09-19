# Remaker

## Overview

Remaker is an audit-record application, available in the browser and as an Electron desktop app. The workflow is:

    Audit Number -> Record ID + Box ID + Whitelist -> Validation -> Save -> Manage -> Export/Share

Every list belongs to one remake category, chosen before the list is created.
A list holds rows of four columns. Entering an 8-digit audit number automatically generates the other three. An Audit Range Generator fills whole ranges at once. Lists are saved to disk, managed from a dashboard, and exported as `.txt`: a first line of `FILEMK\\REMAKE JOB NID_RMK\\`, then one record per line with one space between fields and no column headings (columns: record_id, box_id, audit_no, whitelist).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style)
- **Animations**: Framer Motion for smooth transitions
- **Fonts**: DM Sans, Outfit and JetBrains Mono bundled via `@fontsource-variable` (no Google Fonts request, works offline)
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Pattern**: RESTful endpoints defined in `shared/routes.ts`
- **Validation**: Zod schemas shared between client and server

### Audit Number Rules
Derived in `shared/audit.ts` and shared by client and server. These rules were
recovered from the project's own data files, not invented, and are verified
against 225,000 rows of `whitelist-analyzer-AA-1m`, both `Remake_1-*.txt`
exports, and the COMBINE missing-audit report:

- `Record_ID` = `((audit - 1) mod 500) + 1`, zero-padded to 4 digits
- `Box_ID` = `((audit - 1) div 500 + 1) mod 2000`, zero-padded to 6 digits
- 500 records fill a box; the box counter wraps every 1,000,000 audits
- `Whitelist` is a per-list constant, default `AM399G_600105483_20170811.xml`
- Audit numbers are exactly 8 digits, optionally led by a two-letter prefix (`AA00025000`)

### Remake Categories
Defined once in `shared/categories.ts`; adding an entry there makes the category
appear in the picker, the dashboard filter and the editor with no other changes.

- Workflow is **New List -> Select Remake Type -> Create List**; a list cannot be
  created without a category. Both entry points (the landing page's "Start a New
  List" and the dashboard's "New List") go through the picker
- Stored on the document as `category` (the category's `id`)
- Ids are permanent once lists reference them; labels may be edited freely
- The dashboard filters by category with per-category counts, keeping the
  categories separate
- The editor shows the category at the top and can move a list to another one
- Records belong to a category through their list, so a record's category always
  matches its list
- Lists created before categories existed load as `other`

### Audit Prefix
Some sources label audit numbers with two leading letters, as in the
`whitelist-analyzer-AA-*` and COMBINE files. The prefix is a property of the
list, set in the editor's Audit Prefix section, and the letters vary per list.

- Stored on the document as `auditPrefix`; `""` means digits only
- Applied to newly typed rows and to everything the range generator produces
- Changing it rewrites the letters on existing rows; the digits are untouched
- Derivation ignores the prefix entirely: `AA00008115` and `00008115` both
  derive from `8115`, so Record ID and Box ID never change with the prefix
- A row may override the list prefix by typing its own letters
- Lists saved before prefixes existed load with `auditPrefix: ""`

### Data Storage
- **Storage**: JSON files, one per list, under `DATA_DIR/lists/<id>.json`
- **Location**: Electron points `DATA_DIR` at the OS userData folder; the web dev server falls back to `./data`
- **Writes**: temp file + rename, so an interrupted write cannot corrupt a list
- **Mirror**: an in-memory Map mirrors disk so the dashboard does not re-read large lists per request
- **Schema Location**: `shared/schema.ts`
- **Data Model**:
  - `documents`: list metadata (id, name, whitelist, createdAt, updatedAt)
  - `records`: rows of `auditNo` / `recordId` / `boxId` / `whitelist`

### Validation
- Audit number must be exactly 8 digits
- Duplicate audit numbers are rejected
- Duplicate `Record_ID` + `Box_ID` pairs are rejected (two audits 1,000,000 apart collide)
- Blank rows are ignored; Record/Box/Whitelist may not be blank on a filled row
- Checked live in the editor and again on the server, which is authoritative

### Desktop (Electron)
- **Entry Point**: `electron/main.cjs` (CommonJS, since the package is ESM)
- **Model**: The main process boots the bundled Express server (`dist/index.cjs`) in-process on a random free port bound to `127.0.0.1`, then loads a `BrowserWindow` at that origin
- **Data Folder**: `~/Library/Application Support/Remaker/data`; set `REMAKER_DATA_DIR` to point a build at another folder, e.g. for testing without touching real lists
- **Host Binding**: `server/index.ts` honours `HOST` (defaults to `0.0.0.0` for Replit); Electron sets it to loopback so the API is never exposed to the local network
- **Downloads**: The list export is a blob + `<a download>`; Electron converts it to a real download with a native save dialog, handled in `will-download`
- **Packaging**: electron-builder config lives under `build` in `package.json`; output goes to `release/`. `node_modules` is excluded because the esbuild server bundle is self-contained; `dist/**` is asar-unpacked so `express.static` reads real files
- **Scripts**: `desktop` (build + run), `desktop:pack` (unpacked app), `desktop:dist` (installers), `electron:dev` (attach to a running `npm run dev`)

### Theme
ICPS brand colours, defined as HSL custom properties in `client/src/index.css`
and consumed through Tailwind tokens (`bg-primary`, `text-destructive`, ...).

- `--primary` / `--accent` / `--ring`: ICPS indigo-blue, `236 55% 37%`
- `--destructive`: ICPS red, `354 76% 48%`
- `--card` / `--popover`: opaque white surfaces. These must stay defined - an
  undefined variable makes `bg-card` / `bg-popover` transparent, which silently
  renders dropdowns and cards see-through
- The saved / unsaved dot in the editor deliberately stays amber-green: it is a
  status signal, not branding
- `.dark` mirrors the same hues, lightened for contrast
- The ICPS logo is served from `client/public/icps-logo.png` and heads the
  landing page

### Key Design Patterns
- **Shared Types**: Schema and route definitions in `shared/` directory are used by both frontend and backend
- **Type-Safe API**: Zod schemas validate both request inputs and response outputs
- **Monorepo Structure**: Client code in `client/`, server in `server/`, shared types in `shared/`

### File Structure
```
client/src/       - React application
  components/     - Reusable UI components
  pages/          - Home (landing), Dashboard (/lists) and ListEditor (the grid)
  hooks/          - Custom React hooks including API mutations
  components/     - CategoryPicker (remake type selection) and shadcn/ui
  lib/            - Utilities, query client, and .txt export/share
electron/         - Desktop shell
  main.cjs        - Boots the server and opens the app window
server/           - Express backend
  routes.ts       - API endpoint handlers
  storage.ts      - JSON-file storage operations
shared/           - Shared between client and server
  audit.ts        - Audit number validation and ID derivation
  categories.ts   - Remake category definitions
  schema.ts       - Zod schemas and shared API types
  routes.ts       - API route definitions with types
```

## External Dependencies

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
