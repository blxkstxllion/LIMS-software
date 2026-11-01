namespace GbcLims.Domain.Constants;

// Single source of truth for role name strings — these were previously duplicated as
// literals across Program.cs (role seeding, policy definitions) and every controller
// that does its own role check instead of relying on a named policy. A typo in one of
// those literals wouldn't be a compile error, just a silently-wrong permission check.
public static class Roles
{
    public const string Admin = "admin";
    public const string XrfChemist = "xrf_chemist";
    public const string BauxiteEngineer = "bauxite_engineer";
    public const string QaEngineer = "qa_engineer";
    public const string Management = "management";

    public static readonly string[] All = { Admin, XrfChemist, BauxiteEngineer, QaEngineer, Management };
}
