# GBC LIMS

A Laboratory Information Management System modeled on the assay-laboratory sample workflow used at Ghana Bauxite Company (GBC) — sample intake through results, QC, and Certificate of Analysis generation.

## Problem

Assay labs track a sample through several handoffs — registration, verification, results entry, QC review, and a signed-off Certificate of Analysis (CoA) — each usually owned by a different role (chemist, QA, engineer, lab manager). Doing that on paper or in spreadsheets loses the audit trail and makes it hard to enforce who's allowed to approve what at each stage.

## What it does

Sample lifecycle: registration, management, and verification are tracked as distinct stages, each represented by its own `Sample` entity state (`SampleStatus`). Results entry records and status-tracks assay results (`Result`, `ResultStatus`) against a sample. A separate `QcSample` model and workflow handles quality-control checks alongside regular production samples. Certificate of Analysis (CoA) generation is handled by a dedicated `Coa` entity and generator page/endpoint for producing the signed-off analysis certificate once results are approved. File attachments — supporting documents attached to samples and results — are handled via a dedicated `Attachment` entity and file-management endpoints. Audit logging is handled by an `AuditLog` entity and service recording who did what, for lab-compliance traceability. Access is role-based across five roles (`ADMIN`, `CHEMIST`, `ENGINEER`, `QA`, `MANAGER`), each gated per-page on the frontend (`canAccess`) and enforced via ASP.NET Core Identity roles on the backend. Reports, analytics, and an admin panel round out the app as first-class pages alongside the core sample/QC/CoA workflow.

## Architecture

Backend — ASP.NET Core 8 Web API (`GbcLims.Api`), split into `GbcLims.Domain` (entities, enums, no external dependencies), `GbcLims.Application`, and `GbcLims.Infrastructure` (EF Core `DbContext`, Identity, external services). Controllers: `Samples`, `QcSamples`, `Results`, `Coas`, `Attachments`, `AuditLogs`, `Notifications`, `Users`, `Auth`.

Database — PostgreSQL via `Npgsql.EntityFrameworkCore.PostgreSQL` and EF Core 8, with EF Core's in-memory provider used for local development (see below).

Auth — JWT bearer tokens. The API refuses to start without a signing secret configured (`Jwt:Secret`) — there is no built-in default to fall back on.

Frontend — React 19 + Vite, plain JavaScript/JSX (no TypeScript in this repo). Client-side state is handled with React Context (`AuthContext`, `SampleContext`, `UIContext`) rather than a state-management library, and navigation is a manual page-switch (`AppRoutes`) driven by app state rather than a router package — there's no `react-router` dependency here. Charts are rendered with `recharts`, icons with `lucide-react`.

## Local development

The backend deliberately makes local setup low-friction: in the Development environment the connection string is left blank on purpose, so the API falls back to an in-memory database and seeds five test accounts on startup, one for each role — ADMIN, CHEMIST, ENGINEER, QA, and MANAGER — all with the password Test1234. This seeding only happens in Development; it is not a production fallback.

Backend, from backend/src/GbcLims.Api: run "dotnet user-secrets set Jwt:Secret YOUR_LONG_RANDOM_VALUE" once, then "dotnet run".

Any environment other than Development needs Jwt__Secret and ConnectionStrings__DefaultConnection set as real environment variables, never in appsettings.json, which is checked in with placeholder text on purpose, plus Cors:AllowedOrigins pointed at the real frontend origin(s); it defaults to the local Vite dev ports otherwise.

Frontend: run "npm install" then "npm run dev".

## Current status and limitations

This is an actively-developed personal/portfolio project reflecting a real lab workflow, not a deployed production system. There is no CI/CD pipeline set up yet (no GitHub Actions workflows in this repo), and no automated test suite yet. PostgreSQL is wired up via EF Core/Npgsql for non-development environments, but day-to-day development runs against the in-memory provider described above — the Postgres path hasn't been exercised the way the in-memory one has. The project is on a single master branch, with no branch protection or CI gating yet.

## Roadmap

Planned next steps include automated backend and frontend test coverage, a CI pipeline (lint, build, test) similar to the one already in place on [The Shop Keeper](https://github.com/blxkstxllion/shopkeeper), and exercising and documenting the PostgreSQL path outside of local development.
