package com.trattoria.cartes;

import org.json.JSONArray;
import org.json.JSONObject;

/** Modules de gestion avancés (logique pure, testable). */
public final class Modules {

    private Modules() { }

    // ---- STOCK ----
    public static JSONArray stock(JSONObject donnees) {
        JSONArray s = donnees.optJSONArray("stock");
        if (s == null) {
            s = new JSONArray();
            try { donnees.put("stock", s); } catch (Exception ignored) { }
        }
        return s;
    }

    public static JSONObject article(String nom, double quantite, String unite,
                                     double seuil, String fournisseur) {
        JSONObject a = new JSONObject();
        try {
            a.put("id", "st" + System.currentTimeMillis());
            a.put("nom", nom);
            a.put("qte", quantite);
            a.put("unite", unite == null ? "u" : unite);
            a.put("seuil", seuil);
            a.put("fournisseur", fournisseur == null ? "" : fournisseur);
        } catch (Exception ignored) { }
        return a;
    }

    public static JSONArray aCommander(JSONObject donnees) {
        JSONArray out = new JSONArray();
        JSONArray s = stock(donnees);
        for (int i = 0; i < s.length(); i++) {
            JSONObject a = s.optJSONObject(i);
            if (a == null) continue;
            if (a.optDouble("qte", 0) <= a.optDouble("seuil", 0)) {
                JSONObject c = new JSONObject();
                try {
                    c.put("nom", a.optString("nom", ""));
                    c.put("qte", Math.max(a.optDouble("seuil", 1), 1));
                    c.put("unite", a.optString("unite", "u"));
                    c.put("fournisseur", a.optString("fournisseur", ""));
                } catch (Exception ignored) { }
                out.put(c);
            }
        }
        return out;
    }

    // ---- COMPTABILITÉ ----
    public static JSONObject resultat(JSONObject donnees, String mois) {
        double ca = 0, tva10 = 0, tva20 = 0, tva55 = 0;
        JSONArray ventes = donnees.optJSONArray("ventes");
        if (ventes != null) {
            for (int i = 0; i < ventes.length(); i++) {
                JSONObject v = ventes.optJSONObject(i);
                if (v == null || !mois.regionMatches(0, v.optString("date", ""), 0, 7)) continue;
                JSONArray lignes = v.optJSONArray("lignes");
                if (lignes == null) continue;
                for (int k = 0; k < lignes.length(); k++) {
                    JSONObject li = lignes.optJSONObject(k);
                    if (li == null) continue;
                    double ttc = li.optDouble("pv", 0) * li.optInt("q", 1);
                    double tva = ttc - ttc / (1 + li.optDouble("tva", 0.1));
                    ca += ttc;
                    double t = li.optDouble("tva", 0.1);
                    if (t == 0.2) tva20 += tva;
                    else if (t == 0.055) tva55 += tva;
                    else tva10 += tva;
                }
            }
        }
        double depenses = 0;
        JSONArray dep = donnees.optJSONArray("depenses");
        if (dep != null) {
            for (int i = 0; i < dep.length(); i++) {
                JSONObject dd = dep.optJSONObject(i);
                if (dd != null && mois.regionMatches(0, dd.optString("date", ""), 0, 7))
                    depenses += dd.optDouble("montant", 0);
            }
        }
        JSONObject out = new JSONObject();
        try {
            out.put("mois", mois);
            out.put("ca", Math.round(ca * 100) / 100.0);
            out.put("tva10", Math.round(tva10 * 100) / 100.0);
            out.put("tva55", Math.round(tva55 * 100) / 100.0);
            out.put("tva20", Math.round(tva20 * 100) / 100.0);
            out.put("tvaTotale", Math.round((tva10 + tva55 + tva20) * 100) / 100.0);
            out.put("depenses", Math.round(depenses * 100) / 100.0);
            out.put("resultat", Math.round((ca - tva10 - tva55 - tva20 - depenses) * 100) / 100.0);
        } catch (Exception ignored) { }
        return out;
    }

    public static JSONObject depense(String date, String libelle, double montant) {
        JSONObject d = new JSONObject();
        try {
            d.put("date", date);
            d.put("libelle", libelle);
            d.put("montant", montant);
        } catch (Exception ignored) { }
        return d;
    }

    // ---- OBJECTIFS ----
    public static JSONObject objectifs(JSONObject donnees) {
        JSONObject conf = donnees.optJSONObject("config");
        JSONObject o = conf == null ? null : conf.optJSONObject("objectifs");
        if (o == null) {
            o = new JSONObject();
            try {
                o.put("caJour", 600);
                o.put("couverts", 40);
                JSONObject conf2 = donnees.optJSONObject("config");
                if (conf2 != null) conf2.put("objectifs", o);
            } catch (Exception ignored) { }
        }
        return o;
    }

    public static JSONObject avancement(JSONObject donnees, String jour) {
        JSONObject obj = objectifs(donnees);
        double ca = 0;
        int couverts = 0;
        JSONArray ventes = donnees.optJSONArray("ventes");
        if (ventes != null) {
            for (int i = 0; i < ventes.length(); i++) {
                JSONObject v = ventes.optJSONObject(i);
                if (v == null || !jour.equals(v.optString("date", ""))) continue;
                ca += v.optDouble("total", 0);
                couverts++;
            }
        }
        double caCible = obj.optDouble("caJour", 600);
        int couvCible = obj.optInt("couverts", 40);
        JSONObject out = new JSONObject();
        try {
            out.put("ca", Math.round(ca * 100) / 100.0);
            out.put("couverts", couverts);
            out.put("caCible", caCible);
            out.put("couvertsCible", couvCible);
            out.put("pctCA", caCible > 0 ? (int) Math.round(ca * 100 / caCible) : 0);
            out.put("pctCouverts", couvCible > 0 ? couverts * 100 / couvCible : 0);
        } catch (Exception ignored) { }
        return out;
    }

    // ---- INVENDUS ----
    public static JSONArray invendus(JSONObject donnees, String jour) {
        JSONArray out = new JSONArray();
        JSONArray inv = donnees.optJSONArray("invendus");
        if (inv != null) {
            for (int i = 0; i < inv.length(); i++) {
                JSONObject x = inv.optJSONObject(i);
                if (x != null && jour.equals(x.optString("date", ""))) out.put(x);
            }
        }
        return out;
    }

    public static JSONObject invendu(String jour, String nom, int qte, double prix) {
        JSONObject x = new JSONObject();
        try {
            x.put("date", jour);
            x.put("nom", nom);
            x.put("qte", qte);
            x.put("prix", prix);
            x.put("statut", "disponible");
        } catch (Exception ignored) { }
        return x;
    }
}
