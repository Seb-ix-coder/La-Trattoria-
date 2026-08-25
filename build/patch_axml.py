#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_axml.py — Correctifs du AndroidManifest.xml binaire (AXML) de trato.apk
============================================================================

Correctifs appliqués (build durci 11.1) :
  1. android:allowBackup = false
     (C5 du rapport ANALYSE_TRATO.md : empêche l'exfiltration des données —
     NIR, pièces d'identité, signatures, clé Hiboutik — via `adb backup`
     ou la sauvegarde cloud du compte Google de la tablette.)
  2. android:versionCode : 15 -> 16
     (nouvelle version signée avec une nouvelle clé ; le code de version est
     incrémenté pour distinguer le build durci et permettre le suivi.)
  3. android:versionName : "11.0" -> "11.1"
     (même longueur de chaîne, remplacement en place dans le string pool.)

Principe technique
------------------
Le AndroidManifest.xml d'un APK est un XML binaire (AXML). On le modifie au
niveau des octets, sans réassemblage :
  * chaque attribut d'un élément porte une "typed value" (1 octet de type +
    4 octets de donnée). allowBackup est un booléen (type 0x12) : on passe sa
    donnée de 0xFFFFFFFF (true) à 0x00000000 (false).
  * versionCode est un entier (type 0x10) : on passe la donnée de 15 à 16.
  * versionName est une chaîne du string pool : on modifie le dernier octet
    "0" -> "1" ("11.0" -> "11.1", même longueur => aucun décalage).

Aucun décalage d'offset n'est introduit : le fichier garde exactement la même
taille, ce qui rend le patch sûr et vérifiable.

Usage :
  python3 patch_axml.py dump   AndroidManifest.xml            # diagnostic
  python3 patch_axml.py patch  AndroidManifest.xml  OUT.xml   # applique
"""

import struct
import sys

# Chunk types du format AXML (binary XML Android)
CHUNK_STRING_POOL = 0x0001
CHUNK_XML = 0x0003
CHUNK_RES_MAP = 0x0180
CHUNK_START_NS = 0x0100
CHUNK_END_NS = 0x0101
CHUNK_START_TAG = 0x0102
CHUNK_END_TAG = 0x0103
CHUNK_CDATA = 0x0104

# Types de "typed value" Android
TYPE_INT_DEC = 0x10
TYPE_INT_BOOL = 0x12


class AXML:
    """Parseur minimal d'un fichier AXML (AndroidManifest.xml binaire)."""

    def __init__(self, data: bytes):
        self.data = data
        self.strings = []          # liste des chaînes du string pool
        self.string_offsets = []   # offset de chaque chaîne dans le pool
        self.utf8 = False          # True si le pool est encodé en MUTF-8
        self.chunks = []           # (type, debut, taille) pour parcours
        self._parse()

    # ------------------------------------------------------------------
    #  Parsing du string pool
    # ------------------------------------------------------------------
    def _parse(self) -> None:
        """Parcourt les chunks de tête pour localiser le string pool.

        Le fichier AXML commence par un chunk racine (type 3, RES_XML) dont
        la taille couvre tout le fichier ; les chunks réels (string pool,
        éléments…) suivent immédiatement après son en-tête de 8 octets.
        """
        ctype0, hsize0, csize0 = struct.unpack_from('<HHI', self.data, 0)
        if ctype0 == CHUNK_XML:
            off = 8  # on saute l'en-tête du chunk racine
        else:
            off = 0
        while off + 8 <= len(self.data):
            ctype, hsize, csize = struct.unpack_from('<HHI', self.data, off)
            if ctype == CHUNK_STRING_POOL:
                self._parse_string_pool(off, csize)
                # le string pool est le premier chunk ; on s'arrête là
                return
            off += csize

    def _parse_string_pool(self, off: int, size: int) -> None:
        # Après l'en-tête de chunk (type, headerSize, chunkSize = 8 octets),
        # les 5 champs du pool sont : stringCount, styleCount, flags,
        # stringsStart, stylesStart.
        string_count, style_count, flags, strings_start, styles_start = (
            struct.unpack_from('<IIIII', self.data, off + 8)
        )
        self.utf8 = bool(flags & 0x100)
        # Table des offsets des chaînes (4 octets chacun)
        self.string_offsets = [
            struct.unpack_from('<I', self.data, off + 28 + 4 * i)[0]
            for i in range(string_count)
        ]
        base = off + strings_start
        self.pool_base = base
        for so in self.string_offsets:
            p = base + so
            if self.utf8:
                # MUTF-8 : uleb128 longueur (1) + uleb128 longueur utf16 + octets
                length, p = self._uleb(p)
                _, p = self._uleb(p)
                s = self.data[p:p + length].decode('utf-8', 'replace')
            else:
                # UTF-16LE avec préfixe de longueur u16 (format aapt2) :
                #   [longueur:u16][caractères:u16 × longueur][NUL:u16]
                length = struct.unpack_from('<H', self.data, p)[0]
                p += 2
                chars = struct.unpack_from(
                    '<%dH' % length, self.data, p
                )
                p += 2 * length
                s = ''.join(chr(c) for c in chars)
                # NUL terminal éventuel
                if p + 2 <= len(self.data) and \
                        struct.unpack_from('<H', self.data, p)[0] == 0:
                    p += 2
            self.strings.append(s)

    @staticmethod
    def _uleb(buf: bytes, off: int):
        result = 0
        shift = 0
        while True:
            b = buf[off]
            off += 1
            result |= (b & 0x7F) << shift
            if not (b & 0x80):
                return result, off
            shift += 7

    # ------------------------------------------------------------------
    #  Parcours des chunks (éléments / attributs)
    # ------------------------------------------------------------------
    def _iter_chunks(self):
        """Itère sur les chunks (après l'en-tête du chunk racine XML)."""
        off = 8
        while off + 8 <= len(self.data):
            ctype, hsize, csize = struct.unpack_from('<HHI', self.data, off)
            yield ctype, off, csize
            off += csize

    def elements(self):
        """Itère sur les éléments : (nom, liste d'attributs).

        Chaque attribut est un tuple :
          (ns_idx, name_idx, raw_idx, value_type, value_data, attr_offset)
        où attr_offset pointe sur le début des 20 octets de l'attribut
        (utile pour patcher value_data à attr_offset + 16).
        """
        for ctype, off, csize in self._iter_chunks():
            if ctype != CHUNK_START_TAG:
                continue
            ns, name = struct.unpack_from('<II', self.data, off + 16)
            attr_start, attr_size, attr_count = struct.unpack_from(
                '<HHH', self.data, off + 24
            )
            # Les attributs commencent à off + 16 + attributeStart :
            # attributeStart (0x14) est relatif à la fin de l'en-tête de
            # chunk générique de 16 octets (type/headerSize/size/line/comment).
            attr_base = off + 16 + attr_start
            attrs = []
            for i in range(attr_count):
                aoff = attr_base + i * attr_size
                ans, aname, araw = struct.unpack_from('<III', self.data, aoff)
                # typed value : {size:u16, res0:u8, dataType:u8, data:i32}
                size_res_type = struct.unpack_from('<I', self.data, aoff + 12)[0]
                data_type = (size_res_type >> 24) & 0xFF
                vdata = struct.unpack_from('<i', self.data, aoff + 16)[0]
                attrs.append((ans, aname, araw, data_type, vdata, aoff))
            yield self._str(name), attrs

    def _str(self, idx: int) -> str:
        if 0 <= idx < len(self.strings):
            return self.strings[idx]
        return '<%d>' % idx

    # ------------------------------------------------------------------
    #  Patches
    # ------------------------------------------------------------------
    def patch_boolean_attr(self, element: str, attr: str, value: bool) -> bool:
        """Passe un attribut booléen d'un élément à la valeur demandée."""
        target = 1 if value else 0
        for name, attrs in self.elements():
            if name != element:
                continue
            for ans, aname, araw, vtype, vdata, aoff in attrs:
                if self._str(aname) != attr:
                    continue
                if vtype != TYPE_INT_BOOL:
                    raise ValueError(
                        'attribut %s de %s : type %#x attendu booléen (%#x)'
                        % (attr, element, vtype, TYPE_INT_BOOL)
                    )
                new = struct.pack('<i', target)
                self.data = (
                    self.data[:aoff + 16] + new + self.data[aoff + 20:]
                )
                print('[ok] %s:%s -> %s' % (element, attr, value))
                return True
        raise ValueError('attribut %s:%s introuvable' % (element, attr))

    def patch_int_attr(self, element: str, attr: str, value: int) -> bool:
        """Passe un attribut entier d'un élément à la valeur demandée."""
        for name, attrs in self.elements():
            if name != element:
                continue
            for ans, aname, araw, vtype, vdata, aoff in attrs:
                if self._str(aname) != attr:
                    continue
                if vtype != TYPE_INT_DEC:
                    raise ValueError(
                        'attribut %s de %s : type %#x attendu entier (%#x)'
                        % (attr, element, vtype, TYPE_INT_DEC)
                    )
                new = struct.pack('<i', value)
                self.data = (
                    self.data[:aoff + 16] + new + self.data[aoff + 20:]
                )
                print('[ok] %s:%s -> %d' % (element, attr, value))
                return True
        raise ValueError('attribut %s:%s introuvable' % (element, attr))

    def patch_string(self, old: str, new: str) -> bool:
        """Remplace une chaîne du string pool (même longueur requise).

        On écrit directement à l'offset exact de la chaîne dans le pool :
        aucune recherche globale (pas de risque de faux positif).
        """
        if len(old) != len(new):
            raise ValueError('chaînes de longueurs différentes')
        for idx, s in enumerate(self.strings):
            if s != old:
                continue
            pos = self.pool_base + self.string_offsets[idx]
            if self.utf8:
                # MUTF-8 : on saute les 2 préfixes uleb128
                _, p1 = self._uleb(self.data, pos)
                _, p2 = self._uleb(self.data, p1)
                pos = p2
            else:
                # UTF-16 : on saute le préfixe de longueur u16
                pos += 2
            if self.data[pos:pos + len(old)] != old.encode('utf-8') and \
                    self.data[pos:pos + 2 * len(old)] != old.encode('utf-16-le'):
                raise ValueError(
                    'contenu inattendu à l\'offset de "%s"' % old
                )
            if self.utf8:
                new_bytes = new.encode('utf-8')
            else:
                new_bytes = new.encode('utf-16-le')
            self.data = self.data[:pos] + new_bytes + self.data[pos + len(new_bytes):]
            print('[ok] chaîne "%s" -> "%s"' % (old, new))
            return True
        raise ValueError('chaîne "%s" absente du pool' % old)

    def dump(self) -> None:
        print('== string pool : %d chaînes (encodage %s) =='
              % (len(self.strings), 'UTF-8' if self.utf8 else 'UTF-16'))
        print('== éléments ==')
        for name, attrs in self.elements():
            print('  <%s>' % name)
            for ans, aname, araw, vtype, vdata, aoff in attrs:
                extra = ''
                if araw < len(self.strings):
                    extra = '  (raw="%s")' % self.strings[araw]
                print('    %s type=%#x data=%d%s'
                      % (self._str(aname), vtype, vdata, extra))


def main() -> None:
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    mode = sys.argv[1]
    src = sys.argv[2]
    with open(src, 'rb') as f:
        axml = AXML(f.read())
    if mode == 'dump':
        axml.dump()
        return
    if mode == 'patch':
        if len(sys.argv) != 4:
            print('usage: patch_axml.py patch IN.xml OUT.xml')
            sys.exit(1)
        # 1) allowBackup=false sur l'élément <application>
        axml.patch_boolean_attr('application', 'allowBackup', False)
        # 2) versionCode 15 -> 16 sur <manifest>
        axml.patch_int_attr('manifest', 'versionCode', 16)
        # 3) versionName "11.0" -> "11.1"
        try:
            axml.patch_string('11.0', '11.1')
        except ValueError as e:
            print('[attention] %s (versionName conservé)' % e)
        with open(sys.argv[3], 'wb') as f:
            f.write(axml.data)
        print('[ok] manifeste écrit : %s (%d octets)'
              % (sys.argv[3], len(axml.data)))
        return
    print(__doc__)
    sys.exit(1)


if __name__ == '__main__':
    main()
