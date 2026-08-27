package com.trattoria.cartes;

import android.content.Context;

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
 * Serveur HTTP local du site clients (port 8721).
 * Sert la page de commande et reçoit les commandes via POST /api/commande.
 * Thread unique par connexion ; démarré/arrêté depuis l'activité.
 */
public class ServeurSite implements Runnable {

    public interface Ecouteur {
        String catalogueJson();               // JSON de la carte
        String etablissementJson();           // {nom, adresse, telephone, promesses}
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
            String methode = ligne.split(" ")[0];
            String chemin = ligne.split(" ")[1];
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
                String reponse = "{\"ok\":true,\"message\":\"Commande transmise au restaurant\"}";
                try {
                    JSONObject c = new JSONObject(corps.toString());
                    c.put("date", new SimpleDateFormat("yyyy-MM-dd", Locale.FRENCH).format(new Date()));
                    c.put("heure", new SimpleDateFormat("HH:mm", Locale.FRENCH).format(new Date()));
                    c.put("canal", "enligne");
                    c.put("statut", "nouvelle");
                    ecouteur.commandeRecue(c);
                } catch (Exception e) {
                    reponse = "{\"ok\":false,\"erreur\":\"" + e.getMessage() + "\"}";
                }
                envoyer(cli, 200, "application/json; charset=utf-8", reponse);
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
                    + "Cache-Control: no-store\r\n\r\n";
            cli.getOutputStream().write(entetes.getBytes(StandardCharsets.UTF_8));
            cli.getOutputStream().write(b);
            cli.getOutputStream().flush();
        } catch (Exception ignored) { }
    }

    // ---------- page clients ----------
    private String page() {
        StringBuilder h = new StringBuilder();
        h.append("<!DOCTYPE html><html lang='fr'><head><meta charset='utf-8'>")
                .append("<meta name='viewport' content='width=device-width, initial-scale=1'>")
                .append("<title>La Trattoria — Commander</title><style>")
                .append("body{margin:0;background:#F4F1EA;color:#2B2B28;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif}")
                .append("header{background:#A51822;color:#fff;text-align:center;padding:22px 14px}")
                .append("header h1{margin:0;font-family:Georgia,serif;font-size:24px}")
                .append("header p{margin:4px 0 0;font-size:13px;opacity:.85}")
                .append("main{max-width:640px;margin:0 auto;padding:16px}")
                .append("h2{color:#7A1018;font-size:19px;border-bottom:2px solid #D8CFC0;padding-bottom:6px}")
                .append(".prod{background:#FDFAF3;border:1px solid #D8CFC0;border-radius:10px;")
                .append("padding:10px 12px;margin:8px 0;display:flex;align-items:center;gap:8px}")
                .append(".prod b{flex:1}.prod span{font-size:12px;color:#6E6A63;display:block}")
                .append("button{font-size:17px;min-width:42px;min-height:42px;border-radius:10px;")
                .append("border:1px solid #D8CFC0;background:#fff;cursor:pointer}")
                .append("input{padding:10px;font-size:15px;border:1px solid #D8CFC0;border-radius:8px;width:100%;box-sizing:border-box;margin:4px 0 10px}")
                .append(".envoyer{width:100%;background:#A51822;color:#fff;font-weight:700;font-size:17px;padding:14px;margin-top:14px}")
                .append(".q{min-width:36px;background:#F4F1EA}")
                .append(".ok{background:#DFF0D8;border:1px solid #4a8a3a;border-radius:10px;padding:12px;margin-top:12px;display:none}")
                .append("footer{text-align:center;color:#6E6A63;font-size:12px;padding:18px}")
                .append("</style></head><body><header><h1>La Trattoria</h1><p>Fait maison — pâte maturée 48 h</p></header><main>");
        try {
            JSONObject etab = new JSONObject(ecouteur.etablissementJson());
            JSONArray badges = etab.optJSONArray("badges");
            if (badges != null && badges.length() > 0) {
                h.append("<p style='text-align:center;color:#8A8A55;font-size:13px'>");
                for (int i = 0; i < badges.length(); i++)
                    h.append(i > 0 ? " · " : "").append(badges.getString(i));
                h.append("</p>");
            }
        } catch (Exception ignored) { }
        h.append("<h2>La carte</h2>");
        try {
            JSONArray carte = new JSONArray(ecouteur.catalogueJson());
            String famCourante = null;
            for (int i = 0; i < carte.length(); i++) {
                org.json.JSONObject p = carte.getJSONObject(i);
                if (!p.optBoolean("actif", true)) continue;
                String fam = p.optString("fam", "Divers");
                if (!fam.equals(famCourante)) {
                    if (famCourante != null) h.append("</div>");
                    famCourante = fam;
                    h.append("<h2>").append(ech(fam)).append("</h2><div id='l-").append(echId(fam)).append("'>");
                }
                double pv = p.optDouble("pv", 0);
                String prix = pv > 0 ? String.format("%.2f €", pv).replace('.', ',') : "";
                h.append("<div class='prod'><div style='flex:1'><b>").append(ech(p.optString("nom", "")))
                        .append("</b><span>").append(ech(p.optString("sous", p.optString("desc", "")))).append("</span></div>")
                        .append("<span style='font-weight:700;color:#7A1018'>").append(prix).append("</span>")
                        .append("<button class='q' onclick='retirer(\"").append(echId(p.optString("id", ""))).append("\",\"")
                        .append(ech(p.optString("nom", ""))).append("\",").append(pv).append(")'>−</button>")
                        .append("<span id='q-").append(echId(p.optString("id", ""))).append("' style='min-width:20px;text-align:center;font-weight:700'>0</span>")
                        .append("<button onclick='ajouter(\"").append(echId(p.optString("id", ""))).append("\",\"")
                        .append(ech(p.optString("nom", ""))).append("\",").append(pv).append(")'>+</button></div>");
            }
            if (famCourante != null) h.append("</div>");
        } catch (Exception ignored) { }
        h.append("<h2>Votre commande</h2>")
                .append("<label>Votre nom</label><input id='nom' placeholder='Nom'>")
                .append("<label>Téléphone</label><input id='tel' placeholder='06 …' inputmode='tel'>")
                .append("<div style='text-align:right;font-weight:700;margin:8px 0'>Total : <span id='total'>0,00 €</span></div>")
                .append("<button class='envoyer' onclick='envoyer()'>Envoyer ma commande</button>")
                .append("<div class='ok' id='conf'>Merci ! Votre commande est transmise au restaurant.</div>")
                .append("<footer>La Trattoria — 15 rue de la Poste, 17100 Saintes — 06 27 21 31 90<br>")
                .append("SIRET 106 050 263 00016 · Prix TTC, service compris</footer>")
                .append("<script>")
                .append("var panier={};")
                .append("function ajouter(id,nom,pv){panier[id]=panier[id]||{nom:nom,pv:pv,q:0};panier[id].q++;dessiner();}")
                .append("function retirer(id){if(!panier[id])return;panier[id].q--;if(panier[id].q<=0)delete panier[id];dessiner();}")
                .append("function total(){var t=0;for(var k in panier)t+=panier[k].pv*panier[k].q;return t;}")
                .append("function dessiner(){var t=0;for(var k in panier){t+=panier[k].pv*panier[k].q;")
                .append("var e=document.getElementById('q-'+k);if(e)e.textContent=panier[k].q;}")
                .append("for(var k in panier){var e=document.getElementById('q-'+k);if(e)e.textContent=panier[k].q;}")
                .append("document.getElementById('total').textContent=t.toFixed(2).replace('.',',')+' €';}")
                .append("function envoyer(){var l=[];for(var k in panier)l.push({id:k,nom:panier[k].nom,pv:panier[k].pv,q:panier[k].q});")
                .append("if(!l.length){alert('Votre panier est vide');return;}")
                .append("var n=document.getElementById('nom').value.trim();")
                .append("if(!n){alert('Indiquez votre nom');return;}")
                .append("fetch('/api/commande',{method:'POST',headers:{'Content-Type':'application/json'},")
                .append("body:JSON.stringify({client:n,tel:document.getElementById('tel').value,lignes:l,total:t.toFixed(2)})})")
                .append(".then(function(r){return r.json();})")
                .append(".then(function(r){if(r.ok){document.getElementById('conf').style.display='block';panier={};dessiner();window.scrollTo(0,0);}")
                .append("else alert(r.erreur||'Erreur');}).catch(function(){alert('Serveur injoignable');});}")
                .append("</script></body></html>");
        return h.toString();
    }

    private static String ech(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("'", "&#39;").replace("\"", "&quot;");
    }
    private static String echId(String s) {
        return ech(s).replace("[^a-zA-Z0-9_-]", "");
    }
}
