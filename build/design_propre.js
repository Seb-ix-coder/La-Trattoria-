/* ============================================================================
   Design client « La Trattoria — table claire »
   CSS inline pour conserver l’application autonome, hors ligne et légère.
   ========================================================================== */
(function () {
  'use strict';
  if (typeof document === 'undefined' || document.getElementById('lt-design-propre')) return;
  var style = document.createElement('style');
  style.id = 'lt-design-propre';
  style.textContent = [
    ':root{--lt-ink:#262522;--lt-muted:#756f68;--lt-red:#9f2931;--lt-red-dark:#7e1e26;--lt-olive:#818354;--lt-cream:#faf7f0;--lt-paper:#fffdfa;--lt-line:#e8dfd2;--lt-shadow:0 12px 34px rgba(54,36,24,.10)}',
    'html{background:var(--lt-cream)}body{background:linear-gradient(180deg,#f9f5ed 0,#fffdfa 310px);color:var(--lt-ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.005em}',
    'body:before{content:"LA TRATTORIA  ·  SAINTES";display:block;text-align:center;padding:10px 16px;background:#272522;color:#f8e9cc;letter-spacing:.18em;font:600 10px/1.2 Georgia,serif}',
    '.hero{background:linear-gradient(135deg,#8e222b 0%,#b63b3d 58%,#c05a45 100%);box-shadow:0 8px 28px rgba(104,27,29,.20);border-radius:0 0 28px 28px;overflow:hidden}',
    '.hero .in{max-width:760px;padding:38px 20px 32px;margin:auto}',
    '.hero h1{font:700 clamp(34px,8vw,60px)/.95 Georgia,serif;letter-spacing:-.035em;margin:0;color:#fff8ed}',
    '.hero p{color:#fbe8d5;font-size:15px;margin:12px 0 0;max-width:470px}',
    '.barre-sociale{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px}.bs-btn{display:inline-flex;min-height:38px;align-items:center;padding:0 13px;border:1px solid rgba(255,255,255,.34);border-radius:999px;background:rgba(255,255,255,.13);color:#fff;text-decoration:none;font-size:12px;font-weight:700;backdrop-filter:blur(8px)}.bs-btn:hover{background:rgba(255,255,255,.24)}',
    'main,.conteneur{max-width:760px}.conteneur,main{padding-left:18px;padding-right:18px}',
    '.titre-sec h2,h2{font-family:Georgia,serif;color:var(--lt-red-dark);letter-spacing:-.02em}.titre-sec h2{font-size:30px}',
    '.sep{height:1px;background:var(--lt-line);margin:12px 0 20px}',
    '#carte{padding-top:30px}#carte>h2{font-size:26px;margin:30px 0 12px;padding-bottom:10px;border-bottom:1px solid var(--lt-line)}',
    '.carte-bloc,.prod{background:rgba(255,253,250,.94);border:1px solid var(--lt-line);border-radius:18px;box-shadow:var(--lt-shadow)}',
    '.prod{margin:10px 0;padding:15px 14px;transition:transform .18s ease,box-shadow .18s ease}.prod:active{transform:scale(.985)}.prod b{font-family:Georgia,serif;font-size:17px;color:var(--lt-ink)}.prod span{margin-top:5px;color:var(--lt-muted);line-height:1.45}',
    '.prod .ajouter,.prod button{border:0!important;background:var(--lt-red)!important;color:#fff!important;width:46px;height:46px;border-radius:14px!important;font-size:25px!important;box-shadow:0 5px 12px rgba(159,41,49,.22)}.prod .ajouter:active,.prod button:active{background:var(--lt-red-dark)!important;transform:scale(.94)}',
    '#panier-flot{right:16px!important;bottom:18px!important;border:0!important;border-radius:18px!important;background:#272522!important;box-shadow:0 12px 28px rgba(36,31,25,.28)!important;color:#fff!important;padding:10px 15px!important}',
    '#tiroir .fond,#tiroir .voile{background:rgba(31,25,20,.56)}#tiroir .panneau{border-radius:26px 26px 0 0;border:1px solid var(--lt-line);box-shadow:0 -16px 50px rgba(43,31,20,.2);background:var(--lt-paper)}',
    '#tiroir .fermer{border-radius:12px!important;border:1px solid var(--lt-line)!important;background:var(--lt-cream)!important;color:var(--lt-ink)!important}',
    '.lg-panier{padding:12px 0!important;border-bottom:1px solid var(--lt-line)!important}.lg-panier .nm{font-weight:700}.lg-panier .px{font-weight:800;color:var(--lt-red-dark)}',
    '.creneau{border:1px solid var(--lt-line)!important;border-radius:12px!important;background:#fff!important;color:var(--lt-ink)!important;padding:11px 13px!important;font-weight:700}.creneau[aria-pressed="true"]{background:var(--lt-olive)!important;border-color:var(--lt-olive)!important;color:#fff!important}',
    '#valider,.envoyer,.btn-p{border:0!important;border-radius:14px!important;background:var(--lt-red)!important;color:#fff!important;box-shadow:0 8px 18px rgba(159,41,49,.20);font-weight:800!important}#valider:hover,.envoyer:hover,.btn-p:hover{background:var(--lt-red-dark)!important}',
    'input,textarea,select{border:1px solid var(--lt-line)!important;border-radius:12px!important;background:#fff!important;color:var(--lt-ink)!important;min-height:44px;padding:10px 12px!important}input:focus,textarea:focus,select:focus{outline:3px solid rgba(129,131,84,.24)!important;border-color:var(--lt-olive)!important}',
    'footer{background:#272522!important;color:#ddd1c1!important;margin-top:38px;padding:28px 18px!important}footer a{color:#f2c6a5!important}',
    '.reserver-tel{padding:14px 16px!important;border:1px solid #e7d7c4!important;border-radius:14px!important;background:#fff7ea!important;color:var(--lt-red-dark)!important;font-weight:700}',
    '.monetico-payer-wrap{margin-top:14px;padding:15px;border:1px solid #cfd2b3;border-radius:18px;background:linear-gradient(135deg,#fbfcf2,#fffdfa);box-shadow:0 8px 22px rgba(86,85,46,.09)}.monetico-head{display:flex;gap:10px;align-items:center}.monetico-head strong{display:block;color:#4f552b}.monetico-head small{display:block;margin-top:3px;color:var(--lt-muted)}.monetico-lock{width:32px;height:32px;display:grid;place-items:center;border-radius:10px;background:var(--lt-olive);color:#fff;font-size:16px}.monetico-payer-wrap[hidden]{display:none}.monetico-payer{width:100%;margin-top:10px;border:0;border-radius:13px;background:var(--lt-olive);color:#fff;padding:13px 14px;font-weight:800;font-size:15px}.monetico-payer:disabled{opacity:.65}.monetico-email-label{display:block;margin-top:12px;color:var(--lt-muted);font-size:12px;font-weight:700}.monetico-email{width:100%;box-sizing:border-box;margin-top:5px}.monetico-message{margin:9px 0 0;font-size:12.5px;color:#59602b}.monetico-message.is-error{color:#9f2931}.monetico-message.is-ok{color:#59602b}',
    '@media (min-width:700px){#carte>div{display:grid;grid-template-columns:1fr 1fr;gap:10px}#carte>h2{grid-column:1/-1}.prod{margin:0}.hero .in{padding-top:52px;padding-bottom:44px}}',
    '@media (prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}'
  ].join('');
  document.head.appendChild(style);
})();
