using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GbcLims.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddAuditLogAppendOnlyTrigger : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Defense-in-depth for the audit trail: the API has no endpoint that can
            // edit or delete an AuditLogs row, but that only stops tampering through
            // the app. A bug, a stray SQL session on the server, or anyone with the
            // database password could still UPDATE/DELETE/TRUNCATE the table directly.
            // This makes Postgres itself refuse, regardless of caller.
            //
            // Not a substitute for splitting the DB connection into a migration-owner
            // role and a restricted runtime role (tracked separately, deferred because
            // it touches credentials, Program.cs's migration path, and restore-db.sh —
            // real infra changes, not safe to slip into a routine deploy). The owner
            // role can always DROP TRIGGER first. This stops accidents and casual
            // tampering; the two-role split is what makes it unconditional.
            migrationBuilder.Sql(@"
                CREATE FUNCTION audit_logs_block_changes() RETURNS trigger AS $$
                BEGIN
                  RAISE EXCEPTION 'AuditLogs is append-only';
                END;
                $$ LANGUAGE plpgsql;

                CREATE TRIGGER audit_logs_no_update_delete
                  BEFORE UPDATE OR DELETE ON ""AuditLogs""
                  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_changes();

                CREATE TRIGGER audit_logs_no_truncate
                  BEFORE TRUNCATE ON ""AuditLogs""
                  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_block_changes();
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                DROP TRIGGER IF EXISTS audit_logs_no_update_delete ON ""AuditLogs"";
                DROP TRIGGER IF EXISTS audit_logs_no_truncate ON ""AuditLogs"";
                DROP FUNCTION IF EXISTS audit_logs_block_changes();
            ");
        }
    }
}
