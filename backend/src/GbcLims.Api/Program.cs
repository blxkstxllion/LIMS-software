using System.Security.Claims;
using System.Text;
using GbcLims.Api.Services;
using GbcLims.Domain.Entities;
using GbcLims.Infrastructure.Extensions;
using GbcLims.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<AuditLogService>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo { Title = "GBC LIMS API", Version = "v1" });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "JWT Authorization header using the Bearer scheme."
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });
});

builder.Services.AddInfrastructure(builder.Configuration);

var jwtSecret = builder.Configuration["Jwt:Secret"];
if (string.IsNullOrWhiteSpace(jwtSecret) || jwtSecret.StartsWith("CHANGE_ME", StringComparison.OrdinalIgnoreCase))
{
    throw new InvalidOperationException(
        "Jwt:Secret is not configured. For local development, run " +
        "`dotnet user-secrets set \"Jwt:Secret\" \"<a long random value>\"` from backend/src/GbcLims.Api. " +
        "For any other environment, set it via the Jwt__Secret environment variable. Never put a real " +
        "value in appsettings.json — a known signing secret lets anyone forge valid login tokens.");
}
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "https://localhost";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "https://localhost";
builder.Services.AddAuthentication(options =>
    {
        // AddIdentity (above) registers its own cookie scheme as the default. Without
        // this, [Authorize] challenges redirect to a nonexistent "/Account/Login" page
        // instead of returning 401 for a bearer token request.
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            NameClaimType = ClaimTypes.Name,
            RoleClaimType = ClaimTypes.Role,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
        };
        options.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = context =>
            {
                Console.WriteLine($"JWT auth failed: {context.Exception.Message}");
                return Task.CompletedTask;
            },
            OnTokenValidated = context =>
            {
                Console.WriteLine($"JWT validated for user: {context.Principal?.Identity?.Name}");
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization(options =>
{
    // Mirrors the role permissions already expressed in the frontend's PERMISSIONS
    // table (src/constants/lims.js) and SIDEBAR_MENU, enforced server-side instead
    // of only in the UI.
    options.AddPolicy("CanCreateRecords", policy => policy.RequireRole("admin", "xrf_chemist", "bauxite_engineer"));
    options.AddPolicy("CanApproveResults", policy => policy.RequireRole("admin", "bauxite_engineer", "qa_engineer"));
    options.AddPolicy("CanGenerateCoas", policy => policy.RequireRole("admin", "bauxite_engineer", "qa_engineer"));
});

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:5173", "http://localhost:5174" };

var app = builder.Build();

app.UseCors(policy => policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod());

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

var enableHttpsRedirection = app.Configuration.GetValue("EnableHttpsRedirection", !app.Environment.IsDevelopment());
if (enableHttpsRedirection)
{
    app.UseHttpsRedirection();
}

app.UseRouting();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api", StringComparison.OrdinalIgnoreCase))
    {
        Console.WriteLine($"Route debug: {context.Request.Method} {context.Request.Path} -> endpoint {context.GetEndpoint()?.DisplayName ?? "<null>"}");
    }

    await next();
});
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<GbcLimsDbContext>();
    try
    {
        // No EF Core migrations exist yet for this schema; EnsureCreated builds it
        // directly from the model on both the in-memory and relational providers.
        db.Database.EnsureCreated();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Database schema creation skipped: {ex.Message}");
    }

    // Predictable, publicly-documented test credentials must never be created outside
    // local development — seeding them in a real deployment would ship a known-password
    // admin account to anyone who finds it.
    if (app.Environment.IsDevelopment())
    {
        try
        {
            var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
            var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<ApplicationRole>>();

            var seedRoles = new[] { "admin", "xrf_chemist", "bauxite_engineer", "qa_engineer", "management" };
            foreach (var roleName in seedRoles)
            {
                if (!await roleManager.RoleExistsAsync(roleName)) await roleManager.CreateAsync(new ApplicationRole { Name = roleName });
            }

            var seedUsers = new[]
            {
                new { UserName = "ADMIN", Email = "admin@gbclims.local", FullName = "System Administrator", StaffId = "ADMIN", Department = "IT", Role = "admin" },
                new { UserName = "CHEMIST", Email = "chemist@gbclims.local", FullName = "XRF Chemist", StaffId = "CHEMIST", Department = "Laboratory", Role = "xrf_chemist" },
                new { UserName = "ENGINEER", Email = "engineer@gbclims.local", FullName = "Bauxite Analysis Engineer", StaffId = "ENGINEER", Department = "Laboratory", Role = "bauxite_engineer" },
                new { UserName = "QA", Email = "qa@gbclims.local", FullName = "Quality Assurance Engineer", StaffId = "QA", Department = "Quality Assurance", Role = "qa_engineer" },
                new { UserName = "MANAGER", Email = "manager@gbclims.local", FullName = "Management", StaffId = "MANAGER", Department = "Management", Role = "management" },
            };

            const string seedPassword = "Test1234";
            foreach (var seed in seedUsers)
            {
                if (await userManager.FindByNameAsync(seed.UserName) is not null) continue;

                var newUser = new ApplicationUser
                {
                    UserName = seed.UserName,
                    Email = seed.Email,
                    FullName = seed.FullName,
                    StaffId = seed.StaffId,
                    Department = seed.Department,
                    Role = seed.Role
                };
                var result = await userManager.CreateAsync(newUser, seedPassword);
                if (result.Succeeded) await userManager.AddToRoleAsync(newUser, seed.Role);
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Database seeding skipped: {ex.Message}");
        }
    }
}

app.Run();

public partial class Program { }
