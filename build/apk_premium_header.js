/* APK Premium header — deux niveaux, recherche clavier et navigation tactile. */
(function(){'use strict';
  function initPremiumHeader(){
    if(document.getElementById('lt-premium-header')) return;
    var old=document.querySelector('header');
    var h=document.createElement('header'); h.id='lt-premium-header'; h.className='lt-premium-header';
    h.innerHTML='<div class="lt-head-main"><a class="lt-brand" href="#top" aria-label="La Trattoria, accueil"><span class="lt-mark">LT</span><span><b>La Trattoria</b><small>Maison italienne · Saintes</small></span></a><label class="lt-search"><span aria-hidden="true">⌕</span><input id="lt-search-input" type="search" placeholder="Rechercher dans la carte…" aria-label="Rechercher dans la carte"></label></div><nav class="lt-head-nav" aria-label="Navigation principale"><a href="#top">Accueil</a><a href="#carte">La carte</a><a href="#moment">Du moment</a><a href="#avis">Avis clients</a><a href="#communaute">Communauté</a><a href="#contact">Nous trouver</a></nav>';
    if(old&&old.parentNode) old.parentNode.insertBefore(h,old); else document.body.insertBefore(h,document.body.firstChild);
    var input=document.getElementById('lt-search-input');
    input.addEventListener('input',function(){var q=input.value.toLowerCase().trim();var nodes=document.querySelectorAll('article,.produit,.carte-ligne,[data-produit]');for(var i=0;i<nodes.length;i++){var text=(nodes[i].textContent||'').toLowerCase();nodes[i].style.display=!q||text.indexOf(q)>=0?'':'none';}});
    input.addEventListener('keydown',function(e){if(e.key==='Escape'){input.value='';input.dispatchEvent(new Event('input'));input.blur();}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initPremiumHeader);else initPremiumHeader();
})();
