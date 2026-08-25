#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
integrer_carte.py — Intégration du module « carte/ » dans l'APK durci
=====================================================================

Produit l'application unifiée : l'application tablette (serveur local
port 8720, caisse + site public + module social) sert désormais aussi
le module de gestion de la carte (dossier carte/ du dépôt, PWA
autonome/hors ligne).

Principe (aucune chirurgie DEX, aucune recompilation)
-----------------------------------------------------
Le site client de l'application est UNE SEULE page HTML produite par
le DEX (Site.page) avec les assets site.css / site.js INCLUS en
ligne. L'asset site.js est donc le seul point d'intégration possible
sans toucher au bytecode :

  * le module carte (index.html + carte.css + carte.js + donnees.js +
    icônes) est assemblé en un document HTML autonome — CSS/JS inclus,
    icônes en data URI, manifest et liens public.html neutralisés —
    puis encodé en base64 ;
  * un addon JS est ajouté à la fin de site.js :
      - mode « ?carte » : le module s'ouvre en plein écran dans une
        iframe blob: (même origine que la page → le localStorage du
        module fonctionne ; sa synchro tablettes, inapplicable dans un
        blob, bascule automatiquement en mode autonome) ;
      - un bouton flottant « 📋 » (mode personnel uniquement — absent
        en modes client/partenaire du module social) l'ouvre, au-dessus
        du bouton ⚙ Outils ;
  * le module social (appeler + avis Google/Facebook/Tripadvisor,
    modes ?client / ?partenaire) est déjà présent dans le build 11.2 :
    il est conservé tel quel (vérifié par verify) ;
  * versionCode 17 → 18, versionName "11.2" → "11.3" (remplacement
    en place, même longueur — aucun décalage d'offset) ;
  * reconstruction ZIP + signatures v1/v2 avec l'outillage existant
    (resign.py).

Usage :
  python3 build/integrer_carte.py SRC_APK CARTE_DIR KEYSTORE.p12 MOT_DE_PASSE OUT_APK
"""

import base64
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from patch_axml import AXML  # noqa: E402


def read(path: str) -> str:
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def readb(path: str) -> bytes:
    with open(path, 'rb') as f:
        return f.read()


# ---------------------------------------------------------------------------
#  1. Assemblage du module carte en document HTML autonome
# ---------------------------------------------------------------------------
def assembler_module(carte_dir: str) -> bytes:
    html = read(os.path.join(carte_dir, 'index.html'))
    css = read(os.path.join(carte_dir, 'carte.css'))
    js_donnees = read(os.path.join(carte_dir, 'donnees.js'))
    js_carte = read(os.path.join(carte_dir, 'carte.js'))
    ic180 = base64.b64encode(
        readb(os.path.join(carte_dir, 'icones', 'icone-180.png'))).decode()
    ic192 = base64.b64encode(
        readb(os.path.join(carte_dir, 'icones', 'icone-192.png'))).decode()

    def doit(old: str, new: str) -> None:
        nonlocal html
        if old not in html:
            raise SystemExit('référence introuvable dans index.html : %r' % old)
        html = html.replace(old, new)

    # PWA : inutile en embedded (pas d'URL propre pour manifest/SW)
    doit('<link rel="manifest" href="manifest.webmanifest">', '')
    # icônes → data URI
    doit('<link rel="apple-touch-icon" href="icones/icone-180.png">',
         '<link rel="apple-touch-icon" href="data:image/png;base64,%s">' % ic180)
    doit('<link rel="icon" type="image/png" href="icones/icone-192.png">',
         '<link rel="icon" type="image/png" href="data:image/png;base64,%s">' % ic192)
    # CSS/JS → inclus en ligne
    doit('<link rel="stylesheet" href="carte.css">',
         '<style>\n' + css + '\n</style>')
    # sécurité (aucun </script> attendu, mais on protège)
    js_donnees = js_donnees.replace('</script>', '<\\/script>')
    js_carte = js_carte.replace('</script>', '<\\/script>')
    doit('<script src="donnees.js"></script>',
         '<script>\n' + js_donnees + '\n</script>')
    doit('<script src="carte.js"></script>',
         '<script>\n' + js_carte + '\n</script>')
    # page publique : inutilisable en embedded (pas de route dédiée)
    html = html.replace('href="public.html"', 'href="#"')

    # contrôle : aucune référence de fichier relative ne doit rester
    # (le HTML seul — les blocs <script>/<style> sont du code, pas du HTML)
    import re
    html_sans_code = re.sub(r'<script[\s\S]*?</script>', '', html)
    html_sans_code = re.sub(r'<style[\s\S]*?</style>', '', html_sans_code)
    for m in re.finditer(r'(?:href|src)="([^"]+)"', html_sans_code):
        ref = m.group(1)
        if not (ref.startswith(('http', 'data:', '#', 'tel:', 'mailto:'))
                or ref == ''):
            raise SystemExit('référence relative restante : %r' % ref)
    return html.encode('utf-8')


# ---------------------------------------------------------------------------
#  2. Addon JS ajouté à la fin de site.js
# ---------------------------------------------------------------------------
ADDON_TEMPLATE = '''
/* ============================================================================
   Addon « Module carte du jour » (site.js) — build unifié 11.3
   ============================================================================
   Intègre le module PWA « carte/ » (dossier carte/ du dépôt GitHub)
   dans l'application tablette :

     http://<tablette>:8720/?carte  →  module en plein écran
     + bouton flottant « 📋 » (mode personnel uniquement, au-dessus du
       bouton ⚙ Outils) qui l'ouvre.

   Le module est livré en un document HTML autonome (CSS, JS et icônes
   inclus), encodé en base64 ci-dessous, chargé dans une iframe blob:
   (même origine que la page → le stockage local du module fonctionne
   normalement ; sa synchro tablette, inapplicable ici, se met
   automatiquement en mode autonome).
   ========================================================================== */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var BUNDLE_B64 = '__BUNDLE_B64__';

  function decodB64(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8').decode(bytes);
    }
    return decodeURIComponent(escape(bin));
  }

  function ouvrirModule() {
    if (document.getElementById('lt-carte-iframe')) return;
    var html = decodB64(BUNDLE_B64);
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var fr = document.createElement('iframe');
    fr.id = 'lt-carte-iframe';
    fr.title = 'Gestion de la carte';
    fr.src = URL.createObjectURL(blob);
    fr.style.cssText = 'position:fixed;left:0;top:0;width:100vw;' +
      'height:100vh;border:0;z-index:2147483647;background:#F4F1EA;';
    document.documentElement.style.overflow = 'hidden';
    document.body.appendChild(fr);
  }

  function enModeCarte() {
    // ?carte dans la QUERY uniquement (le hash #carte est un ancre du menu)
    return (location.search || '').indexOf('carte') >= 0;
  }

  function styleBouton() {
    if (document.getElementById('lt-carte-style')) return;
    var st = document.createElement('style');
    st.id = 'lt-carte-style';
    st.textContent =
      '#btn-carte{position:fixed;left:16px;bottom:154px;z-index:110;' +
      'width:58px;height:58px;border-radius:50%;border:1.5px solid var(--trait,#D8CFC0);' +
      'cursor:pointer;background:var(--creme,#FDFAF3);color:var(--rouge,#A51822);' +
      'display:flex;align-items:center;justify-content:center;' +
      'font-size:22px;line-height:1;box-shadow:0 4px 14px rgba(0,0,0,.28);' +
      'touch-action:manipulation;-webkit-tap-highlight-color:transparent}' +
      '@supports(padding:max(0px)){#btn-carte{left:max(16px,env(safe-area-inset-left));' +
      'bottom:calc(max(16px,env(safe-area-inset-bottom)) + 136px)}}' +
      '#btn-carte:active{transform:scale(.94)}' +
      '#btn-carte:focus-visible{outline:3px solid var(--olive,#8A8A55);outline-offset:2px}';
    document.head.appendChild(st);
  }

  function ajouterBouton() {
    if (document.getElementById('btn-carte')) return;
    if (document.body.classList.contains('mode-app')) return; // client/partenaire
    var o = document.getElementById('btn-outils');
    if (!o || !o.parentNode) return;
    var b = document.createElement('button');
    b.id = 'btn-carte';
    b.type = 'button';
    b.setAttribute('aria-label', 'Carte du jour : produits, marges, cartes du jour');
    b.textContent = '\\uD83D\\uDCCB';
    b.addEventListener('click', ouvrirModule);
    o.parentNode.insertBefore(b, o);
  }

  function demarrer() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', demarrer);
      return;
    }
    if (enModeCarte()) { ouvrirModule(); return; }
    if (document.body.classList.contains('mode-app')) return;
    styleBouton();
    ajouterBouton();
    if (!document.getElementById('btn-carte')) setTimeout(demarrer, 300);
  }
  demarrer();
})();
'''


def patcher_site_js(site_js: str, carte_dir: str) -> str:
    module_b64 = base64.b64encode(assembler_module(carte_dir)).decode()
    addon = ADDON_TEMPLATE.replace('__BUNDLE_B64__', module_b64)
    if 'LT_CARTE' in site_js or 'btn-carte' in site_js:
        raise SystemExit('site.js déjà patché (btn-carte présent)')
    if 'barre-sociale' not in site_js:
        print('[ATTENTION] module social (barre-sociale) introuvable — '
              'vérifier le build source')
    return site_js + '\n' + addon


# ---------------------------------------------------------------------------
#  3. Manifeste : versionCode 17 → 18, versionName 11.2 → 11.3
# ---------------------------------------------------------------------------
def patcher_manifest(manifest: bytes) -> bytes:
    axml = AXML(manifest)
    axml.patch_int_attr('manifest', 'versionCode', 18)
    axml.patch_string('11.2', '11.3')
    return axml.data


def main() -> None:
    if len(sys.argv) != 6:
        print(__doc__)
        sys.exit(1)
    src_apk, carte_dir, keystore, password, dst_apk = sys.argv[1:6]

    import zipfile
    with zipfile.ZipFile(src_apk) as z:
        manifest = z.read('AndroidManifest.xml')
        site_js = z.read('assets/site.js').decode('utf-8')

    manifest_out = patcher_manifest(manifest)
    site_js_out = patcher_site_js(site_js, carte_dir)

    work = os.path.join(HERE, 'work')
    os.makedirs(work, exist_ok=True)
    m_path = os.path.join(work, 'manifest_113.xml')
    j_path = os.path.join(work, 'site_js_113.js')
    with open(m_path, 'wb') as f:
        f.write(manifest_out)
    with open(j_path, 'w', encoding='utf-8') as f:
        f.write(site_js_out)

    print('[ok] manifeste patché      : %s (%d octets)' % (m_path, len(manifest_out)))
    print('[ok] site.js patché        : %s (%d octets, +addon carte)' % (j_path, len(site_js_out)))

    # Reconstruction + signatures v1/v2 (outillage existant)
    import subprocess
    r = subprocess.run([
        sys.executable, os.path.join(HERE, 'resign.py'),
        src_apk, keystore, password, dst_apk,
        '--replace=AndroidManifest.xml=' + m_path,
        '--replace=assets/site.js=' + j_path,
    ])
    if r.returncode != 0:
        sys.exit('resign.py a échoué')
    print('[ok] APK unifié signé      : %s' % dst_apk)


if __name__ == '__main__':
    main()
