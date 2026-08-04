import { useCallback } from "react";
import { SIDEBAR_MENU } from "./constants/lims";
import { Toast } from "./components/shared";
import DashboardLayout from "./layouts/DashboardLayout";
import LoginPage from "./pages/LoginPage";
import AppRoutes from "./routes/AppRoutes";
import { useAuth } from "./contexts/AuthContext";
import { useSamples } from "./contexts/SampleContext";
import { useUI } from "./contexts/UIContext";

/**
 * AppBootstrap - Application Shell
 * 
 * This is the main application shell that handles:
 * - User authentication state (logged-in/logged-out)
 * - Layout management (dashboard vs. login)
 * - Route delegation to AppRoutes
 * - Toast notification rendering
 * 
 * This file acts as the bridge between:
 * - Auth context → provides user session
 * - Sample context → provides domain data
 * - UI context → provides notifications and page state
 * - Layout → wraps authenticated app with sidebar/header
 * - Routes → delegates to feature pages based on page state
 */
export default function AppBootstrap() {
  const { user, login, logout } = useAuth();
  const { samples, setSamples, results, setResults, coas, setCoas, onSampleAdded, onResultAdded, onCoaCreated, onSampleStatusChanged, onSampleDeleted, onResultStatusChanged, onCoaStatusChanged } = useSamples();
  const { toast, clearToast, page, setPage, showToast } = useUI();

  // Permission helper: check if user can access a feature
  const canAccess = useCallback((featureKey) => {
    const menuItem = SIDEBAR_MENU.find((m) => m.key === featureKey);
    if (!menuItem) return true; // Unknown features are accessible by default
    return menuItem.roles.includes("all") || menuItem.roles.includes(user?.role);
  }, [user?.role]);

  // Show login screen if user is not authenticated
  if (!user) {
    return (
      <>
        <LoginPage
          onLogin={async (staffId, password) => {
            const success = await login(staffId, password);
            if (!success) {
              showToast("Invalid Staff ID or password. Please try again.", "error");
            }
          }}
        />
        {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}
      </>
    );
  }

  // Show authenticated app with layout, routes, and notifications
  return (
    <>
      <DashboardLayout user={user} onLogout={logout} activePage={page} onNavigate={setPage}>
        <AppRoutes
          user={user}
          page={page}
          samples={samples}
          results={results}
          coas={coas}
          setSamples={setSamples}
          setResults={setResults}
          setCoas={setCoas}
          onNavigate={setPage}
          onSampleAdded={onSampleAdded}
          onResultAdded={onResultAdded}
          onCoaCreated={onCoaCreated}
          onSampleStatusChanged={onSampleStatusChanged}
          onSampleDeleted={onSampleDeleted}
          onResultStatusChanged={onResultStatusChanged}
          onCoaStatusChanged={onCoaStatusChanged}
          showToast={showToast}
          canAccess={canAccess}
        />
      </DashboardLayout>
      {toast && <Toast message={toast.message} type={toast.type} onClose={clearToast} />}
    </>
  );
}
