import { createContext, useCallback, useContext, useMemo, useEffect, useState } from "react";
import { createSample, createResult, createCoa, fetchLimsData, updateSampleStatus, updateSample, deleteSample, updateResultStatus, updateCoaStatus } from "../services/sampleService";

const SampleContext = createContext(null);

export function SampleProvider({ children }) {
  const [samples, setSamples] = useState([]);
  const [results, setResults] = useState([]);
  const [coas, setCoas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const data = await fetchLimsData();
        setSamples(data.samples);
        setResults(data.results);
        setCoas(data.coas || []);
      } catch (error) {
        console.error("Failed to load LIMS data", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const onSampleAdded = useCallback(async (sample) => {
    try {
      const created = await createSample({
        sampleNumber: sample.id,
        origin: sample.origin,
        sampleSource: sample.sampleSource,
        location: sample.location,
        quantity: Number(sample.quantity),
        unit: sample.unit,
        tonnage: Number(sample.tonnage),
        priority: sample.priority,
        submittedBy: sample.submittedBy,
        receivedBy: sample.receivedBy,
        batchNumber: sample.batchNumber,
        notes: sample.notes,
      });
      setSamples((prev) => [created, ...prev]);
      return created;
    } catch (error) {
      console.error("Failed to create sample", error);
      throw error;
    }
  }, []);

  const onResultAdded = useCallback(async (resultPayload) => {
    const created = await createResult(resultPayload);
    setResults((prev) => [created, ...prev]);
    return created;
  }, []);

  const onCoaCreated = useCallback(async (coaPayload) => {
    const created = await createCoa(coaPayload);
    setCoas((prev) => [created, ...prev]);
    return created;
  }, []);

  const onSampleStatusChanged = useCallback(async (sampleId, status) => {
    const updated = await updateSampleStatus(sampleId, status);
    setSamples((prev) => prev.map((sample) => (sample.id === sampleId ? { ...sample, status: updated.status } : sample)));
    return updated;
  }, []);

  const onSampleUpdated = useCallback(async (sampleId, payload) => {
    const updated = await updateSample(sampleId, payload);
    setSamples((prev) => prev.map((sample) => (sample.id === sampleId ? { ...sample, ...updated } : sample)));
    return updated;
  }, []);

  const onSampleDeleted = useCallback(async (sampleId) => {
    await deleteSample(sampleId);
    setSamples((prev) => prev.filter((sample) => sample.id !== sampleId));
  }, []);

  const onResultStatusChanged = useCallback(async (resultId, status, comment) => {
    const updated = await updateResultStatus(resultId, status, comment);
    setResults((prev) => prev.map((result) => (result.id === resultId ? updated : result)));
    return updated;
  }, []);

  const onCoaStatusChanged = useCallback(async (coaId, status) => {
    const updated = await updateCoaStatus(coaId, status);
    setCoas((prev) => prev.map((coa) => (coa.id === coaId ? { ...coa, ...updated } : coa)));
    return updated;
  }, []);

  const value = useMemo(() => ({ samples, setSamples, results, setResults, coas, setCoas, onSampleAdded, onResultAdded, onCoaCreated, onSampleStatusChanged, onSampleUpdated, onSampleDeleted, onResultStatusChanged, onCoaStatusChanged, loading }), [samples, results, coas, onSampleAdded, onResultAdded, onCoaCreated, onSampleStatusChanged, onSampleUpdated, onSampleDeleted, onResultStatusChanged, onCoaStatusChanged, loading]);

  return <SampleContext.Provider value={value}>{children}</SampleContext.Provider>;
}

export function useSamples() {
  return useContext(SampleContext);
}
