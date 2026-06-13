import Money from "./Money.jsx";

// Per-category spend breakdown, computed client-side from the fetched
// expenses (integer fils summed per category, largest first). The category
// totals always sum to the group's total spend because they partition the
// same expense list.
export default function CategoryBreakdown({ expenses }) {
  if (expenses.length === 0) return null;

  const totals = new Map();
  let totalFils = 0;
  for (const exp of expenses) {
    const cat = exp.category || "general";
    totals.set(cat, (totals.get(cat) || 0) + exp.amount_fils);
    totalFils += exp.amount_fils;
  }
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const maxFils = rows[0][1];

  return (
    <section className="card" data-testid="category-breakdown">
      <div className="section-head">
        <h2>Spending by category</h2>
        <span className="muted">
          total <Money fils={totalFils} />
        </span>
      </div>
      <ul className="bars">
        {rows.map(([cat, fils]) => (
          <li key={cat} className="bar-row">
            <span className="bar-label">{cat}</span>
            <span className="bar-track" aria-hidden="true">
              <span
                className="bar-fill"
                style={{ width: `${Math.max(2, Math.round((fils / maxFils) * 100))}%` }}
              />
            </span>
            <Money fils={fils} className="bar-amount" />
          </li>
        ))}
      </ul>
    </section>
  );
}
