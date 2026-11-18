# Bugcrowd / PATCH Take-Home: CISA Advisories for Hospital Inventory

Flags which hospital devices are affected by CISA medical advisories and shows how to fix them, without leaving the app.

## Screenshots / Screen-recording

<img width="1440" height="1250" alt="dashboard" src="https://github.com/user-attachments/assets/4e91da1b-b4a2-49e8-a94c-cb232ad996b4" />

<img width="1440" height="1250" alt="sheet" src="https://github.com/user-attachments/assets/dfc3738c-93d0-441b-92d2-f9c5c74f21da" />

<img width="1440" height="1250" alt="sheet-possible" src="https://github.com/user-attachments/assets/b18b448c-13b0-4460-aaf0-d44491628bdd" />

https://hospital-inventory-seven.vercel.app/

## Design Decisions

### Matching advisories to devices

Matching runs in three steps, in pure, unit-tested functions under `src/features/advisories/lib/`:

1. **Vendor.** Names are normalised by dropping suffixes such as "Inc" or "Healthcare", using abbreviations in parentheses, and applying a small alias table. So "BD" matches "Becton, Dickinson and Company (BD)".
2. **Product.** Model numbers must match, including ranges like `MX400-MX850`, so `Alaris 8000` never matches an `Alaris 8015`. An advisory for a whole product family, such as "Alaris PC Unit", matches only devices whose name contains all of its words.
3. **Version.** Versions are compared numerically, so `9.33 < 12.1.2`. The parser handles every format in CISA's feed: lists, ranges (`>= 4.01 | <= 4.34`), wildcards (`8.x`), revision letters (`<=N`) and "all versions". Versions that use different schemes are never guessed.

| Status | When |
|---|---|
| **Affected** | Product matches and the version is in range, or the advisory covers all versions |
| **Possibly affected** | Product matches, but the version or model is unknown or can't be compared |
| No match | Different product, or a version outside every affected range |

A false "not affected" is the dangerous mistake in a hospital, so uncertain cases are shown as *possibly affected* rather than dropped. Every match also stores a one-line reason, so users can see why a device was flagged.

### Presenting advisories

- **Fix first.** The device panel opens inside the app and starts with "What to do": vendor fixes first, then mitigations. CVE details are folded away, and CISA's generic boilerplate is left out.
- **Worst case wins.** A device shows the weakest fix across its advisories, because the unfixed advisory is the one that needs attention.
- **Risk first.** The table sorts affected devices to the top by severity. The summary cards double as filters.

### Automation

An hourly Inngest job reads CISA's `changes.csv` and downloads only new or changed medical advisories, in retryable batches. It then re-matches the whole inventory. New devices are matched as soon as they're created.

### Assumptions

- The inventory's manufacturer, product and version roughly match what's printed on the device.
- Only CISA **medical** advisories (`icsma-*`) are relevant.
- CISA's remediation categories are shown as published, even though they aren't always accurate.

### Tradeoffs

- **Name matching is a best guess.** The three statuses and the visible reasons limit the harm, and a rare false positive is preferred to a false negative.
- **Matching runs in memory.** That's instant for about 700 advisory products, but a very large inventory would need indexing.
- **Polling, not push.** CISA offers no webhook, and polling one small file every hour is cheap.

### What I'd do with more time

- Match on standard identifiers (CPE, PURL, FDA device IDs) where they're available.
- Let users confirm or dismiss *possibly affected* matches.
- Alert people (by email or Slack) when a new advisory matches.
- Add authentication, multi-tenant inventories and end-to-end UI tests.

## Stack

- [Next.js 15](https://nextjs.org) (App Router), React 19, TypeScript (strict)
- [tRPC 11](https://trpc.io) for type-safe API's, with [TanStack Query](https://tanstack.com/query)
- [Prisma 6](https://www.prisma.io) ORM with PostgreSQL
- [shadcn/ui](https://ui.shadcn.com) component library + Tailwind CSS 4
- [nuqs](https://nuqs.47ng.com) for URL state (page, search, sort, exposure filter, open device)
- [Biome](https://biomejs.dev) for lint and format, [Vitest](https://vitest.dev) for tests
- [Inngest](https://www.inngest.com) for the scheduled CISA advisory sync (see below)

## Getting started

Requires Node 20+ and Docker.

```bash
cp .env.example .env
npm install            # also generates the Prisma client
npm run db:up          # starts Postgres on localhost:5432
npm run db:migrate     # applies the migrations
npm run db:seed        # loads sample assets (skipped if assets already exist)
npm run dev:all        # Runs Next.js, Inngest dev server, and Prisma studio
```

Then open http://localhost:3000 and click **Sync now** to import the CISA medical advisories. The first sync takes about 10 seconds, and the dashboard refreshes by itself when it finishes. After that, the sync runs every hour while the Inngest dev server is running. Its runs are listed at http://localhost:8288.

No Inngest keys are needed locally, because the SDK finds the dev server automatically. If the Inngest dev server isn't running, **Sync now** runs the sync in the background inside the app instead.

## Background jobs

Inngest runs the CISA advisory sync (`src/inngest/functions/sync-advisories.ts`):

- **Triggers:** every hour, and on demand when a user clicks **Sync now**.
- **Steps:** find new or changed advisories in CISA's `changes.csv`, import them in batches of 25 (each batch retries on its own), then re-match the whole inventory.
- **Safety:** only one sync runs at a time, and failures are saved and shown on the dashboard.
- `src/app/api/inngest/route.ts` serves the function. `npm run inngest:dev` (or `npm run dev:all`) starts the dev server, with its dashboard at http://localhost:8288.

## Project layout

```
prisma/
  schema.prisma              # assets, advisories, matches, sync state
  migrations/                # SQL migrations
  seed.ts                    # sample data
src/
  app/
    (dashboard)/layout.tsx   # app shell: sidebar + top bar
    (dashboard)/page.tsx     # asset dashboard
    docs/page.tsx            # Scalar API reference
    api/trpc/[trpc]/         # tRPC endpoint used by the UI
    api/v1/[...trpc]/        # REST endpoints (trpc-to-openapi)
    api/openapi.json/        # generated OpenAPI document
    api/inngest/             # Inngest endpoint
  features/advisories/
    lib/                     # CSAF parser and vendor/product/version matching (unit tested)
    server/                  # CISA source, sync, matching service, tRPC router
    components/              # summary cards, badges, device detail panel
    hooks/                   # summary polling, detail query, sync action
  features/assets/
    components/              # table columns, create dialog, page sections
    hooks/                   # client data hooks and URL params
    server/routers.ts        # tRPC router: getMany, create
    types.ts                 # zod input and response schemas
  inngest/                   # Inngest client and the advisory sync function
  trpc/                      # tRPC init, client provider, server helpers
  components/                # app sidebar, top bar, theme toggle, page-level building blocks
  components/ui/             # shadcn/ui components and the DataTable
  lib/                       # pagination, Prisma client, shared helpers
```

## Scripts

| Script           | Description                       |
| ---------------- | --------------------------------- |
| `npm run dev`    | Dev server (Turbopack)            |
| `npm run dev:all` | Dev server, Inngest dev server and Prisma Studio, via mprocs |
| `npm run inngest:dev` | Inngest dev server, which runs the hourly advisory sync |
| `npm run build`  | Production build                  |
| `npm run start`  | Serve the production build        |
| `npm run lint`   | Biome lint and format check       |
| `npm run format` | Format with Biome                 |
| `npm test`       | Vitest in watch mode (`-- --run` for a single run) |
| `npm run db:up`  | Start the local Postgres container (Docker) |
| `npm run db:migrate` | Create and apply migrations in development |
| `npm run db:seed` | Load the sample inventory (skipped if assets exist) |
