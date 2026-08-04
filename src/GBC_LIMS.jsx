import { AuthProvider } from "./contexts/AuthContext";
import { SampleProvider } from "./contexts/SampleContext";
import { UIProvider } from "./contexts/UIContext";
import AppBootstrap from "./AppBootstrap";

/**
 * GBC LIMS - Application Entry Point
 * 
 * This is the root bootstrap file. It wraps the entire application in
 * context providers for authentication, data management, and UI state.
 * 
 * Architecture layers (from inside out):
 * 1. AuthProvider      — manages user authentication and session
 * 2. SampleProvider    — manages sample, result, and COA data
 * 3. UIProvider        — manages UI state (toasts, page navigation)
 * 4. AppBootstrap      — the application shell (layout, routes, auth flow)
 * 
 * This file contains ONLY provider wrapping.
 * All business logic, features, and routing are delegated to modules:
 * - src/AppBootstrap.jsx: main app shell and layout
 * - src/routes/AppRoutes.jsx: centralized page routing
 * - src/pages/FeaturePages.jsx: all feature implementations
 * - src/services/: business logic and data access
 * - src/contexts/: global state management
 */
export default function GBC_LIMS() {
  return (
    <AuthProvider>
      <SampleProvider>
        <UIProvider>
          <AppBootstrap />
        </UIProvider>
      </SampleProvider>
    </AuthProvider>
  );
}
