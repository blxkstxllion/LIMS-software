namespace GbcLims.Domain.Entities;

public class QcSample
{
    public Guid Id { get; set; }
    public string QcNumber { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    // Only meaningful for Duplicate/Spike types, which check a QC result against a real
    // sample's own result — Standard/Blank QC samples aren't tied to any sample at all.
    public Guid? ReferenceSampleId { get; set; }
    public Sample? ReferenceSample { get; set; }
    public decimal ExpectedAl2O3 { get; set; }
    public decimal ActualAl2O3 { get; set; }
    public decimal Variance { get; set; }
    public string Status { get; set; } = string.Empty;
    public Guid CreatedById { get; set; }
    public ApplicationUser CreatedBy { get; set; } = null!;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
