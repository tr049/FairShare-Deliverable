import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import MembersSection from "../components/MembersSection.jsx";
import BalancesSection from "../components/BalancesSection.jsx";
import ExpensesSection from "../components/ExpensesSection.jsx";
import SettlementsSection from "../components/SettlementsSection.jsx";
import ActivitySection from "../components/ActivitySection.jsx";
import CategoryBreakdown from "../components/CategoryBreakdown.jsx";
import { api } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";

export default function GroupPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  // One loader for everything the page shows; re-run after every mutation so
  // balances, expenses, settlements, and activity never go stale.
  const load = useCallback(async () => {
    try {
      const [group, balances, expensesData, settlementsData, activityData] = await Promise.all([
        api.getGroup(id),
        api.getGroupBalances(id),
        api.listExpenses(id),
        api.listSettlements(id),
        api.getActivity(id),
      ]);
      setData({
        group,
        balances,
        expenses: expensesData.expenses,
        settlements: settlementsData.settlements,
        activity: activityData.activity,
      });
      setNotFound(false);
      setError("");
    } catch (err) {
      if (err.status === 404) setNotFound(true);
      else setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    setData(null);
    setNotFound(false);
    load();
  }, [load]);

  function startRename() {
    setRenameValue(data.group.name);
    setRenameError("");
    setRenaming(true);
  }

  async function handleRename(e) {
    e.preventDefault();
    setRenameError("");
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError("Please enter a group name.");
      return;
    }
    setBusy(true);
    try {
      await api.updateGroup(id, { name: trimmed });
      setRenaming(false);
      await load();
    } catch (err) {
      setRenameError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // The export endpoint needs the Authorization header, so it's fetched as a
  // blob and downloaded via a temporary object-URL anchor. Filename comes
  // from Content-Disposition when readable, else "<group>-ledger.csv".
  async function handleExport() {
    setExporting(true);
    setExportError("");
    try {
      const { blob, filename } = await api.exportCsv(id);
      const slug =
        data.group.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "group";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename || `${slug}-ledger.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err.message);
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await api.deleteGroup(id);
      navigate("/", { replace: true });
    } catch (err) {
      setConfirmDelete(false);
      setError(err.message);
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <>
        <Header />
        <main className="container">
          <h1>Group not found</h1>
          <p>
            <Link to="/">Back to dashboard</Link>
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="container">
        <p>
          <Link to="/">&larr; Back to dashboard</Link>
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!data && !error && <p className="muted">Loading...</p>}
        {data && (
          <>
            <div className="card">
              {renaming ? (
                <>
                  <form className="inline-form" onSubmit={handleRename}>
                    <input
                      aria-label="Group name"
                      name="name"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                    />
                    <button type="submit" className="btn btn-primary" disabled={busy}>
                      Save
                    </button>
                    <button type="button" className="btn" onClick={() => setRenaming(false)}>
                      Cancel
                    </button>
                  </form>
                  {renameError && (
                    <p className="error" role="alert">
                      {renameError}
                    </p>
                  )}
                </>
              ) : (
                <div className="section-head">
                  <h1>{data.group.name}</h1>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn"
                      data-testid="export-csv-button"
                      onClick={handleExport}
                      disabled={exporting}
                    >
                      {exporting ? "Exporting..." : "Export CSV"}
                    </button>
                    <button type="button" className="btn" onClick={startRename}>
                      Rename
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete group
                    </button>
                  </div>
                </div>
              )}
              {exportError && (
                <p className="error" role="alert">
                  {exportError}
                </p>
              )}
            </div>

            <MembersSection
              groupId={id}
              members={data.group.members}
              currentUserId={user.id}
              onChanged={load}
            />
            <BalancesSection
              groupId={id}
              balances={data.balances}
              members={data.group.members}
              onChanged={load}
            />
            <ExpensesSection
              groupId={id}
              expenses={data.expenses}
              members={data.group.members}
              currentUserId={user.id}
              onChanged={load}
            />
            <CategoryBreakdown expenses={data.expenses} />
            <SettlementsSection
              groupId={id}
              settlements={data.settlements}
              onChanged={load}
            />
            <ActivitySection activity={data.activity} />

            <ConfirmDialog
              open={confirmDelete}
              title="Delete group"
              message={`Delete "${data.group.name}"? This permanently removes its expenses and settlements.`}
              confirmLabel="Delete"
              busy={busy}
              onConfirm={handleDelete}
              onCancel={() => setConfirmDelete(false)}
            />
          </>
        )}
      </main>
    </>
  );
}
