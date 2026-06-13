import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

// Wraps authenticated routes. While the session restore is in flight we show
// a small indicator (not a blank screen); without a session we go to /login.
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="container">
        <p className="muted">Loading...</p>
      </main>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return children;
}
