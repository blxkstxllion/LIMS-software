namespace GbcLims.Domain.Entities;

public class Coa
{
    public Guid Id { get; set; }
    public string CoaNumber { get; set; } = string.Empty;
    public Guid SampleId { get; set; }
    public Sample Sample { get; set; } = null!;
    // The specific approved Result this certificate was generated from. Required at
    // creation (CoasController.Create refuses to issue a COA with no approved result
    // to point at) — set once and never changed, so a later re-assay on the same
    // sample can never alter a certificate that's already been generated.
    public Guid ResultId { get; set; }
    public Result Result { get; set; } = null!;
    // Frozen copy of the values from Result as of the moment this COA was created.
    // CoasController reads only these when rendering a COA — it never re-queries
    // Results — so the certificate a client already received can't silently change
    // if that sample is re-assayed later.
    public string SnapshotAnalystName { get; set; } = string.Empty;
    public string SnapshotMethod { get; set; } = string.Empty;
    public DateTimeOffset SnapshotAnalysisDate { get; set; }
    public decimal SnapshotAl2O3 { get; set; }
    public decimal SnapshotSiO2 { get; set; }
    public decimal SnapshotFe2O3 { get; set; }
    public decimal SnapshotTiO2 { get; set; }
    public decimal SnapshotLoi { get; set; }
    public decimal SnapshotTotalOxides { get; set; }
    public decimal SnapshotAsr { get; set; }
    public decimal SnapshotRr { get; set; }
    public string ClientName { get; set; } = string.Empty;
    public string? ClientAddress { get; set; }
    public string? ClientContact { get; set; }
    public bool IncludeResults { get; set; }
    public bool IncludeMethodology { get; set; }
    public bool IncludeQcData { get; set; }
    public string? Remarks { get; set; }
    public DateTimeOffset IssueDate { get; set; }
    // Draft -> Approved -> Issued only (enforced in CoasController.CoaStatusTransitions).
    public string Status { get; set; } = "Draft";
    public string GeneratedBy { get; set; } = string.Empty;
    public Guid GeneratedById { get; set; }
    public DateTimeOffset GeneratedDate { get; set; } = DateTimeOffset.UtcNow;
    // Set when Status moves to Approved. The approver must be a different user than
    // GeneratedById (CoasController enforces this with no admin exemption, unlike the
    // Result approval exemption in ResultsController) — segregation of duties for the
    // document that actually leaves the building.
    public Guid? ApprovedById { get; set; }
    public ApplicationUser? ApprovedBy { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
    // Set when Status moves to Issued.
    public Guid? IssuedById { get; set; }
    public ApplicationUser? IssuedBy { get; set; }
    public DateTimeOffset? IssuedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
