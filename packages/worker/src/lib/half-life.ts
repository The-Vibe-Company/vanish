// "Half-life": the paper-and-ink identity shared by the landing page and the dashboard.
// Vermilion (--signal*) is spent only on time and expiry.

export const HALF_LIFE_FAVICON = `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23151310'/%3E%3Cpath d='M9 10l7 13 7-13' fill='none' stroke='%23f3efe7' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='24.5' cy='24.5' r='3' fill='%23ec4a1c'/%3E%3C/svg%3E" />`;

export const HALF_LIFE_FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />`;

/** Paper colour, for theme-color metas and overscroll guards. */
export const HALF_LIFE_PAPER = '#f3efe7';

/** Custom properties to drop inside a `:root { … }` block. */
export const HALF_LIFE_TOKENS = `  --paper: ${HALF_LIFE_PAPER};
  --paper-2: #ebe5da;
  --card: #fbf9f5;
  --ink: #151310;
  --ink-2: #48433b;
  --ink-3: #6b6458;
  --rule: #dcd4c6;
  --rule-2: #cbc1b0;
  --signal: #ec4a1c;
  --signal-ink: #b4360d;
  --signal-soft: #fde3d7;
  --night: #151310;
  --night-2: #1f1c18;
  --night-3: #2d2924;
  --night-text: #efe9de;
  --night-dim: #a59d8f;
  --serif: "Instrument Serif", ui-serif, Georgia, "Times New Roman", serif;
  --sans: "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --arrive: cubic-bezier(.25, .8, .25, 1);
  --travel: cubic-bezier(.45, 0, .1, 1);`;
