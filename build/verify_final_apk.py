#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vérification indépendante de l'APK native unifiée 1.4."""
from __future__ import annotations
import hashlib, os, subprocess, sys, zipfile
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent

def manifest(apk):
 from androguard.core.apk import APK
 a=APK(str(apk));assert a.get_package()=='com.trattoria.cartes';assert a.get_androidversion_name()=='1.4';assert a.get_androidversion_code()=='5';assert a.get_main_activity()=='com.trattoria.cartes.MainActivity';assert a.get_min_sdk_version()=='21';assert a.get_target_sdk_version()=='33'
 ns='{http://schemas.android.com/apk/res/android}';app=next(x for x in a.get_android_manifest_xml().iter() if x.tag.endswith('application'));assert app.get(ns+'allowBackup')=='false';print('[ok] manifeste : package, version, activité, SDK et allowBackup')

def dex(apk):
 from androguard.core.dex import DEX
 with zipfile.ZipFile(apk) as z:
  names=set(z.namelist());assert 'classes.dex' in names;assert not any(x.startswith('classes2.dex') for x in names);d=DEX(z.read('classes.dex'))
 names={c.get_name() for c in d.get_classes()};assert 'Lcom/trattoria/cartes/MainActivity;' in names;assert 'Lcom/trattoria/cartes/ServeurCommunaute;' in names;assert not any(x.startswith('Lcom/trattoria/commande/') for x in names);print('[ok] DEX : interface et backend social natifs, aucun classes2.dex')

def assets(apk):
 with zipfile.ZipFile(apk) as z:
  names=set(z.namelist());req={'assets/public-shell.html','assets/unified-client.css','assets/unified-rating.js','assets/site.js','assets/site.css','assets/community-index.html','assets/community-app.js','assets/community-app.css','assets/community-manifest.webmanifest','assets/community-icone-192.png','assets/community-icone-512.png'};assert req<=names
  shell=z.read('assets/public-shell.html').decode();js=z.read('assets/site.js').decode();css=z.read('assets/site.css').decode();rating=z.read('assets/unified-rating.js').decode();community=z.read('assets/community-app.js').decode();community_html=z.read('assets/community-index.html').decode()
  for x in ('lt-search','Accueil','Salle','Cartes','Communication','Administration','rating-form','Aucun avis vérifié'):assert x in shell,x
  for x in ('TrattoriaQR','Pourboire numérique','Mode de paiement prévu','Cartes de fidélité','Modes App','APK Premium header'):assert x in js,x
  assert 'overflow-x:auto' in css
  for x in ('/api/public/auth','/api/public/rating','plat_id','note','achat'):assert x in rating,x
  for x in ('COMMUNAUTE_API','inscription','connexion','feed','commentaires','messages','partenaire','fidelite','recompense','realtime'):assert x in community,x
  assert '/assets/community-app.js' in community_html
 print('[ok] assets : shell public, header, recherche, paiement, fidélité, QR et notation')

def zip_sign(apk):
 with zipfile.ZipFile(apk) as z:assert z.testzip() is None;assert {'META-INF/MANIFEST.MF','META-INF/CERT.SF','META-INF/CERT.RSA'}<=set(z.namelist())
 sys.path.insert(0,str(HERE));import verify_apk;verify_apk.check_v1(str(apk));verify_apk.check_v2(str(apk));print('[ok] ZIP + signatures v1/v2 : intégrité vérifiée')

def badging(apk):
 tool=ROOT/'build/native-tools/aapt2-x64'
 if not tool.exists():return
 out=subprocess.check_output([str(tool),'dump','badging',str(apk)],text=True);assert "package: name='com.trattoria.cartes'" in out;assert "launchable-activity: name='com.trattoria.cartes.MainActivity'" in out;print('[ok] aapt2 badging : package et activité launcher confirmés')

def cert(apk,p12=None):
 with zipfile.ZipFile(apk) as z:
  from asn1crypto import cms;c=cms.ContentInfo.load(z.read('META-INF/CERT.RSA'))['content']['certificates'][0].chosen
 fp=hashlib.sha256(c.dump()).hexdigest();print('[info] certificat SHA-256 :',fp)
 if p12:
  from cryptography.hazmat.primitives.serialization import pkcs12,Encoding
  pw=os.environ.get('TRATTORIA_KEYSTORE_PASSWORD','');_,x,_=pkcs12.load_key_and_certificates(p12.read_bytes(),pw.encode());assert x;assert fp==hashlib.sha256(x.public_bytes(Encoding.DER)).hexdigest();print('[ok] certificat APK identique au keystore fourni')

def main():
 if len(sys.argv) not in (2,3):print('usage: verify_final_apk.py APK [keystore.p12]');return 2
 apk=Path(sys.argv[1]).resolve();p12=Path(sys.argv[2]).resolve() if len(sys.argv)==3 else None
 manifest(apk);dex(apk);assets(apk);zip_sign(apk);badging(apk);cert(apk,p12);b=apk.read_bytes();print('[info] APK : %d octets'%len(b));print('[info] SHA-256 APK :',hashlib.sha256(b).hexdigest());print('==== APK unifiée 1.4 : vérifications passées ====');return 0
if __name__=='__main__':raise SystemExit(main())
