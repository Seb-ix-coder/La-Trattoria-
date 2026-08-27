#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Patch carte.js : insertion du module ardoise + raccordements."""
import sys

CHEMIN = 'carte/carte.js'
src = open(CHEMIN, encoding='utf-8').read()
module = open('carte/module-cf.tmp.js', encoding='utf-8').read()

def remplacer(s, vieux, neuf, nom, compte=1):
    n = s.count(vieux)
    if n < compte:
        print('ECHEC %s : %d occurrence(s) de :' % (nom, n))
        print(vieux[:200])
        sys.exit(1)
    return s.replace(vieux, neuf, compte)

# ---- 1. insertion du module avant charger() ----
src = remplacer(src, "  function charger() {",
                module + "\n  function charger() {", 'insertion module')

# ---- 2. sauver() : persistance config ----
src = remplacer(src,
"""    try {
      localStorage.setItem(CLE_STOCK, JSON.stringify(CARTE));
      localStorage.setItem(CLE_ARDOISES, JSON.stringify(ARDOISES));
    } catch (e) {
      toast('Espace de stockage insuffisant — photo trop lourde ?');
    }""",
"""    try {
      localStorage.setItem(CLE_STOCK, JSON.stringify(CARTE));
      localStorage.setItem(CLE_ARDOISES, JSON.stringify(ARDOISES));
      if (CF) localStorage.setItem(CLE_CONFIG, JSON.stringify(CF));
    } catch (e) {
      toast('Espace de stockage insuffisant — photo trop lourde ?');
    }""", 'sauver')

# ---- 3. charger() : charge la config ----
src = remplacer(src,
"""    ARDOISES = ardoisesToutesNormalisees(brutA);
    sauver();""",
"""    ARDOISES = ardoisesToutesNormalisees(brutA);
    configCharger();
    sauver();""", 'charger')

# ---- 4. syncTirer : config depuis le serveur ----
src = remplacer(src,
"""      ARDOISES = ardoisesToutesNormalisees(r.ardoises);
      try {
        localStorage.setItem(CLE_STOCK, JSON.stringify(CARTE));
        localStorage.setItem(CLE_ARDOISES, JSON.stringify(ARDOISES));
      } catch (e) { }""",
"""      ARDOISES = ardoisesToutesNormalisees(r.ardoises);
      CF = configNormalisee(r.config || CF);
      try {
        localStorage.setItem(CLE_STOCK, JSON.stringify(CARTE));
        localStorage.setItem(CLE_ARDOISES, JSON.stringify(ARDOISES));
        localStorage.setItem(CLE_CONFIG, JSON.stringify(CF));
      } catch (e) { }""", 'syncTirer')

# ---- 5. planifierEnvoi : envoie la config ----
src = remplacer(src,
"        body: JSON.stringify({ carte: CARTE, ardoises: ARDOISES })",
"        body: JSON.stringify({ carte: CARTE, ardoises: ARDOISES, config: CF })",
'envoi config')

# ---- 6. exporterJSON : version 4 + config ----
src = remplacer(src,
"""    var paquet = {
      application: 'la-trattoria-carte',
      version: 3,
      exporte: new Date().toISOString(),
      produits: CARTE,
      ardoises: ARDOISES
    };""",
"""    var paquet = {
      application: 'la-trattoria-carte',
      version: 4,
      exporte: new Date().toISOString(),
      produits: CARTE,
      ardoises: ARDOISES,
      config: CF
    };""", 'export')

# ---- 7. importerJSON : lit la config ----
src = remplacer(src,
"        ARDOISES = ardoisesToutesNormalisees(paquet.ardoises || null);",
"""        ARDOISES = ardoisesToutesNormalisees(paquet.ardoises || null);
        CF = configNormalisee(paquet.config || null);""", 'import')

# ---- 8. restaurer : reset config ----
src = remplacer(src,
"""    CARTE = (window.TRATTORIA_CATALOGUE || []).map(produitNormalise);
    ARDOISES = ardoisesDefaut();
    sauver();""",
"""    CARTE = (window.TRATTORIA_CATALOGUE || []).map(produitNormalise);
    ARDOISES = ardoisesDefaut();
    localStorage.removeItem(CLE_CONFIG);
    configCharger();
    sauver();""", 'restaurer')

# ---- 9. ouvrirFiche : brouillon photo ardoise + champ sous-titre ----
src = remplacer(src,
"""    EN_EDITION = p ? p.id : null;
    PHOTO_BROUILLON = p ? p.photo : null;

    $('#fiche-titre').textContent = p ? p.nom : 'Nouveau produit';
    $('#f-nom').value = p ? p.nom : '';""",
"""    EN_EDITION = p ? p.id : null;
    PHOTO_BROUILLON = p ? p.photo : null;
    PHOTO_ARDOISE_BROUILLON = p ? (p.photoArdoise || null) : null;
    majBoutonsPhotoArdoise();

    $('#fiche-titre').textContent = p ? p.nom : 'Nouveau produit';
    $('#f-nom').value = p ? p.nom : '';
    $('#f-sous').value = p ? (p.sous || '') : '';""", 'ouvrirFiche')

# ---- 10. majBoutonsPhotoArdoise après majApercuPhoto ----
src = remplacer(src,
"""    } else {
      img.removeAttribute('src');
      img.hidden = true;
      $('#sans-photo').hidden = false;
      $('#btn-photo-retirer').hidden = true;
    }
  }""",
"""    } else {
      img.removeAttribute('src');
      img.hidden = true;
      $('#sans-photo').hidden = false;
      $('#btn-photo-retirer').hidden = true;
    }
  }

  function majBoutonsPhotoArdoise() {
    var retire = $('#btn-photo-ardoise-retirer');
    if (retire) retire.hidden = !PHOTO_ARDOISE_BROUILLON;
  }""", 'majBoutonsPhotoArdoise')

# ---- 11. enregistrer : sous-titre + photo ardoise ----
src = remplacer(src,
"""      actif: $('#f-actif').checked,
      photo: PHOTO_BROUILLON,
      margeManuelle:""",
"""      actif: $('#f-actif').checked,
      photo: PHOTO_BROUILLON,
      sous: String($('#f-sous').value || '').trim().slice(0, 90),
      photoArdoise: PHOTO_ARDOISE_BROUILLON,
      margeManuelle:""", 'enregistrer')

# ---- 12. montrer() : écran ardoise ----
src = remplacer(src,
"""    ['carte', 'ardoises', 'marges', 'donnees'].forEach(function (nom) {
      $('#ecran-' + nom).hidden = nom !== ecran;
    });""",
"""    ['carte', 'ardoises', 'ardoise', 'marges', 'donnees'].forEach(function (nom) {
      $('#ecran-' + nom).hidden = nom !== ecran;
    });""", 'montrer ecrans')

src = remplacer(src,
"""    window.scrollTo(0, 0);
  }

  // ==========================================================
  //  Démarrage
  // ==========================================================""",
"""    if (ecran === 'ardoise') { dessinerCF(); dessinerQR(); }
    window.scrollTo(0, 0);
  }

  // ==========================================================
  //  Démarrage
  // ==========================================================""", 'montrer dessin')

# ---- 13. toutDessiner ----
src = remplacer(src,
"""  function toutDessiner() {
    dessinerCarte();
    dessinerMarges();
    dessinerArdoises();
  }""",
"""  function toutDessiner() {
    dessinerCarte();
    dessinerMarges();
    dessinerArdoises();
    dessinerCF();
  }""", 'toutDessiner')

# ---- 14. clics : ardoise + nouveaux boutons ----
src = remplacer(src,
"""      var onglet = t.closest('.onglet');
      if (onglet) { montrer(onglet.dataset.ecran); return; }""",
"""      var onglet = t.closest('.onglet');
      if (onglet) { montrer(onglet.dataset.ecran); return; }

      if (clicArdoise(t)) return;

      if (t.closest('#btn-ouvrir-ardoise')) { ouvrirArdoise(); return; }
      if (t.closest('#btn-imprimer-ardoise')) { ouvrirArdoise(); return; }
      if (t.closest('#btn-reinit-cf')) {
        if (confirm('Réinitialiser titres, sous-titres, lignes libres et ordre ?')) {
          localStorage.removeItem(CLE_CONFIG);
          CF = configNormalisee(null);
          sauver();
          dessinerCF();
          dessinerQR();
          toast('Ardoise réinitialisée');
        }
        return;
      }
      if (t.closest('#btn-qr-maj')) {
        var v = String($('#champ-site').value || '').trim();
        if (!v) { toast('Indiquez une adresse (URL) pour le QR'); return; }
        CF.site = v;
        sauver();
        dessinerQR();
        toast('QR mis à jour : ' + CF.site);
        return;
      }""", 'clics boutons')

src = remplacer(src,
"""      if (t.closest('#btn-photo')) { $('#champ-photo').click(); return; }
      if (t.closest('#btn-photo-retirer')) { PHOTO_BROUILLON = null; majApercuPhoto(); return; }""",
"""      if (t.closest('#btn-photo')) { $('#champ-photo').click(); return; }
      if (t.closest('#btn-photo-retirer')) { PHOTO_BROUILLON = null; majApercuPhoto(); return; }
      if (t.closest('#btn-photo-ardoise')) { $('#champ-photo-ardoise').click(); return; }
      if (t.closest('#btn-photo-ardoise-retirer')) {
        PHOTO_ARDOISE_BROUILLON = null;
        majBoutonsPhotoArdoise();
        return;
      }""", 'clics photos')

# ---- 15. change : champ photo ardoise ----
src = remplacer(src,
"""      if (e.target.id === 'champ-photo') {
        chargerPhoto(e.target.files[0]);
        e.target.value = '';
      }""",
"""      if (e.target.id === 'champ-photo') {
        chargerPhoto(e.target.files[0]);
        e.target.value = '';
      }
      if (e.target.id === 'champ-photo-ardoise') {
        if (e.target.files[0]) photoArdoiseChoisie(e.target.files[0]);
        e.target.value = '';
      }""", 'change photo ardoise')

# ---- 16. Escape ferme l'ardoise ----
src = remplacer(src,
"""      if (!$('#fiche').hidden) fermerFiche();
      else if (!$('#cueillette').hidden) fermerCueillette();
      else if (!$('#apercu').hidden) fermerApercu();""",
"""      if (document.getElementById('ardoise-overlay')) { fermerArdoise(); return; }
      if (!$('#fiche').hidden) fermerFiche();
      else if (!$('#cueillette').hidden) fermerCueillette();
      else if (!$('#apercu').hidden) fermerApercu();""", 'escape')

# ---- 17. exports tests ----
src = remplacer(src,
"""  window.GestionCarte = {
    carte: function () { return CARTE; },
    ardoises: function () { return ARDOISES; },""",
"""  window.GestionCarte = {
    carte: function () { return CARTE; },
    ardoises: function () { return ARDOISES; },
    config: function () { return CF; },
    htmlArdoise: htmlArdoise,
    itemsFamille: itemsFamille,""", 'exports')

open(CHEMIN, 'w', encoding='utf-8').write(src)
print('Tous les patchs appliqués —', len(src), 'octets')
