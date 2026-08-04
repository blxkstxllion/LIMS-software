using GbcLims.Domain.Enums;

namespace GbcLims.Domain.Entities;

public class Result
{
    public Guid Id { get; set; }
    public Guid SampleId { get; set; }
    public Sample Sample { get; set; } = null!;
    public string AnalysisNumber { get; set; } = string.Empty;
    public DateTimeOffset AnalysisDate { get; set; }
    public string AnalystName { get; set; } = string.Empty;
    public string Method { get; set; } = string.Empty;
    public string Equipment { get; set; } = string.Empty;
    public decimal Moisture { get; set; }
    public decimal Al2O3 { get; set; }
    public decimal SiO2 { get; set; }
    public decimal Fe2O3 { get; set; }
    public decimal TiO2 { get; set; }
    public decimal Loi { get; set; }
    public decimal Cao { get; set; }
    public decimal Mgo { get; set; }
    public decimal Na2O { get; set; }
    public decimal K2O { get; set; }
    public decimal? P2O5 { get; set; }
    public decimal? MnO { get; set; }
    public decimal? Cr2O3 { get; set; }
    public decimal TotalOxides { get; set; }
    public decimal Asr { get; set; }
    public decimal Rr { get; set; }
    public bool Calibrated { get; set; }
    public decimal? StandardDeviation { get; set; }
    public string? Repeatability { get; set; }
    public string Notes { get; set; } = string.Empty;
    public ResultStatus Status { get; set; }
    public string? ApprovalComment { get; set; }
    public Guid CreatedById { get; set; }
    public ApplicationUser CreatedBy { get; set; } = null!;
    public Guid? ApprovedById { get; set; }
    public ApplicationUser? ApprovedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
