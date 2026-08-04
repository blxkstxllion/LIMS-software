using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace GbcLims.Infrastructure.Persistence;

// Used only by `dotnet ef migrations`/`database update` at design time. The real app
// (Program.cs) builds the full host to resolve DbContextOptions, which fail-fasts if
// Jwt:Secret isn't configured — appropriate at runtime, but it means the EF CLI can never
// stand the host up just to inspect the model. This factory gives the tooling a DbContext
// wired to Postgres without going through the rest of app startup; the connection string
// is never used to actually connect for `migrations add`, only for `database update`.
public class GbcLimsDbContextFactory : IDesignTimeDbContextFactory<GbcLimsDbContext>
{
    public GbcLimsDbContext CreateDbContext(string[] args)
    {
        var optionsBuilder = new DbContextOptionsBuilder<GbcLimsDbContext>();
        optionsBuilder.UseNpgsql("Host=localhost;Port=5432;Database=gbclims_design;Username=design;Password=design");
        return new GbcLimsDbContext(optionsBuilder.Options);
    }
}
