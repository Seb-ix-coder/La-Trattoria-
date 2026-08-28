package com.trattoria.cartes;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Serveur HTTP local de l'édition unifiée.
 *
 * Il sert la page publique premium, ses assets locaux et une API volontairement
 * bornée au réseau local. L'interface native reste le point d'entrée de
 * l'administration ; le site public partage les données de la carte via le
 * callback Ecouteur. Aucun DEX de l'ancienne application n'est réinjecté.
 *
 * Les commandes et réservations sont enregistrées dans le modèle natif. Les
 * comptes publics, achats identifiés et notes sont conservés séparément dans
 * public-data.json afin de garder une migration lisible et réversible.
 */
public class ServeurSite implements Runnable {

    public interface Ecouteur {
        String catalogueJson();
        String etablissementJson();
        String commJson();
        String momentJson();
        void commandeRecue(JSONObject commande);
        void reservationRecue(JSONObject reservation);
        void partenaireMessage(JSONObject message);
        String journal();
    }

    private static final int MAX_HEADERS = 32 * 1024;
    private static final int MAX_BODY = 1024 * 1024;
    private static final int SOCKET_TIMEOUT_MS = 6000;
    private static final String SESSION_COOKIE = "trattoria_session";

    private final int port;
    private final Ecouteur ecouteur;
    private final Context contexte;
    private final Object etatLock = new Object();
    private final SecureRandom alea = new SecureRandom();
    private final ExecutorService travailleurs = Executors.newFixedThreadPool(8);
    private volatile boolean actif = false;
    private ServerSocket socket;
    private Thread thread;
    private JSONObject publicData;
    private File publicDataFile;

    /** Constructeur conservé pour les intégrations existantes. */
    public ServeurSite(int port, Ecouteur ecouteur) {
        this(port, ecouteur, null);
    }

    public ServeurSite(int port, Ecouteur ecouteur, Context contexte) {
        this.port = port;
        this.ecouteur = ecouteur;
        this.contexte = contexte;
        if (contexte != null) {
            publicDataFile = new File(contexte.getFilesDir(), "public-data.json");
        }
        chargerDonneesPubliques();
    }

    public boolean estActif() { return actif; }

    public synchronized void demarrer() {
        if (actif) return;
        thread = new Thread(this, "serveur-site-unifie");
        thread.setDaemon(true);
        thread.start();
    }

    public synchronized void arreter() {
        actif = false;
        try { if (socket != null) socket.close(); } catch (Exception ignored) { }
        travailleurs.shutdownNow();
    }

    @Override public void run() {
        try {
            socket = new ServerSocket(port);
            socket.setReuseAddress(true);
            actif = true;
            while (actif) {
                final Socket client = socket.accept();
                travailleurs.execute(new Runnable() {
                    @Override public void run() { traiter(client); }
                });
            }
        } catch (Exception ignored) {
            actif = false;
        } finally {
            travailleurs.shutdownNow();
        }
    }

    // ---------------------------------------------------------------------
    // HTTP minimal, borné et compatible Android 5+
    // ---------------------------------------------------------------------
    private static final class Requete {
        String methode;
        String chemin;
        Map<String, String> entetes = new HashMap<String, String>();
        byte[] corps = new byte[0];
    }

    private void traiter(Socket client) {
        try {
            client.setSoTimeout(SOCKET_TIMEOUT_MS);
            Requete req = lireRequete(client);
            if (req == null) return;
            String chemin = req.chemin;
            int q = chemin.indexOf('?');
            String path = q >= 0 ? chemin.substring(0, q) : chemin;
            String query = q >= 0 ? chemin.substring(q + 1) : "";

            if ("GET".equals(req.methode)) {
                traiterGet(client, req, path, query);
            } else if ("POST".equals(req.methode)) {
                traiterPost(client, req, path);
            } else if ("OPTIONS".equals(req.methode)) {
                envoyer(client, 204, "text/plain; charset=utf-8", "");
            } else {
                envoyerJson(client, 405, objetErreur("Méthode non autorisée"));
            }
        } catch (Exception ignored) {
            try { envoyerJson(client, 400, objetErreur("Requête invalide")); } catch (Exception ignored2) { }
        } finally {
            try { client.close(); } catch (Exception ignored) { }
        }
    }

    private Requete lireRequete(Socket client) throws IOException {
        BufferedInputStream in = new BufferedInputStream(client.getInputStream());
        String premiere = lireLigne(in, 8192);
        if (premiere == null || premiere.length() == 0) return null;
        String[] morceaux = premiere.split(" ");
        if (morceaux.length < 2) return null;
        Requete r = new Requete();
        r.methode = morceaux[0].toUpperCase(Locale.US);
        r.chemin = morceaux[1];
        int totalHeaders = premiere.length();
        while (true) {
            String ligne = lireLigne(in, 8192);
            if (ligne == null || ligne.length() == 0) break;
            totalHeaders += ligne.length();
            if (totalHeaders > MAX_HEADERS) throw new IOException("headers trop volumineux");
            int deux = ligne.indexOf(':');
            if (deux > 0) r.entetes.put(ligne.substring(0, deux).trim().toLowerCase(Locale.US), ligne.substring(deux + 1).trim());
        }
        int longueur = 0;
        try { longueur = Integer.parseInt(valeurEntete(r, "content-length", "0")); } catch (Exception ignored) { }
        if (longueur < 0 || longueur > MAX_BODY) throw new IOException("corps trop volumineux");
        if (longueur > 0) {
            r.corps = new byte[longueur];
            int pos = 0;
            while (pos < longueur) {
                int n = in.read(r.corps, pos, longueur - pos);
                if (n < 0) throw new IOException("corps incomplet");
                pos += n;
            }
        }
        return r;
    }

    private static String lireLigne(InputStream in, int max) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int precedent = -1;
        while (b.size() <= max) {
            int x = in.read();
            if (x < 0) return b.size() == 0 ? null : new String(b.toByteArray(), StandardCharsets.ISO_8859_1);
            if (x == '\n') break;
            if (x != '\r') b.write(x);
            precedent = x;
        }
        if (b.size() > max) throw new IOException("ligne trop longue");
        return new String(b.toByteArray(), StandardCharsets.ISO_8859_1);
    }

    private static String valeurEntete(Requete r, String nom, String defaut) {
        String v = r.entetes.get(nom.toLowerCase(Locale.US));
        return v == null ? defaut : v;
    }

    private void traiterGet(Socket client, Requete req, String path, String query) throws Exception {
        if ("/".equals(path) || "/index.html".equals(path) || "/client".equals(path)) {
            envoyer(client, 200, "text/html; charset=utf-8", page());
            return;
        }
        if (path.startsWith("/assets/") && !path.contains("..")) {
            servirAsset(client, path.substring("/assets/".length()));
            return;
        }
        if ("/api/carte".equals(path)) {
            envoyer(client, 200, "application/json; charset=utf-8", safeJson(ecouteur.catalogueJson(), "[]"));
            return;
        }
        if ("/api/communications".equals(path)) {
            envoyer(client, 200, "application/json; charset=utf-8", safeJson(ecouteur.commJson(), "[]"));
            return;
        }
        if ("/api/public/ratings".equals(path)) {
            envoyerJson(client, 200, notesPubliques());
            return;
        }
        if ("/api/public/me".equals(path)) {
            JSONObject u = utilisateurSession(req);
            JSONObject out = new JSONObject();
            out.put("ok", u != null);
            if (u != null) out.put("utilisateur", profilPublic(u));
            envoyerJson(client, 200, out);
            return;
        }
        if ("/site/etat".equals(path)) {
            JSONObject out = new JSONObject();
            out.put("ok", true).put("ouvert", true).put("message", "Service local actif — commandes et réservations transmises à l'équipe.");
            envoyerJson(client, 200, out);
            return;
        }
        if ("/site/ventes".equals(path)) {
            // L'e-reporting complet reste dans l'écran natif, sans exposer de données sensibles publiquement.
            envoyer(client, 200, "application/json; charset=utf-8", "[]");
            return;
        }
        if ("/communaute/".equals(path) || "/communaute".equals(path)) {
            servirAsset(client, "community.html");
            return;
        }
        envoyerJson(client, 404, objetErreur("Ressource introuvable"));
    }

    private void traiterPost(Socket client, Requete req, String path) throws Exception {
        JSONObject d = jsonCorps(req);
        if ("/site/commande".equals(path) || "/api/commande".equals(path)) {
            traiterCommande(client, req, d);
            return;
        }
        if ("/site/reservation".equals(path) || "/api/reservation".equals(path)) {
            traiterReservation(client, d);
            return;
        }
        if ("/partenaire".equals(path) || "/api/partenaire".equals(path)) {
            if (d.optString("de", "").trim().length() < 2 || d.optString("texte", "").trim().length() < 2) {
                envoyerJson(client, 400, objetErreur("Établissement et message requis"));
                return;
            }
            d.put("cree_le", System.currentTimeMillis());
            if (ecouteur != null) ecouteur.partenaireMessage(d);
            envoyerJson(client, 200, new JSONObject().put("ok", true).put("message", "Message transmis au restaurant"));
            return;
        }
        if ("/api/public/auth".equals(path)) {
            traiterAuth(client, req, d);
            return;
        }
        if ("/api/public/rating".equals(path)) {
            traiterNote(client, req, d);
            return;
        }
        envoyerJson(client, 404, objetErreur("Route inconnue"));
    }

    private void traiterCommande(Socket client, Requete req, JSONObject d) throws Exception {
        JSONArray lignes = d.optJSONArray("lignes");
        if (lignes == null || lignes.length() == 0 || lignes.length() > 40) {
            envoyerJson(client, 400, objetErreur("La commande doit contenir au moins un produit"));
            return;
        }
        JSONArray catalogue = tableauCatalogue();
        JSONArray normalisees = new JSONArray();
        double total = 0;
        for (int i = 0; i < lignes.length(); i++) {
            JSONObject l = lignes.optJSONObject(i);
            if (l == null) { envoyerJson(client, 400, objetErreur("Ligne invalide")); return; }
            String id = propre(l.optString("id", ""), 100);
            JSONObject produit = produitParId(catalogue, id);
            int quantite = l.has("qte") ? l.optInt("qte", 0) : l.optInt("q", 0);
            if (produit == null || quantite < 1 || quantite > 30) {
                envoyerJson(client, 400, objetErreur("Produit ou quantité invalide"));
                return;
            }
            double prix = produit.optDouble("pv", 0);
            total += prix * quantite;
            JSONObject n = new JSONObject();
            n.put("plat_id", id).put("nom", produit.optString("nom", "Produit"))
                    .put("pv", prix).put("q", quantite);
            normalisees.put(n);
        }
        total = Math.round(total * 100) / 100.0;
        String nom = propre(d.optString("nom", d.optString("client", "")), 60);
        String tel = propre(d.optString("tel", ""), 20);
        if (nom.length() < 2 || tel.length() < 6) {
            envoyerJson(client, 400, objetErreur("Nom et téléphone requis"));
            return;
        }
        d.put("client", nom).put("tel", tel).put("lignes", normalisees)
                .put("total", total).put("total_verifie", total)
                .put("date", aujourdHui()).put("heure", heure()).put("canal", "enligne")
                .put("statut", "nouvelle");
        String userId = sessionUserId(req);
        if (userId != null) {
            synchronized (etatLock) {
                JSONObject achat = new JSONObject();
                achat.put("id", "a-" + UUID.randomUUID().toString());
                achat.put("user_id", userId).put("tel", tel).put("statut", "confirmee")
                        .put("lignes", normalisees).put("montant", total).put("cree_le", System.currentTimeMillis());
                publicData.optJSONArray("achats").put(achat);
                sauverDonneesPubliquesLocked();
            }
            d.put("achat_identifie", true);
        } else {
            d.put("achat_identifie", false);
        }
        if (ecouteur != null) ecouteur.commandeRecue(d);
        envoyerJson(client, 200, new JSONObject().put("ok", true)
                .put("message", "Commande transmise au restaurant").put("total_verifie", total)
                .put("achat_identifie", userId != null));
    }

    private void traiterReservation(Socket client, JSONObject d) throws Exception {
        String nom = propre(d.optString("nom", ""), 60);
        String tel = propre(d.optString("tel", ""), 20);
        String date = propre(d.optString("date", ""), 10);
        String heure = propre(d.optString("heure", ""), 5);
        int couverts = d.optInt("couverts", 0);
        if (nom.length() < 2 || tel.length() < 6 || !date.matches("\\d{4}-\\d{2}-\\d{2}")
                || !heure.matches("\\d{2}:\\d{2}") || couverts < 1 || couverts > 30) {
            envoyerJson(client, 400, objetErreur("Nom, téléphone, date, heure et couverts valides requis"));
            return;
        }
        JSONObject r = new JSONObject();
        r.put("id", "r-" + UUID.randomUUID().toString()).put("nom", nom).put("tel", tel)
                .put("date", date).put("heure", heure).put("couverts", couverts)
                .put("note", propre(d.optString("note", ""), 500)).put("statut", "a_confirmer")
                .put("cree_le", System.currentTimeMillis());
        synchronized (etatLock) {
            publicData.optJSONArray("reservations").put(r);
            sauverDonneesPubliquesLocked();
        }
        if (ecouteur != null) ecouteur.reservationRecue(r);
        envoyerJson(client, 200, new JSONObject().put("ok", true)
                .put("message", "Demande enregistrée, l'équipe vous rappellera pour confirmation."));
    }

    // ---------------------------------------------------------------------
    // Authentification, achats identifiés et notation anti-fraude
    // ---------------------------------------------------------------------
    private void traiterAuth(Socket client, Requete req, JSONObject d) throws Exception {
        String action = d.optString("action", "login");
        String tel = normaliserTelephone(d.optString("tel", ""));
        String mdp = d.optString("mdp", "");
        if (tel.length() < 6 || mdp.length() < 4 || mdp.length() > 128) {
            envoyerJson(client, 400, objetErreur("Téléphone et code valides requis")); return;
        }
        synchronized (etatLock) {
            JSONArray users = publicData.optJSONArray("utilisateurs");
            JSONObject user = null;
            for (int i = 0; i < users.length(); i++) {
                JSONObject u = users.optJSONObject(i);
                if (u != null && tel.equals(u.optString("tel", ""))) { user = u; break; }
            }
            if ("register".equals(action)) {
                String nom = propre(d.optString("nom", ""), 60);
                if (nom.length() < 2) { envoyerJson(client, 400, objetErreur("Nom requis")); return; }
                if (user != null) { envoyerJson(client, 409, objetErreur("Un compte existe déjà pour ce téléphone")); return; }
                String sel = aleaHex(16);
                user = new JSONObject().put("id", "u-" + UUID.randomUUID().toString())
                        .put("nom", nom).put("tel", tel).put("sel", sel)
                        .put("mdp", hache(mdp, sel)).put("cree_le", System.currentTimeMillis());
                users.put(user);
            } else {
                if (user == null || !hache(mdp, user.optString("sel", "")).equals(user.optString("mdp", ""))) {
                    envoyerJson(client, 401, objetErreur("Identifiants incorrects")); return;
                }
            }
            String token = aleaHex(32);
            JSONObject session = new JSONObject().put("token", token).put("user_id", user.optString("id"))
                    .put("expire", System.currentTimeMillis() + 30L * 86400000L);
            publicData.optJSONArray("sessions").put(session);
            sauverDonneesPubliquesLocked();
            envoyerJsonAvecCookie(client, 200, new JSONObject().put("ok", true).put("session", token)
                    .put("utilisateur", profilPublic(user)), token);
        }
    }

    private void traiterNote(Socket client, Requete req, JSONObject d) throws Exception {
        String userId = sessionUserId(req);
        if (userId == null) {
            envoyerJson(client, 401, new JSONObject().put("ok", false).put("code", "connexion_requise")
                    .put("erreur", "Connectez-vous pour noter un plat.")); return;
        }
        String platId = propre(d.optString("plat_id", ""), 100);
        int note = d.optInt("note", 0);
        if (platId.length() == 0 || note < 1 || note > 5) {
            envoyerJson(client, 400, objetErreur("Plat et note de 1 à 5 requis")); return;
        }
        synchronized (etatLock) {
            JSONArray achats = publicData.optJSONArray("achats");
            String achatId = null;
            for (int i = 0; i < achats.length(); i++) {
                JSONObject a = achats.optJSONObject(i);
                if (a == null || !userId.equals(a.optString("user_id")) || !"confirmee".equals(a.optString("statut"))) continue;
                JSONArray lignes = a.optJSONArray("lignes");
                if (lignes == null) continue;
                for (int k = 0; k < lignes.length(); k++) {
                    JSONObject l = lignes.optJSONObject(k);
                    if (l != null && platId.equals(l.optString("plat_id"))) { achatId = a.optString("id"); break; }
                }
                if (achatId != null) break;
            }
            if (achatId == null) {
                envoyerJson(client, 403, new JSONObject().put("ok", false).put("code", "achat_requis")
                        .put("erreur", "Ce plat doit figurer dans un achat confirmé.")); return;
            }
            JSONArray notes = publicData.optJSONArray("notes_plats");
            JSONObject existante = null;
            for (int i = 0; i < notes.length(); i++) {
                JSONObject n = notes.optJSONObject(i);
                if (n != null && userId.equals(n.optString("user_id")) && platId.equals(n.optString("plat_id"))) { existante = n; break; }
            }
            long maintenant = System.currentTimeMillis();
            boolean modifiee = existante != null;
            if (existante == null) {
                existante = new JSONObject().put("plat_id", platId).put("user_id", userId)
                        .put("achat_id", achatId).put("cree_le", maintenant);
                notes.put(existante);
            }
            existante.put("note", note).put("commentaire", propre(d.optString("commentaire", ""), 500))
                    .put("modifie_le", maintenant);
            sauverDonneesPubliquesLocked();
            envoyerJson(client, 200, new JSONObject().put("ok", true).put("modifie", modifiee)
                    .put("message", modifiee ? "Votre note a été modifiée." : "Votre note est publiée après vérification de votre achat."));
        }
    }

    private JSONObject notesPubliques() throws Exception {
        synchronized (etatLock) {
            JSONArray notes = publicData.optJSONArray("notes_plats");
            Map<String, Integer> compte = new HashMap<String, Integer>();
            Map<String, Double> sommes = new HashMap<String, Double>();
            Map<String, String> noms = new HashMap<String, String>();
            JSONArray catalogue = tableauCatalogue();
            for (int i = 0; i < notes.length(); i++) {
                JSONObject n = notes.optJSONObject(i);
                if (n == null) continue;
                String id = n.optString("plat_id", "");
                int valeur = n.optInt("note", 0);
                if (id.length() == 0 || valeur < 1 || valeur > 5) continue;
                JSONObject p = produitParId(catalogue, id);
                if (p == null) continue;
                compte.put(id, (compte.containsKey(id) ? compte.get(id) : 0) + 1);
                sommes.put(id, (sommes.containsKey(id) ? sommes.get(id) : 0) + valeur);
                noms.put(id, p.optString("nom", id));
            }
            JSONArray rows = new JSONArray();
            for (String id : compte.keySet()) {
                int c = compte.get(id);
                double moyenne = Math.round((sommes.get(id) / c) * 100.0) / 100.0;
                rows.put(new JSONObject().put("plat_id", id).put("plat_nom", noms.get(id))
                        .put("moyenne", moyenne).put("compteur", c));
            }
            return new JSONObject().put("ok", true).put("ratings", rows);
        }
    }

    private JSONObject utilisateurSession(Requete req) {
        synchronized (etatLock) {
            String id = sessionUserIdLocked(tokenRequete(req));
            if (id == null) return null;
            JSONArray users = publicData.optJSONArray("utilisateurs");
            for (int i = 0; i < users.length(); i++) {
                JSONObject u = users.optJSONObject(i);
                if (u != null && id.equals(u.optString("id"))) return u;
            }
            return null;
        }
    }

    private String sessionUserId(Requete req) {
        synchronized (etatLock) { return sessionUserIdLocked(tokenRequete(req)); }
    }

    private String sessionUserIdLocked(String token) {
        if (token == null || !token.matches("[a-f0-9]{32,64}")) return null;
        long now = System.currentTimeMillis();
        JSONArray sessions = publicData.optJSONArray("sessions");
        String id = null;
        for (int i = sessions.length() - 1; i >= 0; i--) {
            JSONObject s = sessions.optJSONObject(i);
            if (s == null) continue;
            if (s.optLong("expire", 0) < now) { sessions.remove(i); continue; }
            if (token.equals(s.optString("token", ""))) id = s.optString("user_id", null);
        }
        return id;
    }

    private static String tokenRequete(Requete req) {
        String token = valeurEntete(req, "x-session", "");
        if (token.length() > 0) return token;
        String cookie = valeurEntete(req, "cookie", "");
        String marqueur = SESSION_COOKIE + "=";
        int p = cookie.indexOf(marqueur);
        if (p < 0) return "";
        int fin = cookie.indexOf(';', p);
        return cookie.substring(p + marqueur.length(), fin < 0 ? cookie.length() : fin).trim();
    }

    private static JSONObject profilPublic(JSONObject u) throws Exception {
        return new JSONObject().put("id", u.optString("id", ""))
                .put("nom", u.optString("nom", ""));
    }

    // ---------------------------------------------------------------------
    // Rendu HTML et assets
    // ---------------------------------------------------------------------
    public String page() {
        String html = assetTexte("public-shell.html");
        if (html.length() == 0) html = "<!doctype html><html lang='fr'><body><h1>La Trattoria</h1><p>Site local indisponible.</p></body></html>";
        try {
            html = html.replace("{{PRODUITS}}", rendreProduits(tableauCatalogue()))
                    .replace("{{OPTIONS_PLATS}}", rendreOptions(tableauCatalogue()))
                    .replace("{{MOMENT}}", rendreMoment(tableauCatalogue()))
                    .replace("{{COMMUNICATIONS}}", rendreCommunications())
                    .replace("{{ETABLISSEMENT}}", safeJson(ecouteur.etablissementJson(), "{}"));
        } catch (Exception e) {
            html = html.replace("{{PRODUITS}}", "<p class='lt-empty'>Carte temporairement indisponible.</p>")
                    .replace("{{OPTIONS_PLATS}}", "").replace("{{MOMENT}}", "")
                    .replace("{{COMMUNICATIONS}}", "");
        }
        return html;
    }

    private void servirAsset(Socket client, String nom) throws Exception {
        String type = "text/plain; charset=utf-8";
        if (nom.endsWith(".js")) type = "application/javascript; charset=utf-8";
        else if (nom.endsWith(".css")) type = "text/css; charset=utf-8";
        else if (nom.endsWith(".html")) type = "text/html; charset=utf-8";
        String contenu = assetTexte(nom);
        if (contenu.length() == 0) { envoyerJson(client, 404, objetErreur("Asset introuvable")); return; }
        envoyer(client, 200, type, contenu);
    }

    private String assetTexte(String nom) {
        if (contexte == null || nom == null || nom.contains("..") || nom.startsWith("/")) return "";
        try {
            InputStream is = contexte.getAssets().open(nom);
            try { return lireTout(is); } finally { is.close(); }
        } catch (Exception e) { return ""; }
    }

    private static String lireTout(InputStream is) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192]; int n;
        while ((n = is.read(buf)) >= 0) out.write(buf, 0, n);
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    private JSONArray tableauCatalogue() {
        try { return new JSONArray(ecouteur.catalogueJson()); } catch (Exception e) { return new JSONArray(); }
    }

    private String rendreProduits(JSONArray produits) throws Exception {
        StringBuilder h = new StringBuilder();
        String famille = null;
        int visibles = 0;
        for (int i = 0; i < produits.length(); i++) {
            JSONObject p = produits.optJSONObject(i);
            if (p == null || !p.optBoolean("actif", true)) continue;
            String id = propre(p.optString("id", ""), 100);
            if (id.length() == 0) continue;
            String fam = p.optString("fam", "Divers");
            if (!fam.equals(famille)) {
                if (famille != null) h.append("</div></section>");
                famille = fam;
                h.append("<section class='famille'><h2>").append(ech(fam)).append("</h2><div class='grille'>");
            }
            String nom = p.optString("nom", "Produit");
            String desc = p.optString("desc", p.optString("sous", ""));
            double prix = p.optDouble("pv", 0);
            String tags = fam + " " + p.optString("cat", "") + " " + p.optString("allergenes", "");
            String photo = p.optString("photo", "");
            boolean adminPhoto = photo.startsWith("data:image/") || photo.startsWith("/");
            h.append("<article class='plat prod' data-product-id='").append(echAttr(id)).append("' data-tags='").append(echAttr(tags.toLowerCase(Locale.FRENCH))).append("'>");
            if (adminPhoto) {
                h.append("<div class='lt-plat-photo'><img src='").append(echAttr(photo)).append("' alt='").append(echAttr(nom)).append("' loading='lazy'></div>");
            } else {
                h.append("<div class='lt-plat-photo no-photo'><span class='lt-no-photo'>Illustration de démonstration<br>aucune photo administrée</span></div>");
            }
            h.append("<div class='infos'><span class='cat'>").append(ech(p.optString("cat", fam))).append("</span><h3>").append(ech(nom)).append("</h3>")
                    .append("<p class='d'>").append(ech(desc)).append("</p><div class='ligne-prix'><span class='pv'>")
                    .append(eur(prix)).append("</span></div><button type='button' class='ajout btn btn-p' data-ajout='").append(echAttr(id))
                    .append("' data-id='").append(echAttr(id)).append("' data-nom='").append(echAttr(nom)).append("' data-prix='").append(prix)
                    .append("'>Ajouter à la commande</button><div class='lt-menu-rating' data-rating-for='").append(echAttr(id)).append("'></div></div></article>");
            visibles++;
        }
        if (famille != null) h.append("</div></section>");
        if (visibles == 0) h.append("<p class='lt-empty'>Aucun produit publié par l'administration.</p>");
        return h.toString();
    }

    private String rendreOptions(JSONArray produits) {
        StringBuilder h = new StringBuilder();
        for (int i = 0; i < produits.length(); i++) {
            JSONObject p = produits.optJSONObject(i);
            if (p == null || !p.optBoolean("actif", true) || p.optString("id", "").length() == 0) continue;
            h.append("<option value='").append(echAttr(p.optString("id"))).append("' data-nom='").append(echAttr(p.optString("nom", "Produit"))).append("'>").append(ech(p.optString("nom", "Produit"))).append("</option>");
        }
        return h.toString();
    }

    private String rendreMoment(JSONArray produits) throws Exception {
        ArrayList<JSONObject> selection = new ArrayList<JSONObject>();
        for (int i = 0; i < produits.length(); i++) {
            JSONObject p = produits.optJSONObject(i);
            if (p != null && p.optBoolean("actif", true) && (p.optBoolean("duJour", false) || p.optBoolean("moment", false))) selection.add(p);
        }
        if (selection.size() == 0) {
            try {
                JSONObject moment = new JSONObject(ecouteur.momentJson());
                java.util.Iterator<String> keys = moment.keys();
                while (keys.hasNext()) {
                    JSONObject config = moment.optJSONObject(keys.next());
                    if (config == null) continue;
                    JSONArray choix = config.optJSONArray("selection");
                    if (choix != null) for (int i = 0; i < choix.length(); i++) {
                        JSONObject p = produitParId(produits, choix.optString(i, ""));
                        if (p != null) selection.add(p);
                    }
                    JSONArray libres = config.optJSONArray("libres");
                    if (libres != null) for (int i = 0; i < libres.length(); i++) {
                        JSONObject l = libres.optJSONObject(i);
                        if (l != null) selection.add(l);
                    }
                }
            } catch (Exception ignored) { }
        }
        if (selection.size() == 0) return "<div class='lt-empty'>Aucun plat du jour n'est actuellement publié.</div>";
        StringBuilder h = new StringBuilder();
        int n = Math.min(selection.size(), 12);
        for (int i = 0; i < n; i++) {
            JSONObject p = selection.get(i);
            String photo = p.optString("photo", "");
            h.append("<article class='lt-slider-card'>");
            if (photo.startsWith("data:image/") || photo.startsWith("/")) h.append("<img src='").append(echAttr(photo)).append("' alt='").append(echAttr(p.optString("nom", "Plat du jour"))).append("'>");
            else h.append("<div class='lt-plat-photo no-photo'><span class='lt-no-photo'>Illustration de démonstration</span></div>");
            h.append("<div class='lt-slider-copy'><strong>").append(ech(p.optString("nom", "Plat du jour"))).append("</strong><p>").append(ech(p.optString("desc", p.optString("sous", "")))).append("</p><b>").append(eur(p.optDouble("pv", p.optDouble("prix", 0)))).append("</b></div></article>");
        }
        return h.toString();
    }

    private String rendreCommunications() throws Exception {
        JSONArray a;
        try { a = new JSONArray(ecouteur.commJson()); } catch (Exception e) { a = new JSONArray(); }
        if (a.length() == 0) return "<div class='lt-empty'>Aucune communication publiée pour le moment.</div>";
        StringBuilder h = new StringBuilder();
        for (int i = 0; i < a.length(); i++) {
            JSONObject x = a.optJSONObject(i); if (x == null) continue;
            h.append("<article class='carte-bloc'><h3>").append(ech(x.optString("titre", "Information"))).append("</h3><p>").append(ech(x.optString("texte", ""))).append("</p></article>");
        }
        return h.toString();
    }

    // ---------------------------------------------------------------------
    // Utilitaires
    // ---------------------------------------------------------------------
    private static JSONObject jsonCorps(Requete req) throws Exception {
        String s = new String(req.corps, StandardCharsets.UTF_8).trim();
        return new JSONObject(s.length() == 0 ? "{}" : s);
    }

    private static JSONObject objetErreur(String message) throws Exception {
        return new JSONObject().put("ok", false).put("erreur", message);
    }

    private static String safeJson(String brut, String defaut) {
        if (brut == null || brut.length() == 0) return defaut;
        try { new JSONObject(brut); return brut; } catch (Exception ignored) { }
        try { new JSONArray(brut); return brut; } catch (Exception ignored) { return defaut; }
    }

    private void envoyerJson(Socket client, int code, JSONObject obj) throws IOException {
        envoyer(client, code, "application/json; charset=utf-8", obj.toString());
    }

    private void envoyerJsonAvecCookie(Socket client, int code, JSONObject obj, String token) throws IOException {
        envoyer(client, code, "application/json; charset=utf-8", obj.toString(), SESSION_COOKIE + "=" + token + "; Path=/; Max-Age=2592000; SameSite=Lax");
    }

    private void envoyer(Socket client, int code, String type, String corps) throws IOException {
        envoyer(client, code, type, corps, null);
    }

    private void envoyer(Socket client, int code, String type, String corps, String cookie) throws IOException {
        byte[] b = corps.getBytes(StandardCharsets.UTF_8);
        BufferedOutputStream out = new BufferedOutputStream(client.getOutputStream());
        String statut = code == 200 ? "OK" : (code == 204 ? "No Content" : "Error");
        StringBuilder h = new StringBuilder();
        h.append("HTTP/1.1 ").append(code).append(' ').append(statut).append("\r\n")
                .append("Content-Type: ").append(type).append("\r\n")
                .append("Content-Length: ").append(b.length).append("\r\n")
                .append("Cache-Control: no-store\r\n")
                .append("Access-Control-Allow-Origin: *\r\n")
                .append("Access-Control-Allow-Headers: Content-Type, X-Session\r\n");
        if (cookie != null) h.append("Set-Cookie: ").append(cookie).append("\r\n");
        h.append("Connection: close\r\n\r\n");
        out.write(h.toString().getBytes(StandardCharsets.UTF_8));
        out.write(b); out.flush();
    }

    private void chargerDonneesPubliques() {
        synchronized (etatLock) {
            publicData = new JSONObject();
            try {
                if (publicDataFile != null && publicDataFile.exists()) publicData = new JSONObject(lireFichier(publicDataFile));
            } catch (Exception ignored) { publicData = new JSONObject(); }
            assurerTableau("utilisateurs"); assurerTableau("sessions"); assurerTableau("achats");
            assurerTableau("notes_plats"); assurerTableau("reservations");
            sauverDonneesPubliquesLocked();
        }
    }

    private void assurerTableau(String nom) {
        if (publicData.optJSONArray(nom) == null) try { publicData.put(nom, new JSONArray()); } catch (Exception ignored) { }
    }

    private void sauverDonneesPubliquesLocked() {
        if (publicDataFile == null) return;
        File tmp = new File(publicDataFile.getParentFile(), publicDataFile.getName() + ".tmp");
        try {
            FileOutputStream out = new FileOutputStream(tmp);
            out.write(publicData.toString().getBytes(StandardCharsets.UTF_8));
            out.flush(); out.close();
            if (!tmp.renameTo(publicDataFile)) {
                FileOutputStream direct = new FileOutputStream(publicDataFile);
                direct.write(publicData.toString().getBytes(StandardCharsets.UTF_8)); direct.close(); tmp.delete();
            }
        } catch (Exception ignored) { }
    }

    private static String lireFichier(File f) throws Exception {
        FileInputStream in = new FileInputStream(f);
        try { return lireTout(in); } finally { in.close(); }
    }

    private static JSONObject produitParId(JSONArray catalogue, String id) {
        for (int i = 0; i < catalogue.length(); i++) {
            JSONObject p = catalogue.optJSONObject(i);
            if (p != null && id.equals(p.optString("id", ""))) return p;
        }
        return null;
    }

    private static String propre(String s, int max) {
        if (s == null) return "";
        s = s.replace('\u0000', ' ').trim();
        return s.length() > max ? s.substring(0, max) : s;
    }

    private static String normaliserTelephone(String s) {
        if (s == null) return "";
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < s.length(); i++) if (Character.isDigit(s.charAt(i))) out.append(s.charAt(i));
        return out.length() > 20 ? out.substring(0, 20) : out.toString();
    }

    private static String hache(String mdp, String sel) {
        try {
            MessageDigest d = MessageDigest.getInstance("SHA-256");
            byte[] b = d.digest((sel + mdp).getBytes(StandardCharsets.UTF_8));
            StringBuilder h = new StringBuilder();
            for (byte x : b) h.append(String.format(Locale.US, "%02x", x & 255));
            return h.toString();
        } catch (Exception e) { return ""; }
    }

    private String aleaHex(int octets) {
        byte[] b = new byte[octets]; alea.nextBytes(b);
        StringBuilder h = new StringBuilder();
        for (byte x : b) h.append(String.format(Locale.US, "%02x", x & 255));
        return h.toString();
    }

    private static String aujourdHui() { return new SimpleDateFormat("yyyy-MM-dd", Locale.FRENCH).format(new Date()); }
    private static String heure() { return new SimpleDateFormat("HH:mm", Locale.FRENCH).format(new Date()); }
    private static String eur(double v) { return String.format(Locale.US, "%.2f €", v).replace('.', ','); }

    private static String ech(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
    }

    private static String echAttr(String s) { return ech(s).replace("\n", " ").replace("\r", " "); }
}
