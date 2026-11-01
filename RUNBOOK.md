# RUNBOOK

Operational procedures for the live deployment at `https://lims.omnifixlabs.com`, server path `/opt/lims` on the Hetzner box. All commands below assume you're SSH'd into that server and in `/opt/lims`, unless noted otherwise.

## Deploy

```bash
git pull
docker compose up -d --build
```

This rebuilds the `api` and `frontend` images and recreates those containers. `Program.cs` runs `db.Database.Migrate()` on API startup — **a failed migration now crashes the container on purpose** (it used to log a warning and run on a broken schema; that was changed deliberately). If `docker ps` shows `lims-api-1` repeatedly restarting after a deploy, check `docker logs lims-api-1` for the migration error before doing anything else.

Verify after any deploy:
```bash
docker ps --format '{{.Names}}\t{{.Status}}' | grep lims   # all three should show healthy/Up
docker logs lims-api-1 2>&1 | tail -20                       # no warnings/errors
curl -s https://lims.omnifixlabs.com/health                  # {"status":"Healthy",...}
```

### Before deploying a migration that changes existing data (not just adds nullable columns)

Rehearse it first — don't find out a backfill is wrong on the real database:

```bash
./scripts/backup-db.sh
./scripts/restore-db.sh <stamp-from-the-backup-you-just-ran> --target test
# generate the SQL for just the new migration(s):
#   cd backend/src/GbcLims.Api && dotnet ef migrations script <last-deployed-migration> <new-migration> \
#     --project ../GbcLims.Infrastructure --startup-project . --output /tmp/migration.sql
docker exec -i lims-restore-test psql -U lims -d lims < /tmp/migration.sql
# inspect the result, then:
docker rm -f lims-restore-test && docker volume rm lims-restore-test-files
```

## Rollback

There's no automatic rollback — `docker compose` doesn't version images. To roll back:

```bash
git log --oneline -10          # find the commit to roll back to
git checkout <commit-hash> -- .
docker compose up -d --build
```

If the bad deploy included a migration that already ran against production data, rolling back the code does **not** undo the migration. You'd need to run that migration's `Down()` manually (same `dotnet ef migrations script` + `docker exec psql` pattern as above, or `dotnet ef database update <previous-migration>` from a machine with a direct connection to production Postgres) before the rolled-back code's model will match the schema again.

## Restore from backup

```bash
aws s3 ls s3://gbc-lims-db-backups/daily/ --profile lims    # find a stamp
./scripts/restore-db.sh <stamp> --target test               # verify first, always
./scripts/restore-db.sh <stamp> --target live                # only once you've verified
```

`--target live` stops `api`/`frontend`, drops and recreates the `lims` database, restores, and brings the stack back up. It prompts for typed confirmation (`RESTORE`) before doing anything destructive.

Test restores monthly, not just when something's already wrong — a backup you haven't restored is a backup you don't actually know works.

## Rotate the JWT secret

Rotating it invalidates every currently-issued access token and every refresh-token cookie immediately — everyone gets logged out. There's no graceful overlap period (only one secret is ever configured).

```bash
# generate a new one, e.g.:
openssl rand -base64 48
# then in .env:
JWT_SECRET=<new value>
docker compose up -d --build
```

## Reset the admin password / recover a locked-out admin

If you still have access to *any* admin account: use the Admin Panel's "Reset Password" action for the locked-out one (`PATCH /api/users/{staffId}/password`) — it also revokes that user's refresh tokens, forcing re-login.

If **no** admin account is accessible at all, re-trigger the bootstrap-admin path — but note it only fires when the `AspNetUsers` table is completely empty, which it won't be on a live system. On a live system with existing users, recovering access means either:
- Directly updating `AspNetUsers.PasswordHash` via `psql`, computing the new hash with ASP.NET Core Identity's `PasswordHasher<ApplicationUser>` (PBKDF2-HMAC-SHA256) from a throwaway local project — not by hand-rolling the hash format.
- Or, if you have root on the server already (which recovering this way requires anyway), going through the normal admin-reset-password flow using a session you already have.

There is deliberately no "forgot password" self-service flow and no API endpoint for resetting your own password without already being authenticated as an admin — this is an internal lab tool, not a public-facing product, and that trade-off was made on purpose.

## Common checks

```bash
# Is the append-only audit trigger still in place?
docker exec lims-postgres-1 psql -U lims -d lims -c "SELECT tgname FROM pg_trigger WHERE tgrelid = '\"AuditLogs\"'::regclass;"

# How many active (non-revoked, non-expired) sessions exist right now?
docker exec lims-postgres-1 psql -U lims -d lims -c "SELECT count(*) FROM \"RefreshTokens\" WHERE \"RevokedAt\" IS NULL AND \"ExpiresAt\" > now();"

# Disk space (Postgres + attachments volumes live on the same host disk)
df -h /var/lib/docker
```
