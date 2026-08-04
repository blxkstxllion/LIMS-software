import { apiRequest } from "./authService";

function toUiQcSample(q) {
  return {
    id: q.qcNumber,
    type: q.type,
    refId: q.referenceSampleId || "",
    expectedAl2o3: q.expectedAl2O3,
    actualAl2o3: q.actualAl2O3,
    variance: q.variance,
    status: q.status,
    date: q.createdAt?.split("T")[0],
    createdBy: q.createdBy,
  };
}

export async function fetchQcSamples() {
  const qcSamples = await apiRequest("/api/qcsamples");
  return (qcSamples || []).map(toUiQcSample);
}

export async function createQcSample({ qcNumber, type, refId, expectedAl2o3, actualAl2o3 }) {
  const created = await apiRequest("/api/qcsamples", {
    method: "POST",
    body: JSON.stringify({
      qcNumber,
      type,
      referenceSampleId: refId || null,
      expectedAl2O3: Number(expectedAl2o3),
      actualAl2O3: Number(actualAl2o3),
    }),
  });
  return toUiQcSample(created);
}
