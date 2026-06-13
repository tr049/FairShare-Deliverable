import { Link, useNavigate } from "react-router-dom";
import Avatar from "./Avatar.jsx";
import { useAuth } from "../auth/AuthContext.jsx";

// Signed-in header: the Fairshare wordmark, the user's avatar + name linking
// to /profile, and the "Log out" button (both QA anchors preserved).
export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand">
          Fairshare
        </Link>
        <div className="topbar-right">
          {user && (
            <Link to="/profile" className="profile-link" data-testid="profile-link">
              <Avatar user={user} size={26} />
              <span className="user-name">{user.name}</span>
            </Link>
          )}
          <button
            type="button"
            className="btn"
            data-testid="logout-button"
            onClick={handleLogout}
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
