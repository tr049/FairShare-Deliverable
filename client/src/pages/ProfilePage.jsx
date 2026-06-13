import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Header from "../components/Header.jsx";
import Avatar from "../components/Avatar.jsx";
import { api } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { formatDate } from "../lib/format.js";

// /profile — view email (and joined date when the API returns created_at),
// edit the display name (PUT /auth/me), change the password
// (PUT /auth/me/password). Name changes flow through the auth context so
// the header and every member rendering update immediately.
export default function ProfilePage() {
  const { user, updateProfile } = useAuth();

  const [me, setMe] = useState(null);
  const [loadError, setLoadError] = useState("");

  const [name, setName] = useState(user.name);
  const [nameError, setNameError] = useState("");
  const [nameSuccess, setNameSuccess] = useState("");
  const [nameBusy, setNameBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  // Fresh GET /auth/me on mount: the contract's auth user is { id, name,
  // email }; if the backend also includes created_at we show the joined date,
  // otherwise email only — never invent fields.
  useEffect(() => {
    api
      .me()
      .then((data) => setMe(data.user))
      .catch((err) => setLoadError(err.message));
  }, []);

  async function handleNameSubmit(e) {
    e.preventDefault();
    setNameError("");
    setNameSuccess("");
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Please enter a display name.");
      return;
    }
    setNameBusy(true);
    try {
      await updateProfile(trimmed);
      setName(trimmed);
      setNameSuccess("Name updated — it now shows everywhere you appear.");
    } catch (err) {
      setNameError(err.message);
    } finally {
      setNameBusy(false);
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    if (!currentPassword) {
      setPasswordError("Please enter your current password.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }
    setPasswordBusy(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordSuccess("Password changed.");
    } catch (err) {
      // The backend's wrong_password message reads "Current password is
      // incorrect." — rendered verbatim, inline.
      setPasswordError(err.message);
    } finally {
      setPasswordBusy(false);
    }
  }

  const email = (me && me.email) || user.email || "";
  const joined = me && me.created_at ? me.created_at.slice(0, 10) : null;

  return (
    <>
      <Header />
      <main className="container">
        <p>
          <Link to="/">&larr; Back to dashboard</Link>
        </p>
        {loadError && (
          <p className="error" role="alert">
            {loadError}
          </p>
        )}

        <div className="card profile-head">
          <Avatar user={user} size={56} />
          <div>
            <h1>{user.name}</h1>
            <p className="muted">{email}</p>
            {joined && <p className="muted">Joined {formatDate(joined)}</p>}
          </div>
        </div>

        <section className="card">
          <h2>Display name</h2>
          <form onSubmit={handleNameSubmit}>
            <div className="field">
              <label htmlFor="profile-name">Name</label>
              <input
                id="profile-name"
                name="name"
                data-testid="profile-name-input"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {nameError && (
              <p className="error" role="alert">
                {nameError}
              </p>
            )}
            {nameSuccess && (
              <p className="success" role="status">
                {nameSuccess}
              </p>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              data-testid="save-name-button"
              disabled={nameBusy}
            >
              {nameBusy ? "Saving..." : "Save name"}
            </button>
          </form>
        </section>

        <section className="card">
          <h2>Change password</h2>
          <form onSubmit={handlePasswordSubmit}>
            <div className="field">
              <label htmlFor="current-password">Current password</label>
              <input
                id="current-password"
                name="current_password"
                type="password"
                data-testid="current-password-input"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                name="new_password"
                type="password"
                data-testid="new-password-input"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            {passwordError && (
              <p className="error" role="alert">
                {passwordError}
              </p>
            )}
            {passwordSuccess && (
              <p className="success" role="status">
                {passwordSuccess}
              </p>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              data-testid="change-password-button"
              disabled={passwordBusy}
            >
              {passwordBusy ? "Changing..." : "Change password"}
            </button>
          </form>
        </section>
      </main>
    </>
  );
}
