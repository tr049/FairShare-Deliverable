// Deterministic colored-initials avatar: the color comes from the user id
// (same user, same color, everywhere), the initials from the display name.
// Pure client-side — no uploads, no schema. All palette colors are dark
// enough for paper-colored initials to pass WCAG AA.

const PALETTE = [
  "#0e3b2e", // deep green
  "#1a5c42", // green
  "#c77b21", // amber
  "#7c5832", // umber
  "#3e5e7e", // slate blue
  "#6b4e71", // plum
  "#a93b26", // brick
  "#1a6b3c", // leaf
];

function initialsOf(name) {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export default function Avatar({ user, size = 26 }) {
  const id = user && Number.isInteger(user.id) ? user.id : 0;
  const color = PALETTE[Math.abs(id) % PALETTE.length];
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{
        background: color,
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {initialsOf(user && user.name)}
    </span>
  );
}
