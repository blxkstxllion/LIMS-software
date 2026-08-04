import { SampleRegistration, SampleManagement, SampleVerification, ResultsEntry, COAGenerator, QCManagement, FileManagement, Reports, AdminPanel, AccessDenied, AnalyticsPage, SettingsPage } from "../pages/FeaturePages";
import Dashboard from "../pages/Dashboard";

export default function AppRoutes({
  user,
  page,
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
  onSampleDeleted,
  onResultStatusChanged,
  onCoaStatusChanged,
  showToast,
  canAccess,
}) {
  if (!user) return null;
  if (!canAccess(page)) return <AccessDenied page={page} />;

  const pageProps = { user, samples, results, coas, setSamples, setResults, setCoas, onNavigate, onSampleAdded, onResultAdded, onCoaCreated, onSampleStatusChanged, onSampleDeleted, onResultStatusChanged, onCoaStatusChanged, showToast };

  switch (page) {
    case "dashboard":
      return <Dashboard {...pageProps} />;
    case "sample_registration":
      return <SampleRegistration {...pageProps} />;
    case "sample_management":
      return <SampleManagement {...pageProps} />;
    case "sample_verification":
      return <SampleVerification {...pageProps} />;
    case "results_entry":
      return <ResultsEntry {...pageProps} />;
    case "coa_generator":
      return <COAGenerator {...pageProps} />;
    case "qc_management":
      return <QCManagement {...pageProps} />;
    case "file_management":
      return <FileManagement {...pageProps} />;
    case "reports":
      return <Reports {...pageProps} />;
    case "admin_panel":
      return <AdminPanel {...pageProps} />;
    default:
      return <Dashboard {...pageProps} />;
  }
}
