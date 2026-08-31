import { apiRequest } from "./authService";

async function request(path, options = {}) {
  return apiRequest(path, options);
}

// The backend serializes oxide fields like Al2O3 as "al2O3" (camelCase only lowercases
// the leading letter), not the "al2o3" the UI reads everywhere — same fix already
// applied to the top-level results list, needed again for the result snapshot embedded
// in a COA.
function normalizeCoa(coa) {
  if (!coa) return coa;
  return {
    ...coa,
    id: coa.coaNumber,
    status: coa.status,
    issueDate: coa.issueDate?.split("T")[0],
    result: coa.result
      ? {
          ...coa.result,
          al2o3: coa.result.al2O3 ?? coa.result.al2o3,
          sio2: coa.result.siO2 ?? coa.result.sio2,
          fe2o3: coa.result.fe2O3 ?? coa.result.fe2o3,
          tio2: coa.result.tiO2 ?? coa.result.tio2,
        }
      : coa.result,
  };
}

export async function fetchSamplesPaged({ search, status, priority, page = 1, pageSize = 25 } = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  if (priority) params.set("priority", priority);
  params.set("page", page);
  params.set("pageSize", pageSize);
  const response = await request(`/api/samples?${params.toString()}`);
  return {
    items: (response.items || []).map((sample) => ({
      ...sample,
      id: sample.sampleNumber,
      status: sample.status,
      dateReceived: sample.dateReceived?.split("T")[0],
    })),
    total: response.total,
    page: response.page,
    pageSize: response.pageSize,
  };
}

export async function fetchLimsData() {
  const [samples, results, coas] = await Promise.all([
    request("/api/samples"),
    request("/api/results"),
    request("/api/coas"),
  ]);

  return {
    samples: (samples?.items || []).map((sample) => ({
      ...sample,
      id: sample.sampleNumber,
      status: sample.status,
      dateReceived: sample.dateReceived?.split("T")[0],
    })),
    results: (results?.items || []).map((result) => ({
      ...result,
      id: result.analysisNumber,
      sampleId: result.sampleId,
      analysisDate: result.analysisDate?.split("T")[0],
      al2o3: result.al2O3 ?? result.al2o3,
      sio2: result.siO2 ?? result.sio2,
      fe2o3: result.fe2O3 ?? result.fe2o3,
      tio2: result.tiO2 ?? result.tio2,
      loi: result.loi,
      method: result.method,
      status: result.status,
    })),
    coas: (coas?.items || []).map(normalizeCoa),
  };
}

export async function createSample(payload) {
  const response = await request("/api/samples", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return {
    ...response,
    id: response.sampleNumber,
    status: response.status,
    dateReceived: response.dateReceived?.split("T")[0],
  };
}

export async function createResult(payload) {
  const response = await request("/api/results", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return {
    ...response,
    id: response.analysisNumber,
    sampleId: response.sampleId,
    analysisDate: response.analysisDate?.split("T")[0],
    al2o3: response.al2O3 ?? response.al2o3,
    sio2: response.siO2 ?? response.sio2,
    fe2o3: response.fe2O3 ?? response.fe2o3,
    tio2: response.tiO2 ?? response.tio2,
    loi: response.loi,
    method: response.method,
    status: response.status,
  };
}

export async function createCoa(payload) {
  const response = await request("/api/coas", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normalizeCoa(response);
}

export async function updateSampleStatus(sampleId, status, comment) {
  return request(`/api/samples/${sampleId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, comment }),
  });
}

export async function updateSample(sampleId, payload) {
  const response = await request(`/api/samples/${sampleId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return {
    ...response,
    id: response.sampleNumber,
    status: response.status,
    dateReceived: response.dateReceived?.split("T")[0],
  };
}

export async function deleteSample(sampleId) {
  return request(`/api/samples/${sampleId}`, { method: "DELETE" });
}

// Same normalization as createResult() — this endpoint returns the raw backend
// ResultDto (analysisNumber-as-id, al2O3/siO2/fe2O3/tiO2 casing) same as create does.
// Without it, every result that goes through submit/approve/reject silently loses its
// oxide values and human-readable ID in local state, even though creation and the
// initial list load both normalize correctly — reports and tables built from a result
// after its first status change would show 0.00 for every oxide except LOI (whose
// property name has no casing mismatch to begin with) and a GUID instead of its ID.
export async function updateResultStatus(resultId, status, comment) {
  const response = await request(`/api/results/${resultId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, comment }),
  });
  return {
    ...response,
    id: response.analysisNumber,
    sampleId: response.sampleId,
    analysisDate: response.analysisDate?.split("T")[0],
    al2o3: response.al2O3 ?? response.al2o3,
    sio2: response.siO2 ?? response.sio2,
    fe2o3: response.fe2O3 ?? response.fe2o3,
    tio2: response.tiO2 ?? response.tio2,
    loi: response.loi,
    method: response.method,
    status: response.status,
  };
}

export async function updateCoaStatus(coaId, status) {
  const response = await request(`/api/coas/${coaId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return normalizeCoa(response);
}

export function generateAuditLogs() {
  return [
    {
      id: 1,
      timestamp: new Date().toISOString(),
      user: "GBC-ADMIN-001",
      userName: "Administrator",
      action: "Login",
      module: "Authentication",
      recordId: "SYS-001",
      details: "User signed in",
      ipAddress: "127.0.0.1",
    },
  ];
}
