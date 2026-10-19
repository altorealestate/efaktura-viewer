# eFaktúra XML Viewer

Prehliadač a validátor e-faktúr **Peppol BIS Billing 3.0** (UBL 2.1) so slovenskými kontrolami pre eFaktúru 2027.

**Otvoriť nástroj:** <https://altorealestate.github.io/efaktura-viewer/>

## Použitie

1. Otvorte odkaz vyššie. Prípadne si stiahnite súbor [`eFaktura-Viewer.html`](eFaktura-Viewer.html) a otvorte ho dvojklikom (funguje aj offline).
2. Pretiahnite do okna XML faktúru alebo ju otvorte tlačidlom **Otvoriť XML…**.
3. Faktúra sa zobrazí ako doklad. Keď kliknete na ľubovoľný údaj, nástroj ukáže, z ktorého elementu XML pochádza
   (kód BT podľa EN 16931, XPath, číslo riadku).
   Funguje to aj opačne: v záložke **XML** stačí prejsť myšou po kóde. Príslušný údaj sa vo faktúre vyznačí a spojí
   čiarou s riadkom XML. Zobrazí sa aj karta s názvom poľa, popisom a číselníkom.
4. V paneli **Nálezy** sú výsledky kontrol:
   - oficiálna validácia v rovnakých stupňoch ako v sieti Peppol: schéma UBL 2.1 (XSD) a pravidlá EN 16931 + Peppol BIS 3.0,
   - slovenské kontroly (Peppol ID 0245:DIČ, IČO, IČ DPH, IBAN/BIC, variabilný symbol, DUZP, sadzby DPH,
     odkaz na pôvodnú faktúru pri dobropise, diakritika…),
   - technická kontrola XML (well-formed, kódovanie, DOCTYPE).

**Faktúry sa nikam neodosielajú.** Všetko spracovanie prebieha len vo vašom prehliadači. Stránka nenačítava nič
z internetu a otvorený súbor neopustí váš počítač.

## Pre správcu

Zdrojové súbory, zostavenie a aktualizácia pravidiel sú opísané vo [`viewer-src/README.md`](viewer-src/README.md).
Nové pravidlá Peppol (spravidla máj a november) sa nasadia príkazom:

```
python viewer-src/tools/update_rules.py --mandatory RRRR-MM-DD
```

Potom zmeny nahrajte (commit + push). Stránka sa aktualizuje automaticky.

## Licencie a zdroje

- Validačné pravidlá EN 16931 © CEN, licencia EUPL 1.2. Pravidlá Peppol BIS Billing 3.0 © OpenPeppol AISBL.
  Schéma UBL 2.1 © OASIS Open.
  Zdroj: <https://docs.peppol.eu/poacc/billing/3.0/>.
  Podrobnosti sú vo [`viewer-src/rules/NOTICE.md`](viewer-src/rules/NOTICE.md).
- SaxonJS 2.7 © Saxonica Ltd sa šíri ako súčasť aplikácie v súlade s licenciou
  ([`viewer-src/vendor/LICENSE-SaxonJS.txt`](viewer-src/vendor/LICENSE-SaxonJS.txt)).
- Slovenské názvy obchodných termínov a texty pravidiel pochádzajú z dokumentu Finančnej správy SR
  „Transpozície štandardu Peppol BIS v podmienkach Slovenskej legislatívy“ v1.12.
- SK kontroly sú interné doplnkové kontroly, nie oficiálne validačné pravidlá Finančnej správy SR.
