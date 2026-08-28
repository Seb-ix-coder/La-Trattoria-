#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Assemble l'APK native unifiée sans mélanger les deux namespaces.

La base est l'APK Gestion (`com.trattoria.cartes`). Le DEX fourni doit avoir
été recompilé depuis build/app-src/src. Les assets web sont ajoutés comme
fichiers d'assets (aucun identifiant R à remapper).
"""
from __future__ import annotations
import argparse
import struct
import sys
import zipfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
BASE=HERE/'app-src'/'base.apk'
ASSETS=HERE/'app-src'/'assets'

def patch_manifest(data:bytes)->bytes:
    sys.path.insert(0,str(HERE))
    from patch_axml import AXML
    x=AXML(data)
    x.patch_int_attr('manifest','versionCode',5)
    x.patch_string('1.3','1.4')
    x.patch_boolean_attr('application','allowBackup',False)
    return x.data

def make_unsigned(dex:Path,out:Path)->None:
    if not BASE.exists(): raise FileNotFoundError(BASE)
    if not dex.exists(): raise FileNotFoundError(dex)
    entries={}
    with zipfile.ZipFile(BASE) as z:
        for i in z.infolist():
            if not i.filename.endswith('/') and not i.filename.startswith('META-INF/') and i.filename!='classes.dex': entries[i.filename]=z.read(i.filename)
    entries['AndroidManifest.xml']=patch_manifest(entries['AndroidManifest.xml'])
    entries['classes.dex']=dex.read_bytes()
    for p in sorted(ASSETS.rglob('*')):
        if p.is_file(): entries['assets/'+p.relative_to(ASSETS).as_posix()]=p.read_bytes()
    out.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for name,payload in entries.items():
            i=zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0));i.create_system=3;i.external_attr=0o100644<<16
            method=zipfile.ZIP_STORED if name == 'resources.arsc' else zipfile.ZIP_DEFLATED
            # Android expects resources.arsc to be STORE and 4-byte aligned.
            if method == zipfile.ZIP_STORED:
                here=z.fp.tell(); base=here+30+len(name.encode('utf-8')); need=(4-(base%4))%4
                i.extra=struct.pack('<HH',0,need)+b'\0'*need if need else b''
            i.compress_type=method
            z.writestr(i,payload,compress_type=method,compresslevel=9)
    print('[ok] APK native base + DEX + assets : %s (%d octets)'%(out,out.stat().st_size))

def sign(unsigned:Path,out:Path,keystore:Path,password:str)->None:
    sys.path.insert(0,str(HERE));import sign_v1,sign_v2
    v1=Path(str(out)+'.v1');sign_v1.sign(str(unsigned),str(keystore),password,str(v1));sign_v2.sign(str(v1),str(keystore),password,str(out));v1.unlink(missing_ok=True)

def main()->int:
    p=argparse.ArgumentParser();p.add_argument('--dex',required=True,type=Path);p.add_argument('--output',required=True,type=Path);p.add_argument('--keystore',type=Path);p.add_argument('--password');a=p.parse_args();make_unsigned(a.dex,a.output)
    if a.keystore:
        if not a.password:p.error('--password est requis avec --keystore')
        final=a.output.with_name(a.output.name.replace('-unsigned',''));sign(a.output,final,a.keystore,a.password);print('[ok] signatures APK v1 + v2 :',final)
    return 0
if __name__=='__main__':raise SystemExit(main())
