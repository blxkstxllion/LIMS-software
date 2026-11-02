import { Routes, Route, Navigate } from "react-router-dom";
import { keyToPath } from "./pageKeyPath";
import { SampleRegistration } from "../pages/SampleRegistration";
import { SampleManagement } from "../pages/SampleManagement";
import { SampleVerification } from "../pages/SampleVerification";
import { ResultsEntry } from "../pages/ResultsEntry";
import { COAGenerator } from "../pages/COAGenerator";
import { QCManagement } from "../pages/QCManagement";
import { FileManagement } from "../pages/FileManagement";
import { Reports } from "../pages/Reports";
import { AdminPanel } from "../pages/AdminPanel";
import { AccessDenied } from "../pages/AccessDenied";
import Dashboard from "../pages/Dashboard";

export default function AppRoutes({
  user,
  samples,
  results,
  coas,
  setSamples,
  setResults,
  setCoas,
  onNavigate,
  onSampleAdded,
  onResultAdded,
  onCoaCreated,
  onSampleStatusChanged,
  onSampleUpdated,
  onSampleDeleted,
  onResultStatusChanged,
  onCoaStatusChanged,
  showToast,
  canAccess,
}) {
  if (!user) return null;

  const pageProps = { user, samples, results, coas, setSamples, setResults, setCoas, onNavigate, onSampleAdded, onResultAdded, onCoaCreated, onSampleStatusChanged, onSampleUpdated, onSampleDeleted, onResultStatusChanged, onCoaStatusChanged, showToast };

  // Each feature page requires a specific role (see SIDEBAR_MENU) — a direct/deep link
  // to a page the signed-in user can't use shows AccessDenied instead of the feature,
  // same guard that used to run once up front against the single active `page` key.
  const guarded = (key, element) => (canAccess(key) ? element : <AccessDenied page={key} />);

  return (
    <Routes>
      <Route path="/" element={<Navigate to={keyToPath("dashboard")} replace />} />
      <Route path={keyToPath("dashboard")} element={<Dashboard {...pageProps} />} />
      <Route path={keyToPath("sample_registration")} element={guarded("sample_registration", <SampleRegistration {...pageProps} />)} />
      <Route path={keyToPath("sample_management")} element={guarded("sample_management", <SampleManagement {...pageProps} />)} />
      <Route path={keyToPath("sample_verification")} element={guarded("sample_verification", <SampleVerification {...pageProps} />)} />
      <Route path={keyToPath("results_entry")} element={guarded("results_entry", <ResultsEntry {...pageProps} />)} />
      <Route path={keyToPath("coa_generator")} element={guarded("coa_generator", <COAGenerator {...pageProps} />)} />
      <Route path={keyToPath("qc_management")} element={guarded("qc_management", <QCManagement {...pageProps} />)} />
      <Route path={keyToPath("file_management")} element={guarded("file_management", <FileManagement {...pageProps} />)} />
      <Route path={keyToPath("reports")} element={guarded("reports", <Reports {...pageProps} />)} />
      <Route path={keyToPath("admin_panel")} element={guarded("admin_panel", <AdminPanel {...pageProps} />)} />
      <Route path="*" element={<Navigate to={keyToPath("dashboard")} replace />} />
    </Routes>
  );
}
