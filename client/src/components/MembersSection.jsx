import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ConfirmDialog from "./ConfirmDialog.jsx";
import Avatar from "./Avatar.jsx";
import { api } from "../api.js";

export default function MembersSection({ groupId, members, currentUserId, onChanged }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);

  async function handleAdd(e) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setMessage("Please enter an email address.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api.addMember(groupId, trimmed);
      setEmail("");
      await onChanged();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    const target = removeTarget;
    setBusy(true);
    setMessage("");
    try {
      await api.removeMember(groupId, target.id);
      setRemoveTarget(null);
      if (target.id === currentUserId) {
        // Removed ourselves — the group is no longer visible to us.
        navigate("/", { replace: true });
        return;
      }
      await onChanged();
    } catch (err) {
      setRemoveTarget(null);
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Members</h2>
      <ul className="rows">
        {members.map((m) => (
          <li key={m.id} className="row">
            <span className="line-label">
              <Avatar user={m} size={30} />
              <span>
                <strong>{m.name}</strong>
                {m.id === currentUserId ? " (you)" : ""}
                <span className="muted"> · {m.email}</span>
              </span>
            </span>
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                setMessage("");
                setRemoveTarget(m);
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {members.length === 1 && (
        <p className="empty">Just you so far — add members by their email below.</p>
      )}
      <form className="inline-form" onSubmit={handleAdd}>
        <label htmlFor="add-member-email">Email</label>
        <input
          id="add-member-email"
          name="email"
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Add member
        </button>
      </form>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      <ConfirmDialog
        open={removeTarget !== null}
        title="Remove member"
        message={removeTarget ? `Remove ${removeTarget.name} from the group?` : ""}
        confirmLabel="Remove"
        busy={busy}
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </section>
  );
}
