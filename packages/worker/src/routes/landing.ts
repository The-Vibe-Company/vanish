import { Hono } from 'hono';
import type { Env } from '../types.js';

const landing = new Hono<{ Bindings: Env }>();

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>vanish — temporary URLs from your terminal</title>
<meta name="description" content="Give anything your agent creates a temporary public URL. No deployment, no maintenance, no account required." />
<meta name="theme-color" content="#1649e8" />

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%231649e8'/%3E%3Cpath d='M14 16h28c6 0 10 4 10 10v12c0 6-4 10-10 10H14V16Z' fill='%23f4f0e7'/%3E%3Cpath d='M22 24h17c3 0 5 2 5 5v2H22v-7Zm0 12h22v2c0 3-2 5-5 5H22v-7Z' fill='%2311110f'/%3E%3Cpath d='M45 18h5v5h-5zM51 27h4v4h-4zM47 39h3v3h-3z' fill='%23ef432d'/%3E%3C/svg%3E" />

<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

  :root{
    --blue:#1649e8;
    --blue-dark:#0d2d9d;
    --cream:#f4f0e7;
    --paper:#fffdf7;
    --ink:#11110f;
    --red:#ef432d;
    --yellow:#f4c928;
    --muted:#6f6c65;
    --line:rgba(17,17,15,.22);
    --display:'Barlow Condensed',sans-serif;
    --body:'Instrument Sans',sans-serif;
    --mono:'JetBrains Mono',monospace;
    --max:1380px;
  }

  html{scroll-behavior:smooth;background:var(--cream)}
  body{
    min-height:100vh;
    overflow-x:hidden;
    color:var(--ink);
    background:var(--cream);
    font-family:var(--body);
    font-size:16px;
    line-height:1.5;
    -webkit-font-smoothing:antialiased;
    text-rendering:optimizeLegibility;
  }
  body::before{
    content:"";
    position:fixed;
    inset:0;
    pointer-events:none;
    z-index:100;
    opacity:.055;
    background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E");
    mix-blend-mode:multiply;
  }
  ::selection{background:var(--red);color:var(--paper)}
  a{color:inherit;text-decoration:none}
  button{border:0;background:none;color:inherit;font:inherit;cursor:pointer}
  button:focus-visible,a:focus-visible{outline:3px solid currentColor;outline-offset:4px}
  .hero .primary-cta:focus-visible,
  .plan.pro .plan-cta:focus-visible{outline-color:var(--yellow)}
  svg{display:block}
  .shell{width:min(calc(100% - 72px),var(--max));margin-inline:auto}

  .topbar{
    position:absolute;
    inset:0 0 auto;
    z-index:20;
    height:92px;
    color:var(--cream);
  }
  .topbar-inner{height:100%;display:flex;align-items:center;justify-content:space-between;gap:2rem}
  .brand{
    font-family:var(--body);
    font-size:1.75rem;
    font-weight:600;
    letter-spacing:-.07em;
  }
  .brand-dot{color:var(--red)}
  .nav{display:flex;align-items:center;gap:2.1rem;font-size:.9rem;font-weight:500}
  .nav-link{position:relative}
  .nav-link::after{
    content:"";
    position:absolute;
    left:0;right:100%;bottom:-5px;
    height:2px;background:var(--cream);
    transition:right .2s ease;
  }
  .nav-link:hover::after{right:0}
   .nav-signin{
     min-height:44px;
     display:inline-flex;
     align-items:center;
     border:1px solid rgba(244,240,231,.75);
    padding:.7rem 1.15rem;
    border-radius:999px;
    transition:background .2s,color .2s;
  }
  .nav-signin:hover{background:var(--cream);color:var(--blue)}

  .hero{
    position:relative;
    min-height:780px;
    height:100svh;
    max-height:1050px;
    display:flex;
    align-items:center;
    overflow:hidden;
    color:var(--cream);
    background:
      radial-gradient(circle at 18% 35%,rgba(255,255,255,.07),transparent 29%),
      var(--blue);
  }
  .hero::after{
    content:"";
    position:absolute;
    width:440px;height:440px;
    border:1px solid rgba(244,240,231,.15);
    border-radius:50%;
    left:-270px;bottom:-210px;
  }
  .hero-grid{
    position:relative;
    z-index:2;
    width:min(calc(100% - 72px),var(--max));
    margin-inline:auto;
    display:grid;
    grid-template-columns:minmax(0,.88fr) minmax(520px,1.12fr);
    gap:clamp(4rem,8vw,9rem);
    align-items:center;
    padding-top:88px;
  }
  .hero-copy{padding-bottom:2rem}
  .eyebrow{
    display:flex;
    align-items:center;
    gap:.7rem;
    margin-bottom:1.55rem;
    font-size:.72rem;
    font-weight:600;
    letter-spacing:.15em;
    text-transform:uppercase;
  }
  .eyebrow::before{content:"";width:32px;height:3px;background:var(--red)}
  h1{
    max-width:720px;
    font-family:var(--display);
    font-size:clamp(4.8rem,8.5vw,8.7rem);
    font-weight:600;
    line-height:.79;
    letter-spacing:-.055em;
  }
  .hero-lede{
    max-width:470px;
    margin:2rem 0 2.1rem;
    font-size:clamp(1.05rem,1.45vw,1.25rem);
    line-height:1.45;
    color:rgba(244,240,231,.88);
  }
  .hero-actions{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
  .primary-cta{
    min-height:58px;
    display:inline-flex;
    align-items:center;
    justify-content:center;
    gap:1.3rem;
    padding:.9rem 1.3rem .9rem 1.5rem;
    background:var(--cream);
    color:var(--ink);
    border:2px solid var(--cream);
    font-weight:600;
    border-radius:4px;
    box-shadow:7px 7px 0 var(--ink);
    transition:transform .18s ease,box-shadow .18s ease;
  }
  .primary-cta:hover{transform:translate(3px,3px);box-shadow:4px 4px 0 var(--ink)}
  .primary-cta svg{transition:transform .18s}
  .primary-cta:hover svg{transform:translate(3px,-3px)}
  .copy-state{min-width:44px;color:rgba(244,240,231,.9);font-size:.72rem}
  .hero-trust{
    display:flex;
    gap:.75rem;
    align-items:center;
    flex-wrap:wrap;
    margin-top:1.65rem;
    color:rgba(244,240,231,.9);
    font-size:.76rem;
  }
  .hero-trust span+span::before{content:"•";margin-right:.75rem;color:var(--red)}

  .artifact-wrap{position:relative;padding:1rem 0 2rem}
  .artifact{
    position:relative;
    width:min(100%,630px);
    margin-left:auto;
    padding:14px;
    background:var(--ink);
    box-shadow:25px 28px 0 rgba(8,24,91,.42);
    transform:rotate(-1deg);
    transition:transform .4s cubic-bezier(.16,1,.3,1);
  }
  .artifact:hover{transform:rotate(0) translateY(-5px)}
  .artifact-paper{
    min-height:590px;
    display:grid;
    grid-template-rows:1fr auto;
    background:var(--paper);
    color:var(--ink);
  }
  .artifact-preview{padding:clamp(2rem,4vw,3.2rem);display:flex;flex-direction:column}
  .artifact-top{
    display:flex;align-items:center;justify-content:space-between;
    gap:1rem;margin-bottom:2.2rem;
    font-size:.7rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;
  }
  .artifact-top span:first-child{color:var(--blue)}
  .artifact-live{display:flex;align-items:center;gap:.5rem}
  .artifact-live::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--red)}
  .poster{
    flex:1;
    min-height:330px;
    position:relative;
    overflow:hidden;
    display:grid;
    grid-template-columns:1.05fr .95fr;
    background:var(--cream);
    border:1px solid var(--ink);
  }
  .poster-copy{padding:2rem 1.6rem;display:flex;flex-direction:column;justify-content:space-between}
  .poster-kicker{font-size:.66rem;letter-spacing:.13em;text-transform:uppercase;color:var(--blue)}
  .poster h2{
    font-family:var(--display);
    font-size:clamp(2.7rem,4.6vw,4.7rem);
    line-height:.82;
    letter-spacing:-.045em;
    font-weight:600;
  }
  .poster h2 em{color:var(--blue);font-style:normal}
  .poster-note{font-size:.72rem;max-width:22ch;color:var(--muted)}
  .poster-art{position:relative;background:var(--blue);overflow:hidden}
  .poster-art::before{
    content:"";position:absolute;
    width:190px;height:190px;border-radius:50%;
    left:-70px;top:70px;background:var(--cream);
  }
  .poster-art::after{
    content:"";position:absolute;
    width:70px;height:70px;border-radius:50%;
    left:48px;top:132px;background:var(--red);
  }
  .shape-black{
    position:absolute;
    inset:auto -45px -60px 10px;
    height:280px;
    background:var(--ink);
    transform:rotate(-37deg);
  }
  .artifact-meta{
    display:grid;
    grid-template-columns:auto 1fr auto;
    gap:1rem;
    align-items:center;
    min-height:82px;
    padding:1rem 1.35rem;
    border-top:1px solid var(--ink);
  }
  .link-mark{
    width:36px;height:36px;border-radius:50%;
    display:grid;place-items:center;
    background:var(--blue);color:var(--paper);
  }
  .artifact-url{font-size:1.05rem;font-weight:600;letter-spacing:-.02em}
  .expiry{
    display:flex;align-items:center;gap:.55rem;
    padding:.45rem .65rem;
    border:1px solid var(--red);
    border-radius:999px;
    color:var(--red);
    font-family:var(--mono);
    font-size:.72rem;
    white-space:nowrap;
  }
  .artifact-caption{
    position:absolute;
    right:0;bottom:-1.8rem;
    font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;
    color:rgba(244,240,231,.9);
  }

  .ticker{overflow:hidden;background:var(--ink);color:var(--cream);border-block:1px solid var(--ink)}
  .ticker-track{
    width:max-content;
    display:flex;
    animation:ticker 34s linear infinite;
  }
  .ticker-track span{
    display:flex;align-items:center;gap:1.8rem;
    padding:.85rem .9rem;
    font-family:var(--display);
    font-size:1.05rem;
    letter-spacing:.035em;
    text-transform:uppercase;
  }
  .ticker-track span::after{content:"●";color:var(--red);font-size:.65rem}
  @keyframes ticker{to{transform:translateX(-50%)}}

  .section{padding:clamp(6rem,10vw,10rem) 0}
  .section-kicker{
    display:flex;align-items:center;gap:.75rem;
    margin-bottom:1.25rem;
    color:var(--blue);
    font-size:.72rem;font-weight:600;letter-spacing:.15em;text-transform:uppercase;
  }
  .section-kicker::before{content:"";width:26px;height:3px;background:var(--red)}
  .section-title{
    max-width:900px;
    font-family:var(--display);
    font-size:clamp(3.5rem,7vw,7.1rem);
    line-height:.84;
    letter-spacing:-.048em;
    font-weight:600;
  }
  .section-intro{
    max-width:600px;margin-top:1.4rem;
    color:var(--muted);font-size:1.1rem;
  }

  .how{background:var(--cream)}
  .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:1.2rem;margin-top:4.5rem}
  .step{
    min-height:340px;
    display:flex;flex-direction:column;
    padding:1.7rem;
    border:1px solid var(--ink);
    background:var(--paper);
    transition:transform .2s,box-shadow .2s;
  }
  .step:hover{transform:translateY(-5px);box-shadow:8px 8px 0 var(--blue)}
  .step-no{
    width:42px;height:42px;display:grid;place-items:center;
    border-radius:50%;background:var(--blue);color:var(--cream);
    font-family:var(--mono);font-size:.72rem;
  }
  .step h3{
    margin-top:auto;
    font-family:var(--display);font-size:2.3rem;line-height:.95;
    letter-spacing:-.035em;font-weight:600;
  }
  .step p{margin-top:.8rem;color:var(--muted);font-size:.91rem;max-width:31ch}
  .step-code{
    margin-top:1.1rem;padding:.7rem .8rem;
    background:var(--ink);color:var(--cream);
    font-family:var(--mono);font-size:.65rem;
    overflow:hidden;white-space:nowrap;text-overflow:ellipsis;
  }
  .step-code b{color:var(--red);font-weight:400}

   .uses{background:var(--red);color:var(--ink)}
   .uses .section-kicker{color:var(--ink)}
   .uses .section-kicker::before{background:var(--yellow)}
   .uses .section-intro{color:var(--ink)}
  .use-strip{
    margin-top:4.5rem;
    display:grid;
    grid-template-columns:repeat(4,1fr);
     border:1px solid rgba(17,17,15,.55);
  }
  .use{
    min-height:230px;
    padding:1.5rem;
     border-right:1px solid rgba(17,17,15,.55);
    display:flex;flex-direction:column;justify-content:space-between;
  }
  .use:last-child{border-right:0}
   .use-mark{font-family:var(--mono);font-size:.67rem;color:var(--ink)}
  .use h3{font-family:var(--display);font-size:2.1rem;line-height:.95;font-weight:600}
   .use p{font-size:.83rem;color:var(--ink)}

  .pricing{background:var(--cream)}
  .pricing-head{display:flex;justify-content:space-between;align-items:end;gap:3rem}
  .pricing-note{max-width:380px;color:var(--muted)}
  .plans{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.2rem;margin-top:4.5rem}
  .plan{
    min-height:390px;
    padding:2rem;
    border:1px solid var(--ink);
    background:var(--paper);
    display:flex;flex-direction:column;
  }
  .plan.pro{background:var(--blue);color:var(--cream);box-shadow:12px 12px 0 var(--ink)}
  .plan-top{display:flex;justify-content:space-between;align-items:start;gap:1rem}
  .plan-name{font-family:var(--display);font-size:3rem;line-height:1;font-weight:600}
  .plan-price{font-family:var(--mono);font-size:.75rem;padding:.45rem .6rem;border:1px solid currentColor;border-radius:999px}
  .plan ul{list-style:none;margin:2.2rem 0;display:grid;gap:.72rem;color:var(--muted)}
  .plan.pro ul{color:rgba(244,240,231,.9)}
  .plan li::before{content:"—";margin-right:.65rem;color:var(--red)}
  .plan.pro li::before{color:var(--yellow)}
  .plan-cta{
    margin-top:auto;
    min-height:52px;
    display:flex;justify-content:space-between;align-items:center;
    padding:.75rem 1rem;
    border:1px solid currentColor;
    font-weight:600;
    transition:background .2s,color .2s;
  }
  .plan-cta:hover{background:var(--ink);color:var(--cream)}
  .plan.pro .plan-cta{background:var(--cream);color:var(--ink);border-color:var(--cream)}
  .plan.pro .plan-cta:hover{background:var(--yellow);border-color:var(--yellow)}

  .oss{background:var(--blue);color:var(--cream)}
  .oss-grid{display:grid;grid-template-columns:1fr 1fr;gap:5rem;align-items:center}
  .oss .section-kicker{color:var(--cream)}
  .oss .section-kicker::before{background:var(--red)}
  .oss .section-title{font-size:clamp(3.7rem,6.5vw,6.6rem)}
  .oss-copy{color:rgba(244,240,231,.9);max-width:540px;margin:1.5rem 0 2rem}
  .oss-link{
    display:inline-flex;align-items:center;gap:1rem;
    padding:.85rem 1.1rem;border:1px solid var(--cream);
    font-weight:600;transition:background .2s,color .2s;
  }
  .oss-link:hover{background:var(--cream);color:var(--blue)}
  .stack-frame{padding:12px;background:var(--ink);transform:rotate(1.5deg)}
  .stack-paper{background:var(--paper);color:var(--ink);padding:2rem}
  .stack-title{font-family:var(--display);font-size:2.3rem;line-height:1;font-weight:600;margin-bottom:1.5rem}
  .stack-row{
    display:flex;justify-content:space-between;gap:2rem;
    padding:.85rem 0;border-top:1px solid var(--line);font-size:.86rem;
  }
  .stack-row span:first-child{color:var(--muted)}
  .stack-row span:last-child{font-family:var(--mono);font-size:.74rem}

  footer{background:var(--ink);color:var(--cream);padding:4rem 0 2rem}
  .footer-grid{display:grid;grid-template-columns:1.4fr repeat(3,1fr);gap:3rem}
  .footer-brand{font-size:2rem;font-weight:600;letter-spacing:-.07em}
  .footer-blurb{max-width:310px;margin-top:1rem;color:rgba(244,240,231,.76);font-size:.85rem}
  .footer-col h4{font-size:.7rem;text-transform:uppercase;letter-spacing:.14em;color:var(--red);margin-bottom:1rem}
  .footer-col ul{list-style:none;display:grid;gap:.6rem;font-size:.84rem;color:rgba(244,240,231,.7)}
  .footer-col a:hover{color:var(--cream)}
  .footer-bottom{
    display:flex;justify-content:space-between;gap:2rem;flex-wrap:wrap;
    margin-top:4rem;padding-top:1.5rem;border-top:1px solid rgba(244,240,231,.15);
    color:rgba(244,240,231,.7);font-size:.72rem;
  }

  .reveal{opacity:1;transform:none}

  @media(max-width:1050px){
    .hero{height:auto;max-height:none;padding:8rem 0 7rem}
    .hero-grid{grid-template-columns:1fr;gap:5rem;padding-top:3rem}
    .hero-copy{max-width:760px}
    .artifact{margin:0 auto}
    .artifact-caption{right:1rem}
    .plans{grid-template-columns:1fr 1fr}
    .use-strip{grid-template-columns:1fr 1fr}
    .use:nth-child(2){border-right:0}
     .use:nth-child(-n+2){border-bottom:1px solid rgba(17,17,15,.55)}
    .oss-grid{grid-template-columns:1fr;gap:4rem}
  }
  @media(max-width:760px){
    .shell{width:min(calc(100% - 36px),var(--max))}
    .hero-grid{width:min(calc(100% - 36px),var(--max))}
    .topbar{height:72px}
    .nav-link{display:none}
    .nav{gap:.8rem}
    .nav-signin{padding:.55rem .85rem}
    .hero{padding:6.5rem 0 5rem;min-height:0}
    .hero-grid{padding-top:2rem;gap:3.2rem}
    h1{font-size:clamp(4rem,21vw,6rem)}
    .hero-lede{font-size:1rem}
    .artifact{padding:8px;box-shadow:12px 14px 0 rgba(8,24,91,.42)}
    .artifact-paper{min-height:460px}
    .artifact-preview{padding:1.1rem}
    .poster{grid-template-columns:1fr;min-height:300px}
    .poster-copy{min-height:215px;padding:1.2rem}
    .poster h2{font-size:3rem}
    .poster-art{min-height:150px}
    .poster-art::before{top:20px}
    .poster-art::after{top:75px}
    .artifact-meta{grid-template-columns:auto 1fr;padding:.8rem;min-height:68px}
    .artifact-url{font-size:.77rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .expiry{grid-column:1/-1;justify-content:center}
    .artifact-caption{position:static;margin-top:1.5rem;text-align:center}
    .section{padding:5.5rem 0}
    .steps,.plans{grid-template-columns:1fr;margin-top:3rem}
    .step{min-height:285px}
    .pricing-head{display:block}
    .pricing-note{margin-top:1.2rem}
    .use-strip{grid-template-columns:1fr;margin-top:3rem}
     .use{border-right:0;border-bottom:1px solid rgba(17,17,15,.55)!important}
    .use:last-child{border-bottom:0!important}
    .footer-grid{grid-template-columns:1fr 1fr}
    .footer-grid>div:first-child{grid-column:1/-1}
  }
  @media(prefers-reduced-motion:reduce){
    html{scroll-behavior:auto}
    *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
    .reveal{opacity:1;transform:none}
  }
</style>
</head>
<body>

<header class="topbar">
  <div class="shell topbar-inner">
    <a class="brand" href="/" aria-label="Vanish home">vanish<span class="brand-dot">.</span></a>
    <nav class="nav" aria-label="Primary navigation">
      <a class="nav-link" href="#how">How it works</a>
      <a class="nav-link" href="#uses">Examples</a>
      <a class="nav-link" href="#pricing">Pricing</a>
      <a class="nav-link" href="https://github.com/The-Vibe-Company/vanish" rel="noopener">GitHub</a>
      <a class="nav-signin" href="/auth/github?redirect=/dashboard">Sign in</a>
    </nav>
  </div>
</header>

<main>
  <section class="hero">
    <div class="shell hero-grid">
      <div class="hero-copy">
        <div class="eyebrow">Agent handoff, made visible</div>
        <h1>One link.<br>Anyone can see it.</h1>
        <p class="hero-lede">Your agent publishes sites, reports, presentations, and files. You share the link. Vanish handles the rest.</p>
        <div class="hero-actions">
          <button class="primary-cta" data-copy="Publish the current static site with Vanish. Identify the site folder and its entry HTML file, then run: npx vanish-cli site [folder] --root [entry-file]. Return the public URL.">
            <span>Copy prompt for my agent</span>
            <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 15L15 5M8 5h7v7"/></svg>
          </button>
          <span class="copy-state" aria-live="polite"></span>
        </div>
        <div class="hero-trust">
          <span>Free to try</span>
          <span>No account</span>
          <span>Disappears automatically</span>
        </div>
      </div>

      <div class="artifact-wrap" aria-label="Example Vanish site">
        <div class="artifact">
          <div class="artifact-paper">
            <div class="artifact-preview">
              <div class="artifact-top">
                <span>Agent-made preview</span>
                <span class="artifact-live">Published now</span>
              </div>
              <div class="poster">
                <div class="poster-copy">
                  <span class="poster-kicker">Design review · 07</span>
                  <h2>Clear thinking,<br><em>ready to share.</em></h2>
                  <p class="poster-note">A browser-ready report created by your agent and published without a deployment pipeline.</p>
                </div>
                <div class="poster-art"><span class="shape-black"></span></div>
              </div>
            </div>
            <div class="artifact-meta">
              <span class="link-mark" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 12l4-4M6.5 14.5l-1 1a3.5 3.5 0 01-5-5l3-3a3.5 3.5 0 015 0M13.5 5.5l1-1a3.5 3.5 0 015 5l-3 3a3.5 3.5 0 01-5 0"/></svg>
              </span>
              <span class="artifact-url">quiet-river-42.vanish.sh</span>
              <span class="expiry">48 h</span>
            </div>
          </div>
        </div>
        <p class="artifact-caption">Published now · automatic expiry</p>
      </div>
    </div>
  </section>

  <div class="ticker" aria-hidden="true">
    <div class="ticker-track">
      <span>Sites</span><span>Reports</span><span>Prototypes</span><span>Presentations</span><span>Files</span><span>Visualizations</span>
      <span>Sites</span><span>Reports</span><span>Prototypes</span><span>Presentations</span><span>Files</span><span>Visualizations</span>
    </div>
  </div>

  <section class="section how" id="how">
    <div class="shell">
      <div class="reveal">
        <div class="section-kicker">How it works</div>
        <h2 class="section-title">From creation to public link in one move.</h2>
        <p class="section-intro">No deployment settings to learn. No dashboard required. Your agent can publish what it just made and hand you the URL.</p>
      </div>
      <div class="steps">
        <article class="step reveal">
          <span class="step-no">01</span>
          <h3>Make something</h3>
          <p>Your agent creates a site, a report, a deck, or any file you need someone else to see.</p>
          <div class="step-code"><b>→</b> index.html · styles.css</div>
        </article>
        <article class="step reveal">
          <span class="step-no">02</span>
          <h3>Ask Vanish to publish</h3>
          <p>Give your agent the prompt once. It chooses the right Vanish workflow for the artifact.</p>
          <div class="step-code"><b>$</b> npx vanish-cli site ./demo --root index.html</div>
        </article>
        <article class="step reveal">
          <span class="step-no">03</span>
          <h3>Share the link</h3>
          <p>Send a real public URL. Update it while you work, or simply let it disappear.</p>
          <div class="step-code"><b>↗</b> quiet-river-42.vanish.sh</div>
        </article>
      </div>
    </div>
  </section>

  <section class="section uses" id="uses">
    <div class="shell">
      <div class="reveal">
        <div class="section-kicker">What goes on Vanish</div>
        <h2 class="section-title">The things that deserve better than an attachment.</h2>
        <p class="section-intro">Vanish is the final step between an agent finishing the work and a person actually seeing it.</p>
      </div>
      <div class="use-strip reveal">
        <article class="use"><span class="use-mark">01 / REPORT</span><h3>Audits &amp;<br>reviews</h3><p>Turn generated HTML into a page your team can read.</p></article>
        <article class="use"><span class="use-mark">02 / DEMO</span><h3>Prototypes &amp;<br>mini-sites</h3><p>Share a working browser experience with one URL.</p></article>
        <article class="use"><span class="use-mark">03 / DECK</span><h3>Presentations &amp;<br>visual stories</h3><p>Give clients and collaborators a clean public preview.</p></article>
        <article class="use"><span class="use-mark">04 / FILE</span><h3>Documents &amp;<br>media</h3><p>Upload a single file when a full site would be too much.</p></article>
      </div>
    </div>
  </section>

  <section class="section pricing" id="pricing">
    <div class="shell">
      <div class="pricing-head reveal">
        <div>
          <div class="section-kicker">Simple pricing</div>
          <h2 class="section-title">Free now.<br>Keep it longer when needed.</h2>
        </div>
        <p class="pricing-note">Start free, or go Pro when your sites need more room.</p>
      </div>
      <div class="plans">
        <article class="plan reveal">
          <div class="plan-top"><h3 class="plan-name">Free</h3><span class="plan-price">€0</span></div>
          <ul>
            <li>Publish without an account</li>
            <li>Readable random URLs</li>
            <li>24–48 hour retention</li>
            <li>Sites and individual files</li>
          </ul>
          <button class="plan-cta" data-copy="Publish the current static site with Vanish. Identify the site folder and its entry HTML file, then run: npx vanish-cli site [folder] --root [entry-file]. Return the public URL."><span>Try it with my agent</span><span>↗</span></button>
        </article>
        <article class="plan pro reveal">
          <div class="plan-top"><h3 class="plan-name">Pro</h3><span class="plan-price">€10 / month</span></div>
          <ul>
            <li>Custom vanish.sh addresses</li>
            <li>Up to 10 GB of storage</li>
            <li>Up to 5,000 files per site</li>
            <li>Keep links for up to 365 days</li>
            <li>500 requests per hour</li>
          </ul>
          <a class="plan-cta" href="/auth/github?redirect=/dashboard"><span>Get Pro</span><span>↗</span></a>
        </article>
      </div>
    </div>
  </section>

  <section class="section oss">
    <div class="shell oss-grid">
      <div class="reveal">
        <div class="section-kicker">Open by design</div>
        <h2 class="section-title">Small enough to trust. Open enough to own.</h2>
        <p class="oss-copy">Vanish is MIT licensed and built on Cloudflare. Run the hosted version, inspect every line, or deploy the whole thing yourself.</p>
        <a class="oss-link" href="https://github.com/The-Vibe-Company/vanish" rel="noopener"><span>Explore on GitHub</span><span>↗</span></a>
      </div>
      <div class="stack-frame reveal">
        <div class="stack-paper">
          <h3 class="stack-title">The whole stack,<br>without the mystery.</h3>
          <div class="stack-row"><span>Runtime</span><span>Cloudflare Workers</span></div>
          <div class="stack-row"><span>Storage</span><span>R2</span></div>
          <div class="stack-row"><span>Metadata</span><span>D1</span></div>
          <div class="stack-row"><span>License</span><span>MIT</span></div>
          <div class="stack-row"><span>Self-hosting</span><span>Supported</span></div>
        </div>
      </div>
    </div>
  </section>
</main>

<footer>
  <div class="shell">
    <div class="footer-grid">
      <div>
        <a class="footer-brand" href="/">vanish<span class="brand-dot">.</span></a>
        <p class="footer-blurb">A temporary public home for whatever your agent just made.</p>
      </div>
      <div class="footer-col">
        <h4>Product</h4>
        <ul><li><a href="#how">How it works</a></li><li><a href="#pricing">Pricing</a></li><li><a href="/dashboard">Dashboard</a></li></ul>
      </div>
      <div class="footer-col">
        <h4>Open source</h4>
        <ul><li><a href="https://github.com/The-Vibe-Company/vanish">GitHub</a></li><li><a href="https://github.com/The-Vibe-Company/vanish/releases">Changelog</a></li><li><a href="https://github.com/The-Vibe-Company/vanish/blob/main/LICENSE">MIT License</a></li></ul>
      </div>
      <div class="footer-col">
        <h4>Support</h4>
        <ul><li><a href="mailto:abuse@vanish.sh?subject=Vanish%20abuse%20report">Report abuse</a></li></ul>
      </div>
    </div>
    <div class="footer-bottom"><span>© 2026 vanish.sh</span><span>Made by <a href="https://thevibecompany.co">The Vibe Company</a></span></div>
  </div>
</footer>

<script>
  (function(){
    function copyValue(value){
      if(navigator.clipboard&&window.isSecureContext){
        return navigator.clipboard.writeText(value);
      }
      return new Promise(function(resolve,reject){
        var field=document.createElement('textarea');
        field.value=value;
        field.setAttribute('readonly','');
        field.style.position='fixed';
        field.style.opacity='0';
        document.body.appendChild(field);
        field.select();
        try{
          if(document.execCommand('copy')) resolve();
          else reject(new Error('copy unavailable'));
        }catch(error){
          reject(error);
        }finally{
          document.body.removeChild(field);
        }
      });
    }

    var copyButtons=document.querySelectorAll('[data-copy]');
    copyButtons.forEach(function(button){
      button.addEventListener('click',function(){
        var value=button.getAttribute('data-copy')||'';
        var state=document.querySelector('.copy-state');
        copyValue(value).then(function(){
          if(state) state.textContent='Copied';
          var original=button.querySelector('span');
          if(original){
            var text=original.textContent;
            original.textContent='Copied to clipboard';
            setTimeout(function(){original.textContent=text;if(state)state.textContent='';},1800);
          }
        }).catch(function(){
          if(state) state.textContent='Copy failed — select the command';
          window.prompt('Copy this command:',value);
        });
      });
    });

    var revealItems=document.querySelectorAll('.reveal');
    if('IntersectionObserver' in window){
      var observer=new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target);}
        });
      },{threshold:.12});
      revealItems.forEach(function(item){observer.observe(item);});
    }else{
      revealItems.forEach(function(item){item.classList.add('visible');});
    }
  })();
</script>
</body>
</html>`;

landing.get('/', (c) => c.html(html));

export default landing;
