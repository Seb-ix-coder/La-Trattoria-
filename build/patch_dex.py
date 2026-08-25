#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_dex.py — Correctifs du bytecode DEX de trato.apk (build durci 11.1)
=========================================================================

Correctifs appliqués (cf. ANALYSE_TRATO.md pour la justification complète) :

  1. [P4 / C3] Timeout des sockets du serveur local : 8000 ms -> 2000 ms.
     Dans `Reseau$2.run()` (boucle accept du port 8720), le socket accepté
     reçoit `setSoTimeout(8000)`. Le serveur étant mono-thread, un client
     qui ouvre une connexion sans rien envoyer bloque tout le service
     pendant 8 s. Ramené à 2 s, l'impact d'un "slowloris" est réduit d'un
     facteur 4 (la correction structurelle — un thread par connexion —
     nécessite les sources, voir build/README.md).

  2. [P3 / C2] Suppression du prix de revient (`cout`) de la réponse de la
     route non authentifiée `/carte`.
     `Reseau.router()` répondait à `/carte` avec le champ "cout" (prix de
     revient de chaque plat) pour quiconque est connecté au WiFi du
     restaurant — donnée commercialement sensible (marges). On neutralise
     la séquence d'instructions :
         const-string vX, "cout"
         iget-wide   vA, vB, L.../Catalogue$Produit;->cout:D
         invoke-virtual {..}, Lorg/json/JSONObject;->put(Ljava/lang/String;D;)
     en la remplaçant par des nops. Le filtre cible UNIQUEMENT ce champ du
     `Catalogue$Produit` : le `cout` des `Modele$Ligne` (sérialisation des
     tickets, nécessaire à la synchro multi-tablettes) est conservé.

Principe technique
------------------
Les deux patchs sont à TAILLE IDENTIQUE (aucune instruction ajoutée ou
retirée) : on ne décale aucun offset du DEX, on modifie uniquement :
  * 4 octets (const/16 8000 -> 2000),
  * 14 octets (7 nops) pour la suppression du "cout",
  * l'en-tête (checksum adler32 + signature sha1) recalculé.

Le script est autonome : il parse lui-même les tables du DEX (strings,
types, champs, méthodes, protos) pour résoudre les index exacts des
références à patcher. Aucune dépendance externe.

Usage :
  python3 patch_dex.py classes.dex classes_patched.dex
"""

import hashlib
import struct
import sys
import zlib


# ---------------------------------------------------------------------------
#  Parseur DEX minimal (uniquement ce dont on a besoin)
# ---------------------------------------------------------------------------
class DexTables:
    """Extrait les tables de référence du DEX (strings, types, fields…)."""

    def __init__(self, data: bytes):
        self.data = data
        # En-tête DEX : magic(8) checksum(4) signature(20) = 32 octets,
        # puis file_size, header_size, endian_tag, link_size, link_off,
        # map_off (6 × u32), puis 8 paires (size, off) de tables.
        f = struct.unpack_from('<32x6I16I', data, 0)
        self.file_size = f[0]
        self.map_off = f[5]
        self.string_ids_size, self.string_ids_off = f[6], f[7]
        self.type_ids_size, self.type_ids_off = f[8], f[9]
        self.proto_ids_size, self.proto_ids_off = f[10], f[11]
        self.field_ids_size, self.field_ids_off = f[12], f[13]
        self.method_ids_size, self.method_ids_off = f[14], f[15]
        self.class_defs_size, self.class_defs_off = f[16], f[17]
        self.strings = self._parse_strings()
        self.types = self._parse_types()
        self.fields = self._parse_fields()
        self.methods = self._parse_methods()
        self.protos = self._parse_protos()

    # -- chaînes -----------------------------------------------------------
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

    def _parse_strings(self):
        offs = [
            struct.unpack_from('<I', self.data, self.string_ids_off + 4 * i)[0]
            for i in range(self.string_ids_size)
        ]
        out = []
        for so in offs:
            length, p = self._uleb(self.data, so)
            out.append(self.data[p:p + length].decode('utf-8', 'replace'))
        return out

    # -- types : tableau d'index de chaînes (descripteurs) -----------------
    def _parse_types(self):
        return [
            self.strings[struct.unpack_from('<I', self.data,
                                            self.type_ids_off + 4 * i)[0]]
            for i in range(self.type_ids_size)
        ]

    def type_idx(self, descriptor: str) -> int:
        return self.types.index(descriptor)

    def string_idx(self, value: str) -> int:
        return self.strings.index(value)

    # -- champs : class_idx(u16) type_idx(u16) name_idx(u32) ---------------
    def _parse_fields(self):
        out = []
        for i in range(self.field_ids_size):
            o = self.field_ids_off + 8 * i
            c, t, n = struct.unpack_from('<HHI', self.data, o)
            out.append((c, t, n))
        return out

    def field_idx(self, class_desc: str, name: str, type_desc: str) -> int:
        ci, ti = self.type_idx(class_desc), self.type_idx(type_desc)
        ni = self.string_idx(name)
        for i, (c, t, n) in enumerate(self.fields):
            if (c, t, n) == (ci, ti, ni):
                return i
        raise ValueError('champ introuvable : %s.%s:%s'
                         % (class_desc, name, type_desc))

    # -- méthodes : class_idx(u16) proto_idx(u16) name_idx(u32) ------------
    def _parse_methods(self):
        out = []
        for i in range(self.method_ids_size):
            o = self.method_ids_off + 8 * i
            c, p, n = struct.unpack_from('<HHI', self.data, o)
            out.append((c, p, n))
        return out

    # -- protos : shorty(u32) return_type(u32) parameters_off(u32) ---------
    def _parse_protos(self):
        out = []
        for i in range(self.proto_ids_size):
            o = self.proto_ids_off + 12 * i
            shorty, ret, params_off = struct.unpack_from('<III', self.data, o)
            params = []
            if params_off:
                # type_list : size(u32) puis `size` entrées type_item (u16) ;
                # si size est impair, 2 octets de padding suivent (alignement
                # à 4 octets) — cf. spécification DEX (type_item = ushort).
                n = struct.unpack_from('<I', self.data, params_off)[0]
                for j in range(n):
                    params.append(
                        struct.unpack_from('<H', self.data,
                                           params_off + 4 + 2 * j)[0]
                    )
            out.append((ret, params))
        return out

    def method_idx(self, class_desc: str, name: str,
                   param_descs, return_desc: str) -> int:
        ci = self.type_idx(class_desc)
        ni = self.string_idx(name)
        ret_ti = self.type_idx(return_desc)
        param_tis = [self.type_idx(p) for p in param_descs]
        for i, (c, p, n) in enumerate(self.methods):
            if (c, n) != (ci, ni):
                continue
            ret, params = self.protos[p]
            if ret == ret_ti and list(params) == param_tis:
                return i
        raise ValueError('méthode introuvable : %s.%s%s%s'
                         % (class_desc, name, param_descs, return_desc))

    def find_bytes(self, pattern: bytes) -> list:
        """Toutes les occurrences d'un motif d'octets (avec contexte)."""
        out = []
        start = 0
        while True:
            i = self.data.find(pattern, start)
            if i < 0:
                return out
            out.append(i)
            start = i + 1


# ---------------------------------------------------------------------------
#  Correctifs
# ---------------------------------------------------------------------------
def patch_timeout_accept_loop(dt: DexTables) -> list:
    """[P4] setSoTimeout(8000) -> setSoTimeout(2000) dans Reseau$2.run().

    Séquence recherchée : const/16 v1, 0x1F40 (=8000)
        opcode 0x13, registre 0x01, imm16 LE 0x1F40 -> octets 13 01 40 1F
    Remplacement : const/16 v1, 0x07D0 (=2000)  -> octets 13 01 D0 07
    """
    pattern = bytes([0x13, 0x01, 0x40, 0x1F])   # const/16 v1, 8000
    repl = bytes([0x13, 0x01, 0xD0, 0x07])      # const/16 v1, 2000
    hits = dt.find_bytes(pattern)
    if len(hits) != 1:
        raise RuntimeError(
            '[P4] motif setSoTimeout(8000) : %d occurrence(s) attendue(s) : 1'
            % len(hits)
        )
    off = hits[0]
    # Vérification de contexte : l'instruction suivante doit être un
    # invoke-virtual (opcode 0x6E) : appel setSoTimeout(I)V sur le socket.
    if dt.data[off + 4] != 0x6E:
        raise RuntimeError('[P4] contexte inattendu après const/16 8000')
    return [('timeout accept 8000->2000', off, pattern, repl)]


def patch_strip_cout(dt: DexTables) -> list:
    """[P3] Neutralise `put("cout", produit.cout)` dans la route /carte.

    Séquence de 7 code units (14 octets) :
      const-string vX, "cout"                    (2 units, opcode 0x1A)
      iget-wide   vA, vB, Catalogue$Produit.cout (2 units, opcode 0x53)
      invoke-virtual {..}, JSONObject.put(String,double) (3 units, 0x6E)
    Remplacée par 7 nops (14 octets à zéro).

    NB : le champ ciblé est UNIQUEMENT Catalogue$Produit.cout. Le champ
    homonyme de Modele$Ligne (sérialisation des tickets, nécessaire à la
    synchro) est explicitement exclu par le filtre sur l'index du champ.
    """
    cout_sidx = dt.string_idx('cout')
    prod = 'Lcom/trattoria/commande/Catalogue$Produit;'
    jsonobj = 'Lorg/json/JSONObject;'
    cout_fidx = dt.field_idx(prod, 'cout', 'D')
    put_midx = dt.method_idx(jsonobj, 'put', ['Ljava/lang/String;', 'D'],
                             'Lorg/json/JSONObject;')

    patches = []
    # Recherche de chaque const-string pointant vers "cout"
    start = 0
    while True:
        # const-string : 1A AA BB BB (BBBB = index de chaîne u16)
        i = dt.data.find(bytes([0x1A]), start)
        if i < 0:
            break
        start = i + 1
        if i + 4 > len(dt.data):
            break
        sidx = struct.unpack_from('<H', dt.data, i + 2)[0]
        if sidx != cout_sidx:
            continue
        # iget-wide (0x53) immédiatement après, avec le champ "cout" du produit
        if i + 8 > len(dt.data) or dt.data[i + 4] != 0x53:
            continue
        fidx = struct.unpack_from('<H', dt.data, i + 6)[0]
        if fidx != cout_fidx:
            continue
        # invoke-virtual put(String,double) (0x6E) immédiatement après
        if i + 14 > len(dt.data) or dt.data[i + 8] != 0x6E:
            continue
        midx = struct.unpack_from('<H', dt.data, i + 10)[0]
        if midx != put_midx:
            continue
        patches.append((
            'strip cout (route /carte) @%#x' % i,
            i, dt.data[i:i + 14], b'\x00' * 14,
        ))
        start = i + 14
    if not patches:
        raise RuntimeError('[P3] aucune occurrence de put("cout", produit)')
    return patches


def fix_checksums(data: bytes) -> bytes:
    """Recalcule la signature (sha1) et le checksum (adler32) du DEX."""
    buff = bytearray(data)
    signature = hashlib.sha1(bytes(buff[32:])).digest()
    buff[12:32] = signature
    checksum = zlib.adler32(bytes(buff[12:]))
    buff[8:12] = struct.pack('<I', checksum)
    return bytes(buff)


# ---------------------------------------------------------------------------
#  Point d'entrée
# ---------------------------------------------------------------------------
def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    data = open(src, 'rb').read()
    dt = DexTables(data)
    print('[info] tables DEX : %d chaînes, %d types, %d champs, %d méthodes'
          % (dt.string_ids_size, dt.type_ids_size,
             dt.field_ids_size, dt.method_ids_size))

    all_patches = []
    all_patches += patch_timeout_accept_loop(dt)
    all_patches += patch_strip_cout(dt)

    out = bytearray(data)
    for label, off, before, after in all_patches:
        assert out[off:off + len(before)] == before, label
        out[off:off + len(after)] = after
        print('[patch] %s' % label)

    out = fix_checksums(bytes(out))
    open(dst, 'wb').write(out)
    print('[ok] DEX patché écrit : %s (%d octets, taille inchangée)'
          % (dst, len(out)))


if __name__ == '__main__':
    main()
