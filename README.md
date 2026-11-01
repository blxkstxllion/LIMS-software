# GBC LIMS

A Laboratory Information Management System modeled on the assay-laboratory sample workflow used at Ghana Bauxite Company (GBC) — sample intake through results, QC, and Certificate of Analysis generation.

## Problem

Assay labs track a sample through several handoffs — registration, verification, results entry, QC review, and a signed-off Certificate of Analysis (CoA) — each usually owned by a different role (chemist, QA, engineer, lab manager). Doing that on paper or in spreadsheets loses the audit trail and makes it hard to enforce who's allowed to approve what at each stage.

## What it does

Sample lifecycle: registration, management, and verification are tracked as distinct stages, each represented by its own `Sample` entity state (`SampleStatus`). Results entry records and status-tracks assay results (`Result`, `ResultStatus`) against a sample, with server-side recalculation and validation of the oxide chemistry — the browser's own calculation is shown for instant feedback but never trusted. A separate `QcSample` model and workflow handles quality-control checks alongside regular production samples. Certificate of Analysis (CoA) generation is handled by a dedicated `Coa` entity: each COA is generated from one specific approved `Result` and freezes a snapshot of its values at that moment, so a later re-assay of the same sample can never change a certificate that's already been issued. COA and Result approval both require Draft→Approved (→Issued, for COAs) through a reviewer who isn't the person who created the record, re-entering their password at the moment of approval (an e-signature). File attachments — supporting documents attached to samples and results — are handled via a dedicated `Attachment` entity and file-management endpoints, with an extension allow-list. Audit logging is handled by an `AuditLog` entity and service recording who did what and why (`Reason`, `OldValues`/`NewValues`), enforced append-only by a Postgres trigger. Access is role-based across five roles (`admin`, `xrf_chemist`, `bauxite_engineer`, `qa_engineer`, `management`), each gated per-page on the frontend (`canAccess`) and enforced via ASP.NET Core Identity roles on the backend. Reports, analytics, and an admin panel round out the app as first-class pages alongside the core sample/QC/CoA workflow.

## Architecture

Backend — ASP.NET Core 8 Web API (`GbcLims.Api`), split into `GbcLims.Domain` (entities, enums, role/permission constants, no external dependencies) and `GbcLims.Infrastructure` (EF Core `DbContext`, Identity, external services). Controllers: `Samples`, `QcSamples`, `Results`, `Coas`, `Attachments`, `AuditLogs`, `Dashboard`, `Notifications`, `Users`, `Auth`.

Database — PostgreSQL via `Npgsql.EntityFrameworkCore.PostgreSQL` and EF Core 8, with EF Core's in-memory provider used for local development (see below). `AuditLogs` has a Postgres trigger rejecting any `UPDATE`/`DELETE`/`TRUNCATE` outright, regardless of caller.

Auth — JWT access tokens (1 hour) plus a hashed, rotating refresh token (7 days, one row per device/session) delivered as an HttpOnly, SameSite=Strict cookie scoped to `/api/auth` — never in `localStorage`, never in a JSON response body. The API refuses to start without a signing secret configured (`Jwt:Secret`) — there is no built-in default to fall back on. `/api/auth/login` and `/api/auth/refresh` are rate-limited per IP.

Frontend — React 19 + Vite, plain JavaScript/JSX (no TypeScript in this repo). Client-side state is handled with React Context (`AuthContext`, `SampleContext`, `UIContext`) rather than a state-management library, and navigation is a manual page-switch (`AppRoutes`) driven by app state rather than a router package — there's no `react-router` dependency here. Charts are rendered with `recharts`, icons with `lucide-react`.

## Local development

The backend deliberately makes local setup low-friction: in the Development environment the connection string is left blank on purpose, so the API falls back to an in-memory database and seeds five test accounts on startup, one for each role — ADMIN, CHEMIST, ENGINEER, QA, and MANAGER — all with the password Test1234. This seeding only happens in Development; it is not a production fallback.

Backend, from backend/src/GbcLims.Api: run "dotnet user-secrets set Jwt:Secret YOUR_LONG_RANDOM_VALUE" once, then "dotnet run".

Any environment other than Development needs Jwt__Secret and ConnectionStrings__DefaultConnection set as real environment variables, never in appsettings.json, which is checked in with placeholder text on purpose, plus Cors:AllowedOrigins pointed at the real frontend origin(s); it defaults to the local Vite dev ports otherwise.

Frontend: run "npm install" then "npm run dev".

## Testing and CI

Backend tests live in `backend/tests/GbcLims.Tests` (xUnit, `WebApplicationFactory` against the in-memory provider) and cover the auth flow, the Sample and Result state machines, self-approval blocking, the e-signature password check, the Rejected→Draft correction path, and — the most important one — a regression test proving a COA's snapshot stays frozen after its sample is re-assayed and re-approved. Run with `dotnet test` from `backend/`.

GitHub Actions (`.github/workflows/ci.yml`) runs on every push/PR to `master`: frontend (`npm ci && npm run lint && npm run build`) and backend (`dotnet build -c Release && dotnet test`) as separate jobs.

## Deployment

Deployed via Docker Compose (`docker-compose.yml`, `Dockerfile.frontend`, `backend/Dockerfile`) behind a shared Caddy instance that terminates TLS and reverse-proxies to this app's own frontend/API containers on a private Docker network. The API exposes `/health` (checks DB connectivity) for the container healthcheck and an external uptime monitor. Nightly backups of the database and attachments volume to S3 are handled by `scripts/backup-db.sh`; `scripts/restore-db.sh` restores into a throwaway container by default (`--target test`) or the live stack (`--target live`).

## Current status and limitations

Live and in active use. Known gaps: integration tests run against EF Core's in-memory provider rather than a real Postgres instance (Testcontainers would catch real-SQL-behavior bugs the in-memory provider can't); `src/pages/FeaturePages.jsx` is a large single file covering several feature pages rather than split out; there's no client-side router (`react-router`), so there are no deep links and the browser back button doesn't navigate within the app; audit-log append-only enforcement relies on a Postgres trigger rather than a dedicated restricted database role (the app's runtime DB user is still also the migration owner).

## Roadmap

Planned next steps include migrating integration tests to Testcontainers, splitting `FeaturePages.jsx` into one file per page, adding a client-side router, and splitting the database connection into a migration-owner role and a permission-restricted runtime role.
