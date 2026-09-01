using System.Linq;
using GbcLims.Domain.Entities;
using GbcLims.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace GbcLims.Infrastructure.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            services.AddDbContext<GbcLimsDbContext>(options => options.UseInMemoryDatabase("GbcLims"));
        }
        else
        {
            services.AddDbContext<GbcLimsDbContext>(options => options.UseNpgsql(connectionString));
        }

        services.AddIdentity<ApplicationUser, ApplicationRole>(options =>
        {
            options.Password.RequireDigit = true;
            options.Password.RequireLowercase = true;
            options.Password.RequireUppercase = true;
            options.Password.RequireNonAlphanumeric = false;
            options.Password.RequiredLength = 8;
            options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
            options.Lockout.MaxFailedAccessAttempts = 5;
            options.Lockout.AllowedForNewUsers = true;
            // StaffId doubles as the Identity UserName. The default allowed set
            // (letters/digits/-._@+) rejects most punctuation, so a Staff ID with e.g.
            // a "#" or "&" in it fails with "Username is invalid" even though nothing
            // downstream cares — every printable character is safe here since it's
            // never used as a filesystem path or shell argument, just a DB column and a
            // URL-encoded route value.
            options.User.AllowedUserNameCharacters = new string(Enumerable.Range(0x20, 0x7F - 0x20).Select(c => (char)c).ToArray());
        })
        .AddEntityFrameworkStores<GbcLimsDbContext>()
        .AddDefaultTokenProviders();

        return services;
    }
}
