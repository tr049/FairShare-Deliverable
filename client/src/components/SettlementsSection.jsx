import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog.jsx";
import Avatar from "./Avatar.jsx";
import Money from "./Money.jsx";
import { api } from "../api.js";
import { formatDate, formatFils } from "../lib/format.js";

// Settlements have no edit — a wrong one is deleted and re-recorded.
export default function SettlementsSection({ groupId, settlements, onChanged }) {
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    setBusy(true);
    setError("");
    try {
      await api.deleteSettlement(groupId, deleteTarget.id);
      setDeleteTarget(null);
      await onChanged();
    } catch (err) {
      setDeleteTarget(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Settlements</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {settlements.length === 0 ? (
        <p className="empty">No settlements yet.</p>
      ) : (
        <ul className="rows">
          {settlements.map((s) => (
            <li key={s.id} className="row">
              <span className="line-label">
                <Avatar user={s.payer} size={26} />
                <span>
                  {s.payer.name} paid {s.payee.name} <Money fils={s.amount_fils} />
                  <span className="muted">{` · ${formatDate(s.date)}`}</span>
                </span>
              </span>
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => setDeleteTarget(s)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete settlement"
        message={
          deleteTarget
            ? `Delete this settlement (${deleteTarget.payer.name} paid ${deleteTarget.payee.name} ${formatFils(deleteTarget.amount_fils)})?`
            : ""
        }
        confirmLabel="Delete"
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
