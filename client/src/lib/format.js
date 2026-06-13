// Money and date helpers. The API speaks integer fils (100 fils = 1 AED);
// these are the only places the UI converts. All money math stays in integers.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// 123456 -> "AED 1,234.56" (integer math only, no float division)
export function formatFils(fils) {
  const sign = fils < 0 ? "-" : "";
  const abs = Math.abs(fils);
  const whole = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  return `AED ${sign}${whole.toLocaleString("en-US")}.${cents}`;
}

// "1,234.56" -> 123456. Returns null for anything that is not a non-negative
// AED amount with at most two decimals (more precision is rejected).
export function parseAedToFils(input) {
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/,/g, "").trim();
  const match = cleaned.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const whole = parseInt(match[1], 10);
  const cents = match[2] ? parseInt(match[2].padEnd(2, "0"), 10) : 0;
  const fils = whole * 100 + cents;
  return Number.isSafeInteger(fils) ? fils : null;
}

// 10000 -> "100.00" (for pre-filling amount inputs)
export function filsToInput(fils) {
  const sign = fils < 0 ? "-" : "";
  const abs = Math.abs(fils);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

// Local date as "YYYY-MM-DD" (for date input defaults)
export function todayISO() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

// "2026-06-01" -> "1 Jun 2026" (string split, so no timezone drift)
export function formatDate(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${parseInt(day, 10)} ${MONTHS[parseInt(month, 10) - 1]} ${year}`;
}

// ISO timestamp -> "5 Jun 2026, 21:40" in the viewer's local time
export function formatTimestamp(isoTimestamp) {
  const d = new Date(isoTimestamp);
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
