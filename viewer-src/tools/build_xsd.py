"""Z OASIS UBL 2.1 XSD (rules/ubl-2.1, runtime verzia „xsdrt“) vytvorí kompaktný model obsahu
data/ubl21_xsd.json pre kontrolu schémy v prehliadači (src/js/xsd.js).

UBL 2.1 používa pre agregáty len xsd:sequence z odkazov na globálne elementy a pre listové elementy
simpleContent nad primitívnymi typmi XSD. Skript to overuje a pri čomkoľvek inom skončí chybou,
aby sa model nezostavil potichu nepresne.

Použitie:  python viewer-src/tools/build_xsd.py
"""
import json
import pathlib
import xml.etree.ElementTree as ET

SRC = pathlib.Path(__file__).resolve().parent.parent
XSD_DIR = SRC / 'rules' / 'ubl-2.1'
OUT = SRC / 'data' / 'ubl21_xsd.json'
XS = 'http://www.w3.org/2001/XMLSchema'
Q = lambda local: '{%s}%s' % (XS, local)  # noqa: E731

# primitívne typy XSD, ktoré validátor v xsd.js pozná (ostatné sú bez lexikálnej kontroly)
PRIMITIVES = {'decimal', 'date', 'time', 'boolean', 'base64Binary', 'normalizedString', 'string', 'token', 'anyURI', 'language'}
SKIP_NS = {  # obsah rozšírení (ext:ExtensionContent) sa nekontroluje – „processContents=lax“
    'urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2',
}
ROOTS = [('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2', 'Invoice'),
         ('urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2', 'CreditNote')]


def load():
    schemas = []
    for p in sorted(XSD_DIR.rglob('*.xsd')):
        prefixes = {}
        for ev, (pre, uri) in ET.iterparse(p, events=['start-ns']):
            prefixes.setdefault(pre, uri)
        root = ET.parse(p).getroot()
        schemas.append((p.name, root.get('targetNamespace'), prefixes, root))
    return schemas


def main():
    schemas = load()
    elements = {}   # (ns, local) -> type qname (ns, local)
    ctypes = {}     # (ns, local) -> xsd:complexType element + prefixes
    stypes = {}

    def qn(val, prefixes):
        pre, _, local = val.rpartition(':')
        return (prefixes[pre] if pre else prefixes.get('', ''), local)

    for name, tns, pre, root in schemas:
        for child in root:
            if child.tag == Q('element'):
                elements[(tns, child.get('name'))] = qn(child.get('type'), pre)
            elif child.tag == Q('complexType'):
                ctypes[(tns, child.get('name'))] = (child, pre, tns)
            elif child.tag == Q('simpleType'):
                stypes[(tns, child.get('name'))] = (child, pre, tns)

    def simple_base(qt):
        """Primitívny základ simpleType alebo vstavaného typu XSD."""
        if qt[0] == XS:
            if qt[1] not in PRIMITIVES:
                raise SystemExit(f'Nepodporovaný primitívny typ xsd:{qt[1]}')
            return qt[1]
        node, pre, _ = stypes[qt]
        r = node.find(Q('restriction'))
        if r is None or len([c for c in r if c.tag != Q('annotation')]):
            raise SystemExit(f'simpleType {qt} nemá jednoduchú reštrikciu bez facet')
        return simple_base(qn(r.get('base'), pre))

    def attr_list(node, pre):
        out = {}
        for a in node.findall(Q('attribute')):
            use = a.get('use', 'optional')
            out[a.get('name')] = (use, simple_base(qn(a.get('type'), pre)))
        if node.find(Q('anyAttribute')) is not None:
            raise SystemExit('anyAttribute nie je podporovaný')
        return out

    resolved = {}

    def resolve(qt):
        """Vráti model typu: {'seq': [...]} | {'p': prim, 'a': {...}} | {'any': True}."""
        if qt in resolved:
            return resolved[qt]
        if qt[0] == XS or qt in stypes:
            m = {'p': simple_base(qt), 'a': {}}
            resolved[qt] = m
            return m
        node, pre, tns = ctypes[qt]
        kids = [c for c in node if c.tag != Q('annotation')]
        if node.get('mixed') == 'true':
            raise SystemExit(f'{qt}: mixed obsah nie je podporovaný')
        if len(kids) == 1 and kids[0].tag == Q('sequence'):
            seq = []
            for p in kids[0]:
                if p.tag == Q('annotation'):
                    continue
                mn = int(p.get('minOccurs', '1'))
                mx = p.get('maxOccurs', '1')
                mx = -1 if mx == 'unbounded' else int(mx)
                if p.tag == Q('any'):
                    if p.get('namespace') != '##other':
                        raise SystemExit(f'{qt}: xsd:any s namespace {p.get("namespace")}')
                    seq.append({'any': True, 'min': mn, 'max': mx})
                elif p.tag == Q('element') and p.get('ref'):
                    seq.append({'ref': qn(p.get('ref'), pre), 'min': mn, 'max': mx})
                else:
                    raise SystemExit(f'{qt}: nepodporovaná častica {p.tag} {p.attrib}')
            keys = [s.get('ref') for s in seq if 'ref' in s]
            if len(keys) != len(set(keys)):
                raise SystemExit(f'{qt}: element sa v sekvencii opakuje')
            m = {'seq': seq}
        elif len(kids) == 1 and kids[0].tag == Q('simpleContent'):
            d = [c for c in kids[0] if c.tag != Q('annotation')][0]
            base = qn(d.get('base'), pre)
            bm = resolve(base)
            if 'p' not in bm:
                raise SystemExit(f'{qt}: simpleContent nad komplexným typom {base}')
            attrs = dict(bm['a'])
            facets = [c for c in d if c.tag not in (Q('attribute'), Q('annotation'))]
            if facets:
                raise SystemExit(f'{qt}: facety v simpleContent nie sú podporované')
            attrs.update(attr_list(d, pre))
            m = {'p': bm['p'], 'a': attrs}
        elif not kids:
            m = {'seq': []}
        else:
            raise SystemExit(f'{qt}: nepodporovaná štruktúra {[k.tag for k in kids]}')
        resolved[qt] = m
        return m

    # dosiahnuteľné elementy z koreňov Invoice a CreditNote
    reach, todo = {}, [r for r in ROOTS]
    while todo:
        ek = todo.pop()
        if ek in reach:
            continue
        if ek not in elements:
            raise SystemExit(f'Neznámy element {ek}')
        m = resolve(elements[ek])
        reach[ek] = elements[ek]
        for s in m.get('seq', []):
            if 'ref' in s and s['ref'][0] not in SKIP_NS:
                todo.append(s['ref'])

    ns_list = sorted({k[0] for k in reach} | {r[0] for r in ROOTS})
    nsi = {u: i for i, u in enumerate(ns_list)}
    key = lambda k: f'{nsi[k[0]]}:{k[1]}'  # noqa: E731
    type_ids, types, same = {}, [], {}

    def tid(qt):
        if qt not in type_ids:
            m = resolved[qt]
            if 'seq' in m:
                t = {'s': [[('*' if 'any' in s else key(s['ref'])), s['min'], s['max']] for s in m['seq']]}
            else:
                t = {'p': m['p']}
                req = sorted(n for n, (u, _) in m['a'].items() if u == 'required')
                opt = sorted(n for n, (u, _) in m['a'].items() if u == 'optional')
                typed = {n: tp for n, (u, tp) in m['a'].items() if u != 'prohibited' and tp not in ('normalizedString', 'string', 'token', 'anyURI')}
                if req:
                    t['r'] = req
                if opt:
                    t['o'] = opt
                if typed:
                    t['at'] = typed
            sig = json.dumps(t, sort_keys=True)          # rovnaké modely (napr. všetky sumy) sa uložia raz
            if sig not in same:
                same[sig] = len(types)
                types.append(t)
            type_ids[qt] = same[sig]
        return type_ids[qt]

    el = {key(k): tid(v) for k, v in sorted(reach.items())}
    data = {
        'source': 'OASIS UBL 2.1 (os-UBL-2.1, xsdrt), https://docs.oasis-open.org/ubl/os-UBL-2.1/',
        'ns': ns_list, 'el': el, 't': types,
    }
    OUT.write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8', newline='\n')
    print(f'{OUT.name}: {len(el)} elementov, {len(types)} typov, {OUT.stat().st_size / 1024:.0f} kB')


if __name__ == '__main__':
    main()
