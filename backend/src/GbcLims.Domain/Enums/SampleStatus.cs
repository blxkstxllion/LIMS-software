namespace GbcLims.Domain.Enums;

public enum SampleStatus
{
    PendingRegistration = 1,
    PendingVerification,
    PendingAnalysis,
    InProgress,
    Completed,
    Approved,
    Rejected,
    // Appended, not inserted between existing members — this enum is stored as its
    // underlying int in the database, so an existing member's ordinal must never move.
    NeedsCorrection
}
