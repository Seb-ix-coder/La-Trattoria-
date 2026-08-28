package com.trattoria.cartes;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Serveur HTTP local du site clients v2 (port 8721).
 * Sert l'application web responsive v2 et reçoit les commandes via POST /api/commande.
 * Thread par connexion ; démarré/arrêté depuis l'activité.
 */
public class ServeurSite implements Runnable {

    public interface Ecouteur {
        String catalogueJson();               // JSON de la carte
        String etablissementJson();           // {nom, adresse, telephone, promesses, badges}
        String commJson();                    // communications du restaurant (annonces, promos, nouveautés)
        void commandeRecue(JSONObject commande);
        String journal();                     // dernières lignes (debug)
    }

    private final int port;
    private final Ecouteur ecouteur;
    private volatile boolean actif = false;
    private ServerSocket socket;
    private Thread thread;

    public ServeurSite(int port, Ecouteur ecouteur) {
        this.port = port;
        this.ecouteur = ecouteur;
    }

    public boolean estActif() { return actif; }

    public synchronized void demarrer() {
        if (actif) return;
        thread = new Thread(this, "serveur-site");
        thread.setDaemon(true);
        thread.start();
    }

    public synchronized void arreter() {
        actif = false;
        try { if (socket != null) socket.close(); } catch (Exception ignored) { }
    }

    @Override public void run() {
        try {
            socket = new ServerSocket(port);
            actif = true;
            while (actif) {
                final Socket cli = socket.accept();
                new Thread(new Runnable() {
                    public void run() { traiter(cli); }
                }).start();
            }
        } catch (Exception ignored) {
            actif = false;
        }
    }

    private void traiter(Socket cli) {
        try {
            BufferedReader r = new BufferedReader(new InputStreamReader(
                    cli.getInputStream(), StandardCharsets.UTF_8));
            String ligne = r.readLine();
            if (ligne == null) { cli.close(); return; }
            String[] parties = ligne.split(" ");
            if (parties.length < 2) { cli.close(); return; }
            String methode = parties[0];
            String chemin = parties[1];
            int longueur = 0;
            String l;
            while ((l = r.readLine()) != null && !l.isEmpty()) {
                if (l.toLowerCase(Locale.FRENCH).startsWith("content-length:"))
                    longueur = Integer.parseInt(l.substring(15).trim());
            }
            StringBuilder corps = new StringBuilder();
            for (int i = 0; i < longueur; i++)
                corps.append((char) r.read());

            if ("POST".equals(methode) && chemin.startsWith("/api/commande")) {
                String reponse;
                try {
                    JSONObject c = new JSONObject(corps.toString());
                    String ref = "TR-" + ((int) (Math.random() * 900) + 100);
                    c.put("ref", ref);
                    c.put("date", new SimpleDateFormat("yyyy-MM-dd", Locale.FRENCH).format(new Date()));
                    c.put("heure", new SimpleDateFormat("HH:mm", Locale.FRENCH).format(new Date()));
                    c.put("canal", "enligne");
                    c.put("statut", "nouvelle");
                    ecouteur.commandeRecue(c);
                    reponse = "{\"ok\":true,\"ref\":\"" + ref + "\",\"message\":\"Commande n° " + ref + " transmise au restaurant avec succès !\"}";
                } catch (Exception e) {
                    reponse = "{\"ok\":false,\"erreur\":\"" + ech(e.getMessage()) + "\"}";
                }
                envoyer(cli, 200, "application/json; charset=utf-8", reponse);
                return;
            }
            if ("GET".equals(methode) && chemin.startsWith("/api/carte")) {
                envoyer(cli, 200, "application/json; charset=utf-8", ecouteur.catalogueJson());
                return;
            }
            if ("GET".equals(methode) && chemin.startsWith("/api/comm")) {
                envoyer(cli, 200, "application/json; charset=utf-8", ecouteur.commJson());
                return;
            }
            if ("GET".equals(methode) && (chemin.startsWith("/") || chemin.startsWith("/index"))) {
                envoyer(cli, 200, "text/html; charset=utf-8", page());
                return;
            }
            envoyer(cli, 404, "text/plain; charset=utf-8", "introuvable");
        } catch (Exception ignored) {
        } finally {
            try { cli.close(); } catch (Exception ignored) { }
        }
    }

    private void envoyer(Socket cli, int code, String type, String corps) {
        try {
            byte[] b = corps.getBytes(StandardCharsets.UTF_8);
            String entetes = "HTTP/1.1 " + code + " OK\r\n"
                    + "Content-Type: " + type + "\r\n"
                    + "Content-Length: " + b.length + "\r\n"
                    + "Connection: close\r\n"
                    + "Cache-Control: no-store\r\n\r\n";
            cli.getOutputStream().write(entetes.getBytes(StandardCharsets.UTF_8));
            cli.getOutputStream().write(b);
            cli.getOutputStream().flush();
        } catch (Exception ignored) { }
    }

    // ---------- Site Web v2 pour clients ----------
    public String page() {
        StringBuilder h = new StringBuilder();
        h.append("<!DOCTYPE html><html lang='fr'><head><meta charset='utf-8'>")
                .append("<meta name='viewport' content='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'>")
                .append("<title>La Trattoria — Restaurant Italien & Pizzeria · Saintes</title><style>")
                .append(":root{--bordeaux:#8B111B;--rouge:#A51822;--bordeaux-f:#5C0910;--or:#C29B38;--or-clair:#FDF3D7;--vert:#2E7D32;--fond:#F8F6F0;--fond-carte:#FFFFFF;--texte:#2B2B28;--gris:#6E6A63;--trait:#E2DBD0}")
                .append("*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}")
                .append("body{background:var(--fond);color:var(--texte);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.45;padding-bottom:100px}")
                .append("header{background:linear-gradient(135deg,var(--bordeaux-f) 0%,var(--rouge) 100%);color:#fff;text-align:center;padding:24px 16px 18px;box-shadow:0 3px 12px rgba(92,9,16,.25);position:relative}")
                .append(".brand-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;margin-bottom:8px;letter-spacing:.3px}")
                .append("header h1{font-family:Georgia,serif;font-size:27px;font-weight:700;letter-spacing:.5px;margin-bottom:3px}")
                .append("header p{font-size:13px;opacity:.9;margin-bottom:8px}")
                .append(".header-info{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;font-size:12px;opacity:.85;margin-top:6px}")
                .append(".badges-bar{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;padding:10px 14px;background:#EDE8DC;border-bottom:1px solid var(--trait);font-size:12px;font-weight:600;color:#5A544B}")
                .append(".b-item{background:#FAF8F3;border:1px solid var(--trait);padding:3px 8px;border-radius:12px}")
                .append("main{max-width:720px;margin:0 auto;padding:14px 12px}")
                .append(".com-section{margin-bottom:16px}")
                .append(".com-card{background:#FFFBF0;border:1.5px solid var(--or);border-radius:12px;padding:12px 14px;margin-bottom:8px;box-shadow:0 2px 6px rgba(194,155,56,.12);display:flex;gap:10px;align-items:flex-start}")
                .append(".com-badge{font-size:20px;line-height:1;padding-top:2px}")
                .append(".com-body{flex:1}")
                .append(".com-titre{font-weight:700;color:var(--bordeaux);font-size:15px;margin-bottom:2px}")
                .append(".com-texte{font-size:13px;color:#4A443A}")
                .append(".nav-tabs{display:flex;gap:8px;overflow-x:auto;padding:6px 0 12px;scrollbar-width:none;-webkit-overflow-scrolling:touch;position:sticky;top:0;background:var(--fond);z-index:10;border-bottom:1px solid var(--trait);margin-bottom:14px}")
                .append(".nav-tabs::-webkit-scrollbar{display:none}")
                .append(".tab-btn{padding:8px 14px;background:#FFF;border:1px solid var(--trait);border-radius:20px;font-size:13.5px;font-weight:600;color:var(--texte);cursor:pointer;white-space:nowrap;transition:all .15s ease;display:flex;align-items:center;gap:5px}")
                .append(".tab-btn.active{background:var(--bordeaux);border-color:var(--bordeaux);color:#FFF;box-shadow:0 2px 6px rgba(139,17,27,.3)}")
                .append(".search-box{position:relative;margin-bottom:14px}")
                .append(".search-box input{width:100%;padding:10px 14px 10px 38px;border:1px solid var(--trait);border-radius:10px;background:#FFF;font-size:14px;color:var(--texte)}")
                .append(".search-box:before{content:'🔍';position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:14px;opacity:.6}")
                .append(".section-titre{font-family:Georgia,serif;color:var(--bordeaux);font-size:20px;font-weight:700;padding-bottom:6px;border-bottom:2px solid var(--bordeaux);margin:20px 0 10px;display:flex;align-items:center;justify-content:space-between}")
                .append(".section-count{font-size:12px;font-weight:normal;color:var(--gris);font-family:-apple-system,sans-serif}")
                .append(".produits-grille{display:flex;flex-direction:column;gap:8px}")
                .append(".prod-card{background:var(--fond-carte);border:1px solid var(--trait);border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:12px;box-shadow:0 1px 3px rgba(0,0,0,.04);transition:transform .1s ease}")
                .append(".prod-infos{flex:1;min-width:0}")
                .append(".prod-nom{font-size:15px;font-weight:700;color:var(--texte);margin-bottom:3px}")
                .append(".prod-desc{font-size:12.5px;color:var(--gris);line-height:1.35;margin-bottom:4px}")
                .append(".prod-prix{font-size:15px;font-weight:700;color:var(--bordeaux)}")
                .append(".prod-action{display:flex;align-items:center;gap:6px}")
                .append(".btn-qte{width:36px;height:36px;border-radius:8px;border:1px solid var(--trait);background:#FAF8F4;font-size:18px;font-weight:700;color:var(--bordeaux);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .1s}")
                .append(".btn-qte:active{background:#E8E2D6}")
                .append(".btn-qte.plus{background:var(--bordeaux);color:#FFF;border-color:var(--bordeaux)}")
                .append(".btn-qte.plus:active{background:var(--bordeaux-f)}")
                .append(".qte-val{min-width:22px;text-align:center;font-size:15px;font-weight:700;color:var(--texte)}")
                .append(".panier-barre{position:fixed;bottom:0;left:0;right:0;background:#FFF;border-top:1.5px solid var(--trait);box-shadow:0 -4px 16px rgba(0,0,0,.1);padding:10px 14px;display:none;z-index:90}")
                .append(".panier-barre-inner{max-width:720px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px}")
                .append(".panier-totaux{font-size:13px;color:var(--gris)}")
                .append(".panier-totaux b{display:block;font-size:17px;color:var(--bordeaux);font-weight:800}")
                .append(".btn-commander{background:var(--bordeaux);color:#FFF;border:0;border-radius:10px;padding:12px 20px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 3px 8px rgba(139,17,27,.35);transition:background .1s}")
                .append(".btn-commander:active{background:var(--bordeaux-f)}")
                .append(".modal-fond{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100;display:none;align-items:flex-end;justify-content:center}")
                .append(".modal-corps{background:#FFF;width:100%;max-width:640px;max-height:88vh;border-radius:20px 20px 0 0;padding:20px 16px 24px;overflow-y:auto;box-shadow:0 -6px 24px rgba(0,0,0,.25);animation:monter .2s ease-out}")
                .append("@keyframes monter{from{transform:translateY(100%)}to{transform:translateY(0)}}")
                .append(".modal-titre{font-family:Georgia,serif;font-size:21px;font-weight:700;color:var(--bordeaux);margin-bottom:14px;display:flex;justify-content:space-between;align-items:center}")
                .append(".modal-fermer{background:none;border:0;font-size:24px;color:var(--gris);cursor:pointer;padding:4px 8px}")
                .append(".panier-liste{border:1px solid var(--trait);border-radius:10px;background:#FAF8F4;padding:10px 12px;margin-bottom:16px}")
                .append(".panier-ligne{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px dotted var(--trait);font-size:14px}")
                .append(".panier-ligne:last-child{border-bottom:0}")
                .append(".type-retrait{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}")
                .append(".type-btn{padding:10px;border:1.5px solid var(--trait);border-radius:10px;background:#FFF;font-size:13.5px;font-weight:600;text-align:center;cursor:pointer;color:var(--texte)}")
                .append(".type-btn.active{border-color:var(--bordeaux);background:var(--or-clair);color:var(--bordeaux)}")
                .append(".form-groupe{margin-bottom:12px}")
                .append(".form-groupe label{display:block;font-size:13px;font-weight:600;color:var(--texte);margin-bottom:4px}")
                .append(".form-groupe input,.form-groupe select,.form-groupe textarea{width:100%;padding:10px 12px;font-size:14px;border:1px solid var(--trait);border-radius:8px;background:#FFF;color:var(--texte)}")
                .append(".btn-valider{width:100%;background:var(--bordeaux);color:#FFF;border:0;border-radius:10px;padding:14px;font-size:16px;font-weight:700;cursor:pointer;margin-top:14px;box-shadow:0 3px 10px rgba(139,17,27,.35)}")
                .append(".confirmation-card{background:#E8F5E9;border:1.5px solid var(--vert);border-radius:14px;padding:20px 16px;text-align:center;margin:16px 0;display:none}")
                .append(".confirmation-card h3{color:var(--vert);font-size:20px;margin-bottom:6px}")
                .append(".confirmation-ref{display:inline-block;background:#FFF;border:1.5px dashed var(--vert);color:var(--vert);font-weight:800;font-size:18px;padding:6px 14px;border-radius:8px;margin:10px 0}")
                .append("footer{text-align:center;color:var(--gris);font-size:12px;padding:26px 16px 14px;line-height:1.6}")
                .append("</style></head><body>")
                .append("<header>")
                .append("<div class='brand-badge'>🇮🇹 RESTAURANT & PIZZERIA ITALIENNE</div>")
                .append("<h1>La Trattoria</h1>")
                .append("<p>Cuisine traditionnelle italienne · Pâte maturée 48 h · Fait maison</p>")
                .append("<div class='header-info'>")
                .append("<span>📍 15 rue de la Poste, 17100 Saintes</span>")
                .append("<span>📞 06 27 21 31 90</span>")
                .append("<span>🟢 Commandes en direct</span>")
                .append("</div></header>");

        // Badges d'excellence
        h.append("<div class='badges-bar'>");
        try {
            JSONObject etab = new JSONObject(ecouteur.etablissementJson());
            JSONArray badges = etab.optJSONArray("badges");
            if (badges != null && badges.length() > 0) {
                for (int i = 0; i < badges.length(); i++)
                    h.append("<span class='b-item'>✓ ").append(ech(badges.getString(i))).append("</span>");
            } else {
                h.append("<span class='b-item'>✓ Fait maison</span>")
                 .append("<span class='b-item'>✓ Pâte maturée 48 h</span>")
                 .append("<span class='b-item'>✓ Produits frais</span>")
                 .append("<span class='b-item'>✓ Circuit court</span>");
            }
        } catch (Exception e) {
            h.append("<span class='b-item'>✓ Fait maison</span><span class='b-item'>✓ Pâte maturée 48 h</span>");
        }
        h.append("</div><main>");

        // Communications / Annonces
        try {
            JSONArray comms = new JSONArray(ecouteur.commJson());
            if (comms.length() > 0) {
                h.append("<div class='com-section'>");
                for (int i = 0; i < comms.length(); i++) {
                    JSONObject m = comms.getJSONObject(i);
                    String type = m.optString("type", "info");
                    String icone = "promo".equals(type) ? "🔥" : ("nouveaute".equals(type) ? "🆕" : "📣");
                    String badgeNom = "promo".equals(type) ? "Promotion" : ("nouveaute".equals(type) ? "Nouveauté" : "Annonce");
                    h.append("<div class='com-card'><div class='com-badge'>").append(icone).append("</div>")
                            .append("<div class='com-body'><div class='com-titre'>").append(ech(m.optString("titre", badgeNom))).append("</div>");
                    String tx = m.optString("texte", "");
                    if (!tx.isEmpty()) h.append("<div class='com-texte'>").append(ech(tx)).append("</div>");
                    h.append("</div></div>");
                }
                h.append("</div>");
            }
        } catch (Exception ignored) { }

        // Confirmation de commande (masquée par défaut)
        h.append("<div class='confirmation-card' id='conf-card'>")
                .append("<h3>🎉 Commande transmise avec succès !</h3>")
                .append("<p>Votre commande a été reçue en cuisine et est en cours de traitement.</p>")
                .append("<div class='confirmation-ref' id='conf-ref'>#TR-000</div>")
                .append("<p id='conf-details' style='font-size:13px;color:#2E7D32'></p>")
                .append("<button class='btn-commander' style='margin-top:12px;background:#2E7D32' onclick='nouvelleCommande()'>Passer une autre commande</button>")
                .append("</div>");

        // Barre de recherche
        h.append("<div class='search-box'>")
                .append("<input type='text' id='recherche' placeholder='Rechercher un plat, une boisson, un ingrédient...' oninput='filtrerRecherche()'>")
                .append("</div>");

        // Onglets de catégories
        h.append("<div class='nav-tabs' id='categories-tabs'>");
        h.append("<button class='tab-btn active' onclick='filtrerCat(\"TOUT\", this)'>🍽️ Tous</button>");

        java.util.LinkedHashMap<String, java.util.List<JSONObject>> parFamille = new java.util.LinkedHashMap<>();
        try {
            JSONArray carte = new JSONArray(ecouteur.catalogueJson());
            for (int i = 0; i < carte.length(); i++) {
                JSONObject p = carte.getJSONObject(i);
                if (!p.optBoolean("actif", true)) continue;
                String fam = p.optString("fam", "Divers");
                if (!parFamille.containsKey(fam)) parFamille.put(fam, new java.util.ArrayList<JSONObject>());
                parFamille.get(fam).add(p);
            }
            for (String fam : parFamille.keySet()) {
                String icone = "🍽️";
                String fl = fam.toLowerCase(Locale.FRENCH);
                if (fl.contains("pizza")) icone = "🍕";
                else if (fl.contains("pâte") || fl.contains("pate") || fl.contains("pasta")) icone = "🍝";
                else if (fl.contains("entrée") || fl.contains("entree") || fl.contains("salade") || fl.contains("antipasti")) icone = "🥗";
                else if (fl.contains("plat") || fl.contains("viande") || fl.contains("poisson")) icone = "🥩";
                else if (fl.contains("dessert") || fl.contains("douceur")) icone = "🍰";
                else if (fl.contains("glace")) icone = "🍨";
                else if (fl.contains("boisson") || fl.contains("soft")) icone = "🥤";
                else if (fl.contains("vin") || fl.contains("bière") || fl.contains("alcool")) icone = "🍷";

                h.append("<button class='tab-btn' onclick='filtrerCat(\"").append(echId(fam))
                        .append("\", this)'>").append(icone).append(" ").append(ech(fam))
                        .append(" (").append(parFamille.get(fam).size()).append(")</button>");
            }
        } catch (Exception ignored) { }
        h.append("</div>");

        // Liste des plats par famille
        h.append("<div id='catalogue-conteneur'>");
        for (java.util.Map.Entry<String, java.util.List<JSONObject>> e : parFamille.entrySet()) {
            String fam = e.getKey();
            java.util.List<JSONObject> prods = e.getValue();
            h.append("<div class='famille-bloc' id='fam-").append(echId(fam)).append("'>")
                    .append("<div class='section-titre'><span>").append(ech(fam)).append("</span>")
                    .append("<span class='section-count'>").append(prods.size()).append(" article(s)</span></div>")
                    .append("<div class='produits-grille'>");
            for (JSONObject p : prods) {
                String id = p.optString("id", "p" + Math.random());
                String nom = p.optString("nom", "Plat");
                String desc = p.optString("sous", p.optString("desc", ""));
                double pv = p.optDouble("pv", 0);
                String prixStr = pv > 0 ? String.format(Locale.FRENCH, "%.2f €", pv) : "";
                h.append("<div class='prod-card' data-id='").append(echId(id))
                        .append("' data-nom='").append(ech(nom).toLowerCase(Locale.FRENCH))
                        .append("' data-desc='").append(ech(desc).toLowerCase(Locale.FRENCH)).append("'>")
                        .append("<div class='prod-infos'><div class='prod-nom'>").append(ech(nom)).append("</div>");
                if (!desc.isEmpty())
                    h.append("<div class='prod-desc'>").append(ech(desc)).append("</div>");
                h.append("<div class='prod-prix'>").append(prixStr).append("</div></div>")
                        .append("<div class='prod-action'>")
                        .append("<button class='btn-qte' onclick='retirer(\"").append(echId(id)).append("\")'>−</button>")
                        .append("<span class='qte-val' id='q-").append(echId(id)).append("'>0</span>")
                        .append("<button class='btn-qte plus' onclick='ajouter(\"").append(echId(id)).append("\",\"")
                        .append(ech(nom)).append("\",").append(pv).append(")'>+</button>")
                        .append("</div></div>");
            }
            h.append("</div></div>");
        }
        h.append("</div>");

        // Modal de finalisation de commande
        h.append("<div class='modal-fond' id='modal-commande' onclick='siClicFond(event)'>")
                .append("<div class='modal-corps'>")
                .append("<div class='modal-titre'><span>🛒 Votre Panier</span>")
                .append("<button class='modal-fermer' onclick='fermerModal()'>✕</button></div>")
                .append("<div class='panier-liste' id='modal-panier-liste'></div>")
                .append("<div style='text-align:right;font-size:16px;font-weight:800;color:var(--bordeaux);margin:10px 0 16px'>")
                .append("Total : <span id='modal-total'>0,00 €</span></div>")
                .append("<label style='font-size:13px;font-weight:700;display:block;margin-bottom:6px'>Mode de commande :</label>")
                .append("<div class='type-retrait'>")
                .append("<div class='type-btn active' id='btn-type-emporter' onclick='setType(\"emporter\")'>🥡 À emporter (Retrait)</div>")
                .append("<div class='type-btn' id='btn-type-table' onclick='setType(\"table\")'>🍽️ Sur place (À table)</div>")
                .append("</div>")
                .append("<div class='form-groupe' id='grp-retrait'>")
                .append("<label>Heure de retrait souhaitée :</label>")
                .append("<select id='heure-retrait'>")
                .append("<option value='Dès que possible (~20 min)'>Dès que possible (~20 min)</option>")
                .append("<option value='12h15'>12h15</option><option value='12h30'>12h30</option>")
                .append("<option value='12h45'>12h45</option><option value='13h00'>13h00</option>")
                .append("<option value='13h15'>13h15</option><option value='13h30'>13h30</option>")
                .append("<option value='19h15'>19h15</option><option value='19h30'>19h30</option>")
                .append("<option value='19h45'>19h45</option><option value='20h00'>20h00</option>")
                .append("<option value='20h15'>20h15</option><option value='20h30'>20h30</option>")
                .append("<option value='20h45'>20h45</option><option value='21h00'>21h00</option>")
                .append("</select></div>")
                .append("<div class='form-groupe' id='grp-table' style='display:none'>")
                .append("<label>Numéro de table :</label>")
                .append("<input type='text' id='num-table' placeholder='Ex: Table 4, Terrasse 2'>")
                .append("</div>")
                .append("<div class='form-groupe'>")
                .append("<label>Votre Nom (obligatoire) :</label>")
                .append("<input type='text' id='nom' placeholder='Ex: Alexis Dupont'>")
                .append("</div>")
                .append("<div class='form-groupe'>")
                .append("<label>Téléphone (obligatoire) :</label>")
                .append("<input type='tel' id='tel' placeholder='Ex: 06 12 34 56 78'>")
                .append("</div>")
                .append("<div class='form-groupe'>")
                .append("<label>Remarques particulières ou allergies (optionnel) :</label>")
                .append("<textarea id='notes' rows='2' placeholder='Sans oignon, cuisson bien cuite...'></textarea>")
                .append("</div>")
                .append("<button class='btn-valider' onclick='envoyerCommande()'>Envoyer ma commande au restaurant</button>")
                .append("</div></div>");

        // Barre flottante du panier en bas
        h.append("<div class='panier-barre' id='panier-barre'>")
                .append("<div class='panier-barre-inner'>")
                .append("<div class='panier-totaux'>")
                .append("<span id='panier-nb-articles'>0 article</span>")
                .append("<b id='panier-total-barre'>0,00 €</b>")
                .append("</div>")
                .append("<button class='btn-commander' onclick='ouvrirModal()'>🛒 Voir mon panier</button>")
                .append("</div></div>");

        // Pied de page
        h.append("</main><footer>")
                .append("<b>La Trattoria</b> — 15 rue de la Poste, 17100 Saintes · Tél. 06 27 21 31 90<br>")
                .append("SIRET 106 050 263 00016 · Tous les prix sont indiqués en euros TTC, service compris.<br>")
                .append("Site Web v2 servi en direct par la tablette du restaurant.</footer>");

        // JavaScript interactif
        h.append("<script>")
                .append("var panier={};var typeCmd='emporter';")
                .append("function ajouter(id,nom,pv){panier[id]=panier[id]||{id:id,nom:nom,pv:parseFloat(pv)||0,q:0};panier[id].q++;majUI();}")
                .append("function retirer(id){if(!panier[id])return;panier[id].q--;if(panier[id].q<=0)delete panier[id];majUI();}")
                .append("function calculTotal(){var t=0;for(var k in panier)t+=panier[k].pv*panier[k].q;return t;}")
                .append("function calculArticles(){var n=0;for(var k in panier)n+=panier[k].q;return n;}")
                .append("function majUI(){")
                .append("  var tot=calculTotal();var nb=calculArticles();")
                .append("  var els=document.querySelectorAll('.qte-val');for(var i=0;i<els.length;i++)els[i].textContent='0';")
                .append("  for(var k in panier){var e=document.getElementById('q-'+k);if(e)e.textContent=panier[k].q;}")
                .append("  var barre=document.getElementById('panier-barre');")
                .append("  if(nb>0){barre.style.display='block';")
                .append("    document.getElementById('panier-nb-articles').textContent=nb+(nb>1?' articles':' article');")
                .append("    document.getElementById('panier-total-barre').textContent=tot.toFixed(2).replace('.',',')+' €';")
                .append("  }else{barre.style.display='none';fermerModal();}")
                .append("}")
                .append("function filtrerCat(fam, btn){")
                .append("  var btns=document.querySelectorAll('.tab-btn');btns.forEach(function(b){b.classList.remove('active');});")
                .append("  btn.classList.add('active');")
                .append("  var blocs=document.querySelectorAll('.famille-bloc');")
                .append("  blocs.forEach(function(bl){")
                .append("    if(fam==='TOUT'||bl.id==='fam-'+fam)bl.style.display='block';else bl.style.display='none';")
                .append("  });")
                .append("}")
                .append("function filtrerRecherche(){")
                .append("  var q=document.getElementById('recherche').value.trim().toLowerCase();")
                .append("  var prods=document.querySelectorAll('.prod-card');")
                .append("  prods.forEach(function(p){")
                .append("    var nom=p.getAttribute('data-nom')||'';var desc=p.getAttribute('data-desc')||'';")
                .append("    if(!q||nom.indexOf(q)!==-1||desc.indexOf(q)!==-1)p.style.display='flex';else p.style.display='none';")
                .append("  });")
                .append("}")
                .append("function setType(t){typeCmd=t;")
                .append("  document.getElementById('btn-type-emporter').classList.toggle('active',t==='emporter');")
                .append("  document.getElementById('btn-type-table').classList.toggle('active',t==='table');")
                .append("  document.getElementById('grp-retrait').style.display=t==='emporter'?'block':'none';")
                .append("  document.getElementById('grp-table').style.display=t==='table'?'block':'none';")
                .append("}")
                .append("function ouvrirModal(){")
                .append("  var nb=calculArticles();if(nb===0){alert('Votre panier est vide');return;}")
                .append("  var cont=document.getElementById('modal-panier-liste');cont.innerHTML='';")
                .append("  for(var k in panier){")
                .append("    var it=panier[k];var l=document.createElement('div');l.className='panier-ligne';")
                .append("    l.innerHTML='<div style=\"flex:1\"><b>'+it.nom+'</b><div style=\"font-size:12px;color:#6E6A63\">'+it.pv.toFixed(2).replace('.',',')+' € / u</div></div>'+")
                .append("      '<div style=\"display:flex;align-items:center;gap:6px\">'+")
                .append("      '<button class=\"btn-qte\" onclick=\"retirer(\\''+it.id+'\\');ouvrirModal()\">−</button>'+")
                .append("      '<b style=\"min-width:20px;text-align:center\">'+it.q+'</b>'+")
                .append("      '<button class=\"btn-qte plus\" onclick=\"ajouter(\\''+it.id+'\\',\\''+it.nom.replace(/'/g,\"\\\\'\")+'\\','+it.pv+');ouvrirModal()\">+</button>'+")
                .append("      '<b style=\"min-width:60px;text-align:right;color:#8B111B\">'+(it.pv*it.q).toFixed(2).replace('.',',')+' €</b></div>';")
                .append("    cont.appendChild(l);")
                .append("  }")
                .append("  document.getElementById('modal-total').textContent=calculTotal().toFixed(2).replace('.',',')+' €';")
                .append("  document.getElementById('modal-commande').style.display='flex';")
                .append("}")
                .append("function fermerModal(){document.getElementById('modal-commande').style.display='none';}")
                .append("function siClicFond(e){if(e.target.id==='modal-commande')fermerModal();}")
                .append("function envoyerCommande(){")
                .append("  var l=[];for(var k in panier)l.push({id:panier[k].id,nom:panier[k].nom,pv:panier[k].pv,q:panier[k].q});")
                .append("  if(!l.length){alert('Votre panier est vide');return;}")
                .append("  var nom=document.getElementById('nom').value.trim();")
                .append("  if(!nom){alert('Veuillez indiquer votre nom');return;}")
                .append("  var tel=document.getElementById('tel').value.trim();")
                .append("  if(!tel){alert('Veuillez indiquer votre numéro de téléphone');return;}")
                .append("  var tot=calculTotal();")
                .append("  var payload={client:nom,tel:tel,typeCommande:typeCmd,lignes:l,total:tot,")
                .append("    heureRetrait:typeCmd==='emporter'?document.getElementById('heure-retrait').value:'',")
                .append("    table:typeCmd==='table'?document.getElementById('num-table').value.trim():'',")
                .append("    notes:document.getElementById('notes').value.trim()};")
                .append("  fetch('/api/commande',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})")
                .append("  .then(function(r){return r.json();})")
                .append("  .then(function(res){")
                .append("    if(res.ok){")
                .append("      fermerModal();panier={};majUI();")
                .append("      var card=document.getElementById('conf-card');")
                .append("      document.getElementById('conf-ref').textContent='#'+(res.ref||'TR-OK');")
                .append("      document.getElementById('conf-details').textContent=nom+' · '+tot.toFixed(2).replace('.',',')+' € ('+(typeCmd==='emporter'?'À emporter':'Sur place')+')';")
                .append("      card.style.display='block';")
                .append("      window.scrollTo({top:0,behavior:'smooth'});")
                .append("    }else{alert(res.erreur||'Erreur lors de la commande');}")
                .append("  }).catch(function(err){alert('Serveur injoignable. Vérifiez que vous êtes connecté au Wi-Fi du restaurant.');});")
                .append("}")
                .append("function nouvelleCommande(){document.getElementById('conf-card').style.display='none';}")
                .append("</script></body></html>");
        return h.toString();
    }

    private static String ech(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("'", "&#39;").replace("\"", "&quot;");
    }
    private static String echId(String s) {
        if (s == null) return "";
        return s.replaceAll("[^a-zA-Z0-9_-]", "");
    }
}
