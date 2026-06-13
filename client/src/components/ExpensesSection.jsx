import { useMemo, useState } from "react";
import ConfirmDialog from "./ConfirmDialog.jsx";
import ExpenseForm from "./ExpenseForm.jsx";
import Avatar from "./Avatar.jsx";
import Money from "./Money.jsx";
import { api } from "../api.js";
import { formatDate, formatTimestamp } from "../lib/format.js";
import { CATEGORIES } from "../lib/categories.js";

export default function ExpensesSection({ groupId, expenses, members, currentUserId, onChanged }) {
  // form: null (closed) | { expense: null } (add) | { expense: {...} } (edit)
  const [form, setForm] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editLoadingId, setEditLoadingId] = useState(null);

  // Search and filters are purely client-side over the already-fetched list
  // (per docs/scope.md v1.1 — lists are demo-scale, no API change).
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [payerFilter, setPayerFilter] = useState("");

  // Payer options come from the expenses themselves, so removed members who
  // still appear on historical expenses remain filterable.
  const payerOptions = useMemo(() => {
    const seen = new Map();
    for (const exp of expenses) seen.set(exp.payer.id, exp.payer.name);
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [expenses]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return expenses.filter(
      (exp) =>
        (!q || exp.description.toLowerCase().includes(q)) &&
        (!categoryFilter || (exp.category || "general") === categoryFilter) &&
        (!payerFilter || exp.payer.id === Number(payerFilter))
    );
  }, [expenses, query, categoryFilter, payerFilter]);

  const filtering = query.trim() !== "" || categoryFilter !== "" || payerFilter !== "";

  function resetFilters() {
    setQuery("");
    setCategoryFilter("");
    setPayerFilter("");
  }

  // Edit pre-fills from GET /groups/:id/expenses/:expenseId per the contract.
  // While that fetch is in flight the row's buttons are disabled and the Edit
  // button reads "Loading..." so a double click can't open two forms.
  async function openEdit(expenseRow) {
    if (editLoadingId !== null) return;
    setError("");
    setEditLoadingId(expenseRow.id);
    try {
      const full = await api.getExpense(groupId, expenseRow.id);
      setForm({ expense: full });
    } catch (err) {
      setError(err.message);
    } finally {
      setEditLoadingId(null);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError("");
    try {
      await api.deleteExpense(groupId, deleteTarget.id);
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
      <div className="section-head">
        <h2>Expenses</h2>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setForm({ expense: null })}
        >
          Add expense
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {form && (
        <ExpenseForm
          key={form.expense ? `edit-${form.expense.id}` : "add"}
          groupId={groupId}
          members={members}
          currentUserId={currentUserId}
          expense={form.expense}
          onCancel={() => setForm(null)}
          onSaved={async () => {
            setForm(null);
            await onChanged();
          }}
        />
      )}
      {expenses.length > 0 && (
        <div className="toolbar">
          <input
            type="search"
            className="search"
            name="expense_search"
            aria-label="Search expenses by description"
            placeholder="Search descriptions"
            data-testid="expense-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            name="category_filter"
            aria-label="Filter by category"
            data-testid="category-filter"
            className={categoryFilter ? "filter-active" : ""}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            name="payer_filter"
            aria-label="Filter by payer"
            data-testid="payer-filter"
            className={payerFilter ? "filter-active" : ""}
            value={payerFilter}
            onChange={(e) => setPayerFilter(e.target.value)}
          >
            <option value="">All payers</option>
            {payerOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {filtering && (
            <button type="button" className="btn btn-small" onClick={resetFilters}>
              Reset
            </button>
          )}
        </div>
      )}
      {expenses.length === 0 ? (
        <p className="empty">{'No expenses yet — click "Add expense" to log the first one.'}</p>
      ) : filtered.length === 0 ? (
        <p className="empty" data-testid="no-matches">
          No expenses match your search or filters — try clearing them.
        </p>
      ) : (
        <ul className="rows">
          {filtered.map((exp) => (
            <li key={exp.id} className="row">
              <div className="line-label">
                <Avatar user={exp.payer} size={30} />
                <div>
                  <strong>{exp.description}</strong>{" "}
                  <span className="chip">{exp.category || "general"}</span>
                  <div className="expense-meta">
                    <Money fils={exp.amount_fils} />
                    <span>{`· ${formatDate(exp.date)} · paid by ${exp.payer.name}`}</span>
                  </div>
                  {exp.last_edited_by && (
                    <div className="muted edited">
                      {`edited by ${exp.last_edited_by.name} · ${formatTimestamp(exp.last_edited_at)}`}
                    </div>
                  )}
                </div>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => openEdit(exp)}
                  disabled={editLoadingId !== null}
                >
                  {editLoadingId === exp.id ? "Loading..." : "Edit"}
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  onClick={() => setDeleteTarget(exp)}
                  disabled={editLoadingId !== null}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete expense"
        message={deleteTarget ? `Delete "${deleteTarget.description}"? Balances will recompute as if it never existed.` : ""}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
