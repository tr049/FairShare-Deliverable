import { formatFils } from "../lib/format.js";

// Every on-screen amount renders through this: Fraunces display numerals with
// tabular figures (the .amount class), text exactly `AED 12.34` via formatFils.
export default function Money({ fils, className = "" }) {
  return <span className={className ? `amount ${className}` : "amount"}>{formatFils(fils)}</span>;
}
