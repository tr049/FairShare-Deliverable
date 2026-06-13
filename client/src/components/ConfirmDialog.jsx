// Small in-DOM confirm dialog so destructive actions need an explicit click
// (and Playwright can drive it without native dialog handling).
export default function ConfirmDialog({ open, title, message, confirmLabel, busy, onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
