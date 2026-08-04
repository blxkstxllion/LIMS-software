namespace GbcLims.Domain.Entities;

public class Coa
{
    public Guid Id { get; set; }
    public string CoaNumber { get; set; } = string.Empty;
    public Guid SampleId { get; set; }
    public Sample Sample { get; set; } = null!;
    public string ClientName { get; set; } = string.Empty;
    public string? ClientAddress { get; set; }
    public string? ClientContact { get; set; }
    public bool IncludeResults { get; set; }
    public bool IncludeMethodology { get; set; }
    public bool IncludeQcData { get; set; }
    public string? Remarks { get; set; }
    public DateTimeOffset IssueDate { get; set; }
    public string Status { get; set; } = "Draft";
    public string GeneratedBy { get; set; } = string.Empty;
    public DateTimeOffset GeneratedDate { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
