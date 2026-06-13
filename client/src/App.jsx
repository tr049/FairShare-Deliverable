import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./auth/ProtectedRoute.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import GroupPage from "./pages/GroupPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";

// Routes per docs/user-stories.md: public /signup and /login; protected
// / (dashboard) and /groups/:id behind the session wrapper. Each page sits
// inside its own error boundary (Prod scope) so a render crash on one page
// shows a recoverable message, never a white screen.
export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <ErrorBoundary>
            <LoginPage />
          </ErrorBoundary>
        }
      />
      <Route
        path="/signup"
        element={
          <ErrorBoundary>
            <SignupPage />
          </ErrorBoundary>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <ErrorBoundary>
              <DashboardPage />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/groups/:id"
        element={
          <ProtectedRoute>
            <ErrorBoundary>
              <GroupPage />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ErrorBoundary>
              <ProfilePage />
            </ErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
