package com.trattoria.cartes;

import android.content.Context;
import android.util.Base64;
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
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Backend social embarqué dans l'APK.
 *
 * Il remplace le serveur Python lorsque la tablette est utilisée seule :
 * comptes, profils, feed, photos, commentaires, réactions, messages,
 * partenaires, offres, fidélité, missions, badges, classement, consentement
 * et notes liées à des lignes d'achat sont servis sur le port 8721.
 */
public final class ServeurCommunaute implements Runnable {
    private static final int PORT = 8721;
    private static final int MAX_BODY = 8 * 1024 * 1024;
    private static final String COOKIE = "communaute";
    private final Context context;
    private final File file;
    private final Object lock = new Object();
    private final SecureRandom random = new SecureRandom();
    private final ExecutorService pool = Executors.newFixedThreadPool(8);
    private volatile boolean active;
    private ServerSocket server;
    private Thread thread;
    private JSONObject data;

    public ServeurCommunaute(Context context) {
        this.context = context;
        this.file = new File(context.getFilesDir(), "community-data.json");
        load();
    }
    public boolean isActive() { return active; }
    public synchronized void start() { if (active) return; thread = new Thread(this, "serveur-communaute"); thread.setDaemon(true); thread.start(); }
    public synchronized void stop() { active = false; try { if (server != null) server.close(); } catch (Exception ignored) {} pool.shutdownNow(); }

    @Override public void run() {
        try {
            server = new ServerSocket(PORT); server.setReuseAddress(true); active = true;
            while (active) { final Socket s = server.accept(); pool.execute(new Runnable() { public void run() { handle(s); } }); }
        } catch (Exception ignored) { active = false; }
        finally { pool.shutdownNow(); }
    }

    private static final class Req { String method; String target; Map<String,String> headers = new HashMap<String,String>(); byte[] body = new byte[0]; }
    private void handle(Socket socket) {
        try { socket.setSoTimeout(7000); Req r = read(socket); if (r == null) return; String path=r.target, query=""; int q=path.indexOf('?'); if(q>=0){query=path.substring(q+1);path=path.substring(0,q);} if("OPTIONS".equals(r.method)){send(socket,204,"text/plain","",null);return;} if("GET".equals(r.method)) get(socket,r,path,query); else if("POST".equals(r.method)) post(socket,r,path); else json(socket,405,error("Méthode non autorisée")); }
        catch(Exception e){ try{json(socket,400,error("Requête invalide"));}catch(Exception ignored){} } finally { try{socket.close();}catch(Exception ignored){} }
    }
    private Req read(Socket s) throws IOException {
        BufferedInputStream in=new BufferedInputStream(s.getInputStream()); String first=line(in,8192); if(first==null)return null; String[] p=first.split(" "); if(p.length<2)return null; Req r=new Req();r.method=p[0];r.target=p[1];int n=first.length();
        while(true){String x=line(in,8192);if(x==null||x.length()==0)break;n+=x.length();if(n>32768)throw new IOException();int i=x.indexOf(':');if(i>0)r.headers.put(x.substring(0,i).trim().toLowerCase(),x.substring(i+1).trim());}
        int length=0;try{length=Integer.parseInt(header(r,"content-length","0"));}catch(Exception ignored){}if(length<0||length>MAX_BODY)throw new IOException();if(length>0){r.body=new byte[length];int pos=0;while(pos<length){int k=in.read(r.body,pos,length-pos);if(k<0)throw new IOException();pos+=k;}}return r;
    }
    private static String line(InputStream in,int max)throws IOException{ByteArrayOutputStream b=new ByteArrayOutputStream();while(b.size()<=max){int x=in.read();if(x<0)return b.size()==0?null:new String(b.toByteArray(),StandardCharsets.ISO_8859_1);if(x=='\n')break;if(x!='\r')b.write(x);}if(b.size()>max)throw new IOException();return new String(b.toByteArray(),StandardCharsets.ISO_8859_1);}
    private static String header(Req r,String k,String d){String x=r.headers.get(k.toLowerCase());return x==null?d:x;}

    private void get(Socket s,Req r,String path,String query)throws Exception{
        if("/".equals(path)||"/index.html".equals(path)){asset(s,"community-index.html","text/html; charset=utf-8");return;}
        if(path.startsWith("/assets/")&&!path.contains("..")){String n=path.substring(8);String t=n.endsWith(".js")?"application/javascript; charset=utf-8":n.endsWith(".css")?"text/css; charset=utf-8":n.endsWith(".png")?"image/png":n.endsWith(".webmanifest")?"application/manifest+json":"text/plain; charset=utf-8";asset(s,n,t);return;}
        if("/api/moi".equals(path)){String token=token(r);synchronized(lock){JSONObject u=userLocked(token);json(s,200,new JSONObject().put("ok",true).put("moi",u==null?JSONObject.NULL:profile(u)));}return;}
        if("/api/feed".equals(path)){json(s,200,feed(query));return;}
        if("/api/offres".equals(path)){json(s,200,offers());return;}
        if("/api/membres".equals(path)){json(s,200,members(r));return;}
        if("/api/fidelite/moi".equals(path)){json(s,200,loyaltyMine(r));return;}
        if("/api/fidelite".equals(path)){json(s,200,loyaltyStaff(r,query));return;}
        if("/api/pro/moi".equals(path)){json(s,200,partnerMine(r));return;}
        if("/api/envois/recus".equals(path)){json(s,200,envois(r,false));return;}
        if("/api/envois/envoyes".equals(path)){json(s,200,envois(r,true));return;}
        if("/api/realtime".equals(path)){json(s,200,realtime(r));return;}
        if("/api/verification".equals(path)){json(s,200,verification(r));return;}
        if("/api/classement".equals(path)){json(s,200,ranking());return;}
        if("/api/missions".equals(path)){json(s,200,missions(r));return;}
        if("/api/badges".equals(path)){json(s,200,badges(r));return;}
        if("/api/recompenses".equals(path)){json(s,200,new JSONObject().put("ok",true).put("recompenses",rewards()));return;}
        if("/api/consent".equals(path)){json(s,200,consent(r));return;}
        if("/api/partenaire".equals(path)){json(s,200,partner(query,r));return;}
        if("/api/notes-plats".equals(path)||"/api/rating".equals(path)){json(s,200,ratingStats());return;}
        json(s,404,error("Route inconnue"));
    }

    private void post(Socket s,Req r,String path)throws Exception{
        if("/api/inscription".equals(path)){auth(s,r,true);return;}
        if("/api/connexion".equals(path)||"/api/public/auth".equals(path)){auth(s,r,false);return;}
        if("/api/deconnexion".equals(path)){synchronized(lock){removeSessionLocked(token(r));}json(s,200,new JSONObject().put("ok",true));return;}
        if("/api/posts".equals(path)){newPost(s,r);return;}
        if("/api/reaction".equals(path)||"/api/like".equals(path)){reaction(s,r);return;}
        if("/api/commentaires".equals(path)){comment(s,r);return;}
        if("/api/messages".equals(path)){message(s,r);return;}
        if("/api/messages/lire".equals(path)){readMessages(s,r);return;}
        if("/api/avatar".equals(path)||"/api/logo".equals(path)){profileImage(s,r,"/api/logo".equals(path));return;}
        if("/api/bio".equals(path)){bio(s,r);return;}
        if("/api/offres".equals(path)){newOffer(s,r);return;}
        if("/api/offres/fin".equals(path)){endOffer(s,r);return;}
        if("/api/offres/essayer".equals(path)){tryOffer(s,r);return;}
        if("/api/fidelite/achat".equals(path)){purchase(s,r);return;}
        if("/api/envoi".equals(path)){sendReferral(s,r);return;}
        if("/api/envois/repondre".equals(path)){answerReferral(s,r);return;}
        if("/api/verifier".equals(path)){verify(s,r);return;}
        if("/api/mission".equals(path)){mission(s,r);return;}
        if("/api/recompense".equals(path)){reward(s,r);return;}
        if("/api/suivre".equals(path)){follow(s,r);return;}
        if("/api/consent".equals(path)){setConsent(s,r);return;}
        if("/api/notes-plats".equals(path)||"/api/rating".equals(path)){note(s,r);return;}
        json(s,404,error("Route inconnue"));
    }

    // ----- authentication and profiles ----------------------------------
    private void auth(Socket s,Req req,boolean registration)throws Exception{
        JSONObject d=body(req);String tel=digits(d.optString("tel",""));String mdp=d.optString("mdp","");if(tel.length()<6||mdp.length()<4||mdp.length()>128){json(s,400,error("Téléphone et code valides requis"));return;}
        synchronized(lock){JSONArray users=arr("utilisateurs");JSONObject u=null;for(int i=0;i<users.length();i++){JSONObject x=users.optJSONObject(i);if(x!=null&&tel.equals(x.optString("tel",""))){u=x;break;}}
            if(registration||"register".equals(d.optString("action",""))){if(u!=null){json(s,409,error("Ce téléphone est déjà inscrit — connectez-vous."));return;}String nom=clean(d.optString("nom",""),60);if(nom.length()<2){json(s,400,error("Nom requis"));return;}String sel=hex(16);u=new JSONObject().put("id","u-"+UUID.randomUUID()).put("type",d.optBoolean("partenaire",false)?"partenaire":"client").put("nom",nom).put("tel",tel).put("sel",sel).put("mdp",hash(mdp,sel)).put("bio","").put("pts",0).put("verifie",true).put("badges",new JSONArray()).put("consent",new JSONObject()).put("cree_le",System.currentTimeMillis());users.put(u);}
            else if(u==null||!hash(mdp,u.optString("sel","")).equals(u.optString("mdp",""))){json(s,401,error("Téléphone ou code incorrect."));return;}
            String t=hex(32);arr("sessions").put(new JSONObject().put("token",t).put("user_id",u.optString("id")).put("expire",System.currentTimeMillis()+30L*86400000L));saveLocked();
            JSONObject out=new JSONObject().put("ok",true).put("jeton",t).put("session",t).put("utilisateur",profile(u));jsonCookie(s,200,out,t);
        }
    }
    private JSONObject profile(JSONObject u)throws Exception{return new JSONObject().put("id",u.optString("id","")).put("type",u.optString("type","client")).put("nom",u.optString("nom","")).put("tel",u.optString("tel","")).put("bio",u.optString("bio","")).put("pts",u.optInt("pts",0)).put("verifie",u.optBoolean("verifie",true)).put("avatar",u.optString("avatar","")).put("logo",u.optString("logo","")).put("consent",u.optJSONObject("consent")==null?new JSONObject():u.optJSONObject("consent")).put("badges",u.optJSONArray("badges")==null?new JSONArray():u.optJSONArray("badges"));}
    private JSONObject userLocked(String tok){if(tok==null||!tok.matches("[a-f0-9]{32,64}"))return null;JSONArray ss=arr("sessions");long now=System.currentTimeMillis();String id=null;for(int i=ss.length()-1;i>=0;i--){JSONObject x=ss.optJSONObject(i);if(x==null)continue;if(x.optLong("expire",0)<now){ss.remove(i);continue;}if(tok.equals(x.optString("token","")))id=x.optString("user_id",null);}if(id==null)return null;for(int i=0;i<arr("utilisateurs").length();i++){JSONObject u=arr("utilisateurs").optJSONObject(i);if(u!=null&&id.equals(u.optString("id")))return u;}return null;}
    private JSONObject user(Req r){synchronized(lock){return userLocked(token(r));}}
    private String token(Req r){String x=header(r,"x-jeton","");if(x.length()>0)return x;x=header(r,"x-session","");if(x.length()>0)return x;String c=header(r,"cookie","");String key=COOKIE+"=";int p=c.indexOf(key);if(p<0)return "";int e=c.indexOf(';',p);return c.substring(p+key.length(),e<0?c.length():e);}
    private void removeSessionLocked(String tok){JSONArray a=arr("sessions");for(int i=a.length()-1;i>=0;i--){JSONObject x=a.optJSONObject(i);if(x!=null&&tok.equals(x.optString("token")))a.remove(i);}saveLocked();}

    private void newPost(Socket s,Req req)throws Exception{JSONObject u=user(req);if(u==null){json(s,401,error("non connecté"));return;}Map<String,Object> m=multipart(req);String text=clean(string(m.get("texte")),1000);if(text.length()==0){json(s,400,error("Le texte du post est vide."));return;}JSONObject p=new JSONObject().put("id","p-"+UUID.randomUUID()).put("auteur_id",u.optString("id")).put("texte",text).put("cree_le",System.currentTimeMillis()).put("photos",new JSONArray());for(int i=0;i<4;i++){Object o=m.get("@photo"+i);if(o instanceof byte[]&&((byte[])o).length>0) p.optJSONArray("photos").put(dataUri((byte[])o,"image/jpeg"));}synchronized(lock){arr("posts").put(p);gainLocked(u.optString("id"),10);saveLocked();}json(s,200,new JSONObject().put("ok",true).put("id",p.optString("id")));}
    private void profileImage(Socket s,Req req,boolean logo)throws Exception{JSONObject u=user(req);if(u==null){json(s,401,error("non connecté"));return;}Map<String,Object> m=multipart(req);Object o=m.get(logo?"@logo":"@avatar");if(!(o instanceof byte[])||((byte[])o).length==0){json(s,400,error("image requise"));return;}String uri=dataUri((byte[])o,"image/jpeg");synchronized(lock){u.put(logo?"logo":"avatar",uri);saveLocked();}json(s,200,new JSONObject().put("ok",true).put(logo?"logo":"avatar",uri));}
    private void bio(Socket s,Req req)throws Exception{JSONObject u=user(req);if(u==null){json(s,401,error("non connecté"));return;}JSONObject d=body(req);synchronized(lock){u.put("bio",clean(d.optString("bio",""),300));saveLocked();}json(s,200,new JSONObject().put("ok",true));}

    // ----- feed ----------------------------------------------------------
    private JSONObject feed(String query)throws Exception{String filter="tous";try{String[] ps=query.split("&");for(String p:ps)if(p.startsWith("filtre="))filter=p.substring(7);}catch(Exception ignored){}JSONArray out=new JSONArray();synchronized(lock){JSONArray ps=arr("posts");for(int i=ps.length()-1;i>=0;i--){JSONObject p=ps.optJSONObject(i);if(p==null)continue;JSONObject a=findUserLocked(p.optString("auteur_id"));if(a==null)continue;if("partenaires".equals(filter)&&!"partenaire".equals(a.optString("type")))continue;JSONObject x=new JSONObject().put("id",p.optString("id")).put("texte",p.optString("texte")).put("cree_le",p.optLong("cree_le",0)/1000.0).put("photos",p.optJSONArray("photos")==null?new JSONArray():p.optJSONArray("photos")).put("auteur",profile(a)).put("nb_com",count("commentaires","post_id",p.optString("id"))).put("nb_likes",count("reactions","post_id",p.optString("id"))+count("likes","post_id",p.optString("id")));out.put(x);}}return new JSONObject().put("ok",true).put("posts",out);}
    private void reaction(Socket s,Req req)throws Exception{
        JSONObject u=user(req);if(u==null){json(s,401,error("non connecté"));return;}
        JSONObject d=body(req);String pid=clean(d.optString("id",""),100),emoji=d.optString("emoji","❤️");
        if(!has("posts","id",pid)){json(s,404,error("post introuvable"));return;}
        synchronized(lock){JSONArray a=arr("reactions");int oldIndex=-1;
            for(int i=0;i<a.length();i++){JSONObject x=a.optJSONObject(i);if(x!=null&&pid.equals(x.optString("post_id"))&&u.optString("id").equals(x.optString("user_id"))&&emoji.equals(x.optString("emoji"))){oldIndex=i;break;}}
            boolean on=oldIndex<0;if(on)a.put(new JSONObject().put("post_id",pid).put("user_id",u.optString("id")).put("emoji",emoji));else a.remove(oldIndex);
            saveLocked();json(s,200,new JSONObject().put("ok",true).put("active",on));
        }
    }
    private void comment(Socket s,Req req)throws Exception{JSONObject u=user(req);if(u==null){json(s,401,error("non connecté"));return;}JSONObject d=body(req);String pid=clean(d.optString("id",""),100),txt=clean(d.optString("texte",""),300);if(!has("posts","id",pid)||txt.length()==0){json(s,400,error("post ou commentaire invalide"));return;}synchronized(lock){arr("commentaires").put(new JSONObject().put("id","c-"+UUID.randomUUID()).put("post_id",pid).put("user_id",u.optString("id")).put("texte",txt).put("cree_le",System.currentTimeMillis()));gainLocked(u.optString("id"),5);saveLocked();}json(s,200,new JSONObject().put("ok",true));}

    // ----- messaging and members ----------------------------------------
    private JSONObject members(Req req)throws Exception{if(user(req)==null)return errorStatus("non connecté",401);JSONArray a=new JSONArray();synchronized(lock){for(int i=0;i<arr("utilisateurs").length();i++){JSONObject u=arr("utilisateurs").optJSONObject(i);if(u!=null)a.put(profile(u));}}return new JSONObject().put("ok",true).put("membres",a);}
    private void message(Socket s,Req req)throws Exception{JSONObject u=user(req);if(u==null){json(s,401,error("non connecté"));return;}JSONObject d=body(req);String to=clean(d.optString("vers",d.optString("vers_id","")),100),txt=clean(d.optString("texte",""),500);synchronized(lock){if(!has("utilisateurs","id",to)){json(s,404,error("membre introuvable"));return;}arr("messages").put(new JSONObject().put("id","m-"+UUID.randomUUID()).put("de_id",u.optString("id")).put("vers_id",to).put("texte",txt).put("cree_le",System.currentTimeMillis()).put("lu",false));eventLocked(to,"message",new JSONObject().put("de",u.optString("nom")).put("texte",txt));saveLocked();}json(s,200,new JSONObject().put("ok",true));}
    private void readMessages(Socket s,Req req)throws Exception{JSONObject u=user(req);if(u==null){json(s,401,error("non connecté"));return;}JSONObject request=body(req);String with=request.optString("avec",query(req.target,"avec"));JSONArray out=new JSONArray();synchronized(lock){for(int i=0;i<arr("messages").length();i++){JSONObject m=arr("messages").optJSONObject(i);if(m!=null&&((u.optString("id").equals(m.optString("de_id"))&&with.equals(m.optString("vers_id")))||(u.optString("id").equals(m.optString("vers_id"))&&with.equals(m.optString("de_id"))))){out.put(new JSONObject().put("id",m.optString("id")).put("de",m.optString("de_id")).put("vers",m.optString("vers_id")).put("texte",m.optString("texte")).put("cree_le",m.optLong("cree_le")/1000.0));m.put("lu",true);}}saveLocked();}json(s,200,new JSONObject().put("ok",true).put("messages",out));}

    // ----- partners and offers ------------------------------------------
    private JSONObject offers()throws Exception{JSONArray out=new JSONArray();synchronized(lock){for(int i=0;i<arr("offres").length();i++){JSONObject o=arr("offres").optJSONObject(i);if(o==null||!o.optBoolean("active",true)||o.optLong("fin",0)<System.currentTimeMillis())continue;JSONObject p=findUserLocked(o.optString("partenaire_id"));out.put(new JSONObject().put("id",o.optString("id")).put("titre",o.optString("titre")).put("texte",o.optString("texte")).put("photo",o.optString("photo","")).put("code",o.optString("code","")).put("fin",o.optLong("fin")/1000.0).put("partenaire",p==null?new JSONObject():profile(p)));}}return new JSONObject().put("ok",true).put("offres",out);}
    private void newOffer(Socket s,Req req)throws Exception{JSONObject u=user(req);if(u==null||!"partenaire".equals(u.optString("type"))){json(s,403,error("réservé aux partenaires"));return;}Map<String,Object> m=multipart(req);String t=clean(string(m.get("titre")),80),text=clean(string(m.get("texte")),500);if(t.length()==0||text.length()==0){json(s,400,error("titre et texte requis"));return;}synchronized(lock){arr("offres").put(new JSONObject().put("id","o-"+UUID.randomUUID()).put("partenaire_id",u.optString("id")).put("titre",t).put("texte",text).put("code",clean(string(m.get("code")),30)).put("photo",m.get("@photo") instanceof byte[]?dataUri((byte[])m.get("@photo"),"image/jpeg"):"").put("active",true).put("deb",System.currentTimeMillis()).put("fin",System.currentTimeMillis()+7L*86400000L));gainLocked(u.optString("id"),20);saveLocked();}json(s,200,new JSONObject().put("ok",true));}
    private void endOffer(Socket s,Req req)throws Exception{JSONObject u=user(req);if(u==null||!"partenaire".equals(u.optString("type"))){json(s,403,error("réservé aux partenaires"));return;}JSONObject d=body(req);synchronized(lock){for(int i=0;i<arr("offres").length();i++){JSONObject o=arr("offres").optJSONObject(i);if(o!=null&&d.optString("id").equals(o.optString("id"))&&u.optString("id").equals(o.optString("partenaire_id")))o.put("active",false);}saveLocked();}json(s,200,new JSONObject().put("ok",true));}
    private void tryOffer(Socket s,Req req)throws Exception{JSONObject u=user(req);if(u==null){json(s,401,error("non connecté"));return;}JSONObject d=body(req);String id=d.optString("id");synchronized(lock){if(!has("offres","id",id)){json(s,404,error("offre introuvable"));return;}if(!hasPair("offres_essayees","offre_id",id,"user_id",u.optString("id"))){arr("offres_essayees").put(new JSONObject().put("offre_id",id).put("user_id",u.optString("id")));gainLocked(u.optString("id"),15);saveLocked();}else{json(s,409,error("offre déjà essayée"));return;}}json(s,200,new JSONObject().put("ok",true).put("pts",15));}
    private JSONObject partner(String q,Req req)throws Exception{String name=queryValue(q,"nom");synchronized(lock){JSONObject p=null;for(int i=0;i<arr("utilisateurs").length();i++){JSONObject u=arr("utilisateurs").optJSONObject(i);if(u!=null&&"partenaire".equals(u.optString("type"))&&name.equals(u.optString("nom")))p=u;}if(p==null)return errorStatus("partenaire introuvable",404);JSONArray po=offers().optJSONArray("offres");JSONArray fp=new JSONArray();for(int i=0;i<po.length();i++){JSONObject o=po.optJSONObject(i);if(o!=null&&p.optString("id").equals(o.optJSONObject("partenaire").optString("id")))fp.put(o);}JSONArray all=feed("").optJSONArray("posts"),posts=new JSONArray();for(int i=0;i<all.length();i++){JSONObject x=all.optJSONObject(i);if(x!=null&&p.optString("id").equals(x.optJSONObject("auteur").optString("id")))posts.put(x);}return new JSONObject().put("ok",true).put("partenaire",profile(p)).put("offres",fp).put("posts",posts);}}
    private void follow(Socket s,Req req)throws Exception{JSONObject u=user(req);if(u==null){json(s,401,error("non connecté"));return;}JSONObject d=body(req);String id=d.optString("id");synchronized(lock){if(!has("utilisateurs","id",id)){json(s,404,error("membre introuvable"));return;}boolean on=!hasPair("follows","follower_id",u.optString("id"),"followee_id",id);if(on)arr("follows").put(new JSONObject().put("follower_id",u.optString("id")).put("followee_id",id));else removePair("follows","follower_id",u.optString("id"),"followee_id",id);saveLocked();json(s,200,new JSONObject().put("ok",true).put("suivi",on));}}

    // ----- loyalty, referrals, realtime ---------------------------------
    private JSONObject partnerMine(Req req)throws Exception{
        JSONObject u=user(req);if(u==null||!"partenaire".equals(u.optString("type")))return errorStatus("réservé aux partenaires",403);
        int sent=0,accepted=0; synchronized(lock){for(int i=0;i<arr("envois").length();i++){JSONObject e=arr("envois").optJSONObject(i);if(e!=null&&u.optString("id").equals(e.optString("de_id"))){sent++;if("accepte".equals(e.optString("statut")))accepted++;}}}
        JSONArray partners=new JSONArray();synchronized(lock){for(int i=0;i<arr("utilisateurs").length();i++){JSONObject x=arr("utilisateurs").optJSONObject(i);if(x!=null&&"partenaire".equals(x.optString("type"))&&!u.optString("id").equals(x.optString("id")))partners.put(profile(x));}}
        return new JSONObject().put("ok",true).put("pro",new JSONObject().put("points",u.optInt("pts",0)).put("nb_envois",sent).put("nb_acceptes",accepted)).put("partenaires",partners);
    }
    private JSONObject loyaltyMine(Req req)throws Exception{JSONObject u=user(req);if(u==null)return errorStatus("non connecté",401);synchronized(lock){JSONObject f=loyaltyLocked(u.optString("id"));JSONArray a=new JSONArray();for(int i=0;i<arr("achats").length();i++){JSONObject x=arr("achats").optJSONObject(i);if(x!=null&&u.optString("id").equals(x.optString("user_id")))a.put(new JSONObject().put("id",x.optString("id")).put("montant",x.optDouble("montant")).put("mode",x.optString("mode")).put("produits",x.optString("produits")).put("points",x.optInt("points")).put("cree_le",x.optLong("cree_le")/1000.0));}return new JSONObject().put("ok",true).put("carte",f==null?JSONObject.NULL:f).put("achats",a);}}
    private JSONObject loyaltyStaff(Req req,String q)throws Exception{JSONObject u=user(req);if(u==null||!"staff".equals(u.optString("type")))return errorStatus("réservé au personnel",403);String tel=digits(queryValue(q,"tel"));synchronized(lock){JSONObject f=loyaltyByTelLocked(tel);return new JSONObject().put("ok",true).put("carte",f==null?JSONObject.NULL:f).put("achats",new JSONArray());}}
    private void purchase(Socket s,Req req)throws Exception{JSONObject staff=user(req);if(staff==null||!"staff".equals(staff.optString("type"))){json(s,403,error("réservé au personnel"));return;}JSONObject d=body(req);String tel=digits(d.optString("tel",""));double amount=d.optDouble("montant",0);if(tel.length()<6||amount<=0){json(s,400,error("téléphone et montant requis"));return;}synchronized(lock){JSONObject client=null;for(int i=0;i<arr("utilisateurs").length();i++){JSONObject x=arr("utilisateurs").optJSONObject(i);if(x!=null&&tel.equals(x.optString("tel")))client=x;}String uid=client==null?"":client.optString("id");JSONArray lines=d.optJSONArray("lignes");JSONObject a=new JSONObject().put("id","a-"+UUID.randomUUID()).put("user_id",uid).put("tel",tel).put("montant",amount).put("mode",d.optString("mode","sur_place")).put("produits",d.optString("produits","")).put("lignes",lines==null?new JSONArray():lines).put("points",(int)amount).put("cree_le",System.currentTimeMillis()).put("statut","confirmee");arr("achats").put(a);if(client!=null)gainLocked(uid,5);saveLocked();json(s,200,new JSONObject().put("ok",true).put("achat_id",a.optString("id")));}}
    private void sendReferral(Socket s,Req req)throws Exception{JSONObject u=user(req);if(u==null||!"partenaire".equals(u.optString("type"))){json(s,403,error("réservé aux partenaires"));return;}JSONObject d=body(req);String to=d.optString("vers_id"),client=clean(d.optString("client_nom",""),60),detail=clean(d.optString("detail",""),300);if(!has("utilisateurs","id",to)||client.length()<2||detail.length()<2){json(s,400,error("demande invalide"));return;}synchronized(lock){String id="e-"+UUID.randomUUID();arr("envois").put(new JSONObject().put("id",id).put("de_id",u.optString("id")).put("vers_id",to).put("client_nom",client).put("detail",detail).put("quand",clean(d.optString("quand",""),60)).put("statut","en_attente").put("cree_le",System.currentTimeMillis()));gainLocked(u.optString("id"),25);eventLocked(to,"envoi",new JSONObject().put("de",u.optString("nom")).put("client",client).put("detail",detail));saveLocked();}json(s,200,new JSONObject().put("ok",true).put("points",25));}
    private JSONObject envois(Req req,boolean sent)throws Exception{JSONObject u=user(req);if(u==null)return errorStatus("non connecté",401);JSONArray out=new JSONArray();synchronized(lock){for(int i=0;i<arr("envois").length();i++){JSONObject e=arr("envois").optJSONObject(i);if(e==null)continue;if((sent&&u.optString("id").equals(e.optString("de_id")))||(!sent&&u.optString("id").equals(e.optString("vers_id"))))out.put(e);}}return new JSONObject().put("ok",true).put(sent?"envoyes":"recus",out);}
    private void answerReferral(Socket s,Req req)throws Exception{JSONObject u=user(req);if(u==null){json(s,401,error("non connecté"));return;}JSONObject d=body(req);String id=d.optString("id"),status=d.optString("statut");synchronized(lock){for(int i=0;i<arr("envois").length();i++){JSONObject e=arr("envois").optJSONObject(i);if(e!=null&&id.equals(e.optString("id"))&&u.optString("id").equals(e.optString("vers_id"))){e.put("statut",status);String from=e.optString("de_id");eventLocked(from,status,new JSONObject().put("client",e.optString("client_nom")).put("vers",u.optString("nom")));}}saveLocked();}json(s,200,new JSONObject().put("ok",true));}
    private JSONObject realtime(Req req)throws Exception{JSONObject u=user(req);if(u==null)return errorStatus("non connecté",401);JSONArray ev=new JSONArray();synchronized(lock){for(int i=0;i<arr("evenements").length();i++){JSONObject e=arr("evenements").optJSONObject(i);if(e!=null&&u.optString("id").equals(e.optString("dest_id"))&&!e.optBoolean("lu",false)){ev.put(new JSONObject().put("id",e.optString("id")).put("type",e.optString("type")).put("data",parse(e.optString("data"))).put("cree_le",e.optLong("cree_le")/1000.0));e.put("lu",true);}}saveLocked();}return new JSONObject().put("ok",true).put("evenements",ev).put("nb_messages",0);}

    // ----- missions, badges, consent and ranking ------------------------
    private JSONArray rewards()throws Exception{return new JSONArray().put(new JSONObject().put("id","pizza").put("nom","Pizza offerte").put("cout",100)).put(new JSONObject().put("id","boisson").put("nom","Boisson offerte").put("cout",40));}
    private JSONObject missions(Req req)throws Exception{JSONObject u=user(req);if(u==null)return errorStatus("non connecté",401);JSONArray out=new JSONArray();String[] ids={"premier_post","commenter","acheter"};int[] targets={1,3,1};int[] points={20,15,20};for(int i=0;i<ids.length;i++)out.put(new JSONObject().put("id",ids[i]).put("nom",ids[i].equals("premier_post")?"Publier une photo ou un post":ids[i].equals("commenter")?"Commenter trois publications":"Enregistrer un achat").put("pts",points[i]).put("cible",targets[i]).put("progression",0).put("fait",hasPair("missions_faites","user_id",u.optString("id"),"mission_id",ids[i])));return new JSONObject().put("ok",true).put("missions",out);}
    private JSONObject badges(Req req)throws Exception{JSONObject u=user(req);if(u==null)return errorStatus("non connecté",401);JSONArray out=new JSONArray();String[][] defs={{"premier_post","Premier partage","📣"},{"photographe","Photographe","📷"},{"fidele","Client fidèle","⭐"},{"argent","Niveau Argent","🥈"},{"or","Niveau Or","🥇"},{"platine","Niveau Platine","💎"}};JSONArray got=u.optJSONArray("badges");for(String[] d:defs){boolean yes=false;for(int i=0;i<(got==null?0:got.length());i++)if(d[0].equals(got.optString(i)))yes=true;out.put(new JSONObject().put("id",d[0]).put("nom",d[1]).put("icone",d[2]).put("desc",d[1]).put("acquis",yes));}return new JSONObject().put("ok",true).put("badges",out);}
    private JSONObject consent(Req req)throws Exception{JSONObject u=user(req);if(u==null)return errorStatus("non connecté",401);return new JSONObject().put("ok",true).put("consent",u.optJSONObject("consent")==null?new JSONObject():u.optJSONObject("consent"));}
    private void setConsent(Socket s,Req req)throws Exception{JSONObject u=user(req);if(u==null){json(s,401,error("non connecté"));return;}JSONObject d=body(req);synchronized(lock){JSONObject c=u.optJSONObject("consent");if(c==null){c=new JSONObject();u.put("consent",c);}String[] keys={"classement","offres_contact","notifs_son"};for(String k:keys)if(d.has(k))c.put(k,d.optBoolean(k));saveLocked();json(s,200,new JSONObject().put("ok",true).put("consent",c));}}
    private JSONObject ranking()throws Exception{ArrayList<JSONObject> us=new ArrayList<JSONObject>();synchronized(lock){for(int i=0;i<arr("utilisateurs").length();i++){JSONObject u=arr("utilisateurs").optJSONObject(i);if(u!=null&&u.optJSONObject("consent")!=null&&u.optJSONObject("consent").optBoolean("classement",false))us.add(u);}}Collections.sort(us,new Comparator<JSONObject>(){public int compare(JSONObject a,JSONObject b){return b.optInt("pts",0)-a.optInt("pts",0);}});JSONArray out=new JSONArray();for(JSONObject u:us)out.put(new JSONObject().put("rang",out.length()+1).put("nom",u.optString("nom")).put("pts",u.optInt("pts")));return new JSONObject().put("ok",true).put("classement",out);}
    private JSONObject verification(Req req)throws Exception{JSONObject u=user(req);if(u==null||!"staff".equals(u.optString("type")))return errorStatus("réservé au personnel",403);JSONArray a=new JSONArray();synchronized(lock){for(int i=0;i<arr("utilisateurs").length();i++){JSONObject x=arr("utilisateurs").optJSONObject(i);if(x!=null&&!x.optBoolean("verifie",false))a.put(profile(x));}}return new JSONObject().put("ok",true).put("en_attente",a);}
    private void verify(Socket s,Req req)throws Exception{JSONObject staff=user(req);if(staff==null||!"staff".equals(staff.optString("type"))){json(s,403,error("réservé au personnel"));return;}JSONObject d=body(req);synchronized(lock){JSONObject x=findUserLocked(d.optString("user_id"));if(x==null){json(s,404,error("membre introuvable"));return;}x.put("verifie",true);saveLocked();}json(s,200,new JSONObject().put("ok",true));}
    private void mission(Socket s,Req req)throws Exception{JSONObject u=user(req);if(u==null){json(s,401,error("non connecté"));return;}JSONObject d=body(req);String id=d.optString("id");synchronized(lock){if(!hasPair("missions_faites","user_id",u.optString("id"),"mission_id",id)){arr("missions_faites").put(new JSONObject().put("user_id",u.optString("id")).put("mission_id",id));gainLocked(u.optString("id"),20);saveLocked();}else{json(s,409,error("déjà accomplie"));return;}}json(s,200,new JSONObject().put("ok",true).put("pts",20));}
    private void reward(Socket s,Req req)throws Exception{JSONObject u=user(req);if(u==null){json(s,401,error("non connecté"));return;}JSONObject d=body(req);String id=d.optString("reward_id");int cost=id.equals("pizza")?100:40;synchronized(lock){if(u.optInt("pts",0)<cost){json(s,400,error("Points insuffisants"));return;}u.put("pts",u.optInt("pts")-cost);arr("recompenses").put(new JSONObject().put("id","r-"+UUID.randomUUID()).put("user_id",u.optString("id")).put("reward_id",id).put("points",cost).put("cree_le",System.currentTimeMillis()));saveLocked();}json(s,200,new JSONObject().put("ok",true));}

    // ----- purchase-linked ratings --------------------------------------
    private JSONObject ratingStats()throws Exception{synchronized(lock){Map<String,Integer> n=new HashMap<String,Integer>();Map<String,Integer> sum=new HashMap<String,Integer>();Map<String,String> names=new HashMap<String,String>();for(int i=0;i<arr("notes_plats").length();i++){JSONObject x=arr("notes_plats").optJSONObject(i);if(x==null||x.optString("achat_id").length()==0)continue;String id=x.optString("plat_id");n.put(id,n.containsKey(id)?n.get(id)+1:1);sum.put(id,sum.containsKey(id)?sum.get(id)+x.optInt("note"):x.optInt("note"));names.put(id,x.optString("plat_nom",id));}JSONArray rows=new JSONArray();for(String id:n.keySet())rows.put(new JSONObject().put("plat_id",id).put("plat_nom",names.get(id)).put("moyenne",Math.round(100.0*sum.get(id)/n.get(id))/100.0).put("compteur",n.get(id)));return new JSONObject().put("ok",true).put("ratings",rows);}}
    private void note(Socket s,Req req)throws Exception{JSONObject u=user(req);if(u==null){json(s,401,new JSONObject().put("ok",false).put("code","connexion_requise").put("erreur","Connectez-vous pour noter un plat."));return;}JSONObject d=body(req);String pid=clean(d.optString("plat_id",""),100);int value=d.optInt("note",0);if(!pid.matches("[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}")||value<1||value>5){json(s,400,error("plat_id et note de 1 à 5 requis"));return;}synchronized(lock){String aid="",line="",name=d.optString("plat_nom",pid);for(int i=0;i<arr("achats").length();i++){JSONObject a=arr("achats").optJSONObject(i);if(a==null||!u.optString("id").equals(a.optString("user_id"))||!"confirmee".equals(a.optString("statut")))continue;JSONArray ls=a.optJSONArray("lignes");if(ls==null)continue;for(int k=0;k<ls.length();k++){JSONObject l=ls.optJSONObject(k);if(l!=null&&pid.equals(l.optString("plat_id",l.optString("id")))){aid=a.optString("id");line="line-"+k;name=l.optString("nom",name);break;}}if(aid.length()>0)break;}if(aid.length()==0){json(s,403,new JSONObject().put("ok",false).put("code","achat_requis").put("erreur","Ce plat doit apparaître dans un achat confirmé."));return;}JSONObject old=null;for(int i=0;i<arr("notes_plats").length();i++){JSONObject x=arr("notes_plats").optJSONObject(i);if(x!=null&&pid.equals(x.optString("plat_id"))&&u.optString("id").equals(x.optString("user_id"))){old=x;break;}}boolean edit=old!=null;if(old==null){old=new JSONObject().put("plat_id",pid).put("plat_nom",name).put("user_id",u.optString("id")).put("achat_id",aid).put("ligne_achat_id",line).put("cree_le",System.currentTimeMillis());arr("notes_plats").put(old);}old.put("note",value).put("commentaire",clean(d.optString("commentaire",""),500)).put("modifie_le",System.currentTimeMillis());saveLocked();json(s,200,new JSONObject().put("ok",true).put("modifie",edit));}}

    // ----- storage and generic helpers ----------------------------------
    private void load(){synchronized(lock){try{data=file.exists()?new JSONObject(readFile(file)):new JSONObject();}catch(Exception e){data=new JSONObject();}String[] a={"utilisateurs","sessions","posts","commentaires","reactions","likes","messages","offres","offres_essayees","follows","achats","notes_plats","evenements","envois","missions_faites","recompenses"};for(String k:a)arr(k);saveLocked();}}
    private JSONArray arr(String key){JSONArray a=data.optJSONArray(key);if(a==null)try{a=new JSONArray();data.put(key,a);}catch(Exception ignored){a=new JSONArray();}return a;}
    private void saveLocked(){try{File tmp=new File(file.getParentFile(),file.getName()+".tmp");FileOutputStream o=new FileOutputStream(tmp);o.write(data.toString().getBytes(StandardCharsets.UTF_8));o.close();if(!tmp.renameTo(file)){FileOutputStream x=new FileOutputStream(file);x.write(data.toString().getBytes(StandardCharsets.UTF_8));x.close();tmp.delete();}}catch(Exception ignored){}}
    private JSONObject findUserLocked(String id){for(int i=0;i<arr("utilisateurs").length();i++){JSONObject x=arr("utilisateurs").optJSONObject(i);if(x!=null&&id.equals(x.optString("id")))return x;}return null;}
    private boolean has(String table,String key,String value){JSONArray a=arr(table);for(int i=0;i<a.length();i++){JSONObject x=a.optJSONObject(i);if(x!=null&&value.equals(x.optString(key)))return true;}return false;}
    private int count(String table,String key,String value){int n=0;for(int i=0;i<arr(table).length();i++){JSONObject x=arr(table).optJSONObject(i);if(x!=null&&value.equals(x.optString(key)))n++;}return n;}
    private boolean hasPair(String table,String k1,String v1,String k2,String v2){for(int i=0;i<arr(table).length();i++){JSONObject x=arr(table).optJSONObject(i);if(x!=null&&v1.equals(x.optString(k1))&&v2.equals(x.optString(k2)))return true;}return false;}
    private void removePair(String table,String k1,String v1,String k2,String v2){for(int i=arr(table).length()-1;i>=0;i--){JSONObject x=arr(table).optJSONObject(i);if(x!=null&&v1.equals(x.optString(k1))&&v2.equals(x.optString(k2)))arr(table).remove(i);}}
    private void gainLocked(String id,int points){JSONObject u=findUserLocked(id);if(u==null)return;try{u.put("pts",u.optInt("pts",0)+points);JSONArray b=u.optJSONArray("badges");if(b==null){b=new JSONArray();u.put("badges",b);}if(u.optInt("pts")>=150&&!contains(b,"argent"))b.put("argent");if(u.optInt("pts")>=400&&!contains(b,"or"))b.put("or");if(u.optInt("pts")>=1000&&!contains(b,"platine"))b.put("platine");}catch(Exception ignored){}}
    private void eventLocked(String dest,String type,JSONObject value){try{arr("evenements").put(new JSONObject().put("id","ev-"+UUID.randomUUID()).put("dest_id",dest).put("type",type).put("data",value.toString()).put("lu",false).put("cree_le",System.currentTimeMillis()));}catch(Exception ignored){}}
    private JSONObject loyaltyLocked(String id)throws Exception{JSONObject u=findUserLocked(id);return u==null?null:loyaltyByTelLocked(u.optString("tel"));}
    private JSONObject loyaltyByTelLocked(String tel)throws Exception{int pts=0,count=0;double total=0;for(int i=0;i<arr("achats").length();i++){JSONObject a=arr("achats").optJSONObject(i);if(a!=null&&tel.equals(a.optString("tel"))){pts+=a.optInt("points",(int)a.optDouble("montant"));count++;total+=a.optDouble("montant");}}if(count==0)return null;String level=pts>=1000?"Platine":pts>=400?"Or":pts>=150?"Argent":"Bronze";String next=null;int base=0,target=150;if(pts<150){next="Argent";base=0;target=150;}else if(pts<400){next="Or";base=150;target=400;}else if(pts<1000){next="Platine";base=400;target=1000;}int progression=next==null?100:Math.min(100,Math.max(0,(pts-base)*100/(target-base)));return new JSONObject().put("tel",tel).put("points",pts).put("niveau",level).put("nb_achats",count).put("total",total).put("progression",progression).put("prochain_niveau",next==null?JSONObject.NULL:next).put("reste",next==null?0:target-pts);}
    private static boolean contains(JSONArray a,String x){for(int i=0;i<a.length();i++)if(x.equals(a.optString(i)))return true;return false;}
    private static String string(Object o){return o==null?"":String.valueOf(o);}
    private static String clean(String s,int max){if(s==null)return "";s=s.replace('\u0000',' ').trim();return s.length()>max?s.substring(0,max):s;}
    private static String digits(String s){if(s==null)return "";StringBuilder b=new StringBuilder();for(int i=0;i<s.length();i++)if(Character.isDigit(s.charAt(i)))b.append(s.charAt(i));return b.length()>20?b.substring(0,20):b.toString();}
    private static String hash(String s,String salt){try{byte[] b=MessageDigest.getInstance("SHA-256").digest((salt+s).getBytes(StandardCharsets.UTF_8));StringBuilder x=new StringBuilder();for(byte z:b)x.append(String.format(java.util.Locale.US,"%02x",z&255));return x.toString();}catch(Exception e){return "";}}
    private String hex(int n){byte[] b=new byte[n];random.nextBytes(b);StringBuilder x=new StringBuilder();for(byte z:b)x.append(String.format(java.util.Locale.US,"%02x",z&255));return x.toString();}
    private static String dataUri(byte[] b,String type){return "data:"+type+";base64,"+Base64.encodeToString(b,Base64.NO_WRAP);}
    private static JSONObject body(Req r)throws Exception{return new JSONObject(new String(r.body,StandardCharsets.UTF_8).trim().length()==0?"{}":new String(r.body,StandardCharsets.UTF_8));}
    private static JSONObject parse(String s){try{return new JSONObject(s);}catch(Exception e){return new JSONObject();}}
    private static String query( String target,String key){int p=target.indexOf('?');if(p<0)return "";return queryValue(target.substring(p+1),key);}
    private static String queryValue(String q,String key){for(String x:q.split("&")){int p=x.indexOf('=');if(p>=0&&key.equals(x.substring(0,p))){try{return java.net.URLDecoder.decode(x.substring(p+1),"UTF-8");}catch(Exception e){return x.substring(p+1);}}}return "";}
    private Map<String,Object> multipart(Req r){Map<String,Object> out=new HashMap<String,Object>();String ct=header(r,"content-type","");int bp=ct.indexOf("boundary=");if(bp<0)return out;String boundary=ct.substring(bp+9).replace("\"","");byte[] sep=("--"+boundary).getBytes(StandardCharsets.ISO_8859_1);byte[] raw=r.body;int from=0;while(true){int st=indexOf(raw,sep,from);if(st<0)break;if(st+sep.length+1<raw.length&&raw[st+sep.length]=='-'&&raw[st+sep.length+1]=='-')break;int next=indexOf(raw,sep,st+sep.length);if(next<0)next=raw.length;int part=st+sep.length;while(part<next&&(raw[part]=='\r'||raw[part]=='\n'))part++;int split=indexOf(raw,"\r\n\r\n".getBytes(StandardCharsets.ISO_8859_1),part);if(split<0)break;String h=new String(raw,part,split-part,StandardCharsets.ISO_8859_1);int end=next;while(end>split&&(raw[end-1]=='\r'||raw[end-1]=='\n'))end--;int np=h.indexOf("name=\"");if(np>=0){np+=6;int ne=h.indexOf('"',np);String name=h.substring(np,ne);boolean binary=h.indexOf("filename=")>=0;if(binary){byte[] v=new byte[Math.max(0,end-(split+4))];System.arraycopy(raw,split+4,v,0,v.length);out.put("@"+name,v);}else out.put(name,new String(raw,split+4,Math.max(0,end-(split+4)),StandardCharsets.UTF_8));}from=next;}return out;}
    private static int indexOf(byte[] a,byte[] b,int from){outer:for(int i=Math.max(0,from);i<=a.length-b.length;i++){for(int k=0;k<b.length;k++)if(a[i+k]!=b[k])continue outer;return i;}return -1;}

    private void asset(Socket s,String name,String type)throws Exception{if(name.contains("..")||name.startsWith("/")||!(name.startsWith("community-")||name.equals("community-index.html"))){json(s,404,error("asset introuvable"));return;}InputStream in=context.getAssets().open(name);String text=readFile(in);in.close();send(s,200,type,text,null);}
    private static String readFile(File f)throws Exception{FileInputStream i=new FileInputStream(f);try{return readFile(i);}finally{i.close();}}
    private static String readFile(InputStream i)throws Exception{ByteArrayOutputStream b=new ByteArrayOutputStream();byte[] x=new byte[8192];int n;while((n=i.read(x))>=0)b.write(x,0,n);return new String(b.toByteArray(),StandardCharsets.UTF_8);}
    private static JSONObject error(String x)throws Exception{return new JSONObject().put("ok",false).put("erreur",x);}
    private static JSONObject errorStatus(String x,int code)throws Exception{return new JSONObject().put("ok",false).put("erreur",x).put("_status",code);}
    private void json(Socket s,int code,JSONObject o)throws IOException{int status=o.optInt("_status",code);o.remove("_status");send(s,status,"application/json; charset=utf-8",o.toString(),null);}
    private void jsonCookie(Socket s,int code,JSONObject o,String tok)throws IOException{send(s,code,"application/json; charset=utf-8",o.toString(),COOKIE+"="+tok+"; Path=/; Max-Age=2592000; SameSite=Lax");}
    private void send(Socket s,int code,String type,String text,String cookie)throws IOException{byte[] b=text.getBytes(StandardCharsets.UTF_8);BufferedOutputStream o=new BufferedOutputStream(s.getOutputStream());String status=code==200?"OK":code==204?"No Content":"Error";StringBuilder h=new StringBuilder("HTTP/1.1 "+code+" "+status+"\r\nContent-Type: "+type+"\r\nContent-Length: "+b.length+"\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Content-Type, X-Jeton, X-Requested-With\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\n");if(cookie!=null)h.append("Set-Cookie: ").append(cookie).append("\r\n");h.append("Connection: close\r\n\r\n");o.write(h.toString().getBytes(StandardCharsets.UTF_8));o.write(b);o.flush();}
}
