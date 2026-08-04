using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace GbcLims.Infrastructure.Persistence;

// Used only by `dotnet ef migrations`/`database update` at design time. The real app
// (Program.cs) builds the full host to resolve DbContextOptions, which fail-fasts if
// Jwt:Secret isn't configured — appropriate at runtime, but it means the EF CLI can never
// stand the host up just to inspect the model. This factory gives the tooling a DbContext
// wired to Postgres without going through the rest of app startup.
// `migrations add` only inspects the model and never opens a connection, so the fallback
// dummy string is fine there. `database update` does connect for real, so it honors
// ConnectionStrings__DefaultConnection from the environment when set.
public class GbcLimsDbContextFactory : IDesignTimeDbContextFactory<GbcLimsDbContext>
{
    public GbcLimsDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");
        var optionsBuilder = new DbContextOptionsBuilder<GbcLimsDbContext>();
        optionsBuilder.UseNpgsql(string.IsNullOrWhiteSpace(connectionString)
            ? "Host=localhost;Port=5432;Database=gbclims_design;Username=design;Password=design"
            : connectionString);
        return new GbcLimsDbContext(optionsBuilder.Options);
    }
}
