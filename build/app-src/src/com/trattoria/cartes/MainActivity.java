package com.trattoria.cartes;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.print.PrintManager;
import android.text.InputType;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.CompoundButton;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.HorizontalScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * La Trattoria — Édition des cartes (application native).
 *
 * Écrans (comme l'application d'origine, tout dans une activité) :
 *   menu → cartes (standard / moment / ardoise) → éditeurs
 * Données : JSON dans getFilesDir()/cartes.json, compatible avec le
 * module web (carte + config), import/export via le sélecteur système.
 * Impression : HTML craie rendu dans un WebView + PrintManager (PDF).
 */
public class MainActivity extends Activity {

    // ---------- état ----------
    private JSONObject donnees;        // { "carte": [...], "config": {...}, "moment": {...} }
    private String ecran = "menu";
    private String momentCourant = null; // clé de la carte du moment en édition
    private String catCourante = null;   // famille en édition (carte standard)
    private String tableCourante = null; // table en prise de commande
    private LinearLayout contenu;
    private LinearLayout resultatsRecherche;
    private EditText champRecherche;

    private static final String ROUGE = "#A51822";
    private static final String ROUGE_F = "#7A1018";
    private static final String ARDOISE = "#24312B";
    private static final String CREME = "#FDFAF3";
    private static final String FOND = "#F4F1EA";
    private static final String BEIGE = "#EFE9DA";
    private static final String TRAIT = "#D8CFC0";
    private static final String GRIS = "#6E6A63";
    private static final String JAUNE = "#F5D67B";

    // ==========================================================
    //  Cycle de vie / persistance
    // ==========================================================
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (getActionBar() != null) getActionBar().hide();
        charger();
        afficher("menu");
        // Le point d'entrée unique démarre aussi le service local afin que
        // le QR client, la réservation et la carte soient disponibles sans
        // étape cachée dans l'écran Administration.
        demarrerServeur();
        demarrerCommunaute();
    }

    @Override protected void onDestroy() {
        arreterServeur();
        arreterCommunaute();
        super.onDestroy();
    }

    private File fichierDonnees() { return new File(getFilesDir(), "cartes.json"); }

    private void charger() {
        try {
            File f = fichierDonnees();
            String brut;
            if (f.exists()) {
                brut = lire(f);
            } else {
                brut = lireAssetsApp("defauts.json");
            }
            donnees = new JSONObject(brut);
        } catch (Exception e) {
            try { donnees = new JSONObject(lireAssetsApp("defauts.json")); } catch (Exception e2) {
                donnees = new JSONObject();
            }
        }
        try { if (!donnees.has("carte")) donnees.put("carte", new JSONArray()); } catch (Exception ignored) { }
        try { if (!donnees.has("config")) donnees.put("config", new JSONObject()); } catch (Exception ignored) { }
        try { if (!donnees.has("moment")) donnees.put("moment", new JSONObject()); } catch (Exception ignored) { }
        sauver();
    }

    private void sauver() {
        try {
            ecrire(fichierDonnees(), donnees.toString());
        } catch (Exception e) {
            toast("Échec de l'enregistrement : " + e.getMessage());
        }
    }

    private static String lire(File f) throws Exception {
        FileInputStream fis = new FileInputStream(f);
        try { return toutLire(fis); } finally { fis.close(); }
    }
    private String lireAssetsApp(String nom) throws Exception {
        InputStream is = getAssets().open(nom);
        try { return toutLire(is); } finally { is.close(); }
    }
    private static String toutLire(InputStream is) throws Exception {
        BufferedReader r = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String l;
        while ((l = r.readLine()) != null) sb.append(l).append('\n');
        return sb.toString();
    }
    private static void ecrire(File f, String s) throws Exception {
        FileOutputStream fos = new FileOutputStream(f);
        try { fos.write(s.getBytes(StandardCharsets.UTF_8)); } finally { fos.close(); }
    }
    private String asset(String nom) {
        try { return lireAssetsApp(nom); } catch (Exception e) { return ""; }
    }

    // ==========================================================
    //  Helpers JSON
    // ==========================================================
    private JSONArray jarr(JSONObject o, String cle) {
        try {
            JSONArray a = o.optJSONArray(cle);
            return a != null ? a : new JSONArray();
        } catch (Exception e) { return new JSONArray(); }
    }
    private JSONObject jobj(JSONObject o, String cle) {
        try {
            JSONObject x = o.optJSONObject(cle);
            if (x != null) return x;
        } catch (Exception ignored) { }
        try { JSONObject n = new JSONObject(); o.put(cle, n); return n; } catch (Exception e) { return new JSONObject(); }
    }
    private static String s(JSONObject o, String cle, String defaut) {
        String v = o.optString(cle, defaut);
        return v == null || v.equals("null") ? defaut : v;
    }
    private static double d(JSONObject o, String cle) { return o.optDouble(cle, 0); }
    private static boolean bo(JSONObject o, String cle) { return o.optBoolean(cle, false); }
    private static String eur(double v) {
        return String.format("%.2f €", v).replace('.', ',');
    }
    private static String eurHT(double pvTTC, double tva) {
        return String.format("%.2f € HT", (pvTTC / (1 + tva))).replace('.', ',');
    }

    // ==========================================================
    //  Helpers UI
    // ==========================================================
    private int c(String hex) { return Color.parseColor(hex); }
    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private LinearLayout colonne() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }
    private TextView texte(String t, float taille, String couleur, boolean gras) {
        TextView tv = new TextView(this);
        tv.setText(t);
        tv.setTextSize(taille);
        tv.setTextColor(c(couleur));
        tv.setTypeface(Typeface.DEFAULT, gras ? Typeface.BOLD : Typeface.NORMAL);
        return tv;
    }
    private Button bouton(String t, String fond, String texteCouleur, View.OnClickListener oc) {
        Button b = new Button(this);
        b.setText(t);
        b.setTextSize(15);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setAllCaps(false);
        b.setTextColor(c(texteCouleur));
        b.setBackground(fondBord(fond, "#FFFFFF", dp(10), dp(1)));
        b.setMinHeight(dp(48));
        b.setOnClickListener(oc);
        return b;
    }
    private android.graphics.drawable.GradientDrawable fondBord(String fond, String bord, int rayon, int bordEp) {
        android.graphics.drawable.GradientDrawable g = new android.graphics.drawable.GradientDrawable();
        g.setColor(c(fond));
        g.setCornerRadius(dp(rayon));
        g.setStroke(dp(bordEp), c(bord));
        return g;
    }
    private View espace(int h) {
        View v = new View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(1, dp(h)));
        return v;
    }
    private EditText champ(String valeur, String hint) {
        EditText e = new EditText(this);
        e.setText(valeur);
        e.setHint(hint);
        e.setTextSize(15);
        e.setSingleLine(true);
        return e;
    }
    private void toast(String m) {
        Toast.makeText(this, m, Toast.LENGTH_SHORT).show();
    }

    // ==========================================================
    //  Navigation / écrans
    // ==========================================================
    private void afficher(String ecran) {
        this.ecran = ecran;
        LinearLayout racine = colonne();
        racine.setBackgroundColor(c(FOND));

        // En-tête natif premium à deux niveaux : identité, recherche clavier,
        // puis navigation horizontale utilisable au doigt sur petit écran.
        ajouterEntetePro(racine);

        ScrollView sc = new ScrollView(this);
        sc.setFillViewport(true);
        contenu = colonne();
        contenu.setPadding(dp(14), dp(14), dp(14), dp(28));
        sc.addView(contenu);
        racine.addView(sc, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(racine);

        switch (ecran) {
            case "menu": ecranMenu(); break;
            case "salle": ecranSalle(); break;
            case "commande": ecranCommande(); break;
            case "ventes": ecranVentes(); break;
            case "ticket": ecranTicket(); break;
            case "site": ecranSite(); break;
            case "communaute": ecranCommunaute(); break;
            case "stock": ecranStock(); break;
            case "compta": ecranCompta(); break;
            case "objectifs": ecranObjectifs(); break;
            case "invendus": ecranInvendus(); break;
            case "personnel": ecranPersonnel(); break;
            case "com": ecranCom(); break;
            case "admin": ecranAdmin(); break;
            case "cartes": ecranCartes(); break;
            case "standard": ecranStandard(); break;
            case "produits": ecranProduits(); break;
            case "moment": ecranMomentListe(); break;
            case "momentEdit": ecranMomentEdit(); break;
            case "ardoise": ecranArdoise(); break;
            case "donnees": ecranDonnees(); break;
            case "apropos": ecranAPropos(); break;
            default: ecranMenu(); break;
        }
    }

    /**
     * Header compilé dans le DEX final. Le champ n'est pas décoratif : il
     * propose les écrans, fonctions et produits du catalogue courant.
     */
    private void ajouterEntetePro(LinearLayout racine) {
        LinearLayout niveau1 = colonne();
        niveau1.setPadding(dp(12), dp(9), dp(12), dp(8));
        niveau1.setBackgroundColor(c(CREME));

        LinearLayout ligne = new LinearLayout(this);
        ligne.setOrientation(LinearLayout.HORIZONTAL);
        ligne.setGravity(Gravity.CENTER_VERTICAL);

        TextView logo = texte("LT", 18, ROUGE_F, true);
        logo.setGravity(Gravity.CENTER);
        logo.setContentDescription("Logo La Trattoria");
        logo.setBackground(fondBord("#F3E6D4", "#C99B4A", dp(22), dp(1)));
        ligne.addView(logo, new LinearLayout.LayoutParams(dp(44), dp(44)));

        LinearLayout nom = colonne();
        nom.setPadding(dp(9), 0, dp(8), 0);
        TextView nomEtablissement = texte("La Trattoria", 17, ROUGE_F, true);
        nomEtablissement.setSingleLine(true);
        TextView ecranCourant = texte(titreEcran(), 10.5f, GRIS, false);
        ecranCourant.setSingleLine(true);
        nom.addView(nomEtablissement);
        nom.addView(ecranCourant);
        ligne.addView(nom, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 0.9f));

        champRecherche = champ("", "Rechercher…");
        champRecherche.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        champRecherche.setImeOptions(android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH);
        champRecherche.setContentDescription("Rechercher un écran, une fonction ou un produit");
        champRecherche.setTextSize(13);
        champRecherche.setPadding(dp(10), 0, dp(8), 0);
        champRecherche.setBackground(fondBord("#F4F1EA", TRAIT, dp(22), dp(1)));
        ligne.addView(champRecherche, new LinearLayout.LayoutParams(0, dp(44), 1.25f));
        niveau1.addView(ligne);
        racine.addView(niveau1);

        HorizontalScrollView defilement = new HorizontalScrollView(this);
        defilement.setHorizontalScrollBarEnabled(false);
        defilement.setOverScrollMode(View.OVER_SCROLL_NEVER);
        LinearLayout niveau2 = new LinearLayout(this);
        niveau2.setOrientation(LinearLayout.HORIZONTAL);
        niveau2.setGravity(Gravity.CENTER_VERTICAL);
        niveau2.setPadding(dp(7), dp(3), dp(7), dp(4));
        niveau2.setBackgroundColor(c(ARDOISE));
        String[][] items = {{"Accueil", "menu"}, {"Salle", "salle"}, {"Cartes", "cartes"},
                {"Site", "site"}, {"Communication", "com"}, {"Plus", "admin"}};
        for (String[] item : items) {
            final String cible = item[1];
            Button b = new Button(this);
            b.setText(item[0]);
            b.setAllCaps(false);
            b.setTextSize(13);
            b.setMinHeight(dp(44));
            b.setMinimumHeight(dp(44));
            b.setPadding(dp(13), 0, dp(13), 0);
            b.setContentDescription("Ouvrir " + item[0]);
            b.setTextColor(c(sectionActive(cible) ? JAUNE : CREME));
            b.setBackgroundColor(c(ARDOISE));
            b.setOnClickListener(new View.OnClickListener() {
                public void onClick(View v) { afficher(cible); }
            });
            niveau2.addView(b);
        }
        defilement.addView(niveau2);
        racine.addView(defilement, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(51)));

        resultatsRecherche = colonne();
        resultatsRecherche.setPadding(dp(10), dp(6), dp(10), dp(4));
        resultatsRecherche.setBackgroundColor(c("#FFFDF8"));
        resultatsRecherche.setVisibility(View.GONE);
        racine.addView(resultatsRecherche);
        champRecherche.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                afficherResultatsRecherche(s == null ? "" : s.toString());
            }
            public void afterTextChanged(Editable s) { }
        });
    }

    private boolean sectionActive(String cible) {
        if ("menu".equals(cible)) return "menu".equals(ecran);
        if ("salle".equals(cible)) return "salle".equals(ecran) || "commande".equals(ecran)
                || "ventes".equals(ecran) || "ticket".equals(ecran);
        if ("cartes".equals(cible)) return "cartes".equals(ecran) || "standard".equals(ecran)
                || "produits".equals(ecran) || "moment".equals(ecran)
                || "momentEdit".equals(ecran) || "ardoise".equals(ecran);
        if ("site".equals(cible)) return "site".equals(ecran);
        if ("com".equals(cible)) return "com".equals(ecran);
        return "admin".equals(ecran) || "donnees".equals(ecran) || "apropos".equals(ecran)
                || "stock".equals(ecran) || "compta".equals(ecran) || "objectifs".equals(ecran)
                || "invendus".equals(ecran) || "personnel".equals(ecran);
    }

    private void afficherResultatsRecherche(String saisie) {
        if (resultatsRecherche == null) return;
        String q = saisie == null ? "" : saisie.trim().toLowerCase(java.util.Locale.FRENCH);
        resultatsRecherche.removeAllViews();
        if (q.length() == 0) {
            resultatsRecherche.setVisibility(View.GONE);
            return;
        }
        resultatsRecherche.setVisibility(View.VISIBLE);
        String[][] fonctions = {
                {"Accueil", "menu", "accueil tableau de bord"},
                {"Salle & commandes", "salle", "salle tables prise de commande commandes en ligne"},
                {"Ventes du jour & tickets", "ventes", "ventes tickets encaissement"},
                {"Carte standard & produits", "cartes", "carte standard produits catégories"},
                {"Cartes du jour", "moment", "cartes du jour moment"},
                {"Ardoise & QR code", "ardoise", "ardoise qr code"},
                {"Site en ligne & réservation", "site", "site client réservation slider"},
                {"Communication & journal", "com", "communication posts journal blog"},
                {"Stock & fournisseurs bio/local", "stock", "stock fournisseurs bio local"},
                {"Comptabilité & export", "compta", "comptabilité tva export pdf"},
                {"Objectifs", "objectifs", "objectifs"},
                {"Invendus & anti-gaspi", "invendus", "invendus gaspillage"},
                {"Personnel", "personnel", "personnel équipe"},
                {"Administration & paramètres", "admin", "administration paramètres synchronisation"},
                {"Données — import/export", "donnees", "données import export sauvegarde"},
                {"Avis clients vérifiés", "site", "avis note notation achat"},
                {"Paiement, pourboire & fidélité", "site", "paiement pourboire fidélité"},
                {"Communauté & partenaires", "communaute", "communauté partenaires forum messages posts commentaires"}
        };
        int trouves = 0;
        for (String[] f : fonctions) {
            if (f[0].toLowerCase(java.util.Locale.FRENCH).contains(q)
                    || f[2].contains(q)) {
                ajouterResultatRecherche(f[0], f[1], false);
                trouves++;
            }
        }
        JSONArray catalogue = jarr(donnees, "carte");
        for (int i = 0; i < catalogue.length(); i++) {
            JSONObject p = catalogue.optJSONObject(i);
            if (p == null || !p.optBoolean("actif", true)) continue;
            String nom = s(p, "nom", "Produit");
            String desc = s(p, "fam", "");
            if (nom.toLowerCase(java.util.Locale.FRENCH).contains(q)
                    || desc.toLowerCase(java.util.Locale.FRENCH).contains(q)) {
                catCourante = desc;
                ajouterResultatRecherche(nom + " — " + desc, "produits", true);
                trouves++;
            }
        }
        if (trouves == 0) {
            TextView aucun = texte("Aucun résultat — essayez un nom de produit ou une fonction.",
                    13, GRIS, false);
            aucun.setPadding(dp(4), dp(6), dp(4), dp(8));
            resultatsRecherche.addView(aucun);
        }
    }

    private void ajouterResultatRecherche(String libelle, final String cible, boolean produit) {
        Button b = bouton((produit ? "🍽️  " : "→  ") + libelle, "#FFFDF8", ROUGE_F,
                new View.OnClickListener() {
                    public void onClick(View v) {
                        if (champRecherche != null) champRecherche.setText("");
                        afficher(cible);
                    }
                });
        b.setGravity(Gravity.CENTER_VERTICAL | Gravity.LEFT);
        b.setMinHeight(dp(48));
        resultatsRecherche.addView(b);
    }

    private String titreEcran() {
        if ("salle".equals(ecran)) return "Salle — Prise de commande";
        if ("commande".equals(ecran)) return "Commande — " + (tableCourante == null ? "" : tableCourante);
        if ("ventes".equals(ecran)) return "Ventes du jour";
        if ("site".equals(ecran)) return "Site en ligne — commandes clients";
        if ("communaute".equals(ecran)) return "Communauté — social local";
        if ("admin".equals(ecran)) return "Administration";
        if ("stock".equals(ecran)) return "Stock & commandes fournisseurs";
        if ("compta".equals(ecran)) return "Comptabilité";
        if ("objectifs".equals(ecran)) return "Objectifs";
        if ("invendus".equals(ecran)) return "Invendus — anti-gaspi";
        if ("personnel".equals(ecran)) return "Personnel";
        if ("com".equals(ecran)) return "Communication — le site en direct";
        if ("ticket".equals(ecran)) return "Ticket";
        if ("cartes".equals(ecran)) return "Cartes — Éditer & produire";
        if ("standard".equals(ecran)) return "1 · La carte standard — catégories";
        if ("produits".equals(ecran)) return "Produits — " + catCourante;
        if ("moment".equals(ecran)) return "2 · Les cartes du moment";
        if ("momentEdit".equals(ecran)) return titreMoment(momentCourant);
        if ("ardoise".equals(ecran)) return "3 · L'ardoise & QR";
        if ("donnees".equals(ecran)) return "Données";
        if ("apropos".equals(ecran)) return "À propos";
        return "La Trattoria — Édition des cartes";
    }

    @Override public void onBackPressed() {
        if ("menu".equals(ecran)) { super.onBackPressed(); return; }
        if ("cartes".equals(ecran) || "donnees".equals(ecran) || "apropos".equals(ecran)
                || "salle".equals(ecran) || "ventes".equals(ecran) || "site".equals(ecran)
                || "communaute".equals(ecran) || "admin".equals(ecran) || "stock".equals(ecran) || "compta".equals(ecran)
                || "objectifs".equals(ecran) || "invendus".equals(ecran)
                || "personnel".equals(ecran) || "com".equals(ecran)) {
            afficher("menu"); return;
        }
        if ("commande".equals(ecran)) { afficher("salle"); return; }
        if ("ticket".equals(ecran)) { afficher("ventes"); return; }
        if ("produits".equals(ecran) || "moment".equals(ecran) || "ardoise".equals(ecran)) {
            afficher("cartes"); return;
        }
        if ("momentEdit".equals(ecran)) { afficher("moment"); return; }
        afficher("menu");
    }

    private String titreMoment(String cle) {
        try {
            JSONObject conf = jobj(jobj(donnees, "moment"), cle);
            String t = conf.optString("titre", null);
            if (t != null && !t.isEmpty()) return t;
        } catch (Exception ignored) { }
        if ("plats".equals(cle)) return "Les plats du moment";
        if ("boissons".equals(cle)) return "Les boissons du moment";
        if ("vins".equals(cle)) return "Vins & alcools du moment";
        if ("glaces".equals(cle)) return "Glaces artisanales du moment";
        if ("desserts".equals(cle)) return "Les desserts du moment";
        if ("bieres".equals(cle)) return "Les bières du moment";
        return "Carte du moment";
    }

    private String mentionsMoment(String cle) {
        String alcool = "Prix nets hors taxes — TVA en sus. L'abus d'alcool est dangereux pour la santé, à consommer avec modération. La vente d'alcool est interdite aux mineurs de moins de 18 ans (art. L. 3342-1 du Code de la santé publique).";
        if ("plats".equals(cle)) return "Prix nets hors taxes — TVA en sus. Nos plats sont préparés maison à partir de produits frais. Allergènes : la liste complète est disponible sur demande au comptoir.";
        if ("boissons".equals(cle)) return "Prix nets hors taxes — TVA en sus. La vente d'alcool est interdite aux mineurs de moins de 18 ans (art. L. 3342-1 du Code de la santé publique).";
        if ("vins".equals(cle) || "bieres".equals(cle)) return alcool;
        if ("glaces".equals(cle)) return "Prix nets hors taxes — TVA en sus. Glaces artisanales L'Angelys. Allergènes : lait, œuf, fruits à coque possibles selon les parfums. Parfums susceptibles de varier selon les arrivages.";
        if ("desserts".equals(cle)) return "Prix nets hors taxes — TVA en sus. Nos desserts sont préparés maison. Allergènes : gluten, lait, œuf, fruits à coque possibles selon les desserts.";
        return "Prix nets hors taxes — TVA en sus.";
    }

    // ==========================================================
    //  Écran : menu
    // ==========================================================
    private void ecranMenu() {
        contenu.addView(texte("La Trattoria", 30, ROUGE_F, true));
        contenu.addView(texte("Gestion du restaurant — application native", 14, GRIS, false));
        contenu.addView(espace(16));
        java.util.LinkedHashMap<String, String[]> tuiles = new java.util.LinkedHashMap<>();
        JSONArray enLigne = commandesEnLigne();
        tuiles.put("Salle", new String[]{"🪑", "Prise de commande — tables et encaissement"
                + (enLigne.length() > 0 ? "  ·  " + enLigne.length() + " commande(s) du site" : "")});
        tuiles.put("ventes", new String[]{"📈", "Ventes du jour — CA, tickets, meilleures ventes"});
        tuiles.put("cartes", new String[]{"🧾", "La carte standard, les cartes du moment, l'ardoise, l'impression"});
        tuiles.put("site", new String[]{"🌐", "Site en ligne — serveur, commandes clients, ouvrir et partager"});
        tuiles.put("communaute", new String[]{"🤝", "Communauté — profils, posts, messages, partenaires et fidélité"});
        tuiles.put("com", new String[]{"📣", "Communication — messages visuels du site (éditer, visualiser)"});
        tuiles.put("objectifs", new String[]{"🎯", "Objectifs — CA et couverts du jour"});
        tuiles.put("stock", new String[]{"📦", "Stock & commandes fournisseurs"});
        tuiles.put("compta", new String[]{"💼", "Comptabilité — TVA, résultat, dépenses"});
        tuiles.put("invendus", new String[]{"♻️", "Invendus — paniers anti-gaspi"});
        tuiles.put("personnel", new String[]{"👥", "Personnel — équipe et contrats"});
        tuiles.put("admin", new String[]{"⚙️", "Administration — plan de salle, paramètres"});
        tuiles.put("donnees", new String[]{"💾", "Données — export / import JSON"});
        tuiles.put("apropos", new String[]{"ℹ️", "À propos et mentions"});
        for (final java.util.Map.Entry<String, String[]> t : tuiles.entrySet()) {
            LinearLayout l = colonne();
            l.setBackground(fondBord(CREME, TRAIT, 14, 1));
            l.setPadding(dp(16), dp(14), dp(16), dp(14));
            LinearLayout ligne = new LinearLayout(this);
            ligne.setOrientation(LinearLayout.HORIZONTAL);
            ligne.setGravity(Gravity.CENTER_VERTICAL);
            TextView ic = texte(t.getValue()[0], 26, ROUGE_F, false);
            ic.setPadding(0, 0, dp(12), 0);
            ligne.addView(ic);
            LinearLayout tx = colonne();
            tx.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            String nomT = t.getKey();
            if ("Salle".equals(nomT)) nomT = "Salle & commandes";
            else if ("ventes".equals(nomT)) nomT = "Ventes du jour";
            else if ("cartes".equals(nomT)) nomT = "Cartes";
            else if ("site".equals(nomT)) nomT = "Site en ligne";
            else if ("communaute".equals(nomT)) nomT = "Communauté";
            else if ("stock".equals(nomT)) nomT = "Stock";
            else if ("compta".equals(nomT)) nomT = "Comptabilité";
            else if ("objectifs".equals(nomT)) nomT = "Objectifs";
            else if ("invendus".equals(nomT)) nomT = "Invendus";
            else if ("personnel".equals(nomT)) nomT = "Personnel";
            else if ("com".equals(nomT)) nomT = "Communication";
            else if ("admin".equals(nomT)) nomT = "Administration";
            else if ("donnees".equals(nomT)) nomT = "Données";
            tx.addView(texte(nomT, 17, ROUGE_F, true));
            tx.addView(texte(t.getValue()[1], 12.5f, GRIS, false));
            ligne.addView(tx);
            l.addView(ligne);
            l.setOnClickListener(new View.OnClickListener() {
                public void onClick(View v) { afficher(t.getKey()); }
            });
            contenu.addView(l);
            contenu.addView(espace(10));
        }
        contenu.addView(texte("La Trattoria — 15 rue de la poste, 17100 Saintes — SIRET 106 050 263 00016",
                11.5f, GRIS, false));
    }

    // ==========================================================
    //  SALLE — plan de salle & commandes en ligne
    // ==========================================================
    private String aujourdhui() {
        return new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.FRENCH)
                .format(new java.util.Date());
    }
    private String maintenant() {
        return new java.text.SimpleDateFormat("HH:mm", java.util.Locale.FRENCH)
                .format(new java.util.Date());
    }

    private JSONObject commandes() { return jobj(donnees, "commandes"); }
    private JSONArray ventes() { return jarr(donnees, "ventes"); }
    private JSONArray commandesEnLigne() { return jarr(donnees, "commandesEnLigne"); }

    private java.util.LinkedHashMap<String, Integer> tables() {
        JSONObject conf = jobj(donnees, "config");
        String spec = s(conf, "tablesTexte", "Interieur:8,Terrasse:6");
        java.util.LinkedHashMap<String, Integer> out = new java.util.LinkedHashMap<>();
        for (String zone : spec.split(",")) {
            String[] p = zone.split(":");
            if (p.length != 2) continue;
            try { out.put(p[0].trim(), Math.max(1, Math.min(40, Integer.parseInt(p[1].trim())))); }
            catch (Exception ignored) { }
        }
        if (out.isEmpty()) out.put("Salle", 10);
        return out;
    }

    private void ecranSalle() {
        // commandes en ligne reçues
        JSONArray enLigne = commandesEnLigne();
        if (enLigne.length() > 0) {
            contenu.addView(texte("🌐 Commandes du site (" + enLigne.length() + ")",
                    15, ROUGE_F, true));
            contenu.addView(espace(6));
            for (int i = enLigne.length() - 1; i >= 0; i--) {
                final int idx = i;
                final JSONObject c = enLigne.optJSONObject(i);
                if (c == null) continue;
                LinearLayout l = colonne();
                l.setBackground(fondBord("#FFF7E6", "#E5C55B", 10, 1));
                l.setPadding(dp(12), dp(10), dp(12), dp(10));
                l.addView(texte("🧾 " + s(c, "client", "Client") + " — " + s(c, "heure", ""),
                        14.5f, "#2B2B28", true));
                JSONArray lignes = jarr(c, "lignes");
                for (int k = 0; k < lignes.length(); k++) {
                    JSONObject li = lignes.optJSONObject(k);
                    if (li != null)
                        l.addView(texte("  · " + li.optInt("q", 1) + " × " + s(li, "nom", "")
                                + "  (" + eur(li.optDouble("pv", 0)) + ")", 12.5f, GRIS, false));
                }
                l.addView(texte("Total : " + eur(c.optDouble("total", 0)), 13.5f, ROUGE_F, true));
                l.addView(espace(6));
                l.addView(bouton("Encaisser (vendre)", ROUGE, "#FFFFFF", new View.OnClickListener() {
                    public void onClick(View v) {
                        try {
                            c.put("table", "Site");
                            c.put("canal", "enligne");
                            ventes().put(c);
                            JSONArray garde = new JSONArray();
                            for (int k = 0; k < enLigne.length(); k++)
                                if (k != idx) garde.put(enLigne.opt(k));
                            donnees.put("commandesEnLigne", garde);
                            sauver(); afficher("salle"); toast("Vente enregistrée");
                        } catch (Exception e) { toast("Erreur : " + e.getMessage()); }
                    }
                }));
                contenu.addView(l);
                contenu.addView(espace(6));
            }
            contenu.addView(espace(12));
        }

        contenu.addView(texte("Toucher une table pour prendre la commande.", 13.5f, GRIS, false));
        contenu.addView(espace(8));
        JSONObject cmd = commandes();
        java.util.LinkedHashMap<String, Integer> zones = tables();
        for (final String zone : zones.keySet()) {
            int nb = zones.get(zone);
            contenu.addView(texte(zone.toUpperCase(), 13, ROUGE_F, true));
            contenu.addView(espace(4));
            LinearLayout rangee = null;
            int prefixe = zone.toLowerCase(java.util.Locale.FRENCH).startsWith("terr") ? 'T' : 'I';
            for (int i = 1; i <= nb; i++) {
                if (rangee == null || i % 4 == 1) {
                    rangee = new LinearLayout(this);
                    rangee.setOrientation(LinearLayout.HORIZONTAL);
                    contenu.addView(rangee);
                }
                final String tid = (char) prefixe + String.valueOf(i);
                Button b = new Button(this);
                boolean occupee = cmd.has(tid);
                b.setText(tid + (occupee ? "\n●" : ""));
                b.setTextSize(13);
                b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
                b.setTextColor(c(occupee ? "#FFFFFF" : "#2B2B28"));
                b.setBackground(fondBord(occupee ? ROUGE : "#FFFFFF", TRAIT, 10, 1));
                b.setLayoutParams(new LinearLayout.LayoutParams(0, dp(62), 1f));
                ((LinearLayout.LayoutParams) b.getLayoutParams()).setMargins(dp(3), dp(3), dp(3), dp(3));
                b.setOnClickListener(new View.OnClickListener() {
                    public void onClick(View v) { tableCourante = tid; afficher("commande"); }
                });
                rangee.addView(b);
            }
            contenu.addView(espace(8));
        }
    }

    private JSONObject commandeDe(String table) {
        JSONObject cmd = commandes();
        JSONObject c = cmd.optJSONObject(table);
        if (c == null) {
            c = new JSONObject();
            try {
                c.put("table", table);
                c.put("lignes", new JSONArray());
                c.put("date", aujourdhui());
                c.put("heure", maintenant());
                cmd.put(table, c);
            } catch (Exception ignored) { }
        }
        return c;
    }

    private void ecranCommande() {
        final JSONObject c = commandeDe(tableCourante);
        JSONArray lignes = jarr(c, "lignes");
        contenu.addView(bouton("← Salle", BEIGE, "#2B2B28", new View.OnClickListener() {
            public void onClick(View v) { afficher("salle"); }
        }));
        contenu.addView(espace(10));
        double total = 0;
        for (int i = 0; i < lignes.length(); i++) {
            final JSONObject li = lignes.optJSONObject(i);
            if (li == null) continue;
            total += li.optDouble("pv", 0) * li.optInt("q", 1);
            LinearLayout li2 = colonne();
            li2.setBackground(fondBord("#FFFFFF", TRAIT, 8, 1));
            li2.setPadding(dp(10), dp(6), dp(10), dp(6));
            LinearLayout ligne = new LinearLayout(this);
            ligne.setOrientation(LinearLayout.HORIZONTAL);
            ligne.setGravity(Gravity.CENTER_VERTICAL);
            TextView t = texte(li.optInt("q", 1) + " × " + s(li, "nom", ""), 14, "#2B2B28", true);
            t.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            ligne.addView(t);
            TextView pt = texte(eur(li.optDouble("pv", 0) * li.optInt("q", 1)), 13.5f, ROUGE_F, true);
            pt.setPadding(dp(6), 0, dp(6), 0);
            ligne.addView(pt);
            Button moins = bouton("−", BEIGE, "#2B2B28", new View.OnClickListener() {
                public void onClick(View v) {
                    try {
                        int q = li.optInt("q", 1) - 1;
                        if (q <= 0) {
                            JSONArray garde = new JSONArray();
                            JSONArray ls = jarr(c, "lignes");
                            for (int k = 0; k < ls.length(); k++)
                                if (ls.opt(k) != li) garde.put(ls.opt(k));
                            c.put("lignes", garde);
                        } else li.put("q", q);
                        sauver(); afficher("commande");
                    } catch (Exception e) { }
                }
            });
            moins.setPadding(dp(10), 0, dp(10), 0);
            Button plus = bouton("+", BEIGE, "#2B2B28", new View.OnClickListener() {
                public void onClick(View v) {
                    try { li.put("q", li.optInt("q", 1) + 1); sauver(); afficher("commande"); }
                    catch (Exception e) { }
                }
            });
            plus.setPadding(dp(10), 0, dp(10), 0);
            ligne.addView(moins); ligne.addView(plus);
            li2.addView(ligne);
            contenu.addView(li2);
            contenu.addView(espace(4));
        }
        contenu.addView(espace(6));
        TextView tot = texte("Total : " + eur(total), 18, ROUGE_F, true);
        tot.setGravity(Gravity.RIGHT);
        tot.setPadding(0, dp(6), dp(6), dp(6));
        contenu.addView(tot);
        contenu.addView(espace(6));

        if (lignes.length() > 0) {
            contenu.addView(bouton("✅ Encaisser — enregistrer la vente", ROUGE, "#FFFFFF",
                    new View.OnClickListener() {
                        public void onClick(View v) { encaisser(c); }
                    }));
            contenu.addView(espace(6));
            contenu.addView(bouton("🖨️ Imprimer le ticket", BEIGE, "#2B2B28",
                    new View.OnClickListener() {
                        public void onClick(View v) { imprimer("ticket"); }
                    }));
            contenu.addView(espace(6));
            contenu.addView(bouton("Vider la commande", "#FFFFFF", "#7A1018",
                    new View.OnClickListener() {
                        public void onClick(View v) {
                            new AlertDialog.Builder(MainActivity.this)
                                    .setTitle("Vider la commande ?")
                                    .setPositiveButton("Vider", new DialogInterface.OnClickListener() {
                                        public void onClick(DialogInterface d, int w) {
                                            try { commandes().remove(tableCourante); } catch (Exception ignored) { }
                                            sauver(); afficher("salle"); toast("Commande annulée");
                                        }
                                    })
                                    .setNegativeButton("Annuler", null).show();
                        }
                    }));
            contenu.addView(espace(10));
        }

        contenu.addView(texte("Ajouter des produits :", 13, GRIS, false));
        contenu.addView(espace(4));
        JSONArray carte = jarr(donnees, "carte");
        String famCourante = null;
        for (int i = 0; i < carte.length(); i++) {
            final JSONObject p = carte.optJSONObject(i);
            if (p == null || !bo(p, "actif")) continue;
            String fam = s(p, "fam", "Divers");
            if (!fam.equals(famCourante)) {
                famCourante = fam;
                contenu.addView(espace(6));
                contenu.addView(texte(fam, 13.5f, ROUGE_F, true));
            }
            Button b = bouton(s(p, "nom", "—") + "   " + eur(p.optDouble("pv", 0)),
                    "#FFFFFF", "#2B2B28", new View.OnClickListener() {
                        public void onClick(View v) { ajouterLigneCommande(c, p); }
                    });
            b.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
            b.setPadding(dp(12), 0, dp(12), 0);
            contenu.addView(b);
            contenu.addView(espace(3));
        }
    }

    private void ajouterLigneCommande(JSONObject c, JSONObject p) {
        try {
            JSONArray lignes = jarr(c, "lignes");
            String id = s(p, "id", "");
            for (int i = 0; i < lignes.length(); i++) {
                JSONObject li = lignes.optJSONObject(i);
                if (li != null && id.equals(s(li, "id", ""))) {
                    li.put("q", li.optInt("q", 1) + 1);
                    sauver(); afficher("commande"); return;
                }
            }
            JSONObject li = new JSONObject();
            li.put("id", id);
            li.put("nom", s(p, "nom", "—"));
            li.put("pv", p.optDouble("pv", 0));
            li.put("tva", p.optDouble("tva", 0.1));
            li.put("q", 1);
            lignes.put(li);
            sauver(); afficher("commande");
        } catch (Exception e) { toast("Erreur : " + e.getMessage()); }
    }

    private void encaisser(JSONObject c) {
        try {
            c.put("total", totalCommande(c));
            c.put("heure", maintenant());
            c.put("date", aujourdhui());
            c.put("canal", "table");
            ventes().put(c);
            commandes().remove(tableCourante);
            sauver(); afficher("salle");
            toast("Vente enregistrée : " + eur(c.optDouble("total", 0)));
        } catch (Exception e) { toast("Erreur : " + e.getMessage()); }
    }

    private double totalCommande(JSONObject c) {
        double t = 0;
        JSONArray lignes = jarr(c, "lignes");
        for (int i = 0; i < lignes.length(); i++) {
            JSONObject li = lignes.optJSONObject(i);
            if (li != null) t += li.optDouble("pv", 0) * li.optInt("q", 1);
        }
        return Math.round(t * 100) / 100.0;
    }

    // ==========================================================
    //  VENTES DU JOUR
    // ==========================================================
    private void ecranVentes() {
        contenu.addView(bouton("← Menu", BEIGE, "#2B2B28", new View.OnClickListener() {
            public void onClick(View v) { afficher("menu"); }
        }));
        contenu.addView(espace(10));
        String jour = aujourdhui();
        JSONArray ventes = ventes();
        double ca = 0; int nb = 0;
        java.util.HashMap<String, Integer> best = new java.util.HashMap<>();
        for (int i = 0; i < ventes.length(); i++) {
            JSONObject v = ventes.optJSONObject(i);
            if (v == null || !jour.equals(s(v, "date", ""))) continue;
            nb++;
            ca += v.optDouble("total", 0);
            JSONArray lignes = jarr(v, "lignes");
            for (int k = 0; k < lignes.length(); k++) {
                JSONObject li = lignes.optJSONObject(k);
                if (li == null) continue;
                String nom = s(li, "nom", "");
                Integer n = best.get(nom);
                best.put(nom, (n == null ? 0 : n) + li.optInt("q", 1));
            }
        }
        LinearLayout resume = colonne();
        resume.setBackground(fondBord(ARDOISE, TRAIT, 14, 1));
        resume.setPadding(dp(16), dp(14), dp(16), dp(14));
        TextView caT = texte("Chiffre d'affaires du jour", 13, "#BFD8A8", false);
        resume.addView(caT);
        resume.addView(texte(eur(ca), 30, "#FFFFFF", true));
        resume.addView(texte(nb + " ticket" + (nb > 1 ? "s" : "") + "  ·  ticket moyen "
                + eur(nb > 0 ? ca / nb : 0), 13, JAUNE, false));
        contenu.addView(resume);
        contenu.addView(espace(12));

        if (!best.isEmpty()) {
            contenu.addView(texte("Meilleures ventes du jour", 14, ROUGE_F, true));
            contenu.addView(espace(4));
            java.util.List<java.util.Map.Entry<String, Integer>> top =
                    new java.util.ArrayList<>(best.entrySet());
            java.util.Collections.sort(top, new java.util.Comparator<java.util.Map.Entry<String, Integer>>() {
                public int compare(java.util.Map.Entry<String, Integer> a, java.util.Map.Entry<String, Integer> b) {
                    return b.getValue() - a.getValue();
                }
            });
            int affiches = 0;
            for (java.util.Map.Entry<String, Integer> e : top) {
                if (affiches++ == 5) break;
                contenu.addView(texte("· " + e.getKey() + "  × " + e.getValue(), 13, "#2B2B28", false));
            }
            contenu.addView(espace(12));
        }

        contenu.addView(texte("Tickets du jour", 14, ROUGE_F, true));
        contenu.addView(espace(4));
        boolean aucun = true;
        for (int i = ventes.length() - 1; i >= 0; i--) {
            final JSONObject v = ventes.optJSONObject(i);
            if (v == null || !jour.equals(s(v, "date", ""))) continue;
            aucun = false;
            LinearLayout l = colonne();
            l.setBackground(fondBord("#FFFFFF", TRAIT, 8, 1));
            l.setPadding(dp(10), dp(6), dp(10), dp(6));
            l.addView(texte(s(v, "heure", "") + "  ·  " + s(v, "table", s(v, "client", "—"))
                    + "  ·  " + eur(v.optDouble("total", 0)), 13.5f, "#2B2B28", true));
            l.setOnClickListener(new View.OnClickListener() {
                public void onClick(View v2) {
                    tableCourante = s(v, "table", "");
                    derniereVente = v;
                    afficher("ticket");
                }
            });
            contenu.addView(l);
            contenu.addView(espace(4));
        }
        if (aucun) contenu.addView(texte("Aucune vente aujourd'hui — encaissez une commande "
                + "depuis la Salle.", 13, GRIS, false));
    }

    private JSONObject derniereVente = null;

    private void ecranTicket() {
        JSONObject v = derniereVente;
        if (v == null) { afficher("ventes"); return; }
        contenu.addView(bouton("← Ventes", BEIGE, "#2B2B28", new View.OnClickListener() {
            public void onClick(View v2) { afficher("ventes"); }
        }));
        contenu.addView(espace(10));
        LinearLayout l = colonne();
        l.setBackground(fondBord(CREME, TRAIT, 12, 1));
        l.setPadding(dp(16), dp(14), dp(16), dp(14));
        l.addView(texte("Ticket — " + s(v, "table", s(v, "client", "")), 16, ROUGE_F, true));
        l.addView(texte(s(v, "date", "") + " à " + s(v, "heure", ""), 12.5f, GRIS, false));
        l.addView(espace(8));
        JSONArray lignes = jarr(v, "lignes");
        for (int i = 0; i < lignes.length(); i++) {
            JSONObject li = lignes.optJSONObject(i);
            if (li != null)
                l.addView(texte(li.optInt("q", 1) + " × " + s(li, "nom", "") + "   "
                        + eur(li.optDouble("pv", 0) * li.optInt("q", 1)), 14, "#2B2B28", false));
        }
        l.addView(espace(8));
        l.addView(texte("TOTAL : " + eur(v.optDouble("total", 0)), 17, ROUGE_F, true));
        contenu.addView(l);
        contenu.addView(espace(10));
        contenu.addView(bouton("🖨️ Réimprimer le ticket", BEIGE, "#2B2B28",
                new View.OnClickListener() {
                    public void onClick(View v2) { imprimer("ticket"); }
                }));
    }

    // ==========================================================
    //  SITE EN LIGNE (serveur local)
    // ==========================================================
    private ServeurSite serveur = null;
    private ServeurCommunaute serveurCommunaute = null;

    private void ecranCommunaute() {
        contenu.addView(texte("Le serveur social est embarqué dans cette APK et démarre avec l'application.", 13.5f, GRIS, false));
        contenu.addView(espace(12));
        contenu.addView(texte("● Communauté active — port 8721", 16, "#2E7D32", true));
        contenu.addView(espace(8));
        contenu.addView(texte("Comptes, profils, photos, posts publics, commentaires, réactions, messages, partenaires, offres, fidélité, missions, badges, classement et consentements sont gérés localement.", 13.5f, "#2B2B28", false));
        contenu.addView(espace(12));
        contenu.addView(bouton("👥 Ouvrir la communauté intégrée", ROUGE, "#FFFFFF", new View.OnClickListener() {
            public void onClick(View v) { ouvrirCommunauteApercu(); }
        }));
        contenu.addView(espace(8));
        contenu.addView(bouton("🔗 Partager l'adresse communauté", BEIGE, "#2B2B28", new View.OnClickListener() {
            public void onClick(View v) { partagerCommunaute(); }
        }));
        contenu.addView(espace(12));
        contenu.addView(texte("Les données sociales sont distinctes des données de caisse et stockées dans community-data.json. Les comptes et droits ne sont pas exposés dans le site public.", 12.5f, GRIS, false));
    }

    private void ecranSite() {
        boolean actif = serveur != null && serveur.estActif();
        contenu.addView(texte("Le site clients est servi sur le réseau Wi-Fi du restaurant : "
                + "les clients scannent l'adresse, composent leur panier et envoient leur commande, "
                + "qui apparaît dans la Salle.", 13.5f, GRIS, false));
        contenu.addView(espace(12));

        TextView etat = texte(actif ? "● Serveur ACTIF — port 8720" : "○ Serveur arrêté",
                16, actif ? "#2E7D32" : GRIS, true);
        contenu.addView(etat);
        contenu.addView(espace(8));
        if (actif) {
            contenu.addView(texte("Adresse pour les clients (écran du restaurant) :\n"
                    + adresseLocale() + ":" + 8720 + "/", 13, "#2B2B28", false));
            contenu.addView(espace(10));
            contenu.addView(bouton("⏹ Arrêter le serveur", "#7A1018", "#FFFFFF",
                    new View.OnClickListener() {
                        public void onClick(View v) {
                            if (serveur != null) serveur.arreter();
                            toast("Serveur arrêté");
                            afficher("site");
                        }
                    }));
        } else {
            contenu.addView(bouton("▶ Démarrer le serveur", "#2E7D32", "#FFFFFF",
                    new View.OnClickListener() {
                        public void onClick(View v) {
                            demarrerServeur();
                            afficher("site");
                        }
                    }));
        }
        contenu.addView(espace(10));
        contenu.addView(bouton("👁️ Ouvrir le site (aperçu intégré)", ROUGE, "#FFFFFF",
                new View.OnClickListener() {
                    public void onClick(View v) { ouvrirSiteApercu(); }
                }));
        contenu.addView(espace(6));
        contenu.addView(bouton("🔗 Partager l'adresse aux clients", BEIGE, "#2B2B28",
                new View.OnClickListener() {
                    public void onClick(View v) { partagerSite(); }
                }));
        contenu.addView(espace(6));
        contenu.addView(bouton("📣 Éditer les communications du site", BEIGE, "#2B2B28",
                new View.OnClickListener() {
                    public void onClick(View v) { afficher("com"); }
                }));
        contenu.addView(espace(16));

        JSONArray enLigne = commandesEnLigne();
        contenu.addView(texte("Commandes reçues : " + enLigne.length(), 14, ROUGE_F, true));
        contenu.addView(espace(6));
        for (int i = enLigne.length() - 1; i >= 0; i--) {
            JSONObject c = enLigne.optJSONObject(i);
            if (c == null) continue;
            contenu.addView(texte("· " + s(c, "heure", "") + " — " + s(c, "client", "Client")
                    + " — " + eur(c.optDouble("total", 0)), 13, "#2B2B28", false));
        }
        if (enLigne.length() > 0) {
            contenu.addView(espace(8));
            contenu.addView(texte("Encaissez-les depuis l'écran Salle.", 12.5f, GRIS, false));
        }
    }

    private String adresseLocale() {
        try {
            java.util.Enumeration<java.net.NetworkInterface> nis =
                    java.net.NetworkInterface.getNetworkInterfaces();
            while (nis.hasMoreElements()) {
                java.net.NetworkInterface ni = nis.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                java.util.Enumeration<java.net.InetAddress> ad = ni.getInetAddresses();
                while (ad.hasMoreElements()) {
                    java.net.InetAddress a = ad.nextElement();
                    if (a instanceof java.net.Inet4Address && !a.isLoopbackAddress())
                        return a.getHostAddress();
                }
            }
        } catch (Exception ignored) { }
        return "192.168.x.x";
    }

    private void demarrerServeur() {
        arreterServeur();
        serveur = new ServeurSite(8720, new ServeurSite.Ecouteur() {
            public String catalogueJson() { return jarr(donnees, "carte").toString(); }
            public String commJson() { return comms().toString(); }
            public String momentJson() { return jobj(donnees, "moment").toString(); }
            public String etablissementJson() {
                try {
                    JSONObject conf = jobj(donnees, "config");
                    JSONObject e = new JSONObject();
                    e.put("nom", "La Trattoria");
                    e.put("adresse", "15 rue de la Poste, 17100 Saintes");
                    e.put("telephone", "06 27 21 31 90");
                    JSONArray b = conf.optJSONArray("badges");
                    if (b == null) {
                        b = new JSONArray();
                        b.put("Tout est fait maison").put("Tout est frais").put("Bio dès que possible");
                    }
                    e.put("badges", b);
                    return e.toString();
                } catch (Exception e2) { return "{}"; }
            }
            public void commandeRecue(JSONObject c) {
                runOnUiThread(new Runnable() {
                    public void run() {
                        commandesEnLigne().put(c);
                        sauver();
                        toast("🌐 Nouvelle commande du site : " + s(c, "client", "client")
                                + " (" + eur(c.optDouble("total_verifie", c.optDouble("total", 0))) + ")");
                        if ("salle".equals(ecran) || "site".equals(ecran)) afficher(ecran);
                    }
                });
            }
            public void reservationRecue(JSONObject r) {
                runOnUiThread(new Runnable() {
                    public void run() {
                        jarr(donnees, "reservations").put(r);
                        sauver();
                        toast("📅 Nouvelle demande de réservation");
                        if ("site".equals(ecran) || "com".equals(ecran)) afficher(ecran);
                    }
                });
            }
            public void partenaireMessage(JSONObject m) {
                runOnUiThread(new Runnable() {
                    public void run() {
                        jarr(donnees, "messagesPartenaires").put(m);
                        sauver();
                        toast("🤝 Message partenaire reçu");
                    }
                });
            }
            public String journal() { return ""; }
        }, this);
        serveur.demarrer();
        toast("Serveur démarré sur le port 8720");
    }

    private void demarrerCommunaute() {
        arreterCommunaute();
        serveurCommunaute = new ServeurCommunaute(this);
        serveurCommunaute.start();
    }

    private void arreterCommunaute() {
        if (serveurCommunaute != null) serveurCommunaute.stop();
    }

    private void arreterServeur() {
        if (serveur != null) serveur.arreter();
    }

    // ==========================================================
    //  ADMINISTRATION
    // ==========================================================
    private void ecranAdmin() {
        final JSONObject conf = jobj(donnees, "config");
        contenu.addView(texte("Paramètres du restaurant.", 13.5f, GRIS, false));
        contenu.addView(espace(12));
        contenu.addView(bouton("🪑 Plan de salle (zones et tables)", BEIGE, "#2B2B28",
                new View.OnClickListener() {
                    public void onClick(View v) {
                        final EditText e = champ(s(conf, "tablesTexte", "Interieur:8,Terrasse:6"),
                                "Format : Zone:nbTables, Zone2:nb2");
                        new AlertDialog.Builder(MainActivity.this)
                                .setTitle("Plan de salle")
                                .setMessage("Exemple : Interieur:8,Terrasse:6")
                                .setView(e)
                                .setPositiveButton("Enregistrer", new DialogInterface.OnClickListener() {
                                    public void onClick(DialogInterface d, int w) {
                                        try {
                                            conf.put("tablesTexte", e.getText().toString().trim());
                                            sauver(); afficher("admin"); toast("Plan de salle mis à jour");
                                        } catch (Exception e2) { }
                                    }
                                })
                                .setNegativeButton("Annuler", null).show();
                    }
                }));
        contenu.addView(espace(8));
        contenu.addView(bouton("📱 Ardoise & site (promesses, QR)", BEIGE, "#2B2B28",
                new View.OnClickListener() {
                    public void onClick(View v) { afficher("ardoise"); }
                }));
        contenu.addView(espace(14));
        contenu.addView(texte("Contact du restaurant (figuré sur les documents) :\n"
                + "La Trattoria — 15 rue de la poste, 17100 Saintes\n"
                + "06 27 21 31 90 — alexis.coudret@outlook.fr\n"
                + "SIRET 106 050 263 00016", 12.5f, GRIS, false));
        contenu.addView(espace(12));
        contenu.addView(bouton("🗑 Effacer toutes les ventes enregistrées", "#FFFFFF", "#7A1018",
                new View.OnClickListener() {
                    public void onClick(View v) {
                        new AlertDialog.Builder(MainActivity.this)
                                .setTitle("Effacer l'historique des ventes ?")
                                .setPositiveButton("Effacer", new DialogInterface.OnClickListener() {
                                    public void onClick(DialogInterface d, int w) {
                                        try { donnees.put("ventes", new JSONArray()); } catch (Exception ignored) { }
                                        sauver(); toast("Historique effacé");
                                    }
                                })
                                .setNegativeButton("Annuler", null).show();
                    }
                }));
    }


    // ==========================================================
    //  Écran : cartes (sommaire)
    // ==========================================================
    private void ecranCartes() {
        contenu.addView(bloc("1 · La carte standard",
                "Les produits et les catégories : ajouter, modifier, supprimer — tout est mémorisé.",
                "Éditer les produits et catégories", new View.OnClickListener() {
                    public void onClick(View v) { afficher("standard"); }
                }, "🖨️ Aperçu / Imprimer (A4)", new View.OnClickListener() {
                    public void onClick(View v) { imprimer("A4"); }
                }));
        contenu.addView(espace(14));
        contenu.addView(bloc("2 · Les cartes du moment",
                "Plats, boissons, vins & alcools, glaces L'Angelys, desserts, bières — "
                        + "ardoise craie, illustrations, prix HT, mentions obligatoires.",
                "Éditer les cartes du moment", new View.OnClickListener() {
                    public void onClick(View v) { afficher("moment"); }
                }, null, null));
        contenu.addView(espace(14));
        contenu.addView(bloc("3 · L'ardoise & QR",
                "L'ardoise principale : en-tête, promesses de la maison, adresse du site.",
                "Éditer l'ardoise", new View.OnClickListener() {
                    public void onClick(View v) { afficher("ardoise"); }
                }, null, null));
    }

    private LinearLayout bloc(String titre, String aide, String b1t, View.OnClickListener b1c,
                              String b2t, View.OnClickListener b2c) {
        LinearLayout l = colonne();
        l.setBackground(fondBord(CREME, TRAIT, 14, 1));
        l.setPadding(dp(16), dp(16), dp(16), dp(16));
        l.addView(texte(titre, 17, ROUGE_F, true));
        l.addView(espace(6));
        l.addView(texte(aide, 13.5f, GRIS, false));
        l.addView(espace(10));
        l.addView(bouton(b1t, ROUGE, "#FFFFFF", b1c));
        if (b2t != null) {
            l.addView(espace(8));
            l.addView(bouton(b2t, BEIGE, "#2B2B28", b2c));
        }
        return l;
    }

    // ==========================================================
    //  Écran : carte standard — catégories
    // ==========================================================
    private void ecranStandard() {
        contenu.addView(texte("Les catégories de la carte. Toucher une catégorie pour "
                + "éditer ses produits. Appui long pour renommer ou supprimer.", 13.5f, GRIS, false));
        contenu.addView(espace(10));

        JSONArray carte = jarr(donnees, "carte");
        java.util.LinkedHashMap<String, Integer> fams = new java.util.LinkedHashMap<>();
        for (int i = 0; i < carte.length(); i++) {
            JSONObject p = carte.optJSONObject(i);
            if (p == null) continue;
            String fam = s(p, "fam", "Divers");
            Integer n = fams.get(fam);
            fams.put(fam, (n == null ? 0 : n) + 1);
        }
        for (final String fam : fams.keySet()) {
            LinearLayout l = colonne();
            l.setBackground(fondBord("#FFFFFF", TRAIT, 10, 1));
            l.setPadding(dp(14), dp(12), dp(14), dp(12));
            LinearLayout ligne = new LinearLayout(this);
            ligne.setOrientation(LinearLayout.HORIZONTAL);
            ligne.setGravity(Gravity.CENTER_VERTICAL);
            TextView nom = texte(fam, 16, "#2B2B28", true);
            nom.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            ligne.addView(nom);
            Button renommer = bouton("✏️", BEIGE, "#2B2B28", new View.OnClickListener() {
                public void onClick(View v) { renommerCategorie(fam); }
            });
            renommer.setPadding(dp(14), 0, dp(14), 0);
            ligne.addView(renommer);
            ligne.addView(espace(6));
            Button suppr = bouton("🗑", BEIGE, "#7A1018", new View.OnClickListener() {
                public void onClick(View v) { supprimerCategorie(fam); }
            });
            suppr.setPadding(dp(14), 0, dp(14), 0);
            ligne.addView(suppr);
            l.addView(ligne);
            l.addView(espace(4));
            l.addView(texte(fams.get(fam) + " produit(s) — toucher pour éditer", 12.5f, GRIS, false));
            l.setOnClickListener(new View.OnClickListener() {
                public void onClick(View v) { catCourante = fam; afficher("produits"); }
            });
            contenu.addView(l);
            contenu.addView(espace(8));
        }

        contenu.addView(espace(6));
        contenu.addView(bouton("＋ Ajouter une catégorie", ARDOISE, JAUNE, new View.OnClickListener() {
            public void onClick(View v) { ajouterCategorie(); }
        }));
    }

    private void renommerCategorie(final String fam) {
        final EditText e = champ(fam, "Nouveau nom");
        new AlertDialog.Builder(this)
                .setTitle("Renommer la catégorie")
                .setView(e)
                .setPositiveButton("Renommer", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) {
                        String n = e.getText().toString().trim();
                        if (n.isEmpty() || n.equals(fam)) return;
                        JSONArray carte = jarr(donnees, "carte");
                        for (int i = 0; i < carte.length(); i++) {
                            JSONObject p = carte.optJSONObject(i);
                            if (p != null && fam.equals(s(p, "fam", ""))) {
                                try { p.put("fam", n); } catch (Exception ignored) { }
                            }
                        }
                        // renommer aussi dans l'ordre des fams si présent
                        try {
                            JSONObject conf = jobj(donnees, "config");
                            JSONObject fams = jobj(conf, "fams");
                            if (fams.has(fam)) {
                                JSONObject f = fams.getJSONObject(fam);
                                f.put("titre", n);
                                fams.remove(fam);
                                fams.put(n, f);
                            }
                        } catch (Exception ignored) { }
                        sauver(); afficher("standard"); toast("Catégorie renommée : " + n);
                    }
                })
                .setNegativeButton("Annuler", null).show();
    }

    private void supprimerCategorie(final String fam) {
        new AlertDialog.Builder(this)
                .setTitle("Supprimer « " + fam + " » ?")
                .setMessage("Tous les produits de cette catégorie seront supprimés.")
                .setPositiveButton("Supprimer", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) {
                        JSONArray garde = new JSONArray();
                        JSONArray carte = jarr(donnees, "carte");
                        for (int i = 0; i < carte.length(); i++) {
                            JSONObject p = carte.optJSONObject(i);
                            if (p != null && !fam.equals(s(p, "fam", ""))) garde.put(p);
                        }
                        try { donnees.put("carte", garde); } catch (Exception ignored) { }
                        try {
                            JSONObject fams = jobj(jobj(donnees, "config"), "fams");
                            fams.remove(fam);
                        } catch (Exception ignored) { }
                        sauver(); afficher("standard"); toast("Catégorie supprimée");
                    }
                })
                .setNegativeButton("Annuler", null).show();
    }

    private void ajouterCategorie() {
        final EditText e = champ("", "Nom de la nouvelle catégorie");
        new AlertDialog.Builder(this)
                .setTitle("Ajouter une catégorie")
                .setView(e)
                .setPositiveButton("Ajouter", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) {
                        String n = e.getText().toString().trim();
                        if (n.isEmpty()) { toast("Nom requis"); return; }
                        try {
                            JSONObject p = new JSONObject();
                            p.put("id", "u" + System.currentTimeMillis());
                            p.put("type", "plat");
                            p.put("fam", n);
                            p.put("cat", "");
                            p.put("nom", "Nouveau produit");
                            p.put("desc", "");
                            p.put("sous", "");
                            p.put("pv", 0);
                            p.put("tva", 0.1);
                            p.put("actif", true);
                            JSONArray carte = jarr(donnees, "carte");
                            carte.put(p);
                            donnees.put("carte", carte);
                        } catch (Exception ignored) { }
                        sauver(); catCourante = n; afficher("produits");
                        toast("Catégorie créée — ajoutez vos produits");
                    }
                })
                .setNegativeButton("Annuler", null).show();
    }

    // ==========================================================
    //  Écran : produits d'une catégorie
    // ==========================================================
    private void ecranProduits() {
        JSONArray carte = jarr(donnees, "carte");
        contenu.addView(bouton("← Catégories", BEIGE, "#2B2B28", new View.OnClickListener() {
            public void onClick(View v) { afficher("standard"); }
        }));
        contenu.addView(espace(10));
        int n = 0;
        for (int i = 0; i < carte.length(); i++) {
            final JSONObject p = carte.optJSONObject(i);
            if (p == null || !catCourante.equals(s(p, "fam", ""))) continue;
            n++;
            LinearLayout l = colonne();
            l.setBackground(fondBord("#FFFFFF", TRAIT, 10, 1));
            l.setPadding(dp(12), dp(10), dp(12), dp(10));
            LinearLayout ligne = new LinearLayout(this);
            ligne.setOrientation(LinearLayout.HORIZONTAL);
            ligne.setGravity(Gravity.CENTER_VERTICAL);
            LinearLayout infos = colonne();
            infos.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            String nomT = s(p, "nom", "—") + (bo(p, "actif") ? "" : "  (masqué)");
            infos.addView(texte(nomT, 15, "#2B2B28", true));
            String desc = s(p, "sous", null);
            if (desc == null || desc.isEmpty()) desc = s(p, "desc", "");
            if (!desc.isEmpty()) infos.addView(texte(desc, 12, GRIS, false));
            double pv = d(p, "pv");
            double tva = p.optDouble("tva", 0.1);
            infos.addView(texte(eurHT(pv, tva) + "   ·   TTC " + eur(pv), 12.5f, ROUGE_F, false));
            ligne.addView(infos);
            Button suppr = bouton("🗑", BEIGE, "#7A1018", new View.OnClickListener() {
                public void onClick(View v) { supprimerProduit(p); }
            });
            suppr.setPadding(dp(14), 0, dp(14), 0);
            ligne.addView(suppr);
            l.addView(ligne);
            l.setOnClickListener(new View.OnClickListener() {
                public void onClick(View v) { editerProduit(p, false); }
            });
            contenu.addView(l);
            contenu.addView(espace(6));
        }
        if (n == 0) contenu.addView(texte("Aucun produit — ajoutez-en un.", 14, GRIS, false));
        contenu.addView(espace(8));
        contenu.addView(bouton("＋ Ajouter un produit", ARDOISE, JAUNE, new View.OnClickListener() {
            public void onClick(View v) { editerProduit(null, true); }
        }));
    }

    private void supprimerProduit(final JSONObject p) {
        new AlertDialog.Builder(this)
                .setTitle("Supprimer « " + s(p, "nom", "") + " » ?")
                .setPositiveButton("Supprimer", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) {
                        JSONArray garde = new JSONArray();
                        JSONArray carte = jarr(donnees, "carte");
                        String id = s(p, "id", "");
                        for (int i = 0; i < carte.length(); i++) {
                            JSONObject q = carte.optJSONObject(i);
                            if (q != null && !id.equals(s(q, "id", ""))) garde.put(q);
                        }
                        try { donnees.put("carte", garde); } catch (Exception ignored) { }
                        sauver(); afficher("produits"); toast("Produit supprimé");
                    }
                })
                .setNegativeButton("Annuler", null).show();
    }

    private void editerProduit(final JSONObject p, final boolean nouveau) {
        ScrollView form = new ScrollView(this);
        LinearLayout l = colonne();
        final EditText nom = champ(s(p, "nom", ""), "Nom du produit");
        final EditText sous = champ(s(p, "sous", ""), "Sous-titre (facultatif)");
        final EditText desc = champ(s(p, "desc", ""), "Descriptif (facultatif)");
        final EditText pv = champ(p.has("pv") ? String.valueOf(d(p, "pv")) : "", "Prix TTC en €");
        pv.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        final EditText tva = champ(String.valueOf(p.optDouble("tva", 0.1)), "TVA (0.1, 0.055 ou 0.2)");
        tva.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        final CheckBox actif = new CheckBox(this);
        actif.setText("Visible sur la carte");
        actif.setChecked(p.has("actif") ? bo(p, "actif") : true);
        l.addView(texte("Nom", 12, GRIS, false)); l.addView(nom);
        l.addView(texte("Sous-titre", 12, GRIS, false)); l.addView(sous);
        l.addView(texte("Descriptif", 12, GRIS, false)); l.addView(desc);
        l.addView(texte("Prix TTC (€)", 12, GRIS, false)); l.addView(pv);
        l.addView(texte("TVA", 12, GRIS, false)); l.addView(tva);
        l.addView(actif);
        form.addView(l);

        new AlertDialog.Builder(this)
                .setTitle(nouveau ? "Nouveau produit" : "Modifier le produit")
                .setView(form)
                .setPositiveButton("Enregistrer", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) {
                        try {
                            String nNom = nom.getText().toString().trim();
                            if (nNom.isEmpty()) { toast("Nom requis"); return; }
                            JSONObject cible = p;
                            if (nouveau) {
                                cible = new JSONObject();
                                cible.put("id", "u" + System.currentTimeMillis());
                                cible.put("type", "plat");
                                cible.put("fam", catCourante);
                                cible.put("cat", "");
                                cible.put("formats", new JSONArray());
                                cible.put("photo", JSONObject.NULL);
                                jarr(donnees, "carte").put(cible);
                            }
                            cible.put("nom", nNom);
                            cible.put("sous", sous.getText().toString().trim());
                            cible.put("desc", desc.getText().toString().trim());
                            try { cible.put("pv", Double.parseDouble(pv.getText().toString().replace(',', '.'))); }
                            catch (Exception e2) { cible.put("pv", 0); }
                            try { cible.put("tva", Double.parseDouble(tva.getText().toString().replace(',', '.'))); }
                            catch (Exception e2) { cible.put("tva", 0.1); }
                            cible.put("actif", actif.isChecked());
                            sauver(); afficher("produits"); toast("Produit enregistré");
                        } catch (Exception e3) {
                            toast("Erreur : " + e3.getMessage());
                        }
                    }
                })
                .setNegativeButton("Annuler", null).show();
    }

    // ==========================================================
    //  Écran : cartes du moment (liste)
    // ==========================================================
    private void ecranMomentListe() {
        contenu.addView(texte("Les cartes du moment — ardoise craie, illustrations, "
                + "prix HT, mentions obligatoires. Toucher une carte pour l'éditer.", 13.5f, GRIS, false));
        contenu.addView(espace(12));
        String[][] cles = {
                {"plats", "Les plats du moment"},
                {"boissons", "Les boissons du moment"},
                {"vins", "Vins & alcools du moment"},
                {"glaces", "Glaces artisanales du moment (L'Angelys)"},
                {"desserts", "Les desserts du moment"},
                {"bieres", "Les bières du moment"}
        };
        for (final String[] c : cles) {
            LinearLayout l = colonne();
            l.setBackground(fondBord("#FFFFFF", TRAIT, 10, 1));
            l.setPadding(dp(14), dp(12), dp(14), dp(12));
            l.addView(texte("✨ " + titreMoment(c[0]), 16, "#2B2B28", true));
            l.addView(espace(4));
            l.addView(texte("Éditer les lignes, le titre, le descriptif, les mentions — imprimer.",
                    12.5f, GRIS, false));
            l.setOnClickListener(new View.OnClickListener() {
                public void onClick(View v) { momentCourant = c[0]; afficher("momentEdit"); }
            });
            contenu.addView(l);
            contenu.addView(espace(8));
        }
    }

    private JSONObject confMoment(String cle) {
        JSONObject moment = jobj(donnees, "moment");
        JSONObject conf = moment.optJSONObject(cle);
        if (conf == null) {
            conf = new JSONObject();
            try {
                conf.put("titre", titreMoment(cle));
                conf.put("sous", "");
                conf.put("mentions", mentionsMoment(cle));
                conf.put("ht", true);
                conf.put("ordre", new JSONArray());
                conf.put("libres", new JSONArray());
                moment.put(cle, conf);
                donnees.put("moment", moment);
            } catch (Exception ignored) { }
        }
        try { if (!conf.has("mentions") || s(conf, "mentions", "").isEmpty()) conf.put("mentions", mentionsMoment(cle)); } catch (Exception ignored) { }
        try { if (!conf.has("ht")) conf.put("ht", true); } catch (Exception ignored) { }
        try { if (!conf.has("ordre")) conf.put("ordre", new JSONArray()); } catch (Exception ignored) { }
        try { if (!conf.has("libres")) conf.put("libres", new JSONArray()); } catch (Exception ignored) { }
        return conf;
    }

    private void ecranMomentEdit() {
        final JSONObject conf = confMoment(momentCourant);
        contenu.addView(bouton("← Cartes du moment", BEIGE, "#2B2B28", new View.OnClickListener() {
            public void onClick(View v) { afficher("moment"); }
        }));
        contenu.addView(espace(10));

        // entête : illustration
        android.widget.ImageView iv = new android.widget.ImageView(this);
        try {
            java.io.InputStream is = getAssets().open("illus-" + momentCourant + ".jpg");
            android.graphics.Bitmap bmp = android.graphics.BitmapFactory.decodeStream(is);
            is.close();
            iv.setImageBitmap(bmp);
        } catch (Exception ignored) { }
        iv.setAdjustViewBounds(true);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(180), ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.gravity = Gravity.CENTER_HORIZONTAL;
        iv.setLayoutParams(lp);
        contenu.addView(iv);
        contenu.addView(espace(10));

        // boutons édition entête
        contenu.addView(bouton("✏️ Titre, descriptif & mentions", BEIGE, "#2B2B28",
                new View.OnClickListener() {
                    public void onClick(View v) { editerMomentEntete(conf); }
                }));
        contenu.addView(espace(6));
        contenu.addView(bouton("＋ Ajouter une ligne libre", ARDOISE, JAUNE,
                new View.OnClickListener() {
                    public void onClick(View v) { ajouterLigneMoment(conf); }
                }));
        contenu.addView(espace(6));
        contenu.addView(bouton("＋ Reprendre un produit de la carte", "#FFFFFF", "#2B2B28",
                new View.OnClickListener() {
                    public void onClick(View v) { choisirProduitMoment(conf); }
                }));
        contenu.addView(espace(6));
        contenu.addView(bouton("🖨️ Aperçu / Imprimer cette carte", ROUGE, "#FFFFFF",
                new View.OnClickListener() {
                    public void onClick(View v) { imprimer("moment"); }
                }));
        contenu.addView(espace(12));

        // lignes
        JSONArray ordre = jarr(conf, "ordre");
        JSONObject libres = new JSONObject();
        JSONArray ll = jarr(conf, "libres");
        for (int i = 0; i < ll.length(); i++) {
            JSONObject x = ll.optJSONObject(i);
            if (x != null) try { libres.put(s(x, "id", ""), x); } catch (Exception ignored) { }
        }
        JSONArray carte = jarr(donnees, "carte");
        java.util.HashMap<String, JSONObject> produits = new java.util.HashMap<>();
        for (int i = 0; i < carte.length(); i++) {
            JSONObject p = carte.optJSONObject(i);
            if (p != null) try { produits.put(s(p, "id", ""), p); } catch (Exception ignored) { }
        }
        boolean ht = bo(conf, "ht");
        int idx = 0;
        for (int i = 0; i < ordre.length(); i++) {
            final String id = ordre.optString(i, null);
            if (id == null) continue;
            final boolean estLibre = libres.has(id);
            JSONObject l = libres.optJSONObject(id);
            JSONObject p = produits.get(id);
            if (!estLibre && p == null) continue;
            idx++;
            LinearLayout li = colonne();
            li.setBackground(fondBord("#FFFFFF", TRAIT, 10, 1));
            li.setPadding(dp(12), dp(8), dp(12), dp(8));
            LinearLayout ligne = new LinearLayout(this);
            ligne.setOrientation(LinearLayout.HORIZONTAL);
            ligne.setGravity(Gravity.CENTER_VERTICAL);
            LinearLayout infos = colonne();
            infos.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            String nom, sousT, prix;
            if (estLibre) {
                nom = s(l, "nom", "—");
                sousT = s(l, "sous", "");
                double pv = d(l, "prix"), tv = l.optDouble("tva", 0.1);
                prix = ht ? eurHT(pv, tv) : eur(pv);
            } else {
                nom = s(p, "nom", "—");
                sousT = s(p, "sous", null);
                if (sousT == null || sousT.isEmpty()) sousT = s(p, "desc", "");
                prix = ht ? eurHT(d(p, "pv"), p.optDouble("tva", 0.1)) : eur(d(p, "pv"));
            }
            infos.addView(texte(nom, 14.5f, "#2B2B28", true));
            if (!sousT.isEmpty()) infos.addView(texte(sousT, 11.5f, GRIS, false));
            TextView px = texte(prix, 13.5f, ROUGE_F, true);
            px.setPadding(dp(8), 0, 0, 0);
            ligne.addView(infos);
            ligne.addView(px);
            Button monter = bouton("▲", BEIGE, "#2B2B28", new View.OnClickListener() {
                public void onClick(View v) { bougerMoment(conf, id, -1); }
            });
            monter.setPadding(dp(10), 0, dp(10), 0);
            Button descendre = bouton("▼", BEIGE, "#2B2B28", new View.OnClickListener() {
                public void onClick(View v) { bougerMoment(conf, id, 1); }
            });
            descendre.setPadding(dp(10), 0, dp(10), 0);
            Button suppr = bouton("✕", BEIGE, "#7A1018", new View.OnClickListener() {
                public void onClick(View v) { supprimerLigneMoment(conf, id, estLibre); }
            });
            suppr.setPadding(dp(10), 0, dp(10), 0);
            if (estLibre) {
                Button ed = bouton("✏️", BEIGE, "#2B2B28", new View.OnClickListener() {
                    public void onClick(View v) { editerLigneMoment(conf, id); }
                });
                ed.setPadding(dp(10), 0, dp(10), 0);
                ligne.addView(ed);
            }
            ligne.addView(monter); ligne.addView(descendre); ligne.addView(suppr);
            li.addView(ligne);
            contenu.addView(li);
            contenu.addView(espace(5));
        }
        if (idx == 0) contenu.addView(texte("Carte vide — ajoutez des lignes.", 14, GRIS, false));
    }

    private void bougerMoment(JSONObject conf, String id, int delta) {
        JSONArray ordre = jarr(conf, "ordre");
        int i = -1;
        for (int k = 0; k < ordre.length(); k++) if (id.equals(ordre.optString(k, null))) { i = k; break; }
        int j = i + delta;
        if (i < 0 || j < 0 || j >= ordre.length()) return;
        String a = ordre.optString(i, null), b = ordre.optString(j, null);
        try { ordre.put(i, b); ordre.put(j, a); } catch (Exception ignored) { }
        sauver(); afficher("momentEdit");
    }

    private void supprimerLigneMoment(JSONObject conf, String id, boolean estLibre) {
        JSONArray ordre = jarr(conf, "ordre");
        JSONArray garde = new JSONArray();
        for (int k = 0; k < ordre.length(); k++) {
            String x = ordre.optString(k, null);
            if (x != null && !x.equals(id)) garde.put(x);
        }
        try { conf.put("ordre", garde); } catch (Exception ignored) { }
        if (estLibre) {
            JSONArray libres = jarr(conf, "libres");
            JSONArray gl = new JSONArray();
            for (int k = 0; k < libres.length(); k++) {
                JSONObject x = libres.optJSONObject(k);
                if (x != null && !id.equals(s(x, "id", ""))) gl.put(x);
            }
            try { conf.put("libres", gl); } catch (Exception ignored) { }
        }
        sauver(); afficher("momentEdit"); toast("Ligne retirée");
    }

    private void ajouterLigneMoment(final JSONObject conf) {
        ScrollView form = new ScrollView(this);
        LinearLayout l = colonne();
        final EditText nom = champ("", "Nom (ex. : Coupe du chef)");
        final EditText sous = champ("", "Descriptif (facultatif)");
        final EditText prix = champ("", "Prix TTC en €");
        prix.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        final EditText tva = champ("0.1", "TVA (0.1 alimentaire, 0.2 alcool)");
        tva.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        l.addView(texte("Nom", 12, GRIS, false)); l.addView(nom);
        l.addView(texte("Descriptif", 12, GRIS, false)); l.addView(sous);
        l.addView(texte("Prix TTC (€)", 12, GRIS, false)); l.addView(prix);
        l.addView(texte("TVA", 12, GRIS, false)); l.addView(tva);
        form.addView(l);
        new AlertDialog.Builder(this)
                .setTitle("Nouvelle ligne")
                .setView(form)
                .setPositiveButton("Ajouter", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) {
                        try {
                            String n = nom.getText().toString().trim();
                            if (n.isEmpty()) { toast("Nom requis"); return; }
                            JSONObject ln = new JSONObject();
                            ln.put("id", "lm" + System.currentTimeMillis());
                            ln.put("nom", n);
                            ln.put("sous", sous.getText().toString().trim());
                            double pv = 0;
                            try { pv = Double.parseDouble(prix.getText().toString().replace(',', '.')); } catch (Exception ignored) { }
                            ln.put("prix", pv);
                            double tv = 0.1;
                            try { tv = Double.parseDouble(tva.getText().toString().replace(',', '.')); } catch (Exception ignored) { }
                            ln.put("tva", tv);
                            jarr(conf, "libres").put(ln);
                            jarr(conf, "ordre").put(s(ln, "id", ""));
                            sauver(); afficher("momentEdit"); toast("Ligne ajoutée");
                        } catch (Exception e) { toast("Erreur : " + e.getMessage()); }
                    }
                })
                .setNegativeButton("Annuler", null).show();
    }

    private void editerLigneMoment(final JSONObject conf, final String id) {
        JSONArray libres = jarr(conf, "libres");
        JSONObject l = null;
        for (int i = 0; i < libres.length(); i++) {
            JSONObject x = libres.optJSONObject(i);
            if (x != null && id.equals(s(x, "id", ""))) { l = x; break; }
        }
        if (l == null) return;
        final JSONObject ligne = l;
        ScrollView form = new ScrollView(this);
        LinearLayout fx = colonne();
        final EditText nom = champ(s(ligne, "nom", ""), "Nom");
        final EditText sous = champ(s(ligne, "sous", ""), "Descriptif");
        final EditText prix = champ(String.valueOf(d(ligne, "prix")), "Prix TTC en €");
        prix.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        final EditText tva = champ(String.valueOf(ligne.optDouble("tva", 0.1)), "TVA");
        tva.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        fx.addView(texte("Nom", 12, GRIS, false)); fx.addView(nom);
        fx.addView(texte("Descriptif", 12, GRIS, false)); fx.addView(sous);
        fx.addView(texte("Prix TTC (€)", 12, GRIS, false)); fx.addView(prix);
        fx.addView(texte("TVA", 12, GRIS, false)); fx.addView(tva);
        form.addView(fx);
        new AlertDialog.Builder(this)
                .setTitle("Modifier la ligne")
                .setView(form)
                .setPositiveButton("Enregistrer", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) {
                        try {
                            String n = nom.getText().toString().trim();
                            if (n.isEmpty()) { toast("Nom requis"); return; }
                            ligne.put("nom", n);
                            ligne.put("sous", sous.getText().toString().trim());
                            try { ligne.put("prix", Double.parseDouble(prix.getText().toString().replace(',', '.'))); } catch (Exception ignored) { }
                            try { ligne.put("tva", Double.parseDouble(tva.getText().toString().replace(',', '.'))); } catch (Exception ignored) { }
                            sauver(); afficher("momentEdit"); toast("Ligne enregistrée");
                        } catch (Exception e) { toast("Erreur : " + e.getMessage()); }
                    }
                })
                .setNegativeButton("Annuler", null).show();
    }

    private void choisirProduitMoment(final JSONObject conf) {
        JSONArray carte = jarr(donnees, "carte");
        JSONArray ordre = jarr(conf, "ordre");
        java.util.List<String> ids = new java.util.ArrayList<>();
        java.util.List<String> noms = new java.util.ArrayList<>();
        java.util.List<Boolean> coches = new java.util.ArrayList<>();
        for (int i = 0; i < carte.length(); i++) {
            JSONObject p = carte.optJSONObject(i);
            if (p == null || !bo(p, "actif")) continue;
            String id = s(p, "id", "");
            ids.add(id);
            noms.add(s(p, "nom", "—") + "  ·  " + s(p, "fam", ""));
            coches.add(ordre.toString().contains("\"" + id + "\""));
        }
        final String[] fIds = ids.toArray(new String[0]);
        final String[] fNoms = noms.toArray(new String[0]);
        final boolean[] fCoches = new boolean[coches.size()];
        for (int i = 0; i < coches.size(); i++) fCoches[i] = coches.get(i);
        new AlertDialog.Builder(this)
                .setTitle("Produits à inclure")
                .setMultiChoiceItems(fNoms, fCoches, new DialogInterface.OnMultiChoiceClickListener() {
                    public void onClick(DialogInterface d, int w, boolean c) { fCoches[w] = c; }
                })
                .setPositiveButton("Valider", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) {
                        // conserver l'ordre des lignes libres, remplacer les produits
                        JSONArray ancien = jarr(conf, "ordre");
                        JSONObject libres = new JSONObject();
                        JSONArray ll = jarr(conf, "libres");
                        for (int i = 0; i < ll.length(); i++) {
                            JSONObject x = ll.optJSONObject(i);
                            if (x != null) try { libres.put(s(x, "id", ""), x); } catch (Exception ignored) { }
                        }
                        JSONArray nOrdre = new JSONArray();
                        for (int i = 0; i < fIds.length; i++) {
                            if (fCoches[i]) nOrdre.put(fIds[i]);
                        }
                        for (int i = 0; i < ancien.length(); i++) {
                            String x = ancien.optString(i, null);
                            if (x != null && libres.has(x) && nOrdre.toString().indexOf("\"" + x + "\"") < 0)
                                nOrdre.put(x);
                        }
                        try { conf.put("ordre", nOrdre); } catch (Exception ignored) { }
                        sauver(); afficher("momentEdit"); toast("Sélection enregistrée");
                    }
                })
                .setNegativeButton("Annuler", null).show();
    }

    private void editerMomentEntete(final JSONObject conf) {
        ScrollView form = new ScrollView(this);
        LinearLayout l = colonne();
        final EditText titre = champ(s(conf, "titre", titreMoment(momentCourant)), "Titre affiché");
        final EditText sous = champ(s(conf, "sous", ""), "Descriptif (sous le titre)");
        final EditText mentions = new EditText(this);
        mentions.setText(s(conf, "mentions", mentionsMoment(momentCourant)));
        mentions.setTextSize(14);
        mentions.setMinLines(3);
        mentions.setGravity(Gravity.TOP);
        final CheckBox ht = new CheckBox(this);
        ht.setText("Afficher les prix hors taxes (HT)");
        ht.setChecked(bo(conf, "ht"));
        l.addView(texte("Titre", 12, GRIS, false)); l.addView(titre);
        l.addView(texte("Descriptif", 12, GRIS, false)); l.addView(sous);
        l.addView(ht);
        l.addView(texte("Mentions obligatoires (bas de carte)", 12, GRIS, false)); l.addView(mentions);
        form.addView(l);
        new AlertDialog.Builder(this)
                .setTitle("En-tête de la carte")
                .setView(form)
                .setPositiveButton("Enregistrer", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) {
                        try {
                            String t = titre.getText().toString().trim();
                            conf.put("titre", t.isEmpty() ? titreMoment(momentCourant) : t);
                            conf.put("sous", sous.getText().toString().trim());
                            conf.put("ht", ht.isChecked());
                            String m = mentions.getText().toString().trim();
                            conf.put("mentions", m.isEmpty() ? mentionsMoment(momentCourant) : m);
                            sauver(); afficher("momentEdit"); toast("Carte mise à jour");
                        } catch (Exception e) { toast("Erreur : " + e.getMessage()); }
                    }
                })
                .setNegativeButton("Annuler", null).show();
    }

    // ==========================================================
    //  ÉCRAN : STOCK
    // ==========================================================
    private void ecranStock() {
        contenu.addView(bouton("← Menu", BEIGE, "#2B2B28", new View.OnClickListener() {
            public void onClick(View v) { afficher("menu"); }
        }));
        contenu.addView(espace(10));
        JSONArray stock = Modules.stock(donnees);
        JSONArray aCom = Modules.aCommander(donnees);

        if (aCom.length() > 0) {
            LinearLayout alerte = colonne();
            alerte.setBackground(fondBord("#FDF3D7", "#E5C55B", 12, 1));
            alerte.setPadding(dp(14), dp(12), dp(14), dp(12));
            alerte.addView(texte("⚠ " + aCom.length() + " article(s) sous le seuil — à commander",
                    14, "#7A6000", true));
            for (int i = 0; i < aCom.length(); i++) {
                JSONObject c = aCom.optJSONObject(i);
                if (c != null)
                    alerte.addView(texte("· " + c.optString("nom", "") + " — "
                            + c.optDouble("qte", 0) + " " + c.optString("unite", ""), 13, "#2B2B28", false));
            }
            contenu.addView(alerte);
            contenu.addView(espace(12));
        }

        contenu.addView(texte("Inventaire (" + stock.length() + " articles)", 14, ROUGE_F, true));
        contenu.addView(espace(6));
        for (int i = 0; i < stock.length(); i++) {
            final JSONObject a = stock.optJSONObject(i);
            if (a == null) continue;
            LinearLayout l = colonne();
            l.setBackground(fondBord("#FFFFFF", TRAIT, 8, 1));
            l.setPadding(dp(10), dp(6), dp(10), dp(6));
            LinearLayout ligne = new LinearLayout(this);
            ligne.setOrientation(LinearLayout.HORIZONTAL);
            ligne.setGravity(Gravity.CENTER_VERTICAL);
            TextView t = texte(s(a, "nom", "—") + "   " + a.optDouble("qte", 0)
                    + " " + s(a, "unite", "u"), 14, "#2B2B28", true);
            t.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            ligne.addView(t);
            Button moins = bouton("−", BEIGE, "#2B2B28", new View.OnClickListener() {
                public void onClick(View v) {
                    try { a.put("qte", Math.max(0, a.optDouble("qte", 0) - 1)); sauver(); afficher("stock"); }
                    catch (Exception e) { }
                }
            });
            moins.setPadding(dp(12), 0, dp(12), 0);
            Button plus = bouton("+", BEIGE, "#2B2B28", new View.OnClickListener() {
                public void onClick(View v) {
                    try { a.put("qte", a.optDouble("qte", 0) + 1); sauver(); afficher("stock"); }
                    catch (Exception e) { }
                }
            });
            plus.setPadding(dp(12), 0, dp(12), 0);
            Button suppr = bouton("✕", BEIGE, "#7A1018", new View.OnClickListener() {
                public void onClick(View v) {
                    JSONArray garde = new JSONArray();
                    JSONArray ss = Modules.stock(donnees);
                    for (int k = 0; k < ss.length(); k++)
                        if (ss.opt(k) != a) garde.put(ss.opt(k));
                    try { donnees.put("stock", garde); } catch (Exception ignored) { }
                    sauver(); afficher("stock");
                }
            });
            suppr.setPadding(dp(12), 0, dp(12), 0);
            ligne.addView(moins); ligne.addView(plus); ligne.addView(suppr);
            l.addView(ligne);
            contenu.addView(l);
            contenu.addView(espace(4));
        }
        if (stock.length() == 0)
            contenu.addView(texte("Inventaire vide — ajoutez vos produits de stock.", 13, GRIS, false));
        contenu.addView(espace(10));
        contenu.addView(bouton("＋ Ajouter un article de stock", ARDOISE, JAUNE,
                new View.OnClickListener() {
                    public void onClick(View v) { ajouterArticleStock(); }
                }));
    }

    private void ajouterArticleStock() {
        ScrollView form = new ScrollView(this);
        LinearLayout l = colonne();
        final EditText nom = champ("", "Nom (ex. : Farine T55)");
        final EditText qte = champ("0", "Quantité en stock");
        qte.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        final EditText unite = champ("kg", "Unité (kg, L, u…)");
        final EditText seuil = champ("1", "Seuil d'alerte");
        seuil.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        final EditText four = champ("", "Fournisseur (facultatif)");
        l.addView(texte("Nom", 12, GRIS, false)); l.addView(nom);
        l.addView(texte("Quantité", 12, GRIS, false)); l.addView(qte);
        l.addView(texte("Unité", 12, GRIS, false)); l.addView(unite);
        l.addView(texte("Seuil d'alerte", 12, GRIS, false)); l.addView(seuil);
        l.addView(texte("Fournisseur", 12, GRIS, false)); l.addView(four);
        form.addView(l);
        new AlertDialog.Builder(this)
                .setTitle("Nouvel article de stock")
                .setView(form)
                .setPositiveButton("Ajouter", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) {
                        try {
                            String n = nom.getText().toString().trim();
                            if (n.isEmpty()) { toast("Nom requis"); return; }
                            JSONObject a = Modules.article(n,
                                    Double.parseDouble(qte.getText().toString().replace(',', '.')),
                                    unite.getText().toString().trim(),
                                    Double.parseDouble(seuil.getText().toString().replace(',', '.')),
                                    four.getText().toString().trim());
                            Modules.stock(donnees).put(a);
                            sauver(); afficher("stock"); toast("Article ajouté");
                        } catch (Exception e) { toast("Erreur : " + e.getMessage()); }
                    }
                })
                .setNegativeButton("Annuler", null).show();
    }

    // ==========================================================
    //  ÉCRAN : COMPTABILITÉ
    // ==========================================================
    private void ecranCompta() {
        contenu.addView(bouton("← Menu", BEIGE, "#2B2B28", new View.OnClickListener() {
            public void onClick(View v) { afficher("menu"); }
        }));
        contenu.addView(espace(10));
        final String mois = aujourdhui().substring(0, 7);
        JSONObject r = Modules.resultat(donnees, mois);

        LinearLayout resume = colonne();
        resume.setBackground(fondBord(ARDOISE, TRAIT, 14, 1));
        resume.setPadding(dp(16), dp(14), dp(16), dp(14));
        resume.addView(texte("Résultat — " + mois, 13, "#BFD8A8", false));
        resume.addView(texte(eur(r.optDouble("ca", 0)), 30, "#FFFFFF", true));
        resume.addView(texte("chiffre d'affaires TTC", 12.5f, JAUNE, false));
        contenu.addView(resume);
        contenu.addView(espace(12));

        LinearLayout tva = colonne();
        tva.setBackground(fondBord(CREME, TRAIT, 14, 1));
        tva.setPadding(dp(16), dp(14), dp(16), dp(14));
        tva.addView(texte("TVA collectée du mois", 15, ROUGE_F, true));
        tva.addView(espace(6));
        tva.addView(texte("TVA 10 % (alimentaire) : " + eur(r.optDouble("tva10", 0)), 13.5f, "#2B2B28", false));
        tva.addView(texte("TVA 5,5 % : " + eur(r.optDouble("tva55", 0)), 13.5f, "#2B2B28", false));
        tva.addView(texte("TVA 20 % (alcool) : " + eur(r.optDouble("tva20", 0)), 13.5f, "#2B2B28", false));
        tva.addView(espace(4));
        tva.addView(texte("Total TVA à reverser : " + eur(r.optDouble("tvaTotale", 0)),
                14.5f, ROUGE_F, true));
        contenu.addView(tva);
        contenu.addView(espace(12));

        LinearLayout res = colonne();
        res.setBackground(fondBord(CREME, TRAIT, 14, 1));
        res.setPadding(dp(16), dp(14), dp(16), dp(14));
        res.addView(texte("Dépenses du mois : " + eur(r.optDouble("depenses", 0)), 13.5f, "#2B2B28", false));
        res.addView(espace(4));
        res.addView(texte("Résultat estimé (CA − TVA − dépenses) : "
                + eur(r.optDouble("resultat", 0)), 15, ROUGE_F, true));
        contenu.addView(res);
        contenu.addView(espace(12));

        contenu.addView(texte("Dépenses enregistrées", 14, ROUGE_F, true));
        contenu.addView(espace(6));
        JSONArray dep = donnees.optJSONArray("depenses");
        if (dep != null) {
            for (int i = dep.length() - 1; i >= 0; i--) {
                final JSONObject dd = dep.optJSONObject(i);
                if (dd == null) continue;
                LinearLayout l = colonne();
                l.setBackground(fondBord("#FFFFFF", TRAIT, 8, 1));
                l.setPadding(dp(10), dp(6), dp(10), dp(6));
                LinearLayout ligne = new LinearLayout(this);
                ligne.setOrientation(LinearLayout.HORIZONTAL);
                ligne.setGravity(Gravity.CENTER_VERTICAL);
                TextView t = texte(s(dd, "date", "") + "  ·  " + s(dd, "libelle", "")
                        + "  ·  " + eur(dd.optDouble("montant", 0)), 13, "#2B2B28", false);
                t.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
                ligne.addView(t);
                Button suppr = bouton("✕", BEIGE, "#7A1018", new View.OnClickListener() {
                    public void onClick(View v) {
                        JSONArray garde = new JSONArray();
                        JSONArray all = donnees.optJSONArray("depenses");
                        if (all != null) {
                            for (int k = 0; k < all.length(); k++)
                                if (all.opt(k) != dd) garde.put(all.opt(k));
                            try { donnees.put("depenses", garde); } catch (Exception ignored) { }
                        }
                        sauver(); afficher("compta");
                    }
                });
                suppr.setPadding(dp(12), 0, dp(12), 0);
                ligne.addView(suppr);
                l.addView(ligne);
                contenu.addView(l);
                contenu.addView(espace(3));
            }
        }
        contenu.addView(espace(8));
        contenu.addView(bouton("＋ Ajouter une dépense", ARDOISE, JAUNE,
                new View.OnClickListener() {
                    public void onClick(View v) {
                        ScrollView form = new ScrollView(MainActivity.this);
                        LinearLayout l2 = colonne();
                        final EditText lib = champ("", "Libellé (ex. : Farine, gaz…)");
                        final EditText mont = champ("", "Montant €");
                        mont.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
                        l2.addView(texte("Libellé", 12, GRIS, false)); l2.addView(lib);
                        l2.addView(texte("Montant €", 12, GRIS, false)); l2.addView(mont);
                        form.addView(l2);
                        new AlertDialog.Builder(MainActivity.this)
                                .setTitle("Dépense — " + mois)
                                .setView(form)
                                .setPositiveButton("Ajouter", new DialogInterface.OnClickListener() {
                                    public void onClick(DialogInterface d2, int w2) {
                                        try {
                                            String lb = lib.getText().toString().trim();
                                            if (lb.isEmpty()) { toast("Libellé requis"); return; }
                                            double m = Double.parseDouble(
                                                    mont.getText().toString().replace(',', '.'));
                                            JSONArray all = donnees.optJSONArray("depenses");
                                            if (all == null) {
                                                all = new JSONArray();
                                                try { donnees.put("depenses", all); } catch (Exception ignored) { }
                                            }
                                            all.put(Modules.depense(aujourdhui(), lb, m));
                                            sauver(); afficher("compta"); toast("Dépense ajoutée");
                                        } catch (Exception e2) { toast("Erreur : " + e2.getMessage()); }
                                    }
                                })
                                .setNegativeButton("Annuler", null).show();
                    }
                }));
    }

    // ==========================================================
    //  ÉCRAN : OBJECTIFS
    // ==========================================================
    private void ecranObjectifs() {
        contenu.addView(bouton("← Menu", BEIGE, "#2B2B28", new View.OnClickListener() {
            public void onClick(View v) { afficher("menu"); }
        }));
        contenu.addView(espace(10));
        JSONObject av = Modules.avancement(donnees, aujourdhui());
        JSONObject obj = Modules.objectifs(donnees);

        contenu.addView(texte("Où en est-on aujourd'hui ?", 13.5f, GRIS, false));
        contenu.addView(espace(12));

        LinearLayout j1 = colonne();
        j1.setBackground(fondBord(ARDOISE, TRAIT, 14, 1));
        j1.setPadding(dp(16), dp(14), dp(16), dp(14));
        j1.addView(texte("Chiffre d'affaires", 13, "#BFD8A8", false));
        j1.addView(texte(eur(av.optDouble("ca", 0)) + " / " + eur(av.optDouble("caCible", 600)),
                24, "#FFFFFF", true));
        j1.addView(espace(6));
        LinearLayout fond1 = colonne();
        fond1.setBackground(fondBord("#3A4A42", "#3A4A42", 4, 0));
        View barre1 = new View(this);
        barre1.setBackgroundColor(c(JAUNE));
        LinearLayout.LayoutParams bp1 = new LinearLayout.LayoutParams(
                Math.max(dp(2), (int) (dp(280) * Math.min(100, av.optInt("pctCA", 0)) / 100)), dp(8));
        barre1.setLayoutParams(bp1);
        fond1.addView(barre1);
        j1.addView(fond1);
        j1.addView(espace(4));
        j1.addView(texte(av.optInt("pctCA", 0) + " % de l'objectif", 12.5f, JAUNE, false));
        contenu.addView(j1);
        contenu.addView(espace(10));

        LinearLayout j2 = colonne();
        j2.setBackground(fondBord(ARDOISE, TRAIT, 14, 1));
        j2.setPadding(dp(16), dp(14), dp(16), dp(14));
        j2.addView(texte("Couverts", 13, "#BFD8A8", false));
        j2.addView(texte(av.optInt("couverts", 0) + " / " + av.optInt("couvertsCible", 40),
                24, "#FFFFFF", true));
        j2.addView(espace(4));
        j2.addView(texte(av.optInt("pctCouverts", 0) + " % de l'objectif", 12.5f, JAUNE, false));
        contenu.addView(j2);
        contenu.addView(espace(12));

        contenu.addView(bouton("🎯 Modifier les objectifs", BEIGE, "#2B2B28",
                new View.OnClickListener() {
                    public void onClick(View v) {
                        ScrollView form = new ScrollView(MainActivity.this);
                        LinearLayout l = colonne();
                        final EditText ca = champ(String.valueOf(obj.optDouble("caJour", 600)),
                                "CA du jour cible (€)");
                        ca.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
                        final EditText co = champ(String.valueOf(obj.optInt("couverts", 40)),
                                "Couverts par jour");
                        co.setInputType(InputType.TYPE_CLASS_NUMBER);
                        l.addView(texte("CA du jour cible (€)", 12, GRIS, false)); l.addView(ca);
                        l.addView(texte("Couverts par jour", 12, GRIS, false)); l.addView(co);
                        form.addView(l);
                        new AlertDialog.Builder(MainActivity.this)
                                .setTitle("Objectifs")
                                .setView(form)
                                .setPositiveButton("Enregistrer", new DialogInterface.OnClickListener() {
                                    public void onClick(DialogInterface d, int w) {
                                        try {
                                            obj.put("caJour", Double.parseDouble(ca.getText().toString().replace(',', '.')));
                                            obj.put("couverts", Integer.parseInt(co.getText().toString().trim()));
                                            sauver(); afficher("objectifs"); toast("Objectifs mis à jour");
                                        } catch (Exception e2) { toast("Erreur : " + e2.getMessage()); }
                                    }
                                })
                                .setNegativeButton("Annuler", null).show();
                    }
                }));
    }

    // ==========================================================
    //  ÉCRAN : INVENDUS
    // ==========================================================
    private void ecranInvendus() {
        contenu.addView(bouton("← Menu", BEIGE, "#2B2B28", new View.OnClickListener() {
            public void onClick(View v) { afficher("menu"); }
        }));
        contenu.addView(espace(10));
        contenu.addView(texte("Paniers anti-gaspi : les invendus du jour à prix réduit en fin de service.",
                13.5f, GRIS, false));
        contenu.addView(espace(10));
        JSONArray inv = Modules.invendus(donnees, aujourdhui());
        for (int i = inv.length() - 1; i >= 0; i--) {
            final JSONObject x = inv.optJSONObject(i);
            if (x == null) continue;
            LinearLayout l = colonne();
            l.setBackground(fondBord("#FFFFFF", TRAIT, 8, 1));
            l.setPadding(dp(10), dp(8), dp(10), dp(8));
            LinearLayout ligne = new LinearLayout(this);
            ligne.setOrientation(LinearLayout.HORIZONTAL);
            ligne.setGravity(Gravity.CENTER_VERTICAL);
            TextView t = texte(x.optInt("qte", 1) + " × " + s(x, "nom", "") + "   à "
                    + eur(x.optDouble("prix", 0)), 14, "#2B2B28", true);
            t.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            ligne.addView(t);
            Button vendu = bouton("Vendu", "#2E7D32", "#FFFFFF", new View.OnClickListener() {
                public void onClick(View v) {
                    try { x.put("statut", "vendu"); sauver(); afficher("invendus"); }
                    catch (Exception e) { }
                }
            });
            vendu.setPadding(dp(10), 0, dp(10), 0);
            Button suppr = bouton("✕", BEIGE, "#7A1018", new View.OnClickListener() {
                public void onClick(View v) {
                    JSONArray garde = new JSONArray();
                    JSONArray all = donnees.optJSONArray("invendus");
                    if (all != null) {
                        for (int k = 0; k < all.length(); k++)
                            if (all.opt(k) != x) garde.put(all.opt(k));
                        try { donnees.put("invendus", garde); } catch (Exception ignored) { }
                    }
                    sauver(); afficher("invendus");
                }
            });
            suppr.setPadding(dp(10), 0, dp(10), 0);
            ligne.addView(vendu); ligne.addView(suppr);
            l.addView(ligne);
            if ("vendu".equals(s(x, "statut", ""))) l.setAlpha(0.5f);
            contenu.addView(l);
            contenu.addView(espace(4));
        }
        if (inv.length() == 0)
            contenu.addView(texte("Aucun invendu aujourd'hui — c'est une bonne nouvelle !",
                    13, GRIS, false));
        contenu.addView(espace(10));
        contenu.addView(bouton("＋ Déclarer un invendu", ARDOISE, JAUNE,
                new View.OnClickListener() {
                    public void onClick(View v) {
                        ScrollView form = new ScrollView(MainActivity.this);
                        LinearLayout l2 = colonne();
                        final EditText nom = champ("", "Produit (ex. : La Regina)");
                        final EditText qte = champ("1", "Quantité");
                        qte.setInputType(InputType.TYPE_CLASS_NUMBER);
                        final EditText prix = champ("5", "Prix du panier €");
                        prix.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
                        l2.addView(texte("Produit", 12, GRIS, false)); l2.addView(nom);
                        l2.addView(texte("Quantité", 12, GRIS, false)); l2.addView(qte);
                        l2.addView(texte("Prix du panier €", 12, GRIS, false)); l2.addView(prix);
                        form.addView(l2);
                        new AlertDialog.Builder(MainActivity.this)
                                .setTitle("Invendu — " + aujourdhui())
                                .setView(form)
                                .setPositiveButton("Déclarer", new DialogInterface.OnClickListener() {
                                    public void onClick(DialogInterface d, int w) {
                                        try {
                                            String n = nom.getText().toString().trim();
                                            if (n.isEmpty()) { toast("Produit requis"); return; }
                                            JSONArray all = donnees.optJSONArray("invendus");
                                            if (all == null) {
                                                all = new JSONArray();
                                                try { donnees.put("invendus", all); } catch (Exception ignored) { }
                                            }
                                            all.put(Modules.invendu(aujourdhui(), n,
                                                    Integer.parseInt(qte.getText().toString().trim()),
                                                    Double.parseDouble(prix.getText().toString().replace(',', '.'))));
                                            sauver(); afficher("invendus"); toast("Invendu déclaré");
                                        } catch (Exception e2) { toast("Erreur : " + e2.getMessage()); }
                                    }
                                })
                                .setNegativeButton("Annuler", null).show();
                    }
                }));
    }

    // ==========================================================
    //  ÉCRAN : PERSONNEL
    // ==========================================================
    private void ecranPersonnel() {
        contenu.addView(bouton("← Menu", BEIGE, "#2B2B28", new View.OnClickListener() {
            public void onClick(View v) { afficher("menu"); }
        }));
        contenu.addView(espace(10));
        contenu.addView(texte("Équipe et contrats (registre du personnel).", 13.5f, GRIS, false));
        contenu.addView(espace(10));
        JSONArray pers = donnees.optJSONArray("personnel");
        if (pers != null) {
            for (int i = 0; i < pers.length(); i++) {
                final JSONObject m = pers.optJSONObject(i);
                if (m == null) continue;
                LinearLayout l = colonne();
                l.setBackground(fondBord("#FFFFFF", TRAIT, 8, 1));
                l.setPadding(dp(10), dp(8), dp(10), dp(8));
                LinearLayout ligne = new LinearLayout(this);
                ligne.setOrientation(LinearLayout.HORIZONTAL);
                ligne.setGravity(Gravity.CENTER_VERTICAL);
                LinearLayout infos = colonne();
                infos.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
                infos.addView(texte(s(m, "nom", "—"), 14.5f, "#2B2B28", true));
                infos.addView(texte(s(m, "contrat", "contrat") + " · " + s(m, "heures", "") + " h/sem · "
                        + eur(m.optDouble("taux", 0)) + " €/h", 12.5f, GRIS, false));
                ligne.addView(infos);
                Button suppr = bouton("✕", BEIGE, "#7A1018", new View.OnClickListener() {
                    public void onClick(View v) {
                        JSONArray garde = new JSONArray();
                        JSONArray all = donnees.optJSONArray("personnel");
                        if (all != null) {
                            for (int k = 0; k < all.length(); k++)
                                if (all.opt(k) != m) garde.put(all.opt(k));
                            try { donnees.put("personnel", garde); } catch (Exception ignored) { }
                        }
                        sauver(); afficher("personnel");
                    }
                });
                suppr.setPadding(dp(12), 0, dp(12), 0);
                ligne.addView(suppr);
                l.addView(ligne);
                contenu.addView(l);
                contenu.addView(espace(4));
            }
        }
        if (pers == null || pers.length() == 0)
            contenu.addView(texte("Aucun membre enregistré.", 13, GRIS, false));
        contenu.addView(espace(10));
        contenu.addView(bouton("＋ Ajouter un membre", ARDOISE, JAUNE,
                new View.OnClickListener() {
                    public void onClick(View v) {
                        ScrollView form = new ScrollView(MainActivity.this);
                        LinearLayout l2 = colonne();
                        final EditText nom = champ("", "Nom et prénom");
                        final EditText contrat = champ("CDI", "Type de contrat (CDI, CDD, extras…)");
                        final EditText heures = champ("35", "Heures hebdomadaires");
                        heures.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
                        final EditText taux = champ("12", "Taux horaire €");
                        taux.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
                        l2.addView(texte("Nom", 12, GRIS, false)); l2.addView(nom);
                        l2.addView(texte("Contrat", 12, GRIS, false)); l2.addView(contrat);
                        l2.addView(texte("Heures/sem", 12, GRIS, false)); l2.addView(heures);
                        l2.addView(texte("Taux horaire €", 12, GRIS, false)); l2.addView(taux);
                        form.addView(l2);
                        new AlertDialog.Builder(MainActivity.this)
                                .setTitle("Nouveau membre de l'équipe")
                                .setView(form)
                                .setPositiveButton("Ajouter", new DialogInterface.OnClickListener() {
                                    public void onClick(DialogInterface d, int w) {
                                        try {
                                            String n = nom.getText().toString().trim();
                                            if (n.isEmpty()) { toast("Nom requis"); return; }
                                            JSONArray all = donnees.optJSONArray("personnel");
                                            if (all == null) {
                                                all = new JSONArray();
                                                try { donnees.put("personnel", all); } catch (Exception ignored) { }
                                            }
                                            JSONObject m = new JSONObject();
                                            m.put("nom", n);
                                            m.put("contrat", contrat.getText().toString().trim());
                                            m.put("heures", heures.getText().toString().trim());
                                            m.put("taux", Double.parseDouble(taux.getText().toString().replace(',', '.')));
                                            all.put(m);
                                            sauver(); afficher("personnel"); toast("Membre ajouté");
                                        } catch (Exception e2) { toast("Erreur : " + e2.getMessage()); }
                                    }
                                })
                                .setNegativeButton("Annuler", null).show();
                    }
                }));
    }


    // ==========================================================
    //  ÉCRAN : COMMUNICATION (messages visuels du site)
    // ==========================================================
    private JSONArray comms() { return jarr(donnees, "comm"); }

    private void ecranCom() {
        contenu.addView(bouton("← Menu", BEIGE, "#2B2B28", new View.OnClickListener() {
            public void onClick(View v) { afficher("menu"); }
        }));
        contenu.addView(espace(10));
        contenu.addView(texte("Les communications affichées en haut du site clients : "
                + "annonces, promotions, nouveautés. Modifiez-les puis visualisez le site.",
                13.5f, GRIS, false));
        contenu.addView(espace(10));
        contenu.addView(bouton("👁️ Visualiser le site (avec les communications)", ROUGE, "#FFFFFF",
                new View.OnClickListener() {
                    public void onClick(View v) { ouvrirSiteApercu(); }
                }));
        contenu.addView(espace(12));

        JSONArray cs = comms();
        for (int i = 0; i < cs.length(); i++) {
            final JSONObject m = cs.optJSONObject(i);
            if (m == null) continue;
            String type = s(m, "type", "info");
            String icone = "promo".equals(type) ? "🔥" : ("nouveaute".equals(type) ? "🆕" : "📣");
            LinearLayout l = colonne();
            l.setBackground(fondBord("#FFFFFF", TRAIT, 10, 1));
            l.setPadding(dp(12), dp(10), dp(12), dp(10));
            LinearLayout ligne = new LinearLayout(this);
            ligne.setOrientation(LinearLayout.HORIZONTAL);
            ligne.setGravity(Gravity.CENTER_VERTICAL);
            LinearLayout infos = colonne();
            infos.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            infos.addView(texte(icone + "  " + s(m, "titre", "—"), 14.5f, "#2B2B28", true));
            String tx = s(m, "texte", "");
            if (!tx.isEmpty()) infos.addView(texte(tx, 12.5f, GRIS, false));
            ligne.addView(infos);
            Button ed = bouton("✏️", BEIGE, "#2B2B28", new View.OnClickListener() {
                public void onClick(View v) { editerComm(m); }
            });
            ed.setPadding(dp(12), 0, dp(12), 0);
            ligne.addView(ed);
            Button suppr = bouton("✕", BEIGE, "#7A1018", new View.OnClickListener() {
                public void onClick(View v) {
                    JSONArray garde = new JSONArray();
                    JSONArray all = comms();
                    for (int k = 0; k < all.length(); k++)
                        if (all.opt(k) != m) garde.put(all.opt(k));
                    try { donnees.put("comm", garde); } catch (Exception ignored) { }
                    sauver(); afficher("com"); toast("Communication supprimée");
                }
            });
            suppr.setPadding(dp(12), 0, dp(12), 0);
            ligne.addView(suppr);
            l.addView(ligne);
            contenu.addView(l);
            contenu.addView(espace(6));
        }
        if (cs.length() == 0)
            contenu.addView(texte("Aucune communication — ajoutez une annonce, une promotion "
                    + "ou une nouveauté.", 13, GRIS, false));
        contenu.addView(espace(8));
        contenu.addView(bouton("＋ Ajouter une communication", ARDOISE, JAUNE,
                new View.OnClickListener() {
                    public void onClick(View v) { editerComm(null); }
                }));
        contenu.addView(espace(12));
        contenu.addView(texte("Astuce : les communications apparaissent aussi à l'impression ? "
                + "Non — elles vivent uniquement sur le site clients et dans l'aperçu.",
                11.5f, GRIS, false));
    }

    private void editerComm(final JSONObject existant) {
        ScrollView form = new ScrollView(this);
        LinearLayout l = colonne();
        final EditText titre = champ(existant == null ? "" : s(existant, "titre", ""),
                "Titre (ex. : Soirée moules-frites)");
        final EditText texte = champ(existant == null ? "" : s(existant, "texte", ""),
                "Message (facultatif)");
        final android.widget.Spinner type = new android.widget.Spinner(this);
        type.setAdapter(new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item,
                new String[]{"Annonce (info)", "Promotion", "Nouveauté"}));
        if (existant != null) {
            String t = s(existant, "type", "info");
            type.setSelection("promo".equals(t) ? 1 : ("nouveaute".equals(t) ? 2 : 0));
        }
        l.addView(texte("Titre", 12, GRIS, false)); l.addView(titre);
        l.addView(texte("Message", 12, GRIS, false)); l.addView(texte);
        l.addView(texte("Type", 12, GRIS, false)); l.addView(type);
        form.addView(l);
        new AlertDialog.Builder(this)
                .setTitle(existant == null ? "Nouvelle communication" : "Modifier la communication")
                .setView(form)
                .setPositiveButton("Enregistrer", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) {
                        try {
                            String t = titre.getText().toString().trim();
                            if (t.isEmpty()) { toast("Titre requis"); return; }
                            JSONObject cible = existant;
                            if (cible == null) {
                                cible = new JSONObject();
                                cible.put("id", "co" + System.currentTimeMillis());
                                comms().put(cible);
                            }
                            cible.put("titre", t);
                            cible.put("texte", texte.getText().toString().trim());
                            int pos = type.getSelectedItemPosition();
                            cible.put("type", pos == 1 ? "promo" : (pos == 2 ? "nouveaute" : "info"));
                            sauver(); afficher("com"); toast("Communication enregistrée");
                        } catch (Exception e) { toast("Erreur : " + e.getMessage()); }
                    }
                })
                .setNegativeButton("Annuler", null).show();
    }

    // ==========================================================
    //  ACCÈS AU SITE : aperçu WebView intégré + partage
    // ==========================================================
    private void ouvrirSiteApercu() {
        if (serveur == null || !serveur.estActif()) demarrerServeur();
        final android.app.Dialog dlg =
                new android.app.Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        LinearLayout l = colonne();
        l.setBackgroundColor(c("#111814"));
        LinearLayout barre = new LinearLayout(this);
        barre.setOrientation(LinearLayout.HORIZONTAL);
        barre.setGravity(Gravity.CENTER_VERTICAL);
        barre.setBackgroundColor(c(ARDOISE));
        barre.setPadding(dp(14), dp(8), dp(14), dp(8));
        TextView t = texte("Aperçu du site clients — " + adresseLocale() + ":8720",
                12.5f, JAUNE, true);
        t.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        barre.addView(t);
        Button partage = bouton("🔗", ARDOISE, JAUNE, new View.OnClickListener() {
            public void onClick(View v) { partagerSite(); }
        });
        partage.setPadding(dp(14), 0, dp(14), 0);
        barre.addView(partage);
        Button fermer = bouton("✕", ARDOISE, "#FFFFFF", new View.OnClickListener() {
            public void onClick(View v) { dlg.dismiss(); }
        });
        fermer.setPadding(dp(14), 0, dp(14), 0);
        barre.addView(fermer);
        l.addView(barre);
        WebView wv = new WebView(this);
        wv.getSettings().setJavaScriptEnabled(true);
        wv.setWebViewClient(new WebViewClient());
        wv.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        l.addView(wv);
        dlg.setContentView(l);
        wv.loadUrl("http://127.0.0.1:8720/");
        dlg.show();
    }

    private void ouvrirCommunauteApercu() {
        if (serveur == null || !serveur.estActif()) demarrerServeur();
        final android.app.Dialog dlg = new android.app.Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        LinearLayout l = colonne(); l.setBackgroundColor(c("#111814"));
        LinearLayout barre = new LinearLayout(this); barre.setOrientation(LinearLayout.HORIZONTAL); barre.setGravity(Gravity.CENTER_VERTICAL); barre.setBackgroundColor(c(ARDOISE)); barre.setPadding(dp(14), dp(8), dp(14), dp(8));
        TextView t = texte("Communauté intégrée — port 8721", 12.5f, JAUNE, true); t.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)); barre.addView(t);
        Button fermer = bouton("✕", ARDOISE, "#FFFFFF", new View.OnClickListener() { public void onClick(View v) { dlg.dismiss(); } }); fermer.setPadding(dp(14), 0, dp(14), 0); barre.addView(fermer); l.addView(barre);
        WebView wv = new WebView(this); wv.getSettings().setJavaScriptEnabled(true); wv.setWebViewClient(new WebViewClient()); wv.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)); l.addView(wv); dlg.setContentView(l); wv.loadUrl("http://127.0.0.1:8720/communaute/"); dlg.show();
    }

    private void partagerCommunaute() {
        try { android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_SEND); i.setType("text/plain"); i.putExtra(android.content.Intent.EXTRA_SUBJECT, "La Trattoria — Communauté"); i.putExtra(android.content.Intent.EXTRA_TEXT, "Rejoignez la communauté locale La Trattoria : http://" + adresseLocale() + ":8721/"); startActivity(android.content.Intent.createChooser(i, "Partager la communauté")); } catch (Exception e) { toast("Partage impossible : " + e.getMessage()); }
    }

    private void partagerSite() {
        try {
            android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(android.content.Intent.EXTRA_SUBJECT, "La Trattoria — commandez en ligne");
            i.putExtra(android.content.Intent.EXTRA_TEXT,
                    "Commandez chez La Trattoria (fait maison, pâte maturée 48 h) : "
                            + "http://" + adresseLocale() + ":8720/"
                            + " — sur le Wi-Fi du restaurant.");
            startActivity(android.content.Intent.createChooser(i, "Partager l'adresse du site"));
        } catch (Exception e) { toast("Partage impossible : " + e.getMessage()); }
    }


    // ==========================================================
    //  Écran : ardoise & QR
    // ==========================================================
    private void ecranArdoise() {
        final JSONObject conf = jobj(donnees, "config");
        contenu.addView(texte("L'ardoise principale affichée sur le site et imprimée.", 13.5f, GRIS, false));
        contenu.addView(espace(12));
        contenu.addView(bouton("✏️ Titre, promesses, adresse du site", BEIGE, "#2B2B28",
                new View.OnClickListener() {
                    public void onClick(View v) { editerArdoiseEntete(conf); }
                }));
        contenu.addView(espace(8));
        contenu.addView(bouton("🖨️ Aperçu / Imprimer (A4)", ROUGE, "#FFFFFF",
                new View.OnClickListener() {
                    public void onClick(View v) { imprimer("A4"); }
                }));
        contenu.addView(espace(14));
        contenu.addView(texte("Le QR code du site et le bouton flottant restent gérés par "
                + "l'application principale (module carte, ?carte).", 12.5f, GRIS, false));
    }

    private void editerArdoiseEntete(final JSONObject conf) {
        JSONObject c = conf;
        ScrollView form = new ScrollView(this);
        LinearLayout l = colonne();
        final EditText site = champ(s(c, "site", "https://latrattoria-saintes.fr/"), "Adresse du site");
        final EditText badges = champ(s(c, "badgesTexte", "Tout est fait maison,Tout est frais,Bio dès que possible"),
                "Promesses, séparées par des virgules");
        l.addView(texte("Site (pour le QR)", 12, GRIS, false)); l.addView(site);
        l.addView(texte("Promesses de la maison", 12, GRIS, false)); l.addView(badges);
        form.addView(l);
        new AlertDialog.Builder(this)
                .setTitle("Ardoise — en-tête")
                .setView(form)
                .setPositiveButton("Enregistrer", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) {
                        try {
                            conf.put("site", site.getText().toString().trim());
                            conf.put("badgesTexte", badges.getText().toString().trim());
                            String[] b = s(conf, "badgesTexte", "").split(",");
                            JSONArray jb = new JSONArray();
                            for (String x : b) if (!x.trim().isEmpty()) jb.put(x.trim());
                            conf.put("badges", jb);
                            sauver(); afficher("ardoise"); toast("Ardoise mise à jour");
                        } catch (Exception e) { toast("Erreur : " + e.getMessage()); }
                    }
                })
                .setNegativeButton("Annuler", null).show();
    }

    // ==========================================================
    //  Écran : données (export / import)
    // ==========================================================
    private void ecranDonnees() {
        contenu.addView(texte("La carte est enregistrée sur l'appareil. Exportez-la pour la "
                + "sauvegarder ou la transférer vers une autre tablette.", 13.5f, GRIS, false));
        contenu.addView(espace(12));
        contenu.addView(bouton("⬆️ Exporter (JSON)", ROUGE, "#FFFFFF", new View.OnClickListener() {
            public void onClick(View v) {
                try {
                    android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(android.content.Intent.CATEGORY_OPENABLE);
                    i.setType("application/json");
                    i.putExtra(android.content.Intent.EXTRA_TITLE, "carte-la-trattoria.json");
                    startActivityForResult(i, 101);
                } catch (Exception e) { toast("Impossible d'ouvrir le sélecteur : " + e.getMessage()); }
            }
        }));
        contenu.addView(espace(8));
        contenu.addView(bouton("⬇️ Importer (JSON)", "#FFFFFF", "#2B2B28", new View.OnClickListener() {
            public void onClick(View v) {
                try {
                    android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_OPEN_DOCUMENT);
                    i.addCategory(android.content.Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");
                    startActivityForResult(i, 102);
                } catch (Exception e) { toast("Impossible d'ouvrir le sélecteur : " + e.getMessage()); }
            }
        }));
        contenu.addView(espace(14));
        contenu.addView(texte("Fichier actuel : " + fichierDonnees().getAbsolutePath(), 11.5f, GRIS, false));
    }

    @Override protected void onActivityResult(int req, int res, android.content.Intent data) {
        super.onActivityResult(req, res, data);
        if (data == null || data.getData() == null) return;
        try {
            if (req == 101 && res == RESULT_OK) {
                OutputStream os = getContentResolver().openOutputStream(data.getData());
                try { os.write(donnees.toString().getBytes(StandardCharsets.UTF_8)); } finally { os.close(); }
                toast("Carte exportée");
            } else if (req == 102 && res == RESULT_OK) {
                InputStream is = getContentResolver().openInputStream(data.getData());
                String brut;
                try { brut = toutLire(is); } finally { is.close(); }
                JSONObject lu = new JSONObject(brut);
                if (lu.optJSONArray("carte") == null) { toast("Fichier invalide"); return; }
                donnees = lu;
                try {
                    if (!donnees.has("moment")) donnees.put("moment", new JSONObject());
                    if (!donnees.has("config")) donnees.put("config", new JSONObject());
                } catch (Exception ignored) { }
                sauver(); afficher("menu"); toast("Carte importée");
            }
        } catch (Exception e) {
            toast("Erreur : " + e.getMessage());
        }
    }

    // ==========================================================
    //  À propos
    // ==========================================================
    private void ecranAPropos() {
        contenu.addView(texte("La Trattoria — Édition des cartes", 20, ROUGE_F, true));
        contenu.addView(espace(8));
        contenu.addView(texte("Application native d'édition des cartes du restaurant. "
                + "Les modifications sont enregistrées sur l'appareil et publiées sur le "
                + "site par le module carte de l'application principale (port 8720).", 14, "#2B2B28", false));
        contenu.addView(espace(14));
        contenu.addView(texte("La Trattoria — 15 rue de la poste, 17100 Saintes\n"
                + "SIRET 106 050 263 00016\n06 27 21 31 90 — alexis.coudret@outlook.fr", 13.5f, GRIS, false));
        contenu.addView(espace(14));
        contenu.addView(texte("Mentions : prix affichés en euros. Sur les cartes du moment, "
                + "les prix sont présentés hors taxes (TVA en sus) par défaut. "
                + "L'abus d'alcool est dangereux pour la santé. Interdiction de vente "
                + "d'alcool aux mineurs (art. L. 3342-1 CSP).", 12.5f, GRIS, false));
    }

    // ==========================================================
    //  Impression (A4 ou carte du moment) — WebView + PrintManager
    // ==========================================================
    private void imprimer(String quoi) {
        try {
            String html = "A4".equals(quoi) ? htmlA4() : htmlMoment(momentCourant);
            WebView wv = new WebView(this);
            wv.setWebViewClient(new WebViewClient() {
                @Override public void onPageFinished(WebView v, String url) {
                    PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                    String job = "A4".equals(quoi) ? "LaTrattoria-Carte-Standard" : "LaTrattoria-" + momentCourant;
                    pm.print(job, v.createPrintDocumentAdapter(job),
                            new android.print.PrintAttributes.Builder().build());
                }
            });
            wv.loadDataWithBaseURL("file:///android_asset/", html, "text/html", "utf-8", null);
        } catch (Exception e) {
            toast("Impression impossible : " + e.getMessage());
        }
    }

    private String fontFaces() {
        return "@font-face{font-family:'Caveat';font-weight:700;src:url('caveat-700.woff2');}"
                + "@font-face{font-family:'Caveat';font-weight:500;src:url('caveat-500.woff2');}";
    }

    private String htmlA4() {
        StringBuilder h = new StringBuilder();
        h.append("<html><head><meta charset='utf-8'><style>")
                .append(fontFaces())
                .append("body{margin:0;background:#fff;color:#22221f;font-family:Georgia,serif}")
                .append(".ent{ text-align:center;border-bottom:2.5px solid #A51822;padding-bottom:12px }")
                .append(".ent h1{font-size:38px;color:#7A1018;margin:8px 0 0}")
                .append(".ent .lieu{font-size:13px;color:#555}")
                .append(".ent .pro{font-size:13px;color:#8A8A55;font-style:italic}")
                .append("h2{font-size:22px;color:#7A1018;text-align:center;margin:22px 0 0}")
                .append("h2:after{content:'';display:block;width:54px;height:2px;background:#8A8A55;margin:5px auto 0}")
                .append(".sous{text-align:center;font-style:italic;color:#6E6A63;font-size:12.5px;margin:3px 0 8px}")
                .append("ul{list-style:none;margin:8px 0 0;padding:0}")
                .append("li{display:flex;align-items:baseline;gap:8px;padding:3.5px 0}")
                .append("li.d{padding:0 0 4px;margin-top:-2px}")
                .append(".n{font-weight:700;font-size:14.5px}.p{font-weight:700;font-size:14.5px}")
                .append(".t{flex:1;border-bottom:1px dotted #b9b3a4;transform:translateY(-3px)}")
                .append("li.d span{font-size:11.5px;color:#6E6A63;font-style:italic;width:100%}")
                .append(".pied{text-align:center;font-size:11.5px;color:#6E6A63;border-top:1px solid #d8cfc0;margin-top:26px;padding-top:10px}")
                .append("</style></head><body>");
        JSONObject conf = jobj(donnees, "config");
        h.append("<div class='ent'><h1>La Trattoria</h1>")
                .append("<div class='lieu'>15 rue de la Poste, 17100 Saintes — 06 27 21 31 90</div>");
        JSONArray badges = jarr(conf, "badges");
        StringBuilder pr = new StringBuilder();
        for (int i = 0; i < badges.length(); i++) {
            String b = badges.optString(i, "");
            if (!b.isEmpty()) pr.append(b).append(" · ");
        }
        h.append("<div class='pro'>").append(pr.length() > 0 ? pr.substring(0, pr.length() - 3) : "")
                .append("<br>Pâte à pizza maison, maturée 48 heures</div></div>");
        JSONArray carte = jarr(donnees, "carte");
        JSONObject fams = jobj(conf, "fams");
        // ordre : fams configurées d'abord (ordre d'insertion), puis les autres
        java.util.LinkedHashMap<String, java.util.List<JSONObject>> parFam = new java.util.LinkedHashMap<>();
        for (int i = 0; i < carte.length(); i++) {
            JSONObject p = carte.optJSONObject(i);
            if (p == null || !bo(p, "actif")) continue;
            String fam = s(p, "fam", "Divers");
            java.util.List<JSONObject> l = parFam.get(fam);
            if (l == null) { l = new java.util.ArrayList<>(); parFam.put(fam, l); }
            l.add(p);
        }
        for (String fam : parFam.keySet()) {
            JSONObject fc = fams.optJSONObject(fam);
            String titre = fc != null ? s(fc, "titre", fam) : fam;
            String sous = fc != null ? s(fc, "sous", "") : "";
            java.util.List<JSONObject> ps = parFam.get(fam);
            if (ps.isEmpty()) continue;
            h.append("<h2>").append(ech(titre)).append("</h2>");
            if (!sous.isEmpty()) h.append("<div class='sous'>").append(ech(sous)).append("</div>");
            h.append("<ul>");
            for (JSONObject p : ps) {
                h.append("<li><span class='n'>").append(ech(s(p, "nom", "")))
                        .append("</span><span class='t'></span><span class='p'>")
                        .append(eur(d(p, "pv"))).append("</span></li>");
                String dd = s(p, "sous", null);
                if (dd == null || dd.isEmpty()) dd = s(p, "desc", "");
                if (!dd.isEmpty()) h.append("<li class='d'><span>").append(ech(dd)).append("</span></li>");
            }
            h.append("</ul>");
        }
        h.append("<div class='pied'>SIRET 106 050 263 00016 · Prix TTC, service compris · "
                + "15 rue de la Poste, 17100 Saintes</div></body></html>");
        return h.toString();
    }

    private String htmlMoment(String cle) {
        JSONObject moment = jobj(donnees, "moment");
        JSONObject conf = moment.optJSONObject(cle);
        if (conf == null) conf = confMoment(cle);
        String illus = "illus-" + cle + ".jpg";
        StringBuilder h = new StringBuilder();
        h.append("<html><head><meta charset='utf-8'><style>")
                .append(fontFaces())
                .append("body{margin:0;background:#24312B;color:#F3F1E7;font-family:'Caveat',cursive;padding:24px}")
                .append(".ent{text-align:center}")
                .append(".ent img{width:190px;border:3px solid rgba(243,241,231,.5);border-radius:6px;transform:rotate(-1.2deg)}")
                .append("h1{font-size:52px;color:#F5D67B;margin:12px 0 0;line-height:1}")
                .append(".sous{font-size:22px;font-style:italic}")
                .append(".filet{border-top:3px dashed rgba(243,241,231,.5);width:60%;margin:12px auto}")
                .append("ul{list-style:none;padding:0;margin:18px 0 0}")
                .append("li{padding:7px 2px}")
                .append(".i{display:flex;align-items:baseline;gap:10px}")
                .append(".n{font-size:25px;font-weight:700}.p{font-size:25px;font-weight:700;color:#F5D67B}")
                .append(".t{flex:1;border-bottom:2px dotted rgba(243,241,231,.5);transform:translateY(-6px)}")
                .append(".d{font-size:17px;color:rgba(243,241,231,.72);display:block}")
                .append(".men{margin-top:24px;border:2px dashed rgba(243,241,231,.5);border-radius:12px;")
                .append("padding:12px;text-align:center;font-family:Georgia,serif;font-size:12px;")
                .append("color:rgba(243,241,231,.72);line-height:1.5}")
                .append(".pied{text-align:center;margin-top:20px;font-size:16px}")
                .append(".pied span{display:block;font-family:Georgia,serif;font-size:11px;color:rgba(243,241,231,.5)}")
                .append("</style></head><body>");
        h.append("<div class='ent'><img src='").append(illus).append("'>")
                .append("<h1>").append(ech(s(conf, "titre", titreMoment(cle)))).append("</h1>");
        String sous = s(conf, "sous", "");
        if (!sous.isEmpty()) h.append("<div class='sous'>").append(ech(sous)).append("</div>");
        h.append("<div class='filet'></div></div>");
        boolean ht = bo(conf, "ht");
        JSONArray ordre = jarr(conf, "ordre");
        JSONObject libres = new JSONObject();
        JSONArray ll = jarr(conf, "libres");
        for (int i = 0; i < ll.length(); i++) {
            JSONObject x = ll.optJSONObject(i);
            if (x != null) try { libres.put(s(x, "id", ""), x); } catch (Exception ignored) { }
        }
        JSONArray carte = jarr(donnees, "carte");
        java.util.HashMap<String, JSONObject> produits = new java.util.HashMap<>();
        for (int i = 0; i < carte.length(); i++) {
            JSONObject p = carte.optJSONObject(i);
            if (p != null) try { produits.put(s(p, "id", ""), p); } catch (Exception ignored) { }
        }
        h.append("<ul>");
        for (int i = 0; i < ordre.length(); i++) {
            String id = ordre.optString(i, null);
            if (id == null) continue;
            if (libres.has(id)) {
                JSONObject l = libres.optJSONObject(id);
                if (l == null) continue;
                double tv = l.optDouble("tva", 0.1);
                String prix = ht ? eurHT(d(l, "prix"), tv) : eur(d(l, "prix"));
                h.append("<li><div class='i'><span class='n'>").append(ech(s(l, "nom", "")))
                        .append("</span><span class='t'></span><span class='p'>").append(prix)
                        .append("</span></div>");
                if (!s(l, "sous", "").isEmpty())
                    h.append("<span class='d'>").append(ech(s(l, "sous", ""))).append("</span>");
                h.append("</li>");
            } else {
                JSONObject p = produits.get(id);
                if (p == null || !bo(p, "actif")) continue;
                String prix = ht ? eurHT(d(p, "pv"), p.optDouble("tva", 0.1)) : eur(d(p, "pv"));
                h.append("<li><div class='i'><span class='n'>").append(ech(s(p, "nom", "")))
                        .append("</span><span class='t'></span><span class='p'>").append(prix)
                        .append("</span></div>");
                String dd = s(p, "sous", null);
                if (dd == null || dd.isEmpty()) dd = s(p, "desc", "");
                if (!dd.isEmpty()) h.append("<span class='d'>").append(ech(dd)).append("</span>");
                h.append("</li>");
            }
        }
        h.append("</ul>");
        h.append("<div class='men'><span>").append(ech(s(conf, "mentions", mentionsMoment(cle))))
                .append("</span></div>");
        h.append("<div class='pied'>La Trattoria — 15 rue de la Poste, 17100 Saintes — 06 27 21 31 90")
                .append("<span>SIRET 106 050 263 00016 · ").append(ht ? "Prix HT — TVA en sus" : "Prix TTC, service compris")
                .append("</span></div>");
        h.append("</body></html>");
        return h.toString();
    }

    private static String ech(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("'", "&#39;");
    }

}
