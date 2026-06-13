import Avatar from "./Avatar.jsx";
import { formatTimestamp } from "../lib/format.js";

// Newest-first feed straight from the API. Each entry's summary string is
// server-built — we render it verbatim, never rebuild it client-side. The
// actor's avatar makes the hairline-ruled timeline scannable.
export default function ActivitySection({ activity }) {
  return (
    <section className="card">
      <h2>Activity</h2>
      {activity.length === 0 ? (
        <p className="empty">No activity yet.</p>
      ) : (
        <ul className="rows">
          {activity.map((entry) => (
            <li
              key={`${entry.type}-${entry.expense_id || entry.settlement_id}-${entry.timestamp}`}
              className="row"
            >
              <span className="line-label">
                <Avatar user={entry.actor} size={26} />
                <span>{entry.summary}</span>
              </span>
              <span className="muted">{formatTimestamp(entry.timestamp)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
