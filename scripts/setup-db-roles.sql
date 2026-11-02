-- One-time setup: creates the app's restricted runtime role (lims_app) alongside
-- the existing POSTGRES_USER role, which stays as the schema owner used only for
-- migrations.
--
-- Run once per environment — substitute the password placeholder, then pipe into
-- psql as POSTGRES_USER:
--
--   sed "s/__APP_PASSWORD__/$POSTGRES_APP_PASSWORD/" scripts/setup-db-roles.sql | \
--     docker exec -i lims-postgres-1 psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
--
-- Why this exists: POSTGRES_USER becomes the cluster's bootstrap superuser in the
-- official postgres Docker image (confirmed directly — REASSIGN OWNED BY on it fails
-- with "required by the database system", and REVOKE from a superuser is a no-op
-- regardless). A superuser can always bypass GRANT/REVOKE and even DISABLE TRIGGER,
-- so no amount of restricting POSTGRES_USER itself can ever make AuditLogs genuinely
-- append-only against it. The only real fix is a *different*, genuinely
-- non-superuser role for the app's actual runtime traffic.
--
-- Safe to re-run except the CREATE ROLE line — drop that line (or change the role's
-- password separately) if lims_app already exists; every other statement here is
-- naturally idempotent (GRANT/REVOKE/ALTER DEFAULT PRIVILEGES don't error on
-- repetition).

CREATE ROLE lims_app LOGIN PASSWORD '__APP_PASSWORD__' NOSUPERUSER;

GRANT USAGE ON SCHEMA public TO lims_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lims_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lims_app;

-- Tables/sequences created by FUTURE migrations (still run as POSTGRES_USER) get the
-- same grants automatically — without this, every new migration would need a manual
-- GRANT afterward or the app would get a permission-denied on its own new table.
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lims_app;
ALTER DEFAULT PRIVILEGES FOR ROLE CURRENT_USER IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO lims_app;

-- The actual point of this script: lims_app (what the app now runs as for every
-- normal request) can no longer rewrite or erase audit history under any
-- circumstance, including DISABLE TRIGGER (that requires ownership, which lims_app
-- never has, and never can grant itself — confirmed: a self-GRANT attempt without
-- GRANT OPTION silently grants nothing). The append-only trigger (a separate,
-- earlier migration) already blocked accidental/casual tampering; this is what makes
-- it unconditional for the role the app actually runs as.
REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLogs" FROM lims_app;
