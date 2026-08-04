namespace GbcLims.Domain.Enums;

public enum SampleStatus
{
    PendingRegistration = 1,
    PendingVerification,
    PendingAnalysis,
    InProgress,
    Completed,
    Approved,
    Rejected
}
