"""Opravy a doplnenia slovenských údajov z workbooku FS SR (spúšťa ich extract_fs.py).

Workbook v1.12 nemá preklad pre 750 pravidiel UBL-CR / UBL-SR / UBL-DT (text „TODO: Add translation“),
pri BR-CO-10 až 14 stratil znak Σ a pri BR-51 uvádza staršie znenie pravidla. Chýbajúce texty sa preto
generujú z anglického znenia oficiálneho Schematronu CEN (rules/CEN-EN16931-UBL.sch).

Použitie samostatne (opraví existujúce JSON súbory):  python viewer-src/tools/sk_fixes.py
"""
import json
import pathlib
import re

SRC = pathlib.Path(__file__).resolve().parent.parent

# UBL-SR: „<termín> shall occur maximum once“ → BT/BG, ktorého sa pravidlo týka
SR_ONCE = {
    'UBL-SR-01': 'BT-12', 'UBL-SR-02': 'BT-15', 'UBL-SR-03': 'BT-16', 'UBL-SR-04': 'BT-18', 'UBL-SR-05': 'BT-20',
    'UBL-SR-06': 'BG-3', 'UBL-SR-08': 'BG-14', 'UBL-SR-09': 'BT-27', 'UBL-SR-10': 'BT-28', 'UBL-SR-11': 'BT-30',
    'UBL-SR-12': 'BT-31', 'UBL-SR-13': 'BT-32', 'UBL-SR-14': 'BT-33', 'UBL-SR-15': 'BT-44', 'UBL-SR-16': 'BT-46',
    'UBL-SR-17': 'BT-47', 'UBL-SR-18': 'BT-48', 'UBL-SR-19': 'BT-59', 'UBL-SR-20': 'BT-60', 'UBL-SR-21': 'BT-61',
    'UBL-SR-22': 'BT-62', 'UBL-SR-23': 'BT-63', 'UBL-SR-24': 'BG-13', 'UBL-SR-25': 'BT-70', 'UBL-SR-26': 'BT-83',
    'UBL-SR-27': 'BT-82', 'UBL-SR-28': 'BT-89', 'UBL-SR-29': 'BT-90', 'UBL-SR-30': 'BT-97', 'UBL-SR-31': 'BT-104',
    'UBL-SR-32': 'BT-120', 'UBL-SR-33': 'BT-123', 'UBL-SR-34': 'BT-127', 'UBL-SR-35': 'BT-132', 'UBL-SR-36': 'BG-26',
    'UBL-SR-37': 'BT-147', 'UBL-SR-39': 'BT-11', 'UBL-SR-40': 'BT-45', 'UBL-SR-45': 'BT-9', 'UBL-SR-46': 'BT-82',
    'UBL-SR-49': 'BT-7', 'UBL-SR-50': 'BT-154',
}
SR_TEXT = {
    'UBL-SR-07': 'Ak je uvedený odkaz na predchádzajúcu faktúru (BG-3), musí obsahovať číslo predchádzajúcej faktúry (BT-25).',
    'UBL-SR-42': 'Element PartyTaxScheme sa v AccountingSupplierParty môže vyskytovať najviac dvakrát (BT-31 a BT-32).',
    'UBL-SR-43': 'Identifikátor schémy (schemeID) sa pri AdditionalDocumentReference smie použiť len pre fakturovaný objekt '
                 '(DocumentTypeCode 130, pri dobropise aj 50).',
    'UBL-SR-44': 'Faktúra smie mať len jednu platobnú referenciu (PaymentID, BT-83). Tá istá hodnota sa však môže uviesť '
                 'vo viacerých PaymentMeans.',
    'UBL-SR-47': 'Ak je uvedených viac kódov spôsobu platby (BT-81), musia byť rovnaké.',
    'UBL-SR-48': 'Každý riadok faktúry musí mať práve jednu kategóriu DPH položky (ClassifiedTaxCategory, BG-30).',
}
CR_TEXT = {
    'UBL-CR-671': 'Faktúra UBL by nemala pri zľave z ceny uvádzať percento (cac:Price/cac:AllowanceCharge/cbc:MultiplierFactorNumeric).',
}
DT_TEXT = {
    'UBL-DT-01': 'Sumy musia byť desatinné čísla s najviac dvoma desatinnými miestami.',
    'UBL-DT-06': 'Element s vloženým súborom (BT-125) musí obsahovať atribút mimeCode.',
    'UBL-DT-07': 'Element s vloženým súborom (BT-125) musí obsahovať atribút filename.',
}
TEXT_FIX = {
    'BR-51': 'V súlade s bezpečnostnými štandardmi pre platobné karty faktúra nikdy nesmie obsahovať úplné číslo '
             'primárneho účtu platobnej karty (BT-87). PCI Security Standards Council v súčasnosti povoľuje zobraziť '
             'najviac prvých 6 a posledné 4 číslice.',
}
# názvy BT, v ktorých workbook uvádza aj interné poznámky
BT_NAME_FIX = {'BT-17': 'Referenčné označenie ponuky alebo časti verejného obstarávania', 'BT-71': 'Identifikátor miesta dodania',
               'BT-71-1': 'Identifikátor schémy'}


def cen_texts():
    sch = (SRC / 'rules' / 'CEN-EN16931-UBL.sch').read_text(encoding='utf-8')
    out = {}
    for attrs, txt in re.findall(r'<assert\b([^>]*)>(.*?)</assert>', sch, re.S):
        m = re.search(r'\bid="([^"]+)"', attrs)
        t = re.search(r'\btest="([^"]*)"', attrs)
        if m:
            en = re.sub(r'\s+', ' ', txt).strip()
            out[m.group(1)] = (re.sub(r'^\[[^\]]+\]\s*-?\s*', '', en), t.group(1) if t else '')
    return out


def bt_name(bt, sk_bt):
    n = (sk_bt.get(bt) or {}).get('n', '')
    n = n.split('\n')[0].strip()
    if n.isupper():
        n = n[0] + n[1:].lower()
    return n[0].upper() + n[1:] if n else bt


def ubl_cr(en):
    """„A UBL invoice should not include the AccountingSupplierParty Party X“ → slovenská veta."""
    m = re.match(r"A UBL (invoice|credit note) (should|shall) not include (the |a |an )?(.+?)\.?$", en)
    if not m:
        return None
    doc = 'Faktúra UBL' if m.group(1) == 'invoice' else 'Dobropis UBL'
    verb = ('by nemala obsahovať' if m.group(1) == 'invoice' else 'by nemal obsahovať') if m.group(2) == 'should' else 'nesmie obsahovať'
    article, what = m.group(3), m.group(4)
    if what == 'extensions':
        return f'{doc} {verb} rozšírenia (UBLExtensions).'
    if what.startswith('UBLVersionID or it should be'):
        return f'{doc} {verb} element UBLVersionID, alebo musí mať hodnotu 2.1.'
    m2 = re.match(r"(\S+) ID schemeID unless the DocumentTypeCode equals '(\d+)'", what)
    if m2:
        return f'{doc} {verb} atribút schemeID v {m2.group(1)}/ID, okrem prípadu, keď DocumentTypeCode = {m2.group(2)}.'
    m2 = re.match(r'(\S+) schemeID$', what)
    if m2:
        return f'{doc} {verb} atribút schemeID v {m2.group(1)}.'
    if re.fullmatch(r'[A-Za-z0-9/ ]+', what):
        # „the A B C“ je cesta elementov (A/B/C); „a Price Allowance Multiplier Factor“ je opis, ten ostáva
        path = what if article in ('a ', 'an ') else what.replace(' ', '/')
        return f'{doc} {verb} element {path}.'
    return None


def fix_rules(rules, sk_bt):
    en = cen_texts()
    for rid in list(rules):
        txt = rules[rid]
        txt = re.sub(r'= \? ', '= Σ ', txt)                       # BR-CO-10…14: stratený znak Σ
        if rid in TEXT_FIX:
            txt = TEXT_FIX[rid]
        if 'TODO' in txt and rid in en:
            e, test = en[rid]
            new = None
            if rid in SR_ONCE:
                bt = SR_ONCE[rid]
                cond = ', ak je príjemca platby iný ako predávajúci' if 'Payee is different' in e else \
                       ', ak má predávajúci daňového zástupcu' if 'tax representative' in e else ''
                new = f'{bt_name(bt, sk_bt)} ({bt}) sa môže uviesť najviac raz{cond}.'
            elif rid in SR_TEXT:
                new = SR_TEXT[rid]
            elif rid in CR_TEXT:
                new = CR_TEXT[rid]
            elif rid in DT_TEXT:
                new = DT_TEXT[rid]
            elif rid.startswith('UBL-DT-'):
                a = re.search(r'(?:not|count)\(//@(\w+)', test)
                if a and 'should not be present' in e:
                    new = f'Atribút {a.group(1)} by nemal byť uvedený.'
            elif rid.startswith('UBL-CR-'):
                new = ubl_cr(e)
            if not new:
                raise SystemExit(f'{rid}: chýba preklad pre „{e}“')
            txt = new
        rules[rid] = txt
    left = [k for k, v in rules.items() if 'TODO' in v and k in en]
    if left:
        raise SystemExit('Nepreložené pravidlá: ' + ', '.join(left[:20]))
    return rules


def fix_bt(sk_bt):
    for k, n in BT_NAME_FIX.items():
        if k in sk_bt:
            sk_bt[k]['n'] = n
    for e in sk_bt.values():
        if 'n' in e and '\n' in e['n']:
            e['n'] = e['n'].split('\n')[0].strip()
    for k in ('BT-60-1', 'BT-90-1'):                      # identifikátory schém bez názvu vo workbooku
        sk_bt.setdefault(k, {}).setdefault('n', 'Identifikátor schémy')
    return sk_bt


def main():
    d = SRC / 'data'
    sk_bt = fix_bt(json.loads((d / 'sk_bt.json').read_text(encoding='utf-8')))
    rules = fix_rules(json.loads((d / 'sk_rules.json').read_text(encoding='utf-8')), sk_bt)
    (d / 'sk_bt.json').write_text(json.dumps(sk_bt, ensure_ascii=False, indent=0), encoding='utf-8', newline='\n')
    (d / 'sk_rules.json').write_text(json.dumps(rules, ensure_ascii=False, indent=0), encoding='utf-8', newline='\n')
    print('sk_rules.json:', len(rules), 'pravidiel, z toho TODO:', sum('TODO' in v for v in rules.values()))


if __name__ == '__main__':
    main()
