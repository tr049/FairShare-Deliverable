import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Header from "../components/Header.jsx";
import Avatar from "../components/Avatar.jsx";
import Money from "../components/Money.jsx";
import { api } from "../api.js";
import { formatFils } from "../lib/format.js";

function heroLabel(totalFils) {
  if (totalFils > 0) return "Overall, you are owed";
  if (totalFils < 0) return "Overall, you owe";
  return "All settled up";
}

function netClass(netFils) {
  if (netFils > 0) return "pos";
  if (netFils < 0) return "neg";
  return "muted";
}

export default function DashboardPage() {
  const [groups, setGroups] = useState(null);
  const [overall, setOverall] = useState(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [groupsData, overallData] = await Promise.all([
        api.listGroups(),
        api.getOverallBalances(),
      ]);
      setGroups(groupsData.groups);
      setOverall(overallData);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Please enter a group name.");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      await api.createGroup(trimmed);
      setName("");
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const loading = groups === null || overall === null;

  return (
    <>
      <Header />
      <main className="container">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {loading && !error && <p className="muted">Loading...</p>}
        {!loading && (
          <>
            <section className="card hero">
              <h2>Your balance</h2>
              <p className="hero-label">{heroLabel(overall.total_net_fils)}</p>
              <p className={`hero-numeral ${netClass(overall.total_net_fils)}`}>
                {formatFils(Math.abs(overall.total_net_fils))}
              </p>
              {overall.groups.length > 0 && (
                <>
                  <h3>By group</h3>
                  <ul className="rows">
                    {overall.groups.map((g) => (
                      <li key={g.id} className="row ledger-line">
                        <span className="line-label">
                          <Link to={`/groups/${g.id}`}>{g.name}</Link>
                        </span>
                        <span className="leader" aria-hidden="true"></span>
                        <span className={netClass(g.net_fils)}>
                          {g.net_fils === 0 ? (
                            "settled up"
                          ) : (
                            <>
                              {g.net_fils > 0 ? "you are owed " : "you owe "}
                              <Money fils={Math.abs(g.net_fils)} />
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {overall.people.length > 0 && (
                <>
                  <h3>By person</h3>
                  <ul className="rows">
                    {overall.people.map((p) => (
                      <li key={p.user.id} className="row ledger-line">
                        <span className="line-label">
                          <Avatar user={p.user} size={26} />
                          <span>{p.user.name}</span>
                        </span>
                        <span className="leader" aria-hidden="true"></span>
                        <span className={netClass(p.net_fils)}>
                          {p.net_fils > 0 ? "owes you " : "you owe "}
                          <Money fils={Math.abs(p.net_fils)} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section className="card">
              <div className="section-head">
                <h2>Your groups</h2>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setShowForm((s) => !s)}
                >
                  New group
                </button>
              </div>
              {showForm && (
                <>
                  <form className="inline-form" onSubmit={handleCreate}>
                    <label htmlFor="new-group-name">Name</label>
                    <input
                      id="new-group-name"
                      name="name"
                      placeholder="e.g. Flat 12"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <button type="submit" className="btn btn-primary" disabled={busy}>
                      Create group
                    </button>
                  </form>
                  {formError && (
                    <p className="error" role="alert">
                      {formError}
                    </p>
                  )}
                </>
              )}
              {groups.length === 0 ? (
                <p className="empty">
                  {'No groups yet — click "New group" to create your first one.'}
                </p>
              ) : (
                <ul className="rows">
                  {groups.map((g) => (
                    <li key={g.id} className="row ledger-line">
                      <span className="line-label">
                        <Link to={`/groups/${g.id}`}>{g.name}</Link>
                      </span>
                      <span className="leader" aria-hidden="true"></span>
                      <span className="muted">
                        {g.member_count} {g.member_count === 1 ? "member" : "members"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
