/* ============================================================================
   Addon « Mentions légales & CGV » (site.js) — informations officielles
   ============================================================================
   Remplace le contenu des pages légales du site (mentions, cgv, donnees)
   par les textes officiels du restaurant — sans toucher au moteur (DEX) :
   le contenu est injecté dans le DOM après génération, en conservant les
   identifiants/ancre et le bouton de fermeture d'origine.
   ========================================================================== */
(function () {
  'use strict';

  var MAJ = "Dernière mise à jour : 27 août 2026";
  var TEL_HTML = "<a href='tel:0627213190'>06 27 21 31 90</a>";
  var MAIL_HTML = "<a href='mailto:alexis.coudret@outlook.fr'>alexis.coudret@outlook.fr</a>";

  function pageMentions() {
    return "" +
      "<h2>Mentions légales</h2>" +
      "<p class='maj'>" + MAJ + "</p>" +
      "<h3>Éditeur du site</h3>" +
      "<p><strong>La Trattoria</strong><br>" +
      "Forme juridique : entreprise individuelle<br>" +
      "Capital social : —<br>" +
      "SIRET : 106 050 263 00016<br>" +
      "Adresse : 15 rue de la poste, 17100 Saintes<br>" +
      "Téléphone : " + TEL_HTML + "<br>" +
      "Email : " + MAIL_HTML + "</p>" +
      "<h3>Directeur de la publication</h3>" +
      "<p>Le gérant de La Trattoria.</p>" +
      "<h3>Hébergeur</h3>" +
      "<p>Site hébergé par LWS (Ligne Web Services) — " +
      "<a href='https://www.lws.fr' target='_blank' rel='noopener'>https://www.lws.fr</a>.<br>" +
      "La carte et les commandes sont également servies en local par la tablette " +
      "du restaurant (réseau Wi-Fi du restaurant).</p>" +
      "<h3>Contact</h3>" +
      "<div class='encadre'><p><strong>La Trattoria</strong> — 15 rue de la poste, 17100 Saintes<br>" +
      "Téléphone : " + TEL_HTML + " — Email : " + MAIL_HTML + "</p></div>";
  }

  function pageCgv() {
    return "" +
      "<h2>Conditions générales de vente</h2>" +
      "<p class='maj'>" + MAJ + "</p>" +
      "<p>Les présentes conditions générales de vente (CGV) régissent toutes les commandes " +
      "passées via le site Internet de La Trattoria. Toute commande implique l'acceptation " +
      "pleine et entière des présentes CGV par le client.</p>" +
      "<h3>1. Objet</h3>" +
      "<p>Le site La Trattoria permet aux clients de commander des produits alimentaires " +
      "(pizzas, boissons, desserts) pour une consommation sur place, à emporter ou en " +
      "livraison (lorsque disponible).</p>" +
      "<h3>2. Produits et prix</h3>" +
      "<p>Les produits proposés sont décrits avec leur prix en euros TTC. Les photographies " +
      "des produits sont non contractuelles. La Trattoria se réserve le droit de modifier " +
      "les prix et la carte à tout moment, les produits étant facturés sur la base des " +
      "tarifs en vigueur au moment de la commande.</p>" +
      "<h3>3. Disponibilité</h3>" +
      "<p>Nos produits sont préparés à la commande, dans la limite des stocks disponibles. " +
      "En cas d'indisponibilité temporaire d'un produit, nous nous réservons le droit de " +
      "refuser la commande ou de proposer un produit de substitution équivalent.</p>" +
      "<h3>4. Modes de commande</h3>" +
      "<ul>" +
      "<li><strong>À emporter (Click &amp; Collect)</strong> : le client commande en ligne " +
      "et vient récupérer sa commande au restaurant à l'horaire choisi.</li>" +
      "<li><strong>Sur place</strong> : le client réserve et consomme sur place.</li>" +
      "<li><strong>Livraison</strong> : service disponible dans une zone délimitée " +
      "(lorsque activé).</li>" +
      "</ul>" +
      "<h3>5. Horaires de commande</h3>" +
      "<ul>" +
      "<li>Lundi – Jeudi : 11h30 – 14h30 / 18h30 – 22h30</li>" +
      "<li>Vendredi – Samedi : 11h30 – 14h30 / 18h30 – 23h</li>" +
      "<li>Dimanche : 11h30 – 14h30 / 18h30 – 22h30</li>" +
      "</ul>" +
      "<h3>6. Délai de préparation</h3>" +
      "<p>Le délai moyen de préparation est de 15 à 20 minutes pour les commandes à " +
      "emporter. Ce délai peut varier en fonction de l'affluence. Un créneau horaire de " +
      "retrait est proposé lors de la commande.</p>" +
      "<h3>7. Annulation</h3>" +
      "<p>Toute commande peut être annulée tant qu'elle n'a pas été préparée. Pour annuler " +
      "une commande, contactez-nous au " + TEL_HTML + ". Une commande déjà en préparation " +
      "ou prête ne peut pas être annulée.</p>" +
      "<h3>8. Paiement</h3>" +
      "<ul>" +
      "<li><strong>Sur place</strong> : espèces, carte bancaire, tickets restaurant</li>" +
      "<li><strong>En ligne</strong> : carte bancaire via Stripe (lorsque disponible)</li>" +
      "</ul>" +
      "<p>Les prix indiqués sur le site sont en euros toutes taxes comprises (TTC). Le " +
      "montant total de la commande, incluant les éventuels frais de livraison, est " +
      "indiqué avant la validation de la commande.</p>" +
      "<h3>9. Politique de remboursement</h3>" +
      "<p>Conformément à l'article L. 221-18 du Code de la consommation, le client dispose " +
      "d'un droit de rétractation. Toutefois, conformément à l'article L. 221-28 du même " +
      "code, ce droit ne s'applique pas aux fournitures de denrées alimentaires ou de " +
      "boissons destinées à être consommées sur place ou à emporter.</p>" +
      "<p><strong>Produits non conformes ou défectueux</strong> : si un produit ne " +
      "correspond pas à la commande ou présente un défaut, le client peut en informer La " +
      "Trattoria dans un délai raisonnable (le jour même) au " + TEL_HTML + ". Un " +
      "remboursement ou un produit de remplacement sera proposé après vérification.</p>" +
      "<p><strong>Commande non récupérée</strong> : si le client ne vient pas récupérer sa " +
      "commande à emporter dans un délai raisonnable (30 minutes après l'horaire prévu), " +
      "La Trattoria se réserve le droit de ne pas rembourser la commande, les produits " +
      "étant préparés à la demande et périssables.</p>" +
      "<h3>10. Droit applicable et litiges</h3>" +
      "<p>Les présentes CGV sont soumises au droit français. En cas de litige, une " +
      "solution amiable sera recherchée en priorité. À défaut, le tribunal compétent sera " +
      "celui du ressort de Saintes (17100).</p>" +
      "<p>Conformément à l'article L. 612-1 du Code de la consommation, le client peut " +
      "recourir gratuitement à un médiateur de la consommation en vue de la résolution " +
      "amiable d'un litige.</p>";
  }

  function pageDonnees() {
    return "" +
      "<h2>Données personnelles &amp; cookies</h2>" +
      "<p class='maj'>" + MAJ + "</p>" +
      "<h3>Collecte des données</h3>" +
      "<p>La Trattoria collecte les données personnelles des clients uniquement dans le " +
      "cadre du traitement des commandes (nom, prénom, email, téléphone). Ces données ne " +
      "sont jamais cédées ou vendues à des tiers.</p>" +
      "<h3>Finalité de la collecte</h3>" +
      "<ul>" +
      "<li>Traitement et suivi des commandes</li>" +
      "<li>Contact en cas de problème avec la commande</li>" +
      "<li>Amélioration du service</li>" +
      "</ul>" +
      "<h3>Droit d'accès et de suppression</h3>" +
      "<p>Conformément au RGPD (Règlement Général sur la Protection des Données), le " +
      "client dispose d'un droit d'accès, de modification et de suppression de ses " +
      "données personnelles. Pour exercer ce droit, contactez-nous au " + TEL_HTML +
      " ou par email à " + MAIL_HTML + ".</p>" +
      "<h3>Conservation des données</h3>" +
      "<p>Les données personnelles sont conservées pendant une durée de 3 ans après la " +
      "dernière commande, conformément aux obligations légales de conservation.</p>" +
      "<h3>Cookies</h3>" +
      "<p>Le site La Trattoria utilise des cookies techniques nécessaires au bon " +
      "fonctionnement du site (panier, session utilisateur). Aucun cookie de tracking " +
      "publicitaire n'est utilisé sans consentement.</p>" +
      "<h3>Contact</h3>" +
      "<div class='encadre'><p><strong>La Trattoria</strong> — 15 rue de la poste, " +
      "17100 Saintes — " + TEL_HTML + " — " + MAIL_HTML + "</p></div>";
  }

  var PAGES = { mentions: pageMentions, cgv: pageCgv, donnees: pageDonnees };

  function injecter() {
    if (!document.body) return;
    var main = document.querySelector('main') || document.body;
    Object.keys(PAGES).forEach(function (id) {
      var sec = document.getElementById(id);
      if (!sec) {
        sec = document.createElement('section');
        sec.id = id;
        sec.className = 'legal';
        sec.style.display = 'none';
        main.appendChild(sec);
      }
      // conserver le bouton de fermeture d'origine s'il existe
      var fermer = sec.querySelector('[data-fermer-legal]');
      var fermerHTML = fermer ? fermer.outerHTML
        : "<p style='margin-top:26px'><a href='#' class='btn btn-s' " +
          "data-fermer-legal>&#8592; Retour au site</a></p>";
      sec.innerHTML = "<div class='conteneur'>" + PAGES[id]() + fermerHTML + "</div>";
    });
    // encadré légal dans la section contact
    var contact = document.getElementById('contact');
    var cont = contact && contact.querySelector('.conteneur');
    if (cont && !document.getElementById('encadre-legal-contact')) {
      var enc = document.createElement('div');
      enc.id = 'encadre-legal-contact';
      enc.className = 'encadre';
      enc.style.cssText = 'margin-top:22px;padding:12px 14px;font-size:14px';
      enc.innerHTML =
        "<strong>La Trattoria</strong> — entreprise individuelle — " +
        "SIRET 106 050 263 00016 — 15 rue de la poste, 17100 Saintes<br>" +
        "Contact : " + TEL_HTML + " — " + MAIL_HTML +
        "<br>Mentions légales, conditions de vente et données personnelles : " +
        "liens en bas de page.";
      cont.appendChild(enc);
    }
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', injecter);
  else injecter();
})();
