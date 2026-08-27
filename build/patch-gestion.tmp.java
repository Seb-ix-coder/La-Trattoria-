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
            int prefixe = zone.toLowerCase(Locale.FRENCH).startsWith("terr") ? 'T' : 'I';
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

    private void ecranSite() {
        boolean actif = serveur != null && serveur.estActif();
        contenu.addView(texte("Le site clients est servi sur le réseau Wi-Fi du restaurant : "
                + "les clients scannent l'adresse, composent leur panier et envoient leur commande, "
                + "qui apparaît dans la Salle.", 13.5f, GRIS, false));
        contenu.addView(espace(12));

        TextView etat = texte(actif ? "● Serveur ACTIF — port 8721" : "○ Serveur arrêté",
                16, actif ? "#2E7D32" : GRIS, true);
        contenu.addView(etat);
        contenu.addView(espace(8));
        if (actif) {
            contenu.addView(texte("Adresse pour les clients (écran du restaurant) :\n"
                    + adresseLocale() + ":" + 8721 + "/", 13, "#2B2B28", false));
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
        serveur = new ServeurSite(8721, new ServeurSite.Ecouteur() {
            public String catalogueJson() { return jarr(donnees, "carte").toString(); }
            public String etablissementJson() {
                try {
                    JSONObject conf = jobj(donnees, "config");
                    JSONObject e = new JSONObject();
                    e.put("nom", "La Trattoria");
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
                                + " (" + eur(c.optDouble("total", 0)) + ")");
                        if ("salle".equals(ecran) || "site".equals(ecran)) afficher(ecran);
                    }
                });
            }
            public String journal() { return ""; }
        });
        serveur.demarrer();
        toast("Serveur démarré sur le port 8721");
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

