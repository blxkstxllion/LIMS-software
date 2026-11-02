using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using GbcLims.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace GbcLims.Tests;

// Each test builds its own factory against a freshly-created, uniquely-named real
// Postgres database (via the shared PostgresFixture/Testcontainers container, not a
// per-class InMemory instance) — sample/analysis/COA numbers are allocated from
// per-request sequences and several endpoints enforce uniqueness, so tests sharing one
// database could interfere with each other depending on run order. Real Postgres also
// means the raw-SQL migrations (append-only trigger, number sequences) actually run,
// unlike InMemory's EnsureCreated, which silently skips them.
[Collection("Postgres")]
public class WorkflowTests
{
    private readonly PostgresFixture _postgres;

    public WorkflowTests(PostgresFixture postgres)
    {
        _postgres = postgres;
    }

    private async Task<WebApplicationFactory<Program>> CreateFactoryAsync(string dbName)
    {
        Environment.SetEnvironmentVariable("Jwt__Secret", "test-only-secret-never-used-outside-automated-tests-0123456789");
        // Postgres identifiers cap at 63 bytes; some test method names alone are
        // already close to that, so only a short, truncated prefix of the name is
        // kept for readability — the GUID suffix is what actually guarantees
        // uniqueness.
        var shortName = dbName.ToLowerInvariant()[..Math.Min(20, dbName.Length)];
        var connectionString = await _postgres.CreateDatabaseAsync($"{shortName}_{Guid.NewGuid():N}");

        return new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?> { ["EnableHttpsRedirection"] = "false" });
            });
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<DbContextOptions<GbcLimsDbContext>>();
                services.RemoveAll<GbcLimsDbContext>();
                services.AddDbContext<GbcLimsDbContext>(options => options.UseNpgsql(connectionString));
            });
        });
    }

    private static async Task<HttpClient> LoginAsAsync(WebApplicationFactory<Program> factory, string staffId, string password = "Test1234")
    {
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        var response = await client.PostAsJsonAsync("/api/auth/login", new { staffId, password });
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"Login as {staffId} failed: {body}");
        var auth = await response.Content.ReadFromJsonAsync<LoginResponse>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth!.AccessToken);
        return client;
    }

    private static object ValidResultPayload(string sampleId, string? status = null) => new
    {
        sampleId,
        analysisDate = DateTimeOffset.UtcNow,
        method = "Spectroscopy",
        equipment = "XRF-1",
        moisture = 0.5,
        al2o3 = 48,
        sio2 = 15,
        fe2o3 = 15,
        tio2 = 3,
        loi = 15,
        cao = 2,
        mgo = 1,
        na2o = 0.5,
        k2o = 0.5,
        calibrated = true,
        notes = "",
        status
    };

    [Fact]
    public async Task SampleStatus_AllowedTransition_Succeeds()
    {
        using var factory = await CreateFactoryAsync(nameof(SampleStatus_AllowedTransition_Succeeds));
        var chemist = await LoginAsAsync(factory, "CHEMIST");

        var created = await chemist.PostAsJsonAsync("/api/samples", new
        {
            sampleNumber = "TEST-001", origin = "Mine Site", sampleSource = "Blast hole", location = "A-1",
            quantity = 10, unit = "kg", tonnage = 1.0, priority = "Medium", submittedBy = "CHEMIST", receivedBy = "CHEMIST",
            batchNumber = "", notes = ""
        });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var sample = await created.Content.ReadFromJsonAsync<SampleResponse>();

        // PendingVerification -> PendingAnalysis is an allowed transition.
        var engineer = await LoginAsAsync(factory, "ENGINEER");
        var transitioned = await engineer.PatchAsJsonAsync($"/api/samples/{sample!.SampleNumber}/status", new { status = "PendingAnalysis" });
        Assert.Equal(HttpStatusCode.OK, transitioned.StatusCode);
    }

    [Fact]
    public async Task SampleStatus_ForbiddenTransition_Rejected()
    {
        using var factory = await CreateFactoryAsync(nameof(SampleStatus_ForbiddenTransition_Rejected));
        var chemist = await LoginAsAsync(factory, "CHEMIST");
        var created = await chemist.PostAsJsonAsync("/api/samples", new
        {
            sampleNumber = "TEST-002", origin = "Mine Site", sampleSource = "Blast hole", location = "A-1",
            quantity = 10, unit = "kg", tonnage = 1.0, priority = "Medium", submittedBy = "CHEMIST", receivedBy = "CHEMIST",
            batchNumber = "", notes = ""
        });
        var sample = await created.Content.ReadFromJsonAsync<SampleResponse>();

        // Sample starts at PendingVerification; skipping straight to Completed is not
        // a legal transition from there.
        var engineer = await LoginAsAsync(factory, "ENGINEER");
        var transitioned = await engineer.PatchAsJsonAsync($"/api/samples/{sample!.SampleNumber}/status", new { status = "Completed" });
        Assert.Equal(HttpStatusCode.BadRequest, transitioned.StatusCode);
    }

    [Fact]
    public async Task ResultWorkflow_Create_Submit_Approve_Succeeds()
    {
        using var factory = await CreateFactoryAsync(nameof(ResultWorkflow_Create_Submit_Approve_Succeeds));
        var chemist = await LoginAsAsync(factory, "CHEMIST");

        var sampleResponse = await chemist.PostAsJsonAsync("/api/samples", new
        {
            sampleNumber = "TEST-010", origin = "Mine Site", sampleSource = "Blast hole", location = "A-1",
            quantity = 10, unit = "kg", tonnage = 1.0, priority = "Medium", submittedBy = "CHEMIST", receivedBy = "CHEMIST",
            batchNumber = "", notes = ""
        });
        var sample = await sampleResponse.Content.ReadFromJsonAsync<SampleResponse>();

        var resultResponse = await chemist.PostAsJsonAsync("/api/results", ValidResultPayload(sample!.SampleNumber, "Submitted"));
        var resultBody = await resultResponse.Content.ReadAsStringAsync();
        Assert.True(resultResponse.IsSuccessStatusCode, resultBody);
        var result = await resultResponse.Content.ReadFromJsonAsync<ResultResponse>();
        Assert.Equal("Submitted", result!.Status);
        // AnalysisNumber is server-allocated (RES-XXXXXX), never client-supplied.
        Assert.StartsWith("RES-", result.AnalysisNumber);

        // A different role (engineer, approve-capable) reviews it.
        var engineer = await LoginAsAsync(factory, "ENGINEER");
        var approved = await engineer.PatchAsJsonAsync($"/api/results/{result.AnalysisNumber}/status", new { status = "Approved", comment = "Looks good", password = "Test1234" });
        var approvedBody = await approved.Content.ReadAsStringAsync();
        Assert.True(approved.IsSuccessStatusCode, approvedBody);
        var approvedResult = await approved.Content.ReadFromJsonAsync<ResultResponse>();
        Assert.Equal("Approved", approvedResult!.Status);
    }

    [Fact]
    public async Task ResultWorkflow_SelfApproval_Blocked_RegardlessOfRole()
    {
        using var factory = await CreateFactoryAsync(nameof(ResultWorkflow_SelfApproval_Blocked_RegardlessOfRole));
        // Admin both creates and tries to approve — the review explicitly flagged the
        // old admin self-approval exemption; this is the regression test for its removal.
        var admin = await LoginAsAsync(factory, "ADMIN");

        var sampleResponse = await admin.PostAsJsonAsync("/api/samples", new
        {
            sampleNumber = "TEST-011", origin = "Mine Site", sampleSource = "Blast hole", location = "A-1",
            quantity = 10, unit = "kg", tonnage = 1.0, priority = "Medium", submittedBy = "ADMIN", receivedBy = "ADMIN",
            batchNumber = "", notes = ""
        });
        var sample = await sampleResponse.Content.ReadFromJsonAsync<SampleResponse>();

        var resultResponse = await admin.PostAsJsonAsync("/api/results", ValidResultPayload(sample!.SampleNumber, "Submitted"));
        var result = await resultResponse.Content.ReadFromJsonAsync<ResultResponse>();

        var selfApprove = await admin.PatchAsJsonAsync($"/api/results/{result!.AnalysisNumber}/status", new { status = "Approved", comment = "", password = "Test1234" });
        Assert.Equal(HttpStatusCode.Forbidden, selfApprove.StatusCode);
    }

    [Fact]
    public async Task ResultWorkflow_ApproveWithWrongPassword_Rejected()
    {
        using var factory = await CreateFactoryAsync(nameof(ResultWorkflow_ApproveWithWrongPassword_Rejected));
        var chemist = await LoginAsAsync(factory, "CHEMIST");
        var sampleResponse = await chemist.PostAsJsonAsync("/api/samples", new
        {
            sampleNumber = "TEST-012", origin = "Mine Site", sampleSource = "Blast hole", location = "A-1",
            quantity = 10, unit = "kg", tonnage = 1.0, priority = "Medium", submittedBy = "CHEMIST", receivedBy = "CHEMIST",
            batchNumber = "", notes = ""
        });
        var sample = await sampleResponse.Content.ReadFromJsonAsync<SampleResponse>();
        var resultResponse = await chemist.PostAsJsonAsync("/api/results", ValidResultPayload(sample!.SampleNumber, "Submitted"));
        var result = await resultResponse.Content.ReadFromJsonAsync<ResultResponse>();

        var engineer = await LoginAsAsync(factory, "ENGINEER");
        var approved = await engineer.PatchAsJsonAsync($"/api/results/{result!.AnalysisNumber}/status", new { status = "Approved", comment = "", password = "WrongPassword123" });
        Assert.Equal(HttpStatusCode.Unauthorized, approved.StatusCode);
    }

    [Fact]
    public async Task ResultWorkflow_UnprivilegedRole_CannotCreate()
    {
        using var factory = await CreateFactoryAsync(nameof(ResultWorkflow_UnprivilegedRole_CannotCreate));
        // Management is read-only everywhere in this app — CanCreateRecords excludes it.
        var management = await LoginAsAsync(factory, "MANAGER");
        var resultResponse = await management.PostAsJsonAsync("/api/results", ValidResultPayload(Guid.NewGuid().ToString(), "Submitted"));
        Assert.Equal(HttpStatusCode.Forbidden, resultResponse.StatusCode);
    }

    [Fact]
    public async Task ResultWorkflow_RejectedResult_CanBeAmendedByCreator_ButNotByOthers()
    {
        using var factory = await CreateFactoryAsync(nameof(ResultWorkflow_RejectedResult_CanBeAmendedByCreator_ButNotByOthers));
        var chemist = await LoginAsAsync(factory, "CHEMIST");
        var sampleResponse = await chemist.PostAsJsonAsync("/api/samples", new
        {
            sampleNumber = "TEST-013", origin = "Mine Site", sampleSource = "Blast hole", location = "A-1",
            quantity = 10, unit = "kg", tonnage = 1.0, priority = "Medium", submittedBy = "CHEMIST", receivedBy = "CHEMIST",
            batchNumber = "", notes = ""
        });
        var sample = await sampleResponse.Content.ReadFromJsonAsync<SampleResponse>();
        var resultResponse = await chemist.PostAsJsonAsync("/api/results", ValidResultPayload(sample!.SampleNumber, "Submitted"));
        var result = await resultResponse.Content.ReadFromJsonAsync<ResultResponse>();

        var engineer = await LoginAsAsync(factory, "ENGINEER");
        var rejected = await engineer.PatchAsJsonAsync($"/api/results/{result!.AnalysisNumber}/status", new { status = "Rejected", comment = "Numbers look off", password = "Test1234" });
        Assert.Equal(HttpStatusCode.OK, rejected.StatusCode);

        // The reviewer who rejected it is not the creator, so they can't amend it.
        var engineerAmend = await engineer.PatchAsJsonAsync($"/api/results/{result.AnalysisNumber}/status", new { status = "Draft", comment = "Fixing it" });
        Assert.Equal(HttpStatusCode.Forbidden, engineerAmend.StatusCode);

        // The original creator can move it back to Draft to correct and resubmit.
        var amended = await chemist.PatchAsJsonAsync($"/api/results/{result.AnalysisNumber}/status", new { status = "Draft", comment = "Re-ran after recalibration" });
        var amendedBody = await amended.Content.ReadAsStringAsync();
        Assert.True(amended.IsSuccessStatusCode, amendedBody);

        // A reason is required for the correction.
        var sample2Response = await chemist.PostAsJsonAsync("/api/samples", new
        {
            sampleNumber = "TEST-014", origin = "Mine Site", sampleSource = "Blast hole", location = "A-1",
            quantity = 10, unit = "kg", tonnage = 1.0, priority = "Medium", submittedBy = "CHEMIST", receivedBy = "CHEMIST",
            batchNumber = "", notes = ""
        });
        var sample2 = await sample2Response.Content.ReadFromJsonAsync<SampleResponse>();
        var result2Response = await chemist.PostAsJsonAsync("/api/results", ValidResultPayload(sample2!.SampleNumber, "Submitted"));
        var result2 = await result2Response.Content.ReadFromJsonAsync<ResultResponse>();
        var rejected2 = await engineer.PatchAsJsonAsync($"/api/results/{result2!.AnalysisNumber}/status", new { status = "Rejected", comment = "", password = "Test1234" });
        Assert.Equal(HttpStatusCode.OK, rejected2.StatusCode);
        var amendNoReason = await chemist.PatchAsJsonAsync($"/api/results/{result2.AnalysisNumber}/status", new { status = "Draft", comment = "" });
        Assert.Equal(HttpStatusCode.BadRequest, amendNoReason.StatusCode);
    }

    // Regression test for the central 1.1 fix: an issued/approved COA's values must
    // stay frozen even after the same sample gets a second, later-approved result.
    [Fact]
    public async Task CoaSnapshot_StaysFrozen_AfterSampleIsReassayedAndReapproved()
    {
        using var factory = await CreateFactoryAsync(nameof(CoaSnapshot_StaysFrozen_AfterSampleIsReassayedAndReapproved));
        var chemist = await LoginAsAsync(factory, "CHEMIST");
        var engineer = await LoginAsAsync(factory, "ENGINEER");

        var sampleResponse = await chemist.PostAsJsonAsync("/api/samples", new
        {
            sampleNumber = "TEST-020", origin = "Mine Site", sampleSource = "Blast hole", location = "A-1",
            quantity = 10, unit = "kg", tonnage = 1.0, priority = "Medium", submittedBy = "CHEMIST", receivedBy = "CHEMIST",
            batchNumber = "", notes = ""
        });
        var sample = await sampleResponse.Content.ReadFromJsonAsync<SampleResponse>();

        // First assay: Al2O3 = 48, approved.
        var firstResultResponse = await chemist.PostAsJsonAsync("/api/results", ValidResultPayload(sample!.SampleNumber, "Submitted"));
        var firstResult = await firstResultResponse.Content.ReadFromJsonAsync<ResultResponse>();
        await engineer.PatchAsJsonAsync($"/api/results/{firstResult!.AnalysisNumber}/status", new { status = "Approved", comment = "", password = "Test1234" });

        // Generate a COA from that first approved result.
        var coaResponse = await engineer.PostAsJsonAsync("/api/coas", new
        {
            sampleId = sample.SampleNumber,
            resultId = firstResult.AnalysisNumber,
            clientName = "Test Client",
            includeResults = true,
            includeMethodology = true,
            includeQcData = false,
            issueDate = DateTimeOffset.UtcNow
        });
        var coaBody = await coaResponse.Content.ReadAsStringAsync();
        Assert.True(coaResponse.IsSuccessStatusCode, coaBody);
        var coa = await coaResponse.Content.ReadFromJsonAsync<CoaResponse>();
        Assert.Equal(48, coa!.Result!.Al2O3);

        // Second assay on the SAME sample: Al2O3 = 60 (and Loi reduced to keep the
        // 95-105% total-oxides range server-side validation satisfied), also
        // approved — a later re-assay, the exact scenario that used to leak into the
        // old COA.
        var secondPayload = ValidResultPayload(sample.SampleNumber, "Submitted");
        var secondJson = System.Text.Json.JsonSerializer.SerializeToNode(secondPayload)!.AsObject();
        secondJson["al2o3"] = 60;
        secondJson["loi"] = 3;
        var secondResultResponse = await chemist.PostAsJsonAsync("/api/results", secondJson);
        var secondResultBody = await secondResultResponse.Content.ReadAsStringAsync();
        Assert.True(secondResultResponse.IsSuccessStatusCode, secondResultBody);
        var secondResult = await secondResultResponse.Content.ReadFromJsonAsync<ResultResponse>();
        var secondApproval = await engineer.PatchAsJsonAsync($"/api/results/{secondResult!.AnalysisNumber}/status", new { status = "Approved", comment = "", password = "Test1234" });
        var secondApprovalBody = await secondApproval.Content.ReadAsStringAsync();
        Assert.True(secondApproval.IsSuccessStatusCode, secondApprovalBody);

        // Re-fetch the ORIGINAL COA — it must still show 48, not 60.
        var refetched = await engineer.GetAsync($"/api/coas?sampleId={sample.SampleNumber}");
        var refetchedList = await refetched.Content.ReadFromJsonAsync<CoaListResponse>();
        var sameCoa = refetchedList!.Items.Single(c => c.CoaNumber == coa.CoaNumber);
        Assert.Equal(48, sameCoa.Result!.Al2O3);
    }

    [Fact]
    public async Task CoaWorkflow_GeneratorCannotApproveOwnCoa()
    {
        using var factory = await CreateFactoryAsync(nameof(CoaWorkflow_GeneratorCannotApproveOwnCoa));
        var chemist = await LoginAsAsync(factory, "CHEMIST");
        var engineer = await LoginAsAsync(factory, "ENGINEER");

        var sampleResponse = await chemist.PostAsJsonAsync("/api/samples", new
        {
            sampleNumber = "TEST-021", origin = "Mine Site", sampleSource = "Blast hole", location = "A-1",
            quantity = 10, unit = "kg", tonnage = 1.0, priority = "Medium", submittedBy = "CHEMIST", receivedBy = "CHEMIST",
            batchNumber = "", notes = ""
        });
        var sample = await sampleResponse.Content.ReadFromJsonAsync<SampleResponse>();
        var resultResponse = await chemist.PostAsJsonAsync("/api/results", ValidResultPayload(sample!.SampleNumber, "Submitted"));
        var result = await resultResponse.Content.ReadFromJsonAsync<ResultResponse>();
        await engineer.PatchAsJsonAsync($"/api/results/{result!.AnalysisNumber}/status", new { status = "Approved", comment = "", password = "Test1234" });

        var coaResponse = await engineer.PostAsJsonAsync("/api/coas", new
        {
            sampleId = sample.SampleNumber, resultId = result.AnalysisNumber, clientName = "Test Client",
            includeResults = true, includeMethodology = true, includeQcData = false, issueDate = DateTimeOffset.UtcNow
        });
        var coa = await coaResponse.Content.ReadFromJsonAsync<CoaResponse>();

        var selfApprove = await engineer.PatchAsJsonAsync($"/api/coas/{coa!.CoaNumber}/status", new { status = "Approved", password = "Test1234" });
        Assert.Equal(HttpStatusCode.Forbidden, selfApprove.StatusCode);
    }

    private sealed class LoginResponse { public string AccessToken { get; set; } = string.Empty; }
    private sealed class SampleResponse { public string SampleNumber { get; set; } = string.Empty; }
    private sealed class ResultResponse { public string AnalysisNumber { get; set; } = string.Empty; public string Status { get; set; } = string.Empty; }
    private sealed class CoaResponse { public string CoaNumber { get; set; } = string.Empty; public CoaResultSummary? Result { get; set; } }
    private sealed class CoaResultSummary { public decimal Al2O3 { get; set; } }
    private sealed class CoaListResponse { public List<CoaResponse> Items { get; set; } = new(); }
}
