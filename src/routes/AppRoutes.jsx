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
  onSampleUpdated,
  onSampleDeleted,
  onResultStatusChanged,
  onCoaStatusChanged,
  showToast,
  canAccess,
}) {
  if (!user) return null;
  if (!canAccess(page)) return <AccessDenied page={page} />;

  const pageProps = { user, samples, results, coas, setSamples, setResults, setCoas, onNavigate, onSampleAdded, onResultAdded, onCoaCreated, onSampleStatusChanged, onSampleUpdated, onSampleDeleted, onResultStatusChanged, onCoaStatusChanged, showToast };

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
