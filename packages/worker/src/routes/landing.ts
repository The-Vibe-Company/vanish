import { Hono } from 'hono';
import type { Env } from '../types.js';

const landing = new Hono<{ Bindings: Env }>();

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>vanish: public preview URLs for agent-made artifacts</title>
<meta name="description" content="Turn a local HTML, Markdown, CSS, JS, or asset folder from Codex, Claude Code, or your terminal into a temporary public URL." />

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" />

<style>
  *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}

  :root{
    --bg:#08090a;
    --bg-2:#0c0e10;
    --bg-card:#0f1113;
    --bg-mid:#0a0c0e;
    --fg:#a8adb5;
    --fg-dim:#5e646b;
    --fg-mute:#3d3a35;
    --fg-bright:#dee3e9;
    --fg-white:#f2f5fa;
    --accent:#d4a850;
    --accent-dim:#806328;
    --accent-soft:rgba(212,168,80,.12);
    --accent-faint:rgba(212,168,80,.04);
    --green:#7dba5a;
    --blue:#6a9fd8;
    --red:#d46a6a;
    --border:#171a1d;
    --border-2:#202428;
    --hairline:#121417;

    --mono:'IBM Plex Mono','SF Mono','JetBrains Mono','Fira Code',ui-monospace,monospace;
    --sans:'IBM Plex Sans',-apple-system,system-ui,sans-serif;

    --max:1240px;
    --row-pad:1.5rem;
  }

  html,body{background:var(--bg);color:var(--fg);font-family:var(--mono);font-size:14px;line-height:1.65;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
  body{min-height:100vh;overflow-x:hidden}

  ::selection{background:var(--accent);color:var(--bg)}

  a{color:inherit;text-decoration:none}
  button{font-family:inherit;font-size:inherit;background:none;border:0;color:inherit;cursor:pointer}
  svg{display:block}

  .wrap{max-width:var(--max);margin:0 auto;padding:0 var(--row-pad)}

  /* — top bar — */
  .topbar{
    position:sticky;top:0;z-index:50;
    background:color-mix(in srgb,var(--bg) 88%,transparent);
    backdrop-filter:saturate(140%) blur(10px);
    -webkit-backdrop-filter:saturate(140%) blur(10px);
    border-bottom:1px solid var(--hairline);
  }
  .topbar-inner{display:flex;align-items:center;gap:2rem;height:56px}
  .brand{display:flex;align-items:baseline;gap:.05rem;font-weight:600;font-size:1rem;color:var(--fg-white);letter-spacing:-.02em}
  .brand .dot{color:var(--accent)}
  .brand-meta{margin-left:.6rem;color:var(--fg-dim);font-size:.72rem;border-left:1px solid var(--hairline);padding-left:.6rem;letter-spacing:.04em}
  .nav{display:flex;gap:1.4rem;margin-left:auto;align-items:center}
  .nav a{color:var(--fg);font-size:.82rem;letter-spacing:.02em;transition:color .15s}
  .nav a:hover{color:var(--fg-white)}
  .nav .ghbtn{
    display:inline-flex;align-items:center;gap:.5rem;
    padding:.4rem .75rem;border:1px solid var(--border-2);
    border-radius:3px;font-size:.78rem;color:var(--fg-bright);
    transition:border-color .15s, color .15s;
  }
  .nav .ghbtn:hover{border-color:var(--accent);color:var(--accent)}
  .nav .signin{
    color:var(--bg);background:var(--accent);
    padding:.4rem .9rem;border-radius:3px;font-weight:500;font-size:.78rem;
    transition:filter .15s;
  }
  .nav .signin:hover{filter:brightness(1.08)}
  @media(max-width:760px){
    .nav a:not(.ghbtn):not(.signin){display:none}
  }

  /* — hero — */
  .hero{position:relative;padding:5rem 0 6rem;overflow:hidden}
  .hero-grid{display:grid;grid-template-columns:1.05fr 1fr;gap:4rem;align-items:start}
  @media(max-width:980px){.hero-grid{grid-template-columns:1fr;gap:3rem}}

  .eyebrow{
    display:inline-flex;align-items:center;gap:.6rem;
    color:var(--accent);font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;
    margin-bottom:1.4rem;
  }
  .eyebrow::before{content:"";display:block;width:24px;height:1px;background:var(--accent)}
  .eyebrow .pulse{
    width:6px;height:6px;border-radius:50%;background:var(--accent);
    animation:pulse 2s ease-in-out infinite;
  }
  @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.85)}}

  .hero h1{
    font-family:var(--mono);
    font-weight:500;
    font-size:clamp(2.2rem,5vw,3.6rem);
    line-height:1.05;
    letter-spacing:-.035em;
    color:var(--fg-white);
    margin-bottom:1.6rem;
  }
  .hero h1 .strike{position:relative;display:inline-block;color:var(--fg-bright)}
  .hero h1 .strike::after{
    content:"";position:absolute;left:-2%;right:-2%;top:55%;height:2px;
    background:var(--accent);transform-origin:left;
    animation:strikeIn 1.2s .6s cubic-bezier(.65,.05,.36,1) both;
  }
  @keyframes strikeIn{from{transform:scaleX(0)}to{transform:scaleX(1)}}
  .hero h1 .accent{color:var(--accent)}

  .hero .lede{font-size:.98rem;color:var(--fg);max-width:34ch;margin-bottom:2rem;line-height:1.6}
  .hero .lede strong{color:var(--fg-bright);font-weight:500}

  .install-row{display:flex;flex-wrap:wrap;gap:.6rem;margin-bottom:1.4rem}
  .copybox{
    display:inline-flex;align-items:center;gap:.85rem;
    background:var(--bg-card);border:1px solid var(--border-2);
    border-radius:4px;padding:.7rem .85rem .7rem 1rem;
    font-family:var(--mono);font-size:.85rem;color:var(--fg-bright);
    cursor:pointer;transition:border-color .15s, background .15s;
    user-select:all;
  }
  .copybox:hover{border-color:var(--accent-dim);background:var(--bg-2)}
  .copybox .pre{color:var(--accent);user-select:none;margin-right:-.4rem}
  .copybox .copy-icon{
    margin-left:.4rem;color:var(--fg-dim);font-size:.7rem;
    padding-left:.7rem;border-left:1px solid var(--border-2);
    letter-spacing:.04em;
  }
  .copybox.copied .copy-icon{color:var(--green)}

  .alt-cta{
    color:var(--fg-dim);font-size:.78rem;
    display:inline-flex;align-items:center;gap:.5rem;flex-wrap:wrap;
    padding:.7rem 0;
  }
  .alt-cta a{color:var(--fg-bright);border-bottom:1px solid var(--border-2);transition:color .15s, border-color .15s}
  .alt-cta a:hover{color:var(--accent);border-color:var(--accent)}

  .hero-stats{
    display:flex;gap:2.5rem;margin-top:2.4rem;padding-top:1.6rem;
    border-top:1px solid var(--hairline);
    color:var(--fg-dim);font-size:.74rem;flex-wrap:wrap;
  }
  .hero-stats div{display:flex;flex-direction:column;gap:.15rem}
  .hero-stats .v{color:var(--fg-bright);font-size:.95rem;letter-spacing:-.01em}

  /* — terminal — */
  .term{
    background:var(--bg-card);
    border:1px solid var(--border-2);
    border-radius:6px;
    overflow:hidden;
    box-shadow:
      0 1px 0 0 rgba(255,255,255,.02) inset,
      0 30px 60px -20px rgba(0,0,0,.6),
      0 0 80px -10px var(--accent-faint);
    position:relative;
  }
  .term-chrome{
    display:flex;align-items:center;gap:.75rem;
    padding:.6rem .9rem;background:var(--bg-2);
    border-bottom:1px solid var(--border);
    user-select:none;
  }
  .dots{display:flex;gap:6px}
  .dots span{width:11px;height:11px;border-radius:50%;display:block}
  .dot-r{background:#ff5f57}.dot-y{background:#febc2e}.dot-g{background:#28c840}
  .term-title{flex:1;text-align:center;color:var(--fg-dim);font-size:.7rem;letter-spacing:.02em}
  .term-pin{font-size:.62rem;color:var(--fg-mute);letter-spacing:.1em;text-transform:uppercase;display:flex;align-items:center;gap:.4rem}
  .term-pin::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 6px var(--green)}

  .term-body{
    padding:1.1rem 1.25rem;
    min-height:280px;
    font-family:var(--mono);font-size:.86rem;line-height:1.75;
    color:var(--fg-bright);
    overflow:hidden;
    position:relative;
  }
  .term-body .line{white-space:pre;min-height:1.5em}
  .t-prompt{color:var(--accent)}
  .t-green{color:var(--green)}
  .t-blue{color:var(--blue)}
  .t-red{color:var(--red)}
  .t-dim{color:var(--fg-dim)}
  .t-bright{color:var(--fg-white)}
  .t-acc{color:var(--accent)}
  .t-link{color:var(--accent);text-decoration:underline;text-decoration-color:var(--accent-dim);text-underline-offset:3px}

  .cursor{display:inline-block;width:.55em;height:1.05em;background:var(--fg-white);vertical-align:text-bottom;margin-left:1px;animation:blink 1.05s steps(1,end) infinite}
  @keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}

  /* — file card (live countdown) — */
  .filecard{
    margin-top:1.2rem;
    background:var(--bg-card);
    border:1px solid var(--border-2);
    border-radius:6px;
    padding:1rem 1.1rem;
    display:grid;grid-template-columns:auto 1fr auto;gap:1rem;align-items:center;
    position:relative;overflow:hidden;
    transition:opacity .8s ease, filter .8s ease;
  }
  .filecard::before{
    content:"";position:absolute;left:0;top:0;bottom:0;width:3px;
    background:var(--accent);opacity:.7;
  }
  .filecard.expiring::before{background:var(--red);animation:expflash 1s ease-in-out infinite}
  @keyframes expflash{0%,100%{opacity:.4}50%{opacity:1}}
  .filecard.gone{opacity:0;filter:blur(8px) saturate(0)}

  .file-thumb{
    width:46px;height:46px;border-radius:4px;background:var(--bg-2);
    border:1px solid var(--border);
    display:flex;align-items:center;justify-content:center;
    color:var(--fg-dim);font-size:.62rem;letter-spacing:.06em;
    position:relative;overflow:hidden;
  }
  .file-thumb::after{
    content:"";position:absolute;inset:0;
    background:repeating-linear-gradient(135deg,transparent 0 6px,rgba(255,255,255,.02) 6px 12px);
  }
  .file-meta{min-width:0}
  .file-meta .fname{color:var(--fg-bright);font-size:.86rem;display:flex;align-items:center;gap:.5rem}
  .file-meta .fname .acc{color:var(--accent)}
  .file-meta .fsub{color:var(--fg-dim);font-size:.72rem;margin-top:.15rem;display:flex;gap:.85rem;align-items:center;flex-wrap:wrap}
  .file-meta .fsub .url{color:var(--fg-bright);letter-spacing:-.01em}
  .file-meta .fsub .copy-mini{color:var(--accent);cursor:pointer}
  .countdown{
    text-align:right;
    font-size:.7rem;color:var(--fg-dim);letter-spacing:.06em;text-transform:uppercase;
  }
  .countdown .num{
    display:block;color:var(--fg-bright);font-size:1.05rem;letter-spacing:0;
    text-transform:none;font-variant-numeric:tabular-nums;
    margin-top:.1rem;
  }
  .countdown.warn .num{color:var(--accent)}
  .countdown.danger .num{color:var(--red)}

  /* — section header — */
  .section{padding:5rem 0;border-top:1px solid var(--hairline);position:relative}
  .section.alt{background:var(--bg-mid)}
  .sh{display:flex;align-items:baseline;gap:1.2rem;margin-bottom:2.5rem;flex-wrap:wrap}
  .sh .num{
    color:var(--accent);font-size:.7rem;letter-spacing:.18em;
    text-transform:uppercase;font-feature-settings:"tnum"
  }
  .sh h2{
    font-family:var(--mono);font-weight:500;
    font-size:clamp(1.4rem,2.8vw,2.2rem);letter-spacing:-.025em;
    color:var(--fg-white);line-height:1.1;
  }
  .sh .desc{color:var(--fg-dim);font-size:.86rem;margin-left:auto;max-width:36ch;line-height:1.6}
  @media(max-width:760px){.sh .desc{margin-left:0}}

  /* — three steps — */
  .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--hairline);border:1px solid var(--hairline);border-radius:6px;overflow:hidden}
  @media(max-width:760px){.steps{grid-template-columns:1fr}}
  .step{
    background:var(--bg-card);
    padding:1.6rem 1.4rem 1.8rem;
    display:flex;flex-direction:column;gap:.6rem;
    position:relative;min-height:200px;
  }
  .step .step-n{color:var(--accent);font-size:.7rem;letter-spacing:.16em;text-transform:uppercase}
  .step h3{font-size:1rem;color:var(--fg-white);font-weight:500;letter-spacing:-.01em}
  .step p{color:var(--fg-dim);font-size:.82rem;line-height:1.6}
  .step .step-cmd{
    margin-top:auto;padding:.65rem .8rem;background:var(--bg-2);
    border:1px solid var(--border);border-radius:3px;
    font-size:.78rem;color:var(--fg-bright);
    overflow-x:auto;white-space:pre;
  }
  .step .step-cmd .p{color:var(--accent)}
  .step .step-cmd .o{color:var(--green)}
  .step .step-cmd .d{color:var(--fg-dim)}

  /* — vanish grid — */
  .vanish-section .vg-meta{
    display:flex;justify-content:space-between;color:var(--fg-dim);
    font-size:.74rem;margin-bottom:1rem;letter-spacing:.04em;flex-wrap:wrap;gap:.6rem;
  }
  .vg-meta .live{color:var(--green);display:inline-flex;align-items:center;gap:.5rem}
  .vg-meta .live::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 8px var(--green);animation:pulse 1.6s ease-in-out infinite}

  .vgrid{
    display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
    gap:.5rem;
    background:var(--bg-card);
    border:1px solid var(--border);
    border-radius:6px;padding:.5rem;
    position:relative;
  }
  .vfile{
    background:var(--bg-2);border:1px solid var(--border);border-radius:3px;
    padding:.55rem .7rem;
    display:flex;align-items:center;gap:.6rem;
    font-size:.74rem;
    transition:opacity .9s ease, transform .9s ease, filter .9s ease, background .3s;
    position:relative;overflow:hidden;
  }
  .vfile.gone{opacity:0;transform:translateY(-6px);filter:blur(6px) saturate(0)}
  .vfile.fresh{
    animation:freshIn .6s cubic-bezier(.16,1,.3,1) both;
  }
  @keyframes freshIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
  .vfile.warn{border-color:rgba(212,168,80,.35)}
  .vfile.danger{border-color:rgba(212,106,106,.4);background:rgba(212,106,106,.04)}

  .vfile .ext{
    color:var(--fg-dim);font-size:.62rem;
    width:32px;text-align:center;letter-spacing:.04em;
    border-right:1px solid var(--border);padding-right:.55rem;
    flex-shrink:0;
  }
  .vfile.warn .ext{color:var(--accent)}
  .vfile.danger .ext{color:var(--red)}
  .vfile .name{color:var(--fg-bright);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
  .vfile .ttl{color:var(--fg-dim);font-variant-numeric:tabular-nums;font-size:.7rem;letter-spacing:0;white-space:nowrap;flex-shrink:0}
  .vfile.warn .ttl{color:var(--accent)}
  .vfile.danger .ttl{color:var(--red)}

  /* — tiers — */
  .tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--hairline);border:1px solid var(--hairline);border-radius:6px;overflow:hidden}
  @media(max-width:880px){.tiers{grid-template-columns:1fr}}
  .tier{background:var(--bg-card);padding:1.8rem 1.6rem;position:relative;display:flex;flex-direction:column;gap:1.2rem}
  .tier.pro{background:linear-gradient(180deg,rgba(212,168,80,.04) 0%,var(--bg-card) 60%);border-top:1px solid var(--accent-dim)}
  .tier-head{display:flex;align-items:baseline;justify-content:space-between;gap:.8rem;flex-wrap:wrap}
  .tier-name{color:var(--fg-white);font-size:1.05rem;font-weight:500;letter-spacing:-.01em}
  .tier.pro .tier-name{color:var(--accent)}
  .tier-tag{font-size:.65rem;letter-spacing:.16em;text-transform:uppercase;color:var(--fg-dim);padding:.18rem .5rem;border:1px solid var(--border-2);border-radius:2px}
  .tier.pro .tier-tag{color:var(--accent);border-color:var(--accent-dim)}
  .tier-price{font-size:1.4rem;color:var(--fg-bright);letter-spacing:-.02em;font-weight:500}
  .tier-price .sub{font-size:.72rem;color:var(--fg-dim);letter-spacing:0}
  .tier ul{list-style:none;display:flex;flex-direction:column;gap:.55rem;padding:0;font-size:.82rem}
  .tier li{display:flex;gap:.6rem;align-items:baseline;color:var(--fg)}
  .tier li::before{
    content:"";width:8px;height:1px;background:var(--fg-mute);
    align-self:center;flex-shrink:0;display:block;
  }
  .tier.pro li::before{background:var(--accent-dim)}
  .tier li .k{color:var(--fg-dim);font-size:.78rem;width:5.4rem;flex-shrink:0;display:inline-block}
  .tier li .v{color:var(--fg-bright);flex:1;min-width:0}
  .tier li.hi .v{color:var(--accent)}
  .tier-cta{
    display:inline-flex;align-items:center;justify-content:center;gap:.5rem;
    padding:.7rem 1rem;border-radius:3px;
    font-size:.8rem;font-weight:500;letter-spacing:.02em;
    margin-top:auto;
  }
  .tier-cta.ghost{border:1px solid var(--border-2);color:var(--fg-bright)}
  .tier-cta.ghost:hover{border-color:var(--accent);color:var(--accent)}
  .tier-cta.solid{background:var(--accent);color:var(--bg)}
  .tier-cta.solid:hover{filter:brightness(1.08)}

  /* — use cases — */
  .uses{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--hairline);border:1px solid var(--hairline);border-radius:6px;overflow:hidden}
  @media(max-width:780px){.uses{grid-template-columns:1fr}}
  .use{background:var(--bg-card);padding:1.5rem 1.6rem;display:flex;gap:1.1rem;align-items:flex-start}
  .use-num{
    color:var(--accent);font-size:.7rem;letter-spacing:.16em;font-feature-settings:"tnum";
    width:2.5rem;flex-shrink:0;padding-top:.15rem;
  }
  .use h4{color:var(--fg-white);font-size:.95rem;font-weight:500;letter-spacing:-.01em;margin-bottom:.4rem}
  .use p{color:var(--fg-dim);font-size:.82rem;line-height:1.65;margin-bottom:.8rem}
  .use .um{
    font-size:.74rem;color:var(--fg);background:var(--bg-2);
    padding:.4rem .65rem;border-radius:3px;border:1px solid var(--border);
    display:inline-block;
  }
  .use .um .p{color:var(--accent)}
  .use .um .d{color:var(--fg-dim)}

  /* — code tabs — */
  .codecard{
    background:var(--bg-card);border:1px solid var(--border-2);
    border-radius:6px;overflow:hidden;
  }
  .tabs{
    display:flex;border-bottom:1px solid var(--border);
    background:var(--bg-2);overflow-x:auto;
  }
  .tab{
    padding:.85rem 1.2rem;font-size:.78rem;color:var(--fg-dim);
    border-right:1px solid var(--border);letter-spacing:.04em;
    transition:color .15s, background .15s;
    position:relative;white-space:nowrap;
  }
  .tab:hover{color:var(--fg-bright)}
  .tab.active{color:var(--fg-white);background:var(--bg-card)}
  .tab.active::after{
    content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;background:var(--accent);
  }
  .tabbody{padding:1.4rem 1.5rem;font-size:.84rem;line-height:1.85;overflow-x:auto}
  .tabbody pre{font-family:var(--mono);white-space:pre;color:var(--fg-bright)}
  .tabbody .p{color:var(--accent)}
  .tabbody .f{color:var(--blue)}
  .tabbody .s{color:var(--green)}
  .tabbody .d{color:var(--fg-dim)}
  .tabbody .u{color:var(--fg)}
  .tabbody .k{color:var(--accent)}

  /* — self-host — */
  .selfhost{
    display:grid;grid-template-columns:1.3fr 1fr;gap:3rem;align-items:center;
  }
  @media(max-width:880px){.selfhost{grid-template-columns:1fr}}
  .selfhost p{color:var(--fg);font-size:.92rem;line-height:1.7;margin-bottom:1rem;max-width:52ch}
  .selfhost p.dim{color:var(--fg-dim);font-size:.84rem}
  .stack{
    display:grid;grid-template-columns:repeat(2,1fr);gap:.5rem;
  }
  .stack-item{
    border:1px solid var(--border);border-radius:4px;padding:.85rem 1rem;
    background:var(--bg-card);font-size:.78rem;
    display:flex;flex-direction:column;gap:.2rem;
  }
  .stack-item .l{color:var(--fg-dim);font-size:.66rem;letter-spacing:.14em;text-transform:uppercase}
  .stack-item .v{color:var(--fg-bright);font-size:.86rem;letter-spacing:-.01em}
  .stack-item .v .acc{color:var(--accent)}

  /* — footer — */
  footer{
    border-top:1px solid var(--hairline);padding:3rem 0 4rem;color:var(--fg-dim);
    background:var(--bg-mid);
  }
  .foot{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:2rem}
  @media(max-width:780px){.foot{grid-template-columns:1fr 1fr;gap:2.4rem}}
  .foot h5{font-size:.7rem;letter-spacing:.16em;text-transform:uppercase;color:var(--fg-dim);margin-bottom:.85rem;font-weight:500}
  .foot ul{list-style:none;display:flex;flex-direction:column;gap:.55rem}
  .foot a{font-size:.82rem;color:var(--fg);transition:color .15s}
  .foot a:hover{color:var(--accent)}
  .foot .brand{font-size:1.3rem;margin-bottom:.7rem}
  .foot .blurb{font-size:.78rem;color:var(--fg-dim);max-width:30ch;line-height:1.6}
  .foot-bottom{
    margin-top:2.4rem;padding-top:1.4rem;border-top:1px solid var(--hairline);
    display:flex;justify-content:space-between;flex-wrap:wrap;gap:.8rem;
    font-size:.72rem;color:var(--fg-mute);letter-spacing:.04em;
  }
  .foot-bottom a{color:var(--fg-dim)}
  .foot-bottom a:hover{color:var(--accent)}

  /* — dot pattern subtly under hero — */
  .dotpat{
    position:absolute;inset:0;pointer-events:none;opacity:.5;
    background-image:radial-gradient(circle,var(--border-2) 1px,transparent 1px);
    background-size:24px 24px;
    mask-image:radial-gradient(ellipse 60% 70% at 50% 30%, black, transparent 70%);
    -webkit-mask-image:radial-gradient(ellipse 60% 70% at 50% 30%, black, transparent 70%);
  }

  /* — divider chevrons — */
  .marquee{
    overflow:hidden;border-block:1px solid var(--hairline);
    background:var(--bg-mid);
    color:var(--fg-mute);font-size:.7rem;letter-spacing:.3em;text-transform:uppercase;
    padding:.85rem 0;
    white-space:nowrap;
  }
  .marquee-track{display:inline-flex;gap:3rem;animation:marquee 60s linear infinite}
  .marquee span{display:inline-flex;align-items:center;gap:1rem}
  .marquee span::before{content:"\\25C7";color:var(--accent-dim)}
  @keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
</style>
</head>
<body>

<!-- TOPBAR -->
<header class="topbar">
  <div class="wrap topbar-inner">
    <a href="/" class="brand" aria-label="vanish">
      vanish<span class="dot">.</span>sh
      <span class="brand-meta">v0.1.12</span>
    </a>
    <nav class="nav" aria-label="primary">
      <a href="#how">How it works</a>
      <a href="#tiers">Tiers</a>
      <a href="#api">API</a>
      <a href="#selfhost">Self-host</a>
      <a class="ghbtn" href="https://github.com/The-Vibe-Company/vanish" rel="noopener">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
        Star
      </a>
      <a class="signin" href="/auth/github">Sign in</a>
    </nav>
  </div>
</header>

<!-- HERO -->
<section class="hero">
  <div class="dotpat"></div>
  <div class="wrap hero-grid">
    <div>
      <div class="eyebrow"><span class="pulse"></span>ship what your agent just made</div>
      <h1>
        From <span class="strike">./demo/</span> to a <span class="accent">real URL</span>.<br/>
        In one command.
      </h1>
      <p class="lede">
        Vanish turns a folder of generated <strong>HTML, Markdown, CSS, JS</strong>
        into a live mini-site on a readable subdomain. Built for Claude Code,
        Codex, and the artifacts you'd otherwise paste into a Slack DM.
      </p>

      <div class="install-row">
        <button class="copybox" id="copy1" data-copy="npx vanish-cli site ./demo --root index.html">
          <span class="pre">$</span>npx vanish-cli site ./demo --root index.html
          <span class="copy-icon" data-state="idle">copy</span>
        </button>
      </div>
      <div class="alt-cta">
        single file? <a href="#how">vanish upload screenshot.png</a> ·
        <a href="/auth/github">sign in with GitHub</a>
      </div>

      <div class="hero-stats">
        <div><span class="v">1 cmd</span><span>folder &rarr; URL</span></div>
        <div><span class="v">subdomain</span><span>readable random</span></div>
        <div><span class="v">24h &rarr; 365d</span><span>retention range</span></div>
        <div><span class="v">2 &euro;/mo</span><span>pro &middot; custom slug</span></div>
      </div>
    </div>

    <div>
      <div class="term" id="term">
        <div class="term-chrome">
          <div class="dots"><span class="dot-r"></span><span class="dot-y"></span><span class="dot-g"></span></div>
          <div class="term-title">~/work &mdash; vanish &mdash; zsh</div>
          <div class="term-pin">live</div>
        </div>
        <div class="term-body" id="termBody"></div>
      </div>

      <div class="filecard" id="filecard">
        <div class="file-thumb">SITE</div>
        <div class="file-meta">
          <div class="fname">./demo <span class="acc">&middot;</span> <span style="color:var(--fg-dim);font-size:.78rem">3 files &middot; 8.1 KB</span></div>
          <div class="fsub"><span class="url"><span style="color:var(--accent)">quiet-river-42</span>.vanish.sh/</span><span class="copy-mini">open &#8599;</span></div>
        </div>
        <div class="countdown" id="countdown">
          expires in
          <span class="num" id="cdnum">23:59:54</span>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- MARQUEE -->
<div class="marquee" aria-hidden="true">
  <div class="marquee-track">
    <span>claude code</span><span>codex cli</span><span>cloudflare workers</span><span>r2 + d1</span><span>readable subdomains</span><span>html &middot; md &middot; css &middot; js</span><span>self-hostable</span><span>mit licensed</span>
    <span>claude code</span><span>codex cli</span><span>cloudflare workers</span><span>r2 + d1</span><span>readable subdomains</span><span>html &middot; md &middot; css &middot; js</span><span>self-hostable</span><span>mit licensed</span>
  </div>
</div>

<!-- HOW IT WORKS -->
<section class="section" id="how">
  <div class="wrap">
    <div class="sh">
      <span class="num">01 / how it works</span>
      <h2>Folder in. URL out.</h2>
      <p class="desc">No build step, no transformation, no dashboard. HTML stays HTML. Markdown stays Markdown. CSS, JS, images &mdash; served verbatim from R2. The root file becomes <code style="color:var(--accent)">/</code>.</p>
    </div>

    <div class="steps">
      <div class="step">
        <span class="step-n">step 01 &mdash; generate</span>
        <h3>Let the agent cook</h3>
        <p>Claude Code drops an HTML report. Codex builds a demo. A script exports a stack of Markdown. Whatever lands in a folder.</p>
        <div class="step-cmd"><span class="d">$</span> ls ./demo
<span class="d">&rarr;</span> index.html  styles.css  data.json</div>
      </div>
      <div class="step">
        <span class="step-n">step 02 &mdash; vanish site</span>
        <h3>One command</h3>
        <p>Point at the folder, name the root file. CLI uploads everything to R2, registers a readable subdomain, prints the URL.</p>
        <div class="step-cmd"><span class="p">$</span> vanish site ./demo <span class="d">--root</span> index.html</div>
      </div>
      <div class="step">
        <span class="step-n">step 03 &mdash; share &amp; iterate</span>
        <h3>Update in place</h3>
        <p>Send the URL. Re-run with <code style="color:var(--accent)">--update &lt;id&gt;</code> to swap the contents while keeping the same link. Vanishes on its TTL.</p>
        <div class="step-cmd"><span class="o">https://quiet-river-42.vanish.sh/</span></div>
      </div>
    </div>
  </div>
</section>

<!-- AGENT WORKFLOWS + VANISH GRID -->
<section class="section alt vanish-section" id="vanish">
  <div class="wrap">
    <div class="sh">
      <span class="num">02 / agent workflows</span>
      <h2>Three skills. One distribution channel.</h2>
      <p class="desc">Vanish ships with skill files for coding agents. Plug them in once and the agent picks the right verb on its own &mdash; site, file, or account.</p>
    </div>

    <div class="steps" style="margin-bottom:3rem">
      <div class="step">
        <span class="step-n">skill &middot; publish-site</span>
        <h3>vanish-publish-site</h3>
        <p>For folders, browser demos, static reports, mini-sites. Agent reads the contents, picks a root, calls <code style="color:var(--accent)">vanish site</code>.</p>
        <div class="step-cmd"><span class="p">&rarr;</span> claude code &middot; codex &middot; cline</div>
      </div>
      <div class="step">
        <span class="step-n">skill &middot; upload-files</span>
        <h3>vanish-upload-files</h3>
        <p>For single files: screenshots, PDFs, decks, archives, generated docs. Same agent, different verb. Output as URL, JSON, or markdown.</p>
        <div class="step-cmd"><span class="p">&rarr;</span> any file under tier limits</div>
      </div>
      <div class="step">
        <span class="step-n">skill &middot; connect-upgrade</span>
        <h3>vanish-connect-upgrade</h3>
        <p>Login, quota, retention, custom slugs, API key issues. The skill that runs when something goes wrong, before the agent gives up.</p>
        <div class="step-cmd"><span class="p">&rarr;</span> oauth &middot; billing &middot; troubleshoot</div>
      </div>
    </div>

    <div class="vg-meta">
      <span class="live">live &middot; agent artifacts published last 24h</span>
      <span id="vg-counter">&mdash; in the wild</span>
    </div>
    <div class="vgrid" id="vgrid"></div>
  </div>
</section>

<!-- TIERS -->
<section class="section" id="tiers">
  <div class="wrap">
    <div class="sh">
      <span class="num">03 / tiers</span>
      <h2>Pay for time and slugs. Not files.</h2>
      <p class="desc">Anonymous publishes static sites today. Free covers a workshop. Pro keeps things alive for a month and lets you pick the subdomain.</p>
    </div>

    <div class="tiers">
      <div class="tier">
        <div class="tier-head">
          <span class="tier-name">Anonymous</span>
          <span class="tier-tag">no signup</span>
        </div>
        <div class="tier-price">Free<span class="sub" style="margin-left:.4rem">forever</span></div>
        <ul>
          <li><span class="k">sites</span><span class="v">10 MB &middot; 100 files</span></li>
          <li><span class="k">site URL</span><span class="v">readable random subdomain</span></li>
          <li><span class="k">files</span><span class="v">images only &middot; 5 MB</span></li>
          <li><span class="k">retention</span><span class="v">24 hours</span></li>
          <li><span class="k">rate limit</span><span class="v">10 / hour</span></li>
        </ul>
        <a class="tier-cta ghost" href="#how">Publish a site &rarr;</a>
      </div>

      <div class="tier">
        <div class="tier-head">
          <span class="tier-name">Free</span>
          <span class="tier-tag">github login</span>
        </div>
        <div class="tier-price">Free<span class="sub" style="margin-left:.4rem">with account</span></div>
        <ul>
          <li><span class="k">sites</span><span class="v">500 files &middot; counts to 50 MB</span></li>
          <li><span class="k">site URL</span><span class="v">readable random subdomain</span></li>
          <li><span class="k">files</span><span class="v">all &middot; 50 MB max</span></li>
          <li><span class="k">retention</span><span class="v">48 hours</span></li>
          <li><span class="k">rate limit</span><span class="v">50 / hour</span></li>
        </ul>
        <a class="tier-cta ghost" href="/auth/github">Sign in with GitHub &rarr;</a>
      </div>

      <div class="tier pro">
        <div class="tier-head">
          <span class="tier-name">Pro</span>
          <span class="tier-tag">2 &euro; / month</span>
        </div>
        <div class="tier-price">Custom<span class="sub" style="margin-left:.4rem">slugs &middot; long ttl</span></div>
        <ul>
          <li class="hi"><span class="k">sites</span><span class="v">1 000 files &middot; 1 GB total</span></li>
          <li class="hi"><span class="k">site URL</span><span class="v">custom <code style="color:var(--accent)">--slug</code> *.vanish.sh</span></li>
          <li class="hi"><span class="k">files</span><span class="v">all &middot; 1 GB max</span></li>
          <li class="hi"><span class="k">retention</span><span class="v">30 days &middot; up to 365 with --days</span></li>
          <li class="hi"><span class="k">rate limit</span><span class="v">200 / hour</span></li>
        </ul>
        <a class="tier-cta solid" href="/auth/github">Get Pro &rarr;</a>
      </div>
    </div>
  </div>
</section>

<!-- USE CASES -->
<section class="section alt" id="uses">
  <div class="wrap">
    <div class="sh">
      <span class="num">04 / agent handoff</span>
      <h2>Agent handoff, not generic hosting.</h2>
      <p class="desc">Vanish is the missing distribution channel between an agent finishing a task and a human seeing it. These are the patterns we keep seeing.</p>
    </div>

    <div class="uses">
      <div class="use">
        <span class="use-num">01</span>
        <div>
          <h4>Claude Code drops an HTML report</h4>
          <p>An audit, a UX review, a refactor plan rendered as a real page. Agent calls <code style="color:var(--accent)">vanish site</code>, pastes the URL into the PR &mdash; no need to render Markdown in your reviewer's head.</p>
          <span class="um"><span class="p">$</span> vanish site ./report <span class="d">--root</span> index.html</span>
        </div>
      </div>
      <div class="use">
        <span class="use-num">02</span>
        <div>
          <h4>Codex builds a browser demo</h4>
          <p>Three files, no toolchain. CSS + JS + index.html, served verbatim from R2 with proper MIME types. Updates in place via <code style="color:var(--accent)">--update</code> while you iterate.</p>
          <span class="um"><span class="p">$</span> vanish site ./demo <span class="d">--update</span> k8m2q9z4p1ad</span>
        </div>
      </div>
      <div class="use">
        <span class="use-num">03</span>
        <div>
          <h4>One-off screenshots in PRs</h4>
          <p>Capture region, pipe to vanish, get a markdown link. Same flow as before &mdash; just one of the verbs now, not the whole product.</p>
          <span class="um"><span class="p">$</span> screencapture -i - <span class="d">|</span> vanish - --md</span>
        </div>
      </div>
      <div class="use">
        <span class="use-num">04</span>
        <div>
          <h4>Workshop &amp; demo slugs</h4>
          <p>Pro lets you pin a stable subdomain &mdash; ship a workshop site at <code style="color:var(--accent)">workshop-demo.vanish.sh</code>, push updates between sessions, let it expire when the workshop is over.</p>
          <span class="um"><span class="p">$</span> vanish site ./slides <span class="d">--slug</span> workshop-demo</span>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- API / CODE TABS -->
<section class="section" id="api">
  <div class="wrap">
    <div class="sh">
      <span class="num">05 / api</span>
      <h2>No SDK required.</h2>
      <p class="desc">A single POST for files, a multipart upload for folders. The CLI is sugar over plain HTTP &mdash; works the same from any runtime.</p>
    </div>

    <div class="codecard">
      <div class="tabs" role="tablist">
        <button class="tab active" data-tab="cli">CLI</button>
        <button class="tab" data-tab="curl">cURL</button>
        <button class="tab" data-tab="js">fetch (browser)</button>
        <button class="tab" data-tab="py">Python</button>
      </div>
      <div class="tabbody" id="tabBody">
        <pre id="codeCli"><span class="d"># publish a folder as a mini-site</span>
<span class="p">$</span> vanish site ./demo <span class="f">--root</span> index.html
<span class="s">https://quiet-river-42.vanish.sh/</span>

<span class="d"># pro: pick the subdomain, set retention</span>
<span class="p">$</span> vanish site ./demo <span class="f">--slug</span> workshop-demo <span class="f">--days</span> <span class="k">30</span>
<span class="s">https://workshop-demo.vanish.sh/</span>

<span class="d"># update an existing site in place &mdash; same URL, new bytes</span>
<span class="p">$</span> vanish site ./demo <span class="f">--update</span> k8m2q9z4p1ad

<span class="d"># single file, anonymous</span>
<span class="p">$</span> vanish upload screenshot.png
<span class="s">https://vanish.sh/f/a7xK9mQ2.png</span></pre>

<pre id="codeCurl" hidden><span class="d"># single file</span>
<span class="p">$</span> curl <span class="f">-X POST</span> <span class="f">--data-binary</span> @file.png \\
    <span class="f">-H</span> <span class="u">"X-Filename: file.png"</span> \\
    <span class="f">-H</span> <span class="u">"Authorization: Bearer \$VANISH_KEY"</span> \\
    <span class="u">https://vanish.sh/upload</span>
<span class="s">{"url":"https://vanish.sh/f/b3kL8nR4.png","expires":"2026-05-17T..."}</span>

<span class="d"># site as multipart &mdash; one part per file, X-Root for /</span>
<span class="p">$</span> curl <span class="f">-X POST</span> <span class="u">https://vanish.sh/sites</span> \\
    <span class="f">-H</span> <span class="u">"Authorization: Bearer \$VANISH_KEY"</span> \\
    <span class="f">-H</span> <span class="u">"X-Root: index.html"</span> \\
    <span class="f">-F</span> <span class="u">"index.html=@./demo/index.html"</span> \\
    <span class="f">-F</span> <span class="u">"styles.css=@./demo/styles.css"</span>
<span class="s">{"url":"https://quiet-river-42.vanish.sh/","id":"k8m2q9z4p1ad","fileCount":2}</span></pre>

<pre id="codeJs" hidden><span class="k">const</span> upload = <span class="k">async</span> (file) =&gt; {
  <span class="k">const</span> res = <span class="k">await</span> <span class="f">fetch</span>(<span class="u">"https://vanish.sh/upload"</span>, {
    method:  <span class="u">"POST"</span>,
    headers: { <span class="u">"X-Filename"</span>: file.name },
    body:    file
  });
  <span class="k">return</span> (<span class="k">await</span> res.<span class="f">json</span>()).url;
};

<span class="d">// drop a file from a &lt;input type="file"&gt;</span>
<span class="f">upload</span>(input.files[<span class="k">0</span>]).<span class="f">then</span>(console.log);</pre>

<pre id="codePy" hidden><span class="k">import</span> requests, sys, os, pathlib

p = pathlib.<span class="f">Path</span>(sys.argv[<span class="k">1</span>])
r = requests.<span class="f">post</span>(
    <span class="u">"https://vanish.sh/upload"</span>,
    data    = p.<span class="f">read_bytes</span>(),
    headers = {
        <span class="u">"X-Filename"</span>:    p.name,
        <span class="u">"Authorization"</span>: <span class="u">f"Bearer {os.environ['VANISH_KEY']}"</span>,
    },
)
<span class="f">print</span>(r.<span class="f">json</span>()[<span class="u">"url"</span>])</pre>
      </div>
    </div>
  </div>
</section>

<!-- SELF HOST -->
<section class="section alt" id="selfhost">
  <div class="wrap selfhost">
    <div>
      <div class="sh" style="margin-bottom:1.6rem">
        <span class="num">06 / self-host</span>
        <h2>Run your own.</h2>
      </div>
      <p>The whole stack fits on Cloudflare's free tier. Workers run the API and serve mini-sites, R2 holds the bytes (zero egress), D1 holds metadata, a cron handles cleanup. Route <code style="color:var(--accent);background:var(--bg-card);padding:.1em .35em;border:1px solid var(--border);border-radius:3px">*.your-domain</code> to the Worker for subdomain URLs.</p>
      <p class="dim">Set <code style="color:var(--accent)">SELF_HOSTED=true</code> and every authenticated user gets Pro limits &mdash; no billing surface. MIT licensed.</p>

      <div style="display:flex;gap:.6rem;margin-top:1.6rem;flex-wrap:wrap">
        <a class="tier-cta ghost" style="margin-top:0;padding:.65rem 1rem" href="https://github.com/The-Vibe-Company/vanish">View on GitHub &rarr;</a>
        <a class="tier-cta ghost" style="margin-top:0;padding:.65rem 1rem;color:var(--fg-dim)" href="#how">Read the docs</a>
      </div>
    </div>

    <div class="stack">
      <div class="stack-item"><span class="l">Runtime</span><span class="v">Cloudflare <span class="acc">Workers</span></span></div>
      <div class="stack-item"><span class="l">Storage</span><span class="v">R2 <span class="acc">&middot;</span> 10 GB free</span></div>
      <div class="stack-item"><span class="l">Database</span><span class="v">D1 <span class="acc">SQLite</span></span></div>
      <div class="stack-item"><span class="l">Framework</span><span class="v">Hono</span></div>
      <div class="stack-item"><span class="l">Auth</span><span class="v">GitHub <span class="acc">OAuth</span></span></div>
      <div class="stack-item"><span class="l">Billing</span><span class="v">Stripe <span class="acc">(optional)</span></span></div>
    </div>
  </div>
</section>

<!-- FOOTER -->
<footer>
  <div class="wrap">
    <div class="foot">
      <div>
        <div class="brand">vanish<span class="dot" style="color:var(--accent)">.</span>sh</div>
        <p class="blurb">The distribution channel between your coding agent and the people who need to see what it made.</p>
      </div>
      <div>
        <h5>Product</h5>
        <ul>
          <li><a href="#how">How it works</a></li>
          <li><a href="#tiers">Tiers</a></li>
          <li><a href="#api">API</a></li>
          <li><a href="/dashboard">Dashboard</a></li>
        </ul>
      </div>
      <div>
        <h5>Open Source</h5>
        <ul>
          <li><a href="https://github.com/The-Vibe-Company/vanish">GitHub</a></li>
          <li><a href="#selfhost">Self-host</a></li>
          <li><a href="https://github.com/The-Vibe-Company/vanish/releases">Changelog</a></li>
          <li><a href="https://github.com/The-Vibe-Company/vanish/blob/main/LICENSE">License (MIT)</a></li>
        </ul>
      </div>
      <div>
        <h5>Company</h5>
        <ul>
          <li><a href="#">Privacy</a></li>
          <li><a href="#">Terms</a></li>
          <li><a href="#">Status</a></li>
          <li><a href="mailto:abuse@vanish.sh?subject=Vanish%20abuse%20report">Report abuse</a></li>
          <li><a href="mailto:hi@vanish.sh">Contact</a></li>
        </ul>
      </div>
    </div>
    <div class="foot-bottom">
      <span>&copy; 2026 vanish.sh &mdash; built on a Tuesday</span>
      <span>made by <a href="https://thevibecompany.co">The Vibe Company</a> &middot; <a href="https://github.com/The-Vibe-Company/vanish">github</a></span>
    </div>
  </div>
</footer>

<script>
// -- Live terminal animation in the hero --
(function () {
  var SCENARIOS = [
    [
      { type: 'cmd', text: 'vanish site ./demo --root index.html' },
      { type: 'out', text: '  scanning ./demo …', cls: 't-dim', delay: 250 },
      { type: 'out', text: '  → index.html  styles.css  data.json  (3 files, 8.1 KB)', cls: 't-dim', delay: 350 },
      { type: 'spinner', text: 'uploading to R2…', duration: 1500 },
      { type: 'out', text: '✓ https://quiet-river-42.vanish.sh/', cls: 't-acc' },
      { type: 'out', text: '  copied to clipboard · expires in 24h', cls: 't-dim' },
      { type: 'out', text: '  re-run with --update k8m2q9z4p1ad to swap contents', cls: 't-dim' },
      { type: 'pause', duration: 2200 }
    ],
    [
      { type: 'cmd', text: 'claude code "build me a coverage report" && vanish site ./out' },
      { type: 'out', text: '  ✓ generated index.html, css/, charts/  (12 files)', cls: 't-dim', delay: 600 },
      { type: 'spinner', text: 'publishing 12 files (84 KB)…', duration: 1300 },
      { type: 'out', text: '✓ https://silver-meadow-k9.vanish.sh/', cls: 't-acc' },
      { type: 'out', text: '  paste into your PR description', cls: 't-dim' },
      { type: 'pause', duration: 2000 }
    ],
    [
      { type: 'cmd', text: 'vanish site ./slides --slug workshop-demo --days 30' },
      { type: 'spinner', text: 'uploading slides (4 files, 1.1 MB)…', duration: 1400 },
      { type: 'out', text: '✓ https://workshop-demo.vanish.sh/', cls: 't-acc' },
      { type: 'out', text: '  pro · custom slug · expires Jun 9, 2026', cls: 't-dim' },
      { type: 'pause', duration: 2000 }
    ],
    [
      { type: 'cmd', text: 'screencapture -i - | vanish - --md' },
      { type: 'spinner', text: 'reading 384 KB from stdin…', duration: 900 },
      { type: 'out', text: '✓ ![capture.png](https://vanish.sh/f/c2mP5vX8.png)', cls: 't-acc' },
      { type: 'out', text: '  single-file mode · expires in 24h', cls: 't-dim' },
      { type: 'pause', duration: 1900 }
    ],
    [
      { type: 'cmd', text: 'vanish login' },
      { type: 'out', text: '→ opening github oauth in your browser…', cls: 't-dim', delay: 250 },
      { type: 'out', text: '→ waiting for callback', cls: 't-dim', delay: 700 },
      { type: 'pause', duration: 900 },
      { type: 'out', text: '✓ logged in as @octocat', cls: 't-green' },
      { type: 'out', text: '  api key saved → ~/.config/vanish/config.json', cls: 't-dim' },
      { type: 'out', text: '  tier: free · 500 files / site · 48h retention', cls: 't-dim' },
      { type: 'pause', duration: 2000 }
    ]
  ];

  var SPINNER = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  var body = document.getElementById('termBody');
  var term = document.getElementById('term');
  if (!body || !term) return;

  var paused = false;
  var speedMul = 1;

  term.addEventListener('mouseenter', function () { paused = true; });
  term.addEventListener('mouseleave', function () { paused = false; });

  function wait(ms) {
    ms = ms / speedMul;
    return new Promise(function (resolve) {
      var remaining = ms, last = Date.now();
      (function tick() {
        if (paused) { last = Date.now(); setTimeout(tick, 50); return; }
        var now = Date.now();
        remaining -= (now - last); last = now;
        if (remaining <= 0) resolve(); else setTimeout(tick, Math.min(remaining, 16));
      })();
    });
  }
  function addLine() {
    var l = document.createElement('div'); l.className = 'line';
    body.appendChild(l); body.scrollTop = body.scrollHeight; return l;
  }
  async function typeCmd(text) {
    var line = addLine();
    var p = document.createElement('span'); p.className = 't-prompt'; p.textContent = '$ '; line.appendChild(p);
    var t = document.createElement('span'); t.className = 't-bright'; line.appendChild(t);
    var c = document.createElement('span'); c.className = 'cursor'; line.appendChild(c);
    for (var i = 0; i < text.length; i++) {
      await wait(22 + Math.random() * 40);
      t.textContent += text[i];
      body.scrollTop = body.scrollHeight;
    }
    c.remove();
    await wait(260);
  }
  async function spinner(text, duration) {
    var line = addLine();
    var s = document.createElement('span'); s.className = 't-acc'; s.textContent = SPINNER[0]; line.appendChild(s);
    var t = document.createElement('span'); t.className = 't-bright'; t.textContent = ' ' + text; line.appendChild(t);
    var i = 0;
    var iv = setInterval(function () { if (!paused) { i++; s.textContent = SPINNER[i % SPINNER.length]; } }, 80);
    await wait(duration);
    clearInterval(iv);
    line.remove();
  }
  async function out(text, cls, delay) {
    if (delay) await wait(delay);
    var line = addLine();
    if (text) {
      var sp = document.createElement('span');
      sp.className = cls || 't-bright';
      sp.textContent = text;
      line.appendChild(sp);
    }
  }
  async function clearBody() {
    body.style.transition = 'opacity .35s ease';
    body.style.opacity = '0';
    await wait(350);
    body.innerHTML = '';
    body.style.opacity = '1';
  }
  async function run(steps) {
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i];
      if (s.type === 'cmd') await typeCmd(s.text);
      else if (s.type === 'spinner') await spinner(s.text, s.duration);
      else if (s.type === 'out') await out(s.text, s.cls, s.delay);
      else if (s.type === 'pause') await wait(s.duration);
    }
  }
  (async function loop() {
    var i = 0;
    while (true) {
      await run(SCENARIOS[i]);
      await clearBody();
      i = (i + 1) % SCENARIOS.length;
    }
  })();

  // hero countdown card
  var cd = document.getElementById('cdnum');
  var card = document.getElementById('filecard');
  var wrap = document.getElementById('countdown');
  if (cd && card) {
    var total = 23 * 3600 + 59 * 60 + 54;
    function tick() {
      total -= 1;
      if (total < 0) {
        card.classList.add('gone');
        setTimeout(function () {
          total = 23 * 3600 + 59 * 60 + 54;
          card.classList.remove('gone');
          wrap.classList.remove('warn', 'danger');
        }, 1200);
        return;
      }
      var h = Math.floor(total / 3600);
      var m = Math.floor((total % 3600) / 60);
      var s = total % 60;
      cd.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      if (total < 60) wrap.classList.add('danger');
      else if (total < 3600) wrap.classList.add('warn');
    }
    setInterval(function () { for (var k = 0; k < 60; k++) tick(); }, 200);
  }
})();

// -- "In the wild" vanishing grid --
(function () {
  var grid = document.getElementById('vgrid');
  var counter = document.getElementById('vg-counter');
  if (!grid) return;

  var EXTS = ['png','jpg','pdf','log','json','csv','svg','zip','md','gif','txt','mp4'];
  var WORDS = ['screenshot','capture','demo','build','coverage','flame','export','dump','snapshot','logs','draft','final','v2','retro','sketch','mockup','reset','patch','audit'];
  var ADJ = ['quiet','silver','bright','crimson','forest','rolling','hidden','ancient','rapid','golden','silent','frozen','wild','open','sunset','morning','steady','royal','calm','noble'];
  var NOUN = ['river','meadow','peak','grove','cliff','harbor','canyon','field','ridge','forest','bay','glen','dune','shore','isle','vale','garden','mesa'];
  var SITE_TYPES = ['report','demo','slides','docs','workshop','audit','retro','playground','sandbox','review','briefing'];

  function rand(a) { return a[Math.floor(Math.random() * a.length)]; }
  function num() { return Math.floor(Math.random() * 99) + 1; }

  function siteName() {
    if (Math.random() < .25) {
      return rand(SITE_TYPES) + '-' + rand(WORDS);
    }
    return rand(ADJ) + '-' + rand(NOUN) + '-' + num();
  }
  function fmtTTL(s) {
    if (s <= 0) return '00:00';
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    if (m > 0) return m + 'm ' + String(sec).padStart(2, '0') + 's';
    return sec + 's';
  }

  var COUNT = 36;
  var files = [];

  function makeItem(initial) {
    var ttl = Math.floor(20 + Math.random() * 90);
    var isSite = Math.random() < 0.62;
    var label, badge;
    if (isSite) {
      label = siteName() + '.vanish.sh/';
      badge = 'SITE';
    } else {
      var ext = rand(EXTS);
      label = 'f/' + Math.random().toString(36).slice(2, 10) + '.' + ext;
      badge = ext.toUpperCase();
    }
    var f = { name: label, badge: badge, ttl: ttl, el: null, isSite: isSite };
    var el = document.createElement('div');
    el.className = 'vfile' + (initial ? '' : ' fresh');
    el.innerHTML =
      '<span class="ext"></span><span class="name"></span><span class="ttl"></span>';
    el.querySelector('.ext').textContent = badge.slice(0, 4);
    el.querySelector('.name').textContent = label;
    el.querySelector('.ttl').textContent = fmtTTL(ttl);
    f.el = el;
    return f;
  }

  for (var i = 0; i < COUNT; i++) {
    var f = makeItem(true);
    files.push(f);
    grid.appendChild(f.el);
  }
  if (counter) counter.textContent = files.length + ' artifacts in the wild';

  function tick() {
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      f.ttl -= 1;
      var el = f.el;
      el.querySelector('.ttl').textContent = fmtTTL(Math.max(0, f.ttl));
      el.classList.toggle('warn', f.ttl <= 30 && f.ttl > 10);
      el.classList.toggle('danger', f.ttl <= 10 && f.ttl > 0);
      if (f.ttl <= 0 && !el.classList.contains('gone')) {
        el.classList.add('gone');
        (function (idx) {
          setTimeout(function () {
            var slot = files[idx];
            if (!slot) return;
            var nf = makeItem(false);
            slot.el.replaceWith(nf.el);
            files[idx] = nf;
          }, 950);
        })(i);
      }
    }
  }
  setInterval(tick, 1000);
})();

// -- Misc UI: copy buttons, code tabs, smooth scroll --
(function () {
  document.querySelectorAll('[data-copy]').forEach(function (el) {
    el.addEventListener('click', function () {
      var text = el.getAttribute('data-copy');
      try { navigator.clipboard.writeText(text); } catch (_) {}
      el.classList.add('copied');
      var icon = el.querySelector('.copy-icon');
      if (icon) {
        var orig = icon.textContent;
        icon.textContent = 'copied ✓';
        setTimeout(function () {
          el.classList.remove('copied');
          icon.textContent = orig;
        }, 1400);
      }
    });
  });

  document.querySelectorAll('.copy-mini').forEach(function (el) {
    el.addEventListener('click', function () {
      try { navigator.clipboard.writeText('https://quiet-river-42.vanish.sh/'); } catch (_) {}
      var t = el.textContent;
      el.textContent = 'copied ✓';
      setTimeout(function () { el.textContent = t; }, 1200);
    });
  });

  var tabs = document.querySelectorAll('.tab');
  var map = { cli: 'codeCli', curl: 'codeCurl', js: 'codeJs', py: 'codePy' };
  tabs.forEach(function (t) {
    t.addEventListener('click', function () {
      tabs.forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      Object.keys(map).forEach(function (k) {
        var el = document.getElementById(map[k]);
        if (el) el.hidden = (k !== t.dataset.tab);
      });
    });
  });

  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id.length > 1 && document.querySelector(id)) {
        e.preventDefault();
        var top = document.querySelector(id).getBoundingClientRect().top + window.scrollY - 60;
        window.scrollTo({ top: top, behavior: 'smooth' });
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
