import { Hono } from 'hono';
import type { Env } from '../types.js';

const landing = new Hono<{ Bindings: Env }>();

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>vanish — temporary URLs from your terminal</title>
<meta name="description" content="Publish a folder, share a file, hand someone a real *.vanish.sh link in 300ms. Built for agents, ships free, dies on schedule." />

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />

<style>
:root {
  --bg: oklch(0.165 0.008 75);
  --bg-elev: oklch(0.205 0.01 75);
  --bg-card: oklch(0.225 0.012 75);
  --bg-soft: oklch(0.255 0.014 75);
  --line: oklch(0.32 0.01 75);
  --line-soft: oklch(0.27 0.01 75);
  --fg: oklch(0.965 0.008 80);
  --fg-mute: oklch(0.78 0.012 80);
  --fg-dim: oklch(0.58 0.012 80);
  --accent: #d4a850;
  --accent-soft: color-mix(in oklab, var(--accent) 18%, var(--bg));
  --accent-line: color-mix(in oklab, var(--accent) 35%, var(--line));
  --success: #6cc28a;
  --danger: #e57373;
  --pad-x: clamp(20px, 5vw, 80px);
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--fg);
  font-family: 'Geist', system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  font-feature-settings: 'ss01', 'ss02', 'cv11';
  letter-spacing: -0.005em;
  overflow-x: hidden;
}

.mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-feature-settings: 'liga' 0; }
.serif { font-family: 'Instrument Serif', serif; font-style: italic; }

a { color: inherit; text-decoration: none; }
button { font-family: inherit; cursor: pointer; }

.shell {
  max-width: 1240px;
  margin: 0 auto;
  padding: 0 var(--pad-x);
}

/* NAV */
.nav {
  position: sticky; top: 0; z-index: 50;
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  background: color-mix(in oklab, var(--bg) 78%, transparent);
  border-bottom: 1px solid color-mix(in oklab, var(--line) 50%, transparent);
}
.nav-inner { display: flex; align-items: center; justify-content: space-between; height: 60px; gap: 32px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 16px; letter-spacing: -0.01em; }
.brand-mark {
  width: 22px; height: 22px;
  display: grid; place-items: center;
  border-radius: 6px;
  background: var(--accent);
  color: oklch(0.18 0.02 70);
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700; font-size: 13px;
}
.brand-domain { color: var(--fg-mute); font-weight: 400; }
.nav-links { display: flex; gap: 28px; font-size: 14px; color: var(--fg-mute); }
.nav-links a:hover { color: var(--fg); }
.nav-cta { display: flex; gap: 10px; align-items: center; }
@media (max-width: 720px) { .nav-links { display: none; } }

/* BUTTONS */
.btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 16px; border-radius: 8px;
  font-size: 14px; font-weight: 500; letter-spacing: -0.005em;
  border: 1px solid transparent; transition: all 0.15s ease;
  white-space: nowrap;
}
.btn-primary { background: var(--fg); color: var(--bg); }
.btn-primary:hover { background: oklch(0.92 0.02 80); }
.btn-ghost { color: var(--fg-mute); border-color: var(--line); }
.btn-ghost:hover { color: var(--fg); border-color: var(--line); background: var(--bg-elev); }
.btn-accent { background: var(--accent); color: oklch(0.18 0.02 70); }
.btn-accent:hover { filter: brightness(1.08); }
.btn-sm { padding: 6px 12px; font-size: 13px; }
.btn-lg { padding: 12px 20px; font-size: 15px; }

/* HERO */
.hero { position: relative; padding: clamp(56px, 9vw, 110px) 0 clamp(60px, 8vw, 100px); overflow: hidden; }
.hero::before {
  content: ''; position: absolute; inset: 0;
  background:
    radial-gradient(60% 60% at 78% 22%, color-mix(in oklab, var(--accent) 10%, transparent) 0%, transparent 70%),
    radial-gradient(40% 50% at 8% 90%, color-mix(in oklab, var(--accent) 6%, transparent) 0%, transparent 70%);
  pointer-events: none;
}
.hero-grid { display: grid; grid-template-columns: 1.05fr 1fr; gap: 64px; align-items: center; position: relative; }
@media (max-width: 960px) { .hero-grid { grid-template-columns: 1fr; gap: 48px; } }

.eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 5px 11px 5px 8px;
  border: 1px solid var(--line); border-radius: 999px;
  font-size: 12px; color: var(--fg-mute);
  background: var(--bg-elev); margin-bottom: 22px;
}
.eyebrow .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); box-shadow: 0 0 0 3px color-mix(in oklab, var(--success) 25%, transparent); }
.eyebrow strong { color: var(--fg); font-weight: 500; }

.hero h1 {
  font-size: clamp(40px, 5.6vw, 72px);
  line-height: 1.02; letter-spacing: -0.035em;
  font-weight: 500; margin: 0 0 22px;
}
.hero h1 .strike {
  color: var(--fg-dim);
  text-decoration: line-through;
  text-decoration-thickness: 2px;
  text-decoration-color: color-mix(in oklab, var(--accent) 70%, transparent);
}
.hero h1 em { font-style: normal; color: var(--accent); }
.hero h1 .serif { font-family: 'Instrument Serif', serif; font-style: italic; font-weight: 400; color: var(--accent); }

.hero-sub { font-size: clamp(16px, 1.6vw, 18px); color: var(--fg-mute); max-width: 520px; line-height: 1.55; margin: 0 0 32px; }
.hero-cta { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.hero-meta { margin-top: 26px; display: flex; align-items: center; gap: 18px; flex-wrap: wrap; color: var(--fg-dim); font-size: 13px; }
.hero-meta .pill { display: inline-flex; align-items: center; gap: 6px; }
.hero-meta svg { width: 14px; height: 14px; opacity: 0.85; }

/* TERMINAL */
.term {
  background: oklch(0.13 0.008 75);
  border: 1px solid var(--line);
  border-radius: 14px; overflow: hidden;
  box-shadow:
    0 1px 0 0 color-mix(in oklab, white 4%, transparent) inset,
    0 30px 60px -20px rgba(0,0,0,0.6),
    0 0 0 1px color-mix(in oklab, var(--accent) 8%, transparent);
  position: relative;
}
.term-bar {
  display: flex; align-items: center; height: 38px; padding: 0 14px;
  border-bottom: 1px solid var(--line-soft); gap: 8px;
  background: color-mix(in oklab, var(--bg-elev) 90%, var(--accent) 2%);
}
.term-dots { display: flex; gap: 6px; }
.term-dots span { width: 11px; height: 11px; border-radius: 50%; background: oklch(0.32 0.01 75); }
.term-dots span:nth-child(1) { background: #ed6a5e; }
.term-dots span:nth-child(2) { background: #f5bd4f; }
.term-dots span:nth-child(3) { background: #61c554; }
.term-title { flex: 1; text-align: center; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--fg-dim); letter-spacing: 0.02em; }
.term-replay {
  background: transparent; border: 1px solid var(--line); color: var(--fg-mute);
  border-radius: 6px; padding: 4px 10px; font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  display: inline-flex; align-items: center; gap: 6px;
}
.term-replay:hover { color: var(--fg); border-color: var(--accent-line); }

.term-body {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13.5px; line-height: 1.6;
  padding: 22px 22px 26px; min-height: 360px;
  color: var(--fg); white-space: pre-wrap; word-break: break-all;
}
.term-line { display: block; }
.term-prompt { color: var(--accent); user-select: none; }
.term-arg { color: var(--fg-mute); }
.term-ok { color: var(--success); }
.term-flag { color: oklch(0.78 0.07 240); }
.term-url { color: var(--accent); text-decoration: underline; text-decoration-color: color-mix(in oklab, var(--accent) 50%, transparent); text-underline-offset: 3px; }
.term-dim { color: var(--fg-dim); }
.cursor {
  display: inline-block; width: 9px; height: 16px;
  background: var(--accent); vertical-align: -3px;
  animation: blink 1s steps(2, start) infinite; margin-left: 1px;
}
@keyframes blink { to { background: transparent; } }

/* SECTION */
.section { padding: clamp(70px, 10vw, 130px) 0; border-top: 1px solid var(--line-soft); position: relative; }
.section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 40px; margin-bottom: 56px; flex-wrap: wrap; }
.section-head h2 {
  font-size: clamp(30px, 4vw, 46px); line-height: 1.05;
  letter-spacing: -0.025em; font-weight: 500;
  margin: 12px 0 0; max-width: 720px;
}
.section-head .kicker {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em;
  color: var(--accent); display: inline-flex; align-items: center; gap: 8px;
}
.section-head .kicker::before { content: ''; width: 18px; height: 1px; background: currentColor; opacity: 0.6; }
.section-head p { color: var(--fg-mute); max-width: 380px; font-size: 15px; line-height: 1.6; margin: 0; }

/* INSTALL */
.install-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
@media (max-width: 880px) { .install-grid { grid-template-columns: 1fr; } }
.step {
  border: 1px solid var(--line); border-radius: 14px;
  padding: 28px;
  background: linear-gradient(180deg, var(--bg-card), var(--bg-elev));
  display: flex; flex-direction: column; gap: 18px;
  position: relative; overflow: hidden;
}
.step .num {
  position: absolute; top: 22px; right: 22px;
  font-family: 'Instrument Serif', serif; font-style: italic;
  font-size: 56px;
  color: color-mix(in oklab, var(--accent) 35%, var(--line));
  line-height: 1; letter-spacing: -0.04em;
}
.step h3 { font-size: 17px; margin: 0; font-weight: 500; letter-spacing: -0.01em; }
.step p { color: var(--fg-mute); font-size: 13.5px; margin: 0; }
.code-block {
  background: oklch(0.13 0.008 75);
  border: 1px solid var(--line-soft);
  border-radius: 8px; padding: 12px 14px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12.5px; color: var(--fg);
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.code-block .cmd { overflow-x: auto; white-space: nowrap; flex: 1; }
.code-block .cmd::before { content: '$ '; color: var(--accent); }
.copy-btn {
  background: transparent; border: 1px solid var(--line);
  border-radius: 5px; padding: 3px 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; color: var(--fg-mute);
}
.copy-btn:hover { color: var(--fg); border-color: var(--accent-line); }
.copy-btn.copied { color: var(--success); border-color: var(--success); }

/* FEATURES */
.features {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 1px; background: var(--line-soft);
  border: 1px solid var(--line-soft);
  border-radius: 16px; overflow: hidden;
}
@media (max-width: 880px) { .features { grid-template-columns: 1fr; } }
.feature {
  background: var(--bg); padding: 36px 32px;
  display: flex; flex-direction: column; gap: 16px;
  min-height: 260px; position: relative;
}
.feature .ico {
  width: 36px; height: 36px; border-radius: 9px;
  border: 1px solid var(--line); background: var(--bg-elev);
  display: grid; place-items: center; color: var(--accent);
}
.feature h3 { font-size: 17px; margin: 0; font-weight: 500; letter-spacing: -0.01em; }
.feature p { color: var(--fg-mute); font-size: 14px; margin: 0; line-height: 1.6; }
.feature .micro {
  margin-top: auto; font-family: 'JetBrains Mono', monospace;
  font-size: 11.5px; color: var(--fg-dim);
  border-top: 1px dashed var(--line-soft); padding-top: 14px;
}
.feature .micro b { color: var(--accent); font-weight: 500; }
.feature .inline-mono { font-family: 'JetBrains Mono', monospace; color: var(--fg); }

/* USE CASES */
.tabs {
  display: flex; gap: 4px; padding: 4px;
  background: var(--bg-elev); border: 1px solid var(--line);
  border-radius: 10px; width: fit-content; margin-bottom: 28px;
}
.tab {
  border: none; background: transparent;
  color: var(--fg-mute); padding: 8px 14px;
  border-radius: 7px; font-size: 13px;
  font-family: 'JetBrains Mono', monospace;
  display: inline-flex; align-items: center; gap: 8px;
}
.tab .ico-glyph { font-size: 14px; opacity: 0.7; }
.tab.active { background: var(--bg); color: var(--fg); box-shadow: 0 1px 2px rgba(0,0,0,0.3); }
.tab:hover:not(.active) { color: var(--fg); }

.usecase {
  display: grid; grid-template-columns: 1fr 1.15fr; gap: 0;
  border: 1px solid var(--line); border-radius: 16px;
  background: var(--bg-card); overflow: hidden; min-height: 460px;
}
@media (max-width: 880px) { .usecase { grid-template-columns: 1fr; } }
.usecase[hidden] { display: none; }
.usecase-text { padding: 40px; display: flex; flex-direction: column; gap: 18px; justify-content: center; }
.usecase-text h3 { font-size: 26px; font-weight: 500; letter-spacing: -0.02em; margin: 0; }
.usecase-text p { color: var(--fg-mute); margin: 0; line-height: 1.65; font-size: 14.5px; }
.usecase-list { list-style: none; padding: 0; margin: 6px 0 0; display: flex; flex-direction: column; gap: 10px; }
.usecase-list li { display: flex; align-items: flex-start; gap: 10px; font-size: 13.5px; color: var(--fg-mute); }
.usecase-list li::before { content: '✓'; color: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: 12px; margin-top: 2px; }
.usecase-demo {
  background: oklch(0.13 0.008 75);
  border-left: 1px solid var(--line);
  padding: 24px 28px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px; line-height: 1.7;
  display: flex; flex-direction: column;
}
.usecase-demo pre { margin: 0; color: var(--fg); white-space: pre-wrap; word-break: break-word; font-family: inherit; font-size: inherit; line-height: inherit; }
@media (max-width: 880px) { .usecase-demo { border-left: none; border-top: 1px solid var(--line); } }

/* PRICING */
.pricing { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
@media (max-width: 880px) { .pricing { grid-template-columns: 1fr; } }
.tier {
  border: 1px solid var(--line); border-radius: 14px;
  padding: 32px 28px 28px;
  background: var(--bg-card);
  display: flex; flex-direction: column; gap: 20px;
  position: relative;
}
.tier.featured {
  background: linear-gradient(180deg, color-mix(in oklab, var(--accent) 8%, var(--bg-card)) 0%, var(--bg-card) 60%);
  border-color: color-mix(in oklab, var(--accent) 50%, var(--line));
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--accent) 25%, transparent),
              0 30px 60px -30px color-mix(in oklab, var(--accent) 30%, transparent);
}
.tier .tier-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px; text-transform: uppercase;
  letter-spacing: 0.15em; color: var(--fg-mute);
}
.tier.featured .tier-name { color: var(--accent); }
.tier .tier-price { display: flex; align-items: baseline; gap: 6px; }
.tier .tier-price .amt { font-size: 38px; letter-spacing: -0.025em; font-weight: 500; }
.tier .tier-price .per { color: var(--fg-dim); font-size: 14px; }
.tier .tier-blurb { color: var(--fg-mute); font-size: 14px; margin: 0; line-height: 1.55; }
.tier .tier-cta { width: 100%; justify-content: center; }
.tier ul {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 9px;
  border-top: 1px solid var(--line-soft); padding-top: 20px;
}
.tier ul li { font-size: 13.5px; color: var(--fg-mute); display: flex; align-items: flex-start; gap: 10px; }
.tier ul li svg { width: 14px; height: 14px; color: var(--accent); flex-shrink: 0; margin-top: 3px; }
.tier ul li b { color: var(--fg); font-weight: 500; }
.badge-pop {
  position: absolute; top: -10px; right: 22px;
  background: var(--accent); color: oklch(0.18 0.02 70);
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; letter-spacing: 0.1em;
  padding: 4px 9px; border-radius: 999px;
  text-transform: uppercase; font-weight: 600;
}

/* COMMANDS REFERENCE */
.cmds { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
@media (max-width: 720px) { .cmds { grid-template-columns: 1fr; } }
.cmd-row {
  display: grid; grid-template-columns: minmax(220px, 320px) 1fr;
  gap: 24px; padding: 16px 18px;
  border: 1px solid var(--line-soft);
  border-radius: 10px; background: var(--bg-elev);
  font-size: 13px; align-items: center;
}
.cmd-row:hover { border-color: var(--accent-line); }
.cmd-row .c {
  font-family: 'JetBrains Mono', monospace;
  color: var(--fg); font-size: 12.5px;
  white-space: nowrap; overflow-x: auto;
}
.cmd-row .c::before { content: '$ '; color: var(--accent); }
.cmd-row .d { color: var(--fg-mute); font-size: 13px; }

/* AGENT CALLOUT */
.callout {
  border: 1px solid var(--line); border-radius: 16px;
  background:
    radial-gradient(80% 80% at 100% 0%, color-mix(in oklab, var(--accent) 12%, transparent), transparent 60%),
    var(--bg-card);
  padding: 56px;
  display: grid; grid-template-columns: 1.1fr 1fr; gap: 40px;
  align-items: center; position: relative; overflow: hidden;
}
@media (max-width: 880px) { .callout { grid-template-columns: 1fr; padding: 36px; } }
.callout h2 { font-size: clamp(28px, 3.4vw, 40px); margin: 0 0 16px; letter-spacing: -0.025em; line-height: 1.1; font-weight: 500; }
.callout h2 .serif { font-family: 'Instrument Serif', serif; font-style: italic; font-weight: 400; color: var(--accent); }
.callout p { color: var(--fg-mute); margin: 0 0 24px; max-width: 460px; line-height: 1.6; }
.skill-card {
  background: oklch(0.13 0.008 75);
  border: 1px solid var(--line);
  border-radius: 12px; padding: 18px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12.5px; line-height: 1.7; color: var(--fg);
  white-space: pre-wrap;
}
.skill-card .skill-head {
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px dashed var(--line-soft);
  padding-bottom: 10px; margin-bottom: 12px;
}
.skill-card .skill-head .name { color: var(--accent); }
.skill-card .skill-head .tag {
  font-size: 10px; padding: 2px 6px;
  border: 1px solid var(--line); border-radius: 4px;
  color: var(--fg-mute);
}
.skill-card .label { color: var(--accent); }
.skill-card .ok { color: var(--success); }

/* H2 serif accent */
h2 .serif { font-family: 'Instrument Serif', serif; font-style: italic; font-weight: 400; }

/* FOOTER */
.footer {
  padding: 70px 0 36px;
  border-top: 1px solid var(--line-soft);
  color: var(--fg-mute); font-size: 13px;
}
.footer-grid {
  display: grid; grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 40px; margin-bottom: 50px;
}
@media (max-width: 720px) { .footer-grid { grid-template-columns: 1fr 1fr; } }
.footer-grid h4 {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--fg-dim);
  margin: 0 0 14px; font-weight: 500;
}
.footer-grid ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.footer-grid a:hover { color: var(--fg); }
.footer-bottom {
  display: flex; justify-content: space-between; gap: 16px;
  padding-top: 24px; border-top: 1px solid var(--line-soft);
  font-family: 'JetBrains Mono', monospace; font-size: 11.5px;
  color: var(--fg-dim); flex-wrap: wrap;
}
.footer-bottom .ascii { font-size: 11px; color: color-mix(in oklab, var(--accent) 60%, var(--fg-dim)); }
.footer-blurb { max-width: 340px; margin: 0; color: var(--fg-mute); font-size: 13.5px; line-height: 1.65; }
</style>
</head>
<body>

<!-- NAV -->
<nav class="nav">
  <div class="shell nav-inner">
    <a href="/" class="brand">
      <span class="brand-mark">v</span>
      <span>vanish<span class="brand-domain">.sh</span></span>
    </a>
    <div class="nav-links">
      <a href="#install">Install</a>
      <a href="#features">Why</a>
      <a href="#usecases">Use cases</a>
      <a href="#pricing">Pricing</a>
      <a href="#commands">CLI</a>
    </div>
    <div class="nav-cta">
      <a class="btn btn-ghost btn-sm" href="https://github.com/The-Vibe-Company/vanish" rel="noopener">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2.01-3.2.69-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.27-5.24-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.17.92-.26 1.9-.39 2.88-.39s1.96.13 2.88.39c2.2-1.48 3.16-1.17 3.16-1.17.62 1.58.23 2.75.11 3.04.74.8 1.18 1.82 1.18 3.07 0 4.4-2.69 5.37-5.25 5.65.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.67.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z"/></svg>
        1.4k
      </a>
      <a class="btn btn-primary btn-sm" href="/auth/github?redirect=/dashboard">
        Get started
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      </a>
    </div>
  </div>
</nav>

<!-- HERO -->
<section class="hero">
  <div class="shell hero-grid">
    <div>
      <div class="eyebrow">
        <span class="dot"></span>
        <span><strong>v1.4</strong> — now with mini-sites + agent skills</span>
      </div>
      <h1>
        Temporary URLs<br/>
        <span class="strike">from your CI</span> <em><span class="serif">from your terminal.</span></em>
      </h1>
      <p class="hero-sub">
        Publish a folder, share a file, hand someone a real <span class="mono" style="color:var(--fg);">*.vanish.sh</span> link — in 300ms,
        from one command. Built for agents, ships free, dies on schedule.
      </p>
      <div class="hero-cta">
        <button class="btn btn-accent btn-lg" data-copy="npm install -g vanish-cli" data-copy-label-default="npm install -g vanish-cli">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
          <span class="copy-label">npm install -g vanish-cli</span>
        </button>
        <a class="btn btn-ghost btn-lg" href="https://github.com/The-Vibe-Company/vanish" rel="noopener">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2.01-3.2.69-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.27-5.24-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.17.92-.26 1.9-.39 2.88-.39s1.96.13 2.88.39c2.2-1.48 3.16-1.17 3.16-1.17.62 1.58.23 2.75.11 3.04.74.8 1.18 1.82 1.18 3.07 0 4.4-2.69 5.37-5.25 5.65.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.67.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z"/></svg>
          View on GitHub
        </a>
      </div>
      <div class="hero-meta">
        <span class="pill">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          ~300ms publish
        </span>
        <span class="pill">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          MIT · Self-hostable
        </span>
        <span class="pill">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>
          Cloudflare-backed
        </span>
      </div>
    </div>

    <div class="term" id="term">
      <div class="term-bar">
        <div class="term-dots"><span></span><span></span><span></span></div>
        <div class="term-title">~/projects/demo — vanish-cli</div>
        <button class="term-replay" id="termReplay" type="button" aria-label="Replay terminal animation" title="Replay">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
          replay
        </button>
      </div>
      <div class="term-body" id="termBody"></div>
    </div>
  </div>
</section>

<!-- INSTALL -->
<section class="section" id="install">
  <div class="shell">
    <div class="section-head">
      <div>
        <span class="kicker">01 — Install</span>
        <h2>Three commands. <span class="serif">No deploy step.</span></h2>
      </div>
      <p>Vanish ships as a single binary on npm. No config, no project files, no platform lock-in. Login is optional — anonymous publishing works out of the box.</p>
    </div>
    <div class="install-grid">
      <div class="step">
        <span class="num">i</span>
        <h3>Install the CLI</h3>
        <p>One global package. Works on macOS, Linux and Windows. Or skip install and use <span class="mono" style="color:var(--accent);">npx</span>.</p>
        <div class="code-block">
          <span class="cmd mono">npm install -g vanish-cli</span>
          <button class="copy-btn" data-copy="npm install -g vanish-cli">copy</button>
        </div>
      </div>
      <div class="step">
        <span class="num">ii</span>
        <h3>Login (optional)</h3>
        <p>GitHub OAuth. Unlocks 48h retention, file uploads up to 50MB, and your own dashboard.</p>
        <div class="code-block">
          <span class="cmd mono">vanish login</span>
          <button class="copy-btn" data-copy="vanish login">copy</button>
        </div>
      </div>
      <div class="step">
        <span class="num">iii</span>
        <h3>Publish</h3>
        <p>Point at a folder, name the root file. You'll get a real, public URL that just works.</p>
        <div class="code-block">
          <span class="cmd mono">vanish site ./demo --root index.html</span>
          <button class="copy-btn" data-copy="vanish site ./demo --root index.html">copy</button>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- FEATURES -->
<section class="section" id="features">
  <div class="shell">
    <div class="section-head">
      <div>
        <span class="kicker">02 — Why Vanish</span>
        <h2>Hand someone a URL.<br/><span class="serif">Without deploying anything.</span></h2>
      </div>
      <p>Vanish exists for the awkward middle ground between "paste in chat" and "spin up Vercel." A folder, a command, a link that dies on schedule.</p>
    </div>
    <div class="features">
      <div class="feature">
        <div class="ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg></div>
        <h3>Truly ephemeral</h3>
        <p>URLs expire automatically — 24h anonymous, 48h on Free, up to 365 days on Pro. No CMS to clean up. No bills creeping in for forgotten projects.</p>
        <div class="micro"><b>Default TTL:</b> 24h · <b>Pro max:</b> 365d</div>
      </div>
      <div class="feature">
        <div class="ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg></div>
        <h3>CLI-native</h3>
        <p>Built for the terminal first. JSON output, markdown output, clipboard auto-copy. Pipe it, script it, ship it.</p>
        <div class="micro"><b>Outputs:</b> --json · --md · --no-clipboard</div>
      </div>
      <div class="feature">
        <div class="ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/></svg></div>
        <h3>Real subdomains</h3>
        <p>Every site lives at <span class="inline-mono">*.vanish.sh</span> — readable random slugs by default, custom slugs on Pro.</p>
        <div class="micro"><b>e.g.</b> quiet-river-42.vanish.sh</div>
      </div>
      <div class="feature">
        <div class="ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8L12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5"/><line x1="12" y1="13" x2="12" y2="22"/></svg></div>
        <h3>Static, untouched</h3>
        <p>HTML stays HTML. Markdown stays Markdown. CSS, JS, images, fonts — served as-is, no bundler, no transform, no surprises.</p>
        <div class="micro"><b>Limits:</b> up to 1,000 files · 1 GB</div>
      </div>
      <div class="feature">
        <div class="ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg></div>
        <h3>Agent-ready</h3>
        <p>Designed for Claude Code, Codex, and other agent loops. One command turns a generated folder into a reviewable URL.</p>
        <div class="micro"><b>Skills:</b> publish-site · upload-files</div>
      </div>
      <div class="feature">
        <div class="ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
        <h3>Self-hostable</h3>
        <p>Open source, MIT. Runs on Cloudflare Workers + R2 + D1. Set <span class="inline-mono">SELF_HOSTED=true</span> and you own the stack.</p>
        <div class="micro"><b>Stack:</b> Hono + R2 + D1 + Cron</div>
      </div>
    </div>
  </div>
</section>

<!-- USE CASES -->
<section class="section" id="usecases">
  <div class="shell">
    <div class="section-head">
      <div>
        <span class="kicker">03 — Use cases</span>
        <h2>Pick the shape of <span class="serif">your share.</span></h2>
      </div>
      <p>Same CLI, three modes. Switch with a flag.</p>
    </div>
    <div class="tabs" role="tablist" aria-label="Use cases">
      <button class="tab active" role="tab" id="tab-site" data-tab="site" aria-selected="true" aria-controls="panel-site"><span class="ico-glyph" aria-hidden="true">⌘</span>Mini-site</button>
      <button class="tab" role="tab" id="tab-file" data-tab="file" aria-selected="false" aria-controls="panel-file" tabindex="-1"><span class="ico-glyph" aria-hidden="true">↗</span>Single file</button>
      <button class="tab" role="tab" id="tab-agent" data-tab="agent" aria-selected="false" aria-controls="panel-agent" tabindex="-1"><span class="ico-glyph" aria-hidden="true">⚡</span>Agent loop</button>
    </div>

    <div class="usecase" id="panel-site" role="tabpanel" aria-labelledby="tab-site" data-uc="site">
      <div class="usecase-text">
        <h3>Publish a folder as a real website</h3>
        <p>Point at any directory with HTML, Markdown, CSS, JS or assets. Vanish packs it, uploads it, gives you a subdomain. The root file you nominate is what loads at /.</p>
        <ul class="usecase-list">
          <li>HTML, CSS, JS and Markdown served as-is — no bundler, no transform</li>
          <li>Up to 1,000 files per site, 1GB total on Pro</li>
          <li>Update an existing site without changing the URL</li>
          <li>Pro: custom slugs and retention up to 365 days</li>
        </ul>
      </div>
      <div class="usecase-demo">
<pre><span class="term-prompt">$ </span><span style="color:var(--fg);">vanish</span><span class="term-arg"> site ./pitch-deck</span>
<span class="term-arg">     </span><span class="term-flag">--root</span><span class="term-arg"> index.html</span> <span class="term-flag">--slug</span><span class="term-arg"> q1-board</span>

<span class="term-dim">↻ packing 47 files (3.2 MB)</span>
<span class="term-dim">↑ uploading to vanish.sh</span>
<span class="term-ok">✓ published in 612ms</span>

<span class="term-dim">  → </span><span class="term-url">https://q1-board.vanish.sh/</span>
<span class="term-dim">  expires in 30d · 47 files · 3.2 MB</span>
<span class="term-dim">  📋 copied to clipboard</span></pre>
      </div>
    </div>

    <div class="usecase" id="panel-file" role="tabpanel" aria-labelledby="tab-file" data-uc="file" hidden>
      <div class="usecase-text">
        <h3>Drop a file. Get a link.</h3>
        <p>Screenshots, PDFs, reports, archives. Anonymous works for images. Logged-in lets you upload almost anything except executables. Markdown output, JSON output, auto-clipboard.</p>
        <ul class="usecase-list">
          <li>Anonymous: images up to 5MB</li>
          <li>Free: any file (except binaries) up to 50MB · Pro: 1GB</li>
          <li>--md flag returns a Markdown link, ready to paste</li>
          <li>List, delete, expire — full CRUD from the CLI</li>
        </ul>
      </div>
      <div class="usecase-demo">
<pre><span class="term-prompt">$ </span><span style="color:var(--fg);">vanish</span><span class="term-arg"> upload screenshot.png </span><span class="term-flag">--md</span>

<span class="term-ok">✓ uploaded · 1.4 MB · 240ms</span>

<span class="term-dim">  </span><span class="term-arg">![screenshot.png](</span><span class="term-url">https://vanish.sh/f/a1b2c3d4.png</span><span class="term-arg">)</span>

<span class="term-prompt">$ </span><span style="color:var(--fg);">vanish</span><span class="term-arg"> ls</span>
<span class="term-dim">  ID         FILE              SIZE   EXPIRES</span>
<span class="term-arg">  a1b2c3d4   screenshot.png    1.4M   in 47h</span>
<span class="term-arg">  e5f6g7h8   report.pdf        2.1M   in 22d</span></pre>
      </div>
    </div>

    <div class="usecase" id="panel-agent" role="tabpanel" aria-labelledby="tab-agent" data-uc="agent" hidden>
      <div class="usecase-text">
        <h3>A target for code-generating agents</h3>
        <p>Claude Code, Codex and friends generate folders all day. Vanish gives them a one-liner to turn that folder into a URL a human can review — in about 300ms.</p>
        <ul class="usecase-list">
          <li>JSON output for structured agent feedback</li>
          <li>Update flag preserves URL across iterations</li>
          <li>Three first-party Claude skills: publish, upload, account</li>
          <li>Rate-limited 50/h Free, 200/h Pro — designed for tight loops</li>
        </ul>
      </div>
      <div class="usecase-demo">
<pre><span class="term-dim"># inside an agent loop</span>
<span class="term-prompt">$ </span><span style="color:var(--fg);">vanish</span><span class="term-arg"> site ./out </span><span class="term-flag">--update</span><span class="term-arg"> demo-v3 </span><span class="term-flag">--json</span>

<span style="color:var(--fg);">{</span>
<span class="term-arg">  "url": "</span><span class="term-url">https://demo-v3.vanish.sh/</span><span class="term-arg">",</span>
<span class="term-arg">  "id": "k8m2q9z4p1ad",</span>
<span class="term-arg">  "rootPath": "index.html",</span>
<span class="term-arg">  "size": 8120,</span>
<span class="term-arg">  "fileCount": 3,</span>
<span class="term-arg">  "expires": "2026-05-12T10:30:00.000Z"</span>
<span style="color:var(--fg);">}</span></pre>
      </div>
    </div>
  </div>
</section>

<!-- AGENT CALLOUT -->
<section class="section" id="agents">
  <div class="shell">
    <div class="callout">
      <div>
        <span class="kicker" style="color:var(--accent);font-family:'JetBrains Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;display:inline-flex;align-items:center;gap:8px;">06 — For agents</span>
        <h2 style="margin-top:12px">Native skills for <span class="serif">Claude Code &amp; Codex.</span></h2>
        <p>Three first-party skills route agent intent to the right command — publish a folder, upload a file, or check quota — without you wiring it.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <a class="btn btn-primary" href="https://github.com/The-Vibe-Company/vanish#skills" rel="noopener">
            Read the skills doc
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </a>
          <a class="btn btn-ghost" href="https://github.com/The-Vibe-Company/vanish" rel="noopener">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2.01-3.2.69-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.27-5.24-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.17.92-.26 1.9-.39 2.88-.39s1.96.13 2.88.39c2.2-1.48 3.16-1.17 3.16-1.17.62 1.58.23 2.75.11 3.04.74.8 1.18 1.82 1.18 3.07 0 4.4-2.69 5.37-5.25 5.65.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.67.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z"/></svg>
            github.com/vanish-sh
          </a>
        </div>
      </div>
      <div class="skill-card">
        <div class="skill-head">
          <span class="name">vanish-publish-site</span>
          <span class="tag">SKILL</span>
        </div><span class="label">routes:</span> static folders, demos,
         HTML/CSS/JS/MD mini-sites
<span class="label">siblings:</span> vanish-upload-files
           vanish-connect-upgrade
<span class="label">privacy:</span> gated · explicit only

<span class="ok">$ vanish site ./out --json</span>
      </div>
    </div>
  </div>
</section>

<!-- PRICING -->
<section class="section" id="pricing">
  <div class="shell">
    <div class="section-head">
      <div>
        <span class="kicker">04 — Pricing</span>
        <h2>Free for most.<br/><span class="serif">Two euros for everything else.</span></h2>
      </div>
      <p>No seats. No tiers within tiers. Pay once a month for slugs, retention and 1GB.</p>
    </div>
    <div class="pricing">
      <div class="tier">
        <div>
          <div class="tier-name">Anonymous</div>
          <div class="tier-price"><span class="amt">$0</span><span class="per">/ no account</span></div>
        </div>
        <p class="tier-blurb">For one-shot shares. No sign-up, no key, just the binary.</p>
        <button class="btn btn-ghost tier-cta" data-copy="npx vanish-cli site ./demo --root index.html">npx vanish-cli</button>
        <ul>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span><b>10 MB</b> per site, 100 files</span></li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>Image uploads only · <b>5 MB</b> max</span></li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span><b>24 h</b> retention</span></li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>10 publishes / hour</span></li>
        </ul>
      </div>
      <div class="tier">
        <div>
          <div class="tier-name">Free</div>
          <div class="tier-price"><span class="amt">$0</span><span class="per">/ GitHub login</span></div>
        </div>
        <p class="tier-blurb">For everyday demos, screenshots and shareables.</p>
        <a class="btn btn-ghost tier-cta" href="/auth/github?redirect=/dashboard">vanish login</a>
        <ul>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>500 files per site · <b>50 MB</b> total storage</span></li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>Any file (except binaries) · <b>50 MB</b> max</span></li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span><b>48 h</b> retention</span></li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>50 publishes / hour</span></li>
        </ul>
      </div>
      <div class="tier featured">
        <div class="badge-pop">Recommended</div>
        <div>
          <div class="tier-name">Pro</div>
          <div class="tier-price"><span class="amt">€2</span><span class="per">/ month</span></div>
        </div>
        <p class="tier-blurb">For agent loops, custom slugs, and links that live longer.</p>
        <a class="btn btn-accent tier-cta" href="/auth/github?redirect=/dashboard">
          vanish upgrade
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </a>
        <ul>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span><b>1,000 files</b> per site · <b>1 GB</b> storage</span></li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>Any file · <b>1 GB</b> max</span></li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>Up to <b>365 days</b> retention with --days</span></li>
          <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span><b>Custom slugs</b> · 200 publishes / hour</span></li>
        </ul>
      </div>
    </div>
  </div>
</section>

<!-- COMMANDS -->
<section class="section" id="commands">
  <div class="shell">
    <div class="section-head">
      <div>
        <span class="kicker">05 — Reference</span>
        <h2>The whole CLI <span class="serif">on one screen.</span></h2>
      </div>
      <p>Ten commands. Predictable flags. JSON output on every one of them.</p>
    </div>
    <div class="cmds">
      <div class="cmd-row"><span class="c">vanish site ./demo --root index.html</span><span class="d">Publish a folder as a mini-site</span></div>
      <div class="cmd-row"><span class="c">vanish site ./demo --update &lt;slug&gt;</span><span class="d">Replace files on an existing site</span></div>
      <div class="cmd-row"><span class="c">vanish upload report.pdf</span><span class="d">Upload a single file, copy URL to clipboard</span></div>
      <div class="cmd-row"><span class="c">vanish upload img.png --md</span><span class="d">Get a markdown-formatted link</span></div>
      <div class="cmd-row"><span class="c">vanish login</span><span class="d">Authenticate with GitHub OAuth</span></div>
      <div class="cmd-row"><span class="c">vanish whoami</span><span class="d">Show current user and tier</span></div>
      <div class="cmd-row"><span class="c">vanish status</span><span class="d">Storage usage, limits, rate-limit window</span></div>
      <div class="cmd-row"><span class="c">vanish ls</span><span class="d">List your file uploads and sites</span></div>
      <div class="cmd-row"><span class="c">vanish rm &lt;id&gt;</span><span class="d">Delete an upload before it expires</span></div>
      <div class="cmd-row"><span class="c">vanish upgrade</span><span class="d">Move to Pro for slugs and longer TTL</span></div>
    </div>
  </div>
</section>

<!-- FOOTER -->
<footer class="footer">
  <div class="shell">
    <div class="footer-grid">
      <div>
        <div class="brand" style="margin-bottom:14px">
          <span class="brand-mark">v</span>
          <span>vanish<span class="brand-domain">.sh</span></span>
        </div>
        <p class="footer-blurb">
          Temporary URLs for the post-deploy era. Built on Cloudflare Workers, R2 and D1. MIT licensed.
        </p>
      </div>
      <div>
        <h4>Product</h4>
        <ul>
          <li><a href="#install">Install</a></li>
          <li><a href="#features">Features</a></li>
          <li><a href="#pricing">Pricing</a></li>
          <li><a href="#commands">CLI reference</a></li>
          <li><a href="/dashboard">Dashboard</a></li>
        </ul>
      </div>
      <div>
        <h4>Developers</h4>
        <ul>
          <li><a href="https://github.com/The-Vibe-Company/vanish" rel="noopener">GitHub</a></li>
          <li><a href="https://www.npmjs.com/package/vanish-cli" rel="noopener">npm package</a></li>
          <li><a href="https://github.com/The-Vibe-Company/vanish#self-hosting" rel="noopener">Self-host guide</a></li>
          <li><a href="https://github.com/The-Vibe-Company/vanish/releases" rel="noopener">Changelog</a></li>
        </ul>
      </div>
      <div>
        <h4>Legal</h4>
        <ul>
          <li><a href="https://github.com/The-Vibe-Company/vanish/blob/main/LICENSE" rel="noopener">License (MIT)</a></li>
          <li><a href="mailto:abuse@vanish.sh?subject=Vanish%20abuse%20report">Report abuse</a></li>
          <li><a href="mailto:hi@vanish.sh">Contact</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© 2026 vanish.sh — MIT licensed</span>
      <span class="ascii">&gt;_ npx vanish-cli site ./demo</span>
    </div>
  </div>
</footer>

<script>
// -- Hero terminal animation --
(function () {
  var SCRIPT = [
    { type: 'cmd', text: 'npm install -g vanish-cli' },
    { type: 'out', text: 'added 12 packages in 1.4s', cls: 'term-dim' },
    { type: 'spacer' },
    { type: 'cmd', text: 'vanish site ./demo --root index.html' },
    { type: 'out', text: '↻ packing 3 files (8.1 KB)', cls: 'term-dim' },
    { type: 'out', text: '↑ uploading to vanish.sh', cls: 'term-dim' },
    { type: 'out', text: '✓ published in 312ms', cls: 'term-ok' },
    { type: 'spacer' },
    { type: 'out', text: '  → https://quiet-river-42.vanish.sh/', cls: 'term-url' },
    { type: 'out', text: '  expires in 24h · 3 files · 8.1 KB', cls: 'term-dim' },
    { type: 'spacer' },
    { type: 'cmd', text: 'vanish upload report.pdf --md' },
    { type: 'out', text: '✓ [report.pdf](https://vanish.sh/f/a1b2c3d4.pdf)', cls: 'term-ok' },
  ];
  var CHAR_DELAY = 18;
  var LINE_DELAY = 280;
  var PAUSE = 320;

  var body = document.getElementById('termBody');
  var term = document.getElementById('term');
  var replay = document.getElementById('termReplay');
  if (!body || !term || !replay) return;

  var paused = false;
  var token = 0;

  term.addEventListener('mouseenter', function () { paused = true; });
  term.addEventListener('mouseleave', function () { paused = false; });

  function wait(ms) {
    return new Promise(function (resolve) {
      var remaining = ms, last = Date.now();
      (function tick() {
        if (paused) { last = Date.now(); setTimeout(tick, 50); return; }
        var now = Date.now();
        remaining -= (now - last); last = now;
        if (remaining <= 0) resolve();
        else setTimeout(tick, Math.min(remaining, 16));
      })();
    });
  }
  function newLine(cls) {
    var span = document.createElement('span');
    span.className = 'term-line' + (cls ? ' ' + cls : '');
    body.appendChild(span);
    return span;
  }
  function colorizeCmd(line, text) {
    var parts = text.split(' ');
    parts.forEach(function (p, i) {
      var s = document.createElement('span');
      if (i === 0) s.style.color = 'var(--fg)';
      else if (p.indexOf('--') === 0) s.className = 'term-flag';
      else s.className = 'term-arg';
      s.textContent = (i === 0 ? '' : ' ') + p;
      line.appendChild(s);
    });
  }
  async function typeCmd(text, my) {
    var line = newLine();
    var p = document.createElement('span'); p.className = 'term-prompt'; p.textContent = '$ '; line.appendChild(p);
    var cursor = document.createElement('span'); cursor.className = 'cursor';
    var typed = '';
    for (var i = 0; i < text.length; i++) {
      if (token !== my) return;
      await wait(CHAR_DELAY + Math.random() * 24);
      typed += text[i];
      // re-render content of line (after prompt)
      while (line.childNodes.length > 1) line.removeChild(line.lastChild);
      colorizeCmd(line, typed);
      line.appendChild(cursor);
      body.scrollTop = body.scrollHeight;
    }
    if (cursor.parentNode) cursor.parentNode.removeChild(cursor);
    await wait(PAUSE);
  }
  async function runOut(text, cls) {
    var line = newLine(cls || '');
    line.textContent = text;
    body.scrollTop = body.scrollHeight;
    await wait(LINE_DELAY);
  }
  async function runSpacer() {
    var line = newLine();
    line.innerHTML = '\\u00A0';
    await wait(60);
  }
  async function run() {
    token++;
    var my = token;
    body.innerHTML = '';
    for (var i = 0; i < SCRIPT.length; i++) {
      if (token !== my) return;
      var item = SCRIPT[i];
      if (item.type === 'cmd') await typeCmd(item.text, my);
      else if (item.type === 'out') await runOut(item.text, item.cls);
      else if (item.type === 'spacer') await runSpacer();
    }
    if (token !== my) return;
    var finalLine = newLine();
    var fp = document.createElement('span'); fp.className = 'term-prompt'; fp.textContent = '$ '; finalLine.appendChild(fp);
    var fc = document.createElement('span'); fc.className = 'cursor'; finalLine.appendChild(fc);
  }

  replay.addEventListener('click', run);
  run();
})();

// -- Use case tabs --
(function () {
  var tabs = document.querySelectorAll('.tab[data-tab]');
  var panes = document.querySelectorAll('.usecase[data-uc]');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var key = tab.getAttribute('data-tab');
      tabs.forEach(function (t) {
        var on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.setAttribute('tabindex', on ? '0' : '-1');
      });
      panes.forEach(function (p) {
        var match = p.getAttribute('data-uc') === key;
        p.hidden = !match;
      });
    });
  });
})();

// -- Copy buttons --
(function () {
  document.querySelectorAll('[data-copy]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      var text = el.getAttribute('data-copy');
      try { if (navigator.clipboard) navigator.clipboard.writeText(text); } catch (_) {}
      // .copy-btn (text-only) and .btn variants
      if (el.classList.contains('copy-btn')) {
        var orig = el.textContent;
        el.classList.add('copied');
        el.textContent = '✓ copied';
        setTimeout(function () {
          el.classList.remove('copied');
          el.textContent = orig;
        }, 1400);
      } else {
        var label = el.querySelector('.copy-label');
        if (label) {
          var prev = label.textContent;
          label.textContent = '✓ copied';
          setTimeout(function () { label.textContent = prev; }, 1400);
        }
      }
    });
  });
})();

// -- Mark decorative icons as aria-hidden --
(function () {
  document.querySelectorAll('svg').forEach(function (svg) {
    if (!svg.hasAttribute('aria-label') && !svg.hasAttribute('aria-hidden')) {
      svg.setAttribute('aria-hidden', 'true');
    }
  });
})();

// -- Smooth scroll for anchor links --
(function () {
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id.length > 1) {
        var target = document.querySelector(id);
        if (target) {
          e.preventDefault();
          var top = target.getBoundingClientRect().top + window.scrollY - 60;
          window.scrollTo({ top: top, behavior: 'smooth' });
        }
      }
    });
  });
})();
</script>

</body>
</html>`;

landing.get('/', (c) => {
  return c.html(html);
});

export default landing;
