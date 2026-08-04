using GbcLims.Domain.Entities;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace GbcLims.Infrastructure.Persistence;

public class GbcLimsDbContext : IdentityDbContext<ApplicationUser, ApplicationRole, Guid>
{
    public GbcLimsDbContext(DbContextOptions<GbcLimsDbContext> options) : base(options)
    {
    }

    public DbSet<Sample> Samples => Set<Sample>();
    public DbSet<Result> Results => Set<Result>();
    public DbSet<Coa> Coas => Set<Coa>();
    public DbSet<Attachment> Attachments => Set<Attachment>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<QcSample> QcSamples => Set<QcSample>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<ApplicationUser>(entity =>
        {
            entity.HasIndex(e => e.StaffId).IsUnique();
            entity.HasIndex(e => e.Email).IsUnique();
        });

        modelBuilder.Entity<Sample>(entity =>
        {
            // Only enforce uniqueness among non-deleted samples, so a SampleNumber
            // freed up by a (soft) delete can be reused. HasFilter is relational-only:
            // this (and unique indexes in general) has no effect against the InMemory
            // provider used for local dev, verified — it only takes effect on Postgres.
            entity.HasIndex(e => e.SampleNumber).IsUnique().HasFilter("\"IsDeleted\" = false");
            entity.Property(e => e.Quantity).HasPrecision(12, 3);
            entity.Property(e => e.Tonnage).HasPrecision(12, 3);
            entity.HasOne(e => e.CreatedBy).WithMany(u => u.Samples).HasForeignKey(e => e.CreatedById).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.VerifiedBy).WithMany().HasForeignKey(e => e.VerifiedById).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(e => e.DeletedBy).WithMany().HasForeignKey(e => e.DeletedById).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Result>(entity =>
        {
            entity.HasIndex(e => e.AnalysisNumber).IsUnique();
            entity.Property(e => e.Moisture).HasPrecision(12, 3);
            entity.Property(e => e.Al2O3).HasPrecision(12, 3);
            entity.Property(e => e.SiO2).HasPrecision(12, 3);
            entity.Property(e => e.Fe2O3).HasPrecision(12, 3);
            entity.Property(e => e.TiO2).HasPrecision(12, 3);
            entity.Property(e => e.Loi).HasPrecision(12, 3);
            entity.Property(e => e.TotalOxides).HasPrecision(12, 3);
            entity.Property(e => e.Asr).HasPrecision(12, 3);
            entity.Property(e => e.Rr).HasPrecision(12, 3);
            entity.HasOne(e => e.Sample).WithMany(s => s.Results).HasForeignKey(e => e.SampleId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.CreatedBy).WithMany(u => u.Results).HasForeignKey(e => e.CreatedById).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.ApprovedBy).WithMany().HasForeignKey(e => e.ApprovedById).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Coa>(entity =>
        {
            entity.HasIndex(e => e.CoaNumber).IsUnique();
            entity.HasOne(e => e.Sample).WithMany().HasForeignKey(e => e.SampleId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Attachment>(entity =>
        {
            entity.HasOne(e => e.Sample).WithMany(s => s.Attachments).HasForeignKey(e => e.SampleId).OnDelete(DeleteBehavior.Cascade).IsRequired(false);
        });

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.HasOne(e => e.User).WithMany(u => u.AuditLogs).HasForeignKey(e => e.UserId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(e => e.Sample).WithMany(s => s.AuditLogs).HasForeignKey(e => e.SampleId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<QcSample>(entity =>
        {
            entity.HasIndex(e => e.QcNumber).IsUnique();
            entity.Property(e => e.ExpectedAl2O3).HasPrecision(12, 3);
            entity.Property(e => e.ActualAl2O3).HasPrecision(12, 3);
            entity.Property(e => e.Variance).HasPrecision(12, 3);
            // SetNull, not Cascade: a QC record is a lab-quality artifact in its own
            // right — deleting the sample it happened to reference shouldn't also erase
            // the QC history that used it as a check.
            entity.HasOne(e => e.ReferenceSample).WithMany().HasForeignKey(e => e.ReferenceSampleId).OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(e => e.CreatedBy).WithMany().HasForeignKey(e => e.CreatedById).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
