import { createContext, useCallback, useContext, useMemo, useEffect, useState } from "react";
import { createSample, createResult, createCoa, fetchLimsData, updateSampleStatus, updateSample, deleteSample, updateResultStatus, updateCoaStatus } from "../services/sampleService";

const SampleContext = createContext(null);

// How often to quietly re-pull the shared dataset in the background. Without this,
// one person's action (submitting a result, rejecting a sample) is invisible to
// everyone else's already-open tab until they hit F5 — this was the root cause behind
// "QC/QA couldn't see a result that was already submitted". 45s is frequent enough
// that a pending-approval queue never feels stale, without hammering the API.
const BACKGROUND_REFRESH_MS = 45_000;

export function SampleProvider({ children }) {
  const [samples, setSamples] = useState([]);
  const [results, setResults] = useState([]);
  const [coas, setCoas] = useState([]);
  const [loading, setLoading] = useState(true);

  // Separate from the initial load: a background/manual refresh should never flip the
  // whole app back into its full-page loading state, or the Verification Center's list
  // would flash empty every 45s while someone is in the middle of reading it.
  const refreshData = useCallback(async () => {
    try {
      const data = await fetchLimsData();
      setSamples(data.samples);
      setResults(data.results);
      setCoas(data.coas || []);
    } catch (error) {
      console.error("Failed to refresh LIMS data", error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchLimsData();
        if (cancelled) return;
        setSamples(data.samples);
        setResults(data.results);
        setCoas(data.coas || []);
      } catch (error) {
        console.error("Failed to load LIMS data", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const interval = setInterval(refreshData, BACKGROUND_REFRESH_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [refreshData]);

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

  const onSampleStatusChanged = useCallback(async (sampleId, status, comment) => {
    const updated = await updateSampleStatus(sampleId, status, comment);
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

  const onResultStatusChanged = useCallback(async (resultId, status, comment, password) => {
    const updated = await updateResultStatus(resultId, status, comment, password);
    setResults((prev) => prev.map((result) => (result.id === resultId ? updated : result)));
    return updated;
  }, []);

  const onCoaStatusChanged = useCallback(async (coaId, status, password) => {
    const updated = await updateCoaStatus(coaId, status, password);
    setCoas((prev) => prev.map((coa) => (coa.id === coaId ? { ...coa, ...updated } : coa)));
    return updated;
  }, []);

  const value = useMemo(() => ({ samples, setSamples, results, setResults, coas, setCoas, onSampleAdded, onResultAdded, onCoaCreated, onSampleStatusChanged, onSampleUpdated, onSampleDeleted, onResultStatusChanged, onCoaStatusChanged, loading, refreshData }), [samples, results, coas, onSampleAdded, onResultAdded, onCoaCreated, onSampleStatusChanged, onSampleUpdated, onSampleDeleted, onResultStatusChanged, onCoaStatusChanged, loading, refreshData]);

  return <SampleContext.Provider value={value}>{children}</SampleContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- see AuthContext.jsx
export function useSamples() {
  return useContext(SampleContext);
}
