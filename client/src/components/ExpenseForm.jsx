import { useState } from "react";
import { api } from "../api.js";
import { filsToInput, formatFils, parseAedToFils, todayISO } from "../lib/format.js";
import { CATEGORIES } from "../lib/categories.js";

// Add and edit share this form. Defaults (add): paid by me, today's date,
// split equally, all members ticked. Equal sends participant_ids (in the
// order participants were selected, so the earliest-selected get any
// remainder fils); exact sends splits that must sum to the amount.
export default function ExpenseForm({ groupId, members, currentUserId, expense, onCancel, onSaved }) {
  const editing = expense !== null && expense !== undefined;

  const [description, setDescription] = useState(editing ? expense.description : "");
  const [amount, setAmount] = useState(editing ? filsToInput(expense.amount_fils) : "");
  const [date, setDate] = useState(editing ? expense.date : todayISO());
  const [category, setCategory] = useState(editing ? expense.category || "general" : "general");
  const [payerId, setPayerId] = useState(() => {
    if (editing && members.some((m) => m.id === expense.payer.id)) return expense.payer.id;
    return currentUserId;
  });
  const [splitMethod, setSplitMethod] = useState(editing ? expense.split_method : "equal");
  const [participantIds, setParticipantIds] = useState(() => {
    if (editing) {
      return expense.splits
        .map((s) => s.user.id)
        .filter((uid) => members.some((m) => m.id === uid));
    }
    return members.map((m) => m.id);
  });
  const [exactAmounts, setExactAmounts] = useState(() => {
    const initial = {};
    if (editing) {
      for (const s of expense.splits) initial[s.user.id] = filsToInput(s.amount_fils);
    }
    return initial;
  });
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);

  function toggleParticipant(userId) {
    setParticipantIds((ids) =>
      ids.includes(userId) ? ids.filter((x) => x !== userId) : [...ids, userId]
    );
  }

  const amountFils = parseAedToFils(amount);
  const assignedFils = participantIds.reduce((sum, uid) => {
    const parsed = parseAedToFils(exactAmounts[uid] || "");
    return sum + (parsed === null ? 0 : parsed);
  }, 0);
  const leftoverFils = (amountFils === null ? 0 : amountFils) - assignedFils;

  function validate() {
    const problems = [];
    if (!description.trim()) problems.push("Please enter a description.");
    if (amountFils === null || amountFils <= 0) {
      problems.push("Please enter a positive amount with at most two decimals.");
    }
    if (!date) problems.push("Please pick a date.");
    if (participantIds.length === 0) problems.push("Please tick at least one participant.");
    if (splitMethod === "exact") {
      for (const uid of participantIds) {
        const raw = (exactAmounts[uid] || "").trim();
        if (raw !== "" && parseAedToFils(raw) === null) {
          problems.push("Split amounts must be AED with at most two decimals.");
          break;
        }
      }
      if (amountFils !== null && amountFils > 0 && leftoverFils !== 0) {
        problems.push(
          `Splits must sum to the expense amount. ${formatFils(leftoverFils)} left to assign.`
        );
      }
    }
    return problems;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const problems = validate();
    if (problems.length > 0) {
      setErrors(problems);
      return;
    }
    const body = {
      description: description.trim(),
      amount_fils: amountFils,
      date,
      category,
      payer_id: Number(payerId),
      split_method: splitMethod,
    };
    if (splitMethod === "equal") {
      body.participant_ids = participantIds;
    } else {
      body.splits = participantIds.map((uid) => {
        const parsed = parseAedToFils(exactAmounts[uid] || "");
        return { user_id: uid, amount_fils: parsed === null ? 0 : parsed };
      });
    }
    setBusy(true);
    setErrors([]);
    try {
      if (editing) {
        await api.updateExpense(groupId, expense.id, body);
      } else {
        await api.createExpense(groupId, body);
      }
      await onSaved();
    } catch (err) {
      setErrors([err.message]);
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <h3>{editing ? "Edit expense" : "Add expense"}</h3>
      <div className="field">
        <label htmlFor="expense-description">Description</label>
        <input
          id="expense-description"
          name="description"
          placeholder="e.g. DEWA bill"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="expense-amount">Amount (AED)</label>
          <input
            id="expense-amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="expense-date">Date</label>
          <input
            id="expense-date"
            name="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="expense-category">Category</label>
          <select
            id="expense-category"
            name="category"
            data-testid="expense-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="expense-payer">Paid by</label>
          <select
            id="expense-payer"
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
      </div>

      <fieldset>
        <legend>Participants</legend>
        {members.map((m) => (
          <label key={m.id} className="check">
            <input
              type="checkbox"
              name="participant_ids"
              value={m.id}
              checked={participantIds.includes(m.id)}
              onChange={() => toggleParticipant(m.id)}
            />{" "}
            {m.name}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Split</legend>
        <label className="check">
          <input
            type="radio"
            name="split_method"
            value="equal"
            checked={splitMethod === "equal"}
            onChange={() => setSplitMethod("equal")}
          />{" "}
          Equally
        </label>
        <label className="check">
          <input
            type="radio"
            name="split_method"
            value="exact"
            checked={splitMethod === "exact"}
            onChange={() => setSplitMethod("exact")}
          />{" "}
          Exact amounts
        </label>
      </fieldset>

      {splitMethod === "exact" && (
        <fieldset>
          <legend>Exact amounts (AED)</legend>
          {participantIds.map((uid) => {
            const member = members.find((m) => m.id === uid);
            return (
              <div key={uid} className="field-inline">
                <label htmlFor={`split-${uid}`}>{member ? member.name : `User ${uid}`}</label>
                <input
                  id={`split-${uid}`}
                  name={`split_${uid}`}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={exactAmounts[uid] || ""}
                  onChange={(e) =>
                    setExactAmounts((cur) => ({ ...cur, [uid]: e.target.value }))
                  }
                />
              </div>
            );
          })}
          <p className={`assign-indicator ${leftoverFils === 0 ? "pos" : "neg"}`}>
            {`${formatFils(leftoverFils)} left to assign`}
          </p>
        </fieldset>
      )}

      {errors.length > 0 && (
        <div className="error" role="alert">
          {errors.map((msg) => (
            <p key={msg}>{msg}</p>
          ))}
        </div>
      )}

      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Save expense
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
