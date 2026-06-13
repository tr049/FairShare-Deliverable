import { useState } from "react";
import SettleUpForm from "./SettleUpForm.jsx";
import Avatar from "./Avatar.jsx";
import Money from "./Money.jsx";
import { api } from "../api.js";

function netClass(netFils) {
  if (netFils > 0) return "pos";
  if (netFils < 0) return "neg";
  return "muted";
}

export default function BalancesSection({ groupId, balances, members, onChanged }) {
  const [settlePair, setSettlePair] = useState(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [error, setError] = useState("");

  // The toggle is group-wide state: PUT it, then re-fetch so the pairs list
  // reflects the simplified plan (or the raw pairwise view) from the server.
  async function handleToggle() {
    setToggleBusy(true);
    setError("");
    try {
      await api.updateGroup(groupId, { simplify_debts: !balances.simplify_debts });
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setToggleBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="section-head">
        <h2>Balances</h2>
        <label className="toggle">
          <input
            type="checkbox"
            name="simplify_debts"
            checked={balances.simplify_debts}
            onChange={handleToggle}
            disabled={toggleBusy}
          />{" "}
          Simplify debts
        </label>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ul className="rows">
        {balances.members.map((m) => (
          <li key={m.user.id} className="row ledger-line">
            <span className="line-label">
              <Avatar user={m.user} size={26} />
              <strong>{m.user.name}</strong>
            </span>
            <span className="leader" aria-hidden="true"></span>
            <span className={netClass(m.net_fils)}>
              {m.net_fils === 0 ? (
                "settled up"
              ) : (
                <>
                  {m.net_fils > 0 ? "gets back " : "owes "}
                  <Money fils={Math.abs(m.net_fils)} />
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      <h3>Who owes whom</h3>
      {balances.pairs.length === 0 ? (
        <p className="empty">Everyone is settled up.</p>
      ) : (
        <ul className="rows">
          {balances.pairs.map((pair) => (
            <li key={`${pair.from.id}-${pair.to.id}`} className="row ledger-line">
              <span className="line-label">
                <Avatar user={pair.from} size={22} />
                <span>
                  {pair.from.name} <span className="muted">owes</span> {pair.to.name}
                </span>
              </span>
              <span className="leader" aria-hidden="true"></span>
              <Money fils={pair.amount_fils} className="neg" />
              <span className="actions">
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => setSettlePair(pair)}
                >
                  Settle up
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {settlePair && (
        <SettleUpForm
          key={`${settlePair.from.id}-${settlePair.to.id}-${settlePair.amount_fils}`}
          groupId={groupId}
          members={members}
          pair={settlePair}
          onCancel={() => setSettlePair(null)}
          onSaved={async () => {
            setSettlePair(null);
            await onChanged();
          }}
        />
      )}
    </section>
  );
}
