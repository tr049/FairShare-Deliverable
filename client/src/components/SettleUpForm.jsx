import { useState } from "react";
import { api } from "../api.js";
import { filsToInput, parseAedToFils, todayISO } from "../lib/format.js";

// Pre-filled from the clicked pair: payer = debtor, payee = creditor, amount =
// the displayed outstanding amount (editable), date = today.
export default function SettleUpForm({ groupId, members, pair, onCancel, onSaved }) {
  const [payerId, setPayerId] = useState(pair.from.id);
  const [payeeId, setPayeeId] = useState(pair.to.id);
  const [amount, setAmount] = useState(filsToInput(pair.amount_fils));
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const amountFils = parseAedToFils(amount);
    if (amountFils === null || amountFils <= 0) {
      setError("Please enter a positive amount with at most two decimals.");
      return;
    }
    if (Number(payerId) === Number(payeeId)) {
      setError("Payer and payee must be different members.");
      return;
    }
    setBusy(true);
    try {
      const body = {
        payer_id: Number(payerId),
        payee_id: Number(payeeId),
        amount_fils: amountFils,
      };
      if (date) body.date = date;
      await api.createSettlement(groupId, body);
      await onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h3>Settle up</h3>
      <div className="field-row">
        <div className="field">
          <label htmlFor="settle-payer">Payer</label>
          <select
            id="settle-payer"
            name="payer_id"
            value={payerId}
            onChange={(e) => setPayerId(Number(e.target.value))}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="settle-payee">Payee</label>
          <select
            id="settle-payee"
            name="payee_id"
            value={payeeId}
            onChange={(e) => setPayeeId(Number(e.target.value))}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="settle-amount">Amount (AED)</label>
          <input
            id="settle-amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="settle-date">Date</label>
          <input
            id="settle-date"
            name="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Record payment
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
