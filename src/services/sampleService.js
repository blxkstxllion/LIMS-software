import { apiRequest } from "./authService";

async function request(path, options = {}) {
  return apiRequest(path, options);
}

function normalizeCoa(coa) {
  if (!coa) return coa;
  return {
    ...coa,
    id: coa.coaNumber,
    status: coa.status,
    issueDate: coa.issueDate?.split("T")[0],
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

// 200 is the server's hard clamp (SamplesController/ResultsController/CoasController)
// — requesting it explicitly means dashboards, dropdowns, and reports see effectively
// everything for any lab under that size, instead of silently truncating at the old
// unspecified default of 25. True search-based pagination (loading only what a given
// dropdown/filter actually needs) is the real long-term fix once a lab exceeds this.
const MAX_PAGE_SIZE = 200;

export async function fetchLimsData() {
  const [samples, results, coas] = await Promise.all([
    request(`/api/samples?pageSize=${MAX_PAGE_SIZE}`),
    request(`/api/results?pageSize=${MAX_PAGE_SIZE}`),
    request(`/api/coas?pageSize=${MAX_PAGE_SIZE}`),
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
      analysisDate: result.analysisDate?.split("T")[0],
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
    analysisDate: response.analysisDate?.split("T")[0],
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

// Same id/date normalization as createResult() — this endpoint returns the raw
// backend ResultDto (analysisNumber-as-id), same as create does. Without it, every
// result that goes through submit/approve/reject would show a GUID instead of its
// human-readable ID in local state.
export async function updateResultStatus(resultId, status, comment, password) {
  const response = await request(`/api/results/${resultId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, comment, password }),
  });
  return {
    ...response,
    id: response.analysisNumber,
    analysisDate: response.analysisDate?.split("T")[0],
  };
}

export async function updateCoaStatus(coaId, status, password) {
  const response = await request(`/api/coas/${coaId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, password }),
  });
  return normalizeCoa(response);
}

