# eFaktúra XML Viewer – zdrojové súbory

Interný prehliadač a validátor e-faktúr **Peppol BIS Billing 3.0** (UBL 2.1 Invoice / CreditNote).
Hotový nástroj je jeden súbor **`../eFaktura-Viewer.html`**. Otvorí sa dvojklikom v Edge, Chrome alebo Firefoxe,
funguje offline a otvorené XML nikam neodosiela.

## Čo robí

- **Vizuál faktúry s pôvodom údajov.** Každý údaj je prepojený s elementom XML. Pri podržaní myši sa zobrazí BT kód
  a XPath, po kliknutí sa údaj zvýrazní v zdrojovom XML (záložka *XML*), vrátane čísla riadku.
- **Oficiálna validácia.** Schematron EN 16931 (CEN) a Peppol BIS 3.0, rovnaké pravidlá ako v prístupových bodoch Peppol.
  Pravidlá sú skompilované pre SaxonJS a bežia v prehliadači.
- **SK kontroly.** Ide o interné doplnkové kontroly podľa podkladov FS SR (PASR, transpozícia Peppol BIS v1.12, FAQ):
  - Peppol ID `0245:DIČ`
  - IČO v BT-30/BT-47
  - IČ DPH (mod 11)
  - zápis v OR (BT-33)
  - DUZP (BT-7)
  - IBAN, BIC/SWIFT a ich vzájomná zhoda
  - variabilný symbol (BT-83)
  - sadzby DPH
  - poškodená diakritika
  - prílohy
- **Mapovanie polí.** Tabuľka všetkých BT s hodnotou, XPath a riadkom, plus elementy bez priradeného BT.
- **Prílohy.** Náhľad, otvorenie a stiahnutie vloženého PDF (BT-125), napr. na porovnanie s vizuálom z XML.
- Ďalej podporuje viac súborov naraz, vloženie XML zo schránky (Ctrl+V), tlač vizuálu do PDF, svetlú aj tmavú tému.

## Štruktúra

| Cesta | Obsah |
|---|---|
| `src/index.html`, `src/styles.css` | šablóna stránky a štýly |
| `src/js/xmlparse.js` | XML parser s pozíciami (riadky/offsety), oprava neúplného XML pre náhľad |
| `src/js/model.js` | mapovanie BT/BG → UBL XPath (Invoice aj CreditNote) |
| `src/js/skchecks.js` | SK kontroly, IBAN/BIC, mojibake, UUIDv5 pre SK TDD |
| `src/js/validate.js` | spúšťanie Schematronu (SaxonJS) a prepojenie nálezov s poľami |
| `src/js/render.js`, `src/js/app.js` | vykresľovanie a ovládanie |
| `data/sk_bt.json`, `data/sk_rules.json` | slovenské názvy BT a texty pravidiel EN 16931 z workbooku FS SR v1.12 |
| `rules/*.sch`, `rules/*.sef.json.gz`, `rules/versions.json` | zdrojové a skompilované pravidlá |
| `vendor/SaxonJS2.rt.js` | XSLT 3.0 engine (Saxonica, licencia vo `vendor/LICENSE-SaxonJS.txt`) |
| `tools/build.py` | zostavenie `../eFaktura-Viewer.html` |
| `tools/update_rules.py` | stiahnutie a kompilácia nových pravidiel Peppol + zostavenie |
| `tools/extract_fs.py` | aktualizácia SK údajov z nového workbooku FS SR |

## Údržba

OpenPeppol vydáva nové pravidlá spravidla v máji a novembri. Pri novej verzii spustite:

```
python viewer-src/tools/update_rules.py --mandatory 2027-02-22
```

Skript stiahne aktuálne `.sch` súbory z docs.peppol.eu a skompiluje ich. Node.js a nástroje si stiahne do
`%LOCALAPPDATA%\efaktura-viewer-tools`. Pravidlá potom overí na oficiálnych príkladoch Peppol a zostaví nový HTML súbor.
Ak niektorý príklad neprejde, aktualizácia sa zruší a pôvodné pravidlá ostanú bez zmeny.

Po úprave zdrojov stačí `python viewer-src/tools/build.py`.

Nový workbook FS SR (*Transpozície štandardu Peppol BIS…*) sa spracuje takto:

```
python viewer-src/tools/extract_fs.py <workbook.xlsx> viewer-src/data
```

Skript vyžaduje balík `openpyxl`.

## Overenie

- Všetkých 10 oficiálnych príkladov Peppol BIS 3.0 prejde bez chýb.
- Oficiálne unit testy Peppol (`rules/unit-UBL-PEPPOL`): 225 z 227. Zvyšné 2 testy čakajú pri PEPPOL-COMMON-R052/R053
  upozornenie, ale vo verzii 3.0.21 sú tieto pravidlá chybou.
- Zámerne poškodená faktúra spustí očakávané pravidlá BR-CO-15, BR-S-09, PEPPOL-EN16931-R003 a R130.

## Obmedzenia

- Podporuje len syntax UBL (Peppol). Faktúru v CII rozpozná, ale nezobrazí.
- SK kontroly nie sú oficiálne validačné pravidlá FS SR. Upozorňujú na nedostatky, ktoré oficiálna validácia nezachytí.
- Tabuľka kód banky → BIC (`codes.js`) je orientačná.
- SK TDD UUID v pätičke je informatívny výpočet podľa workbooku FS SR.

## Zdroje

- Peppol BIS Billing 3.0: <https://docs.peppol.eu/poacc/billing/3.0/>
- FS SR – eFaktúra (PASR, workbook v1.12, FAQ): <https://www.financnasprava.sk/sk/podnikatelia/dane/dan-z-pridanej-hodnoty/e-faktura>
- Peppol SK Tax Data Document: <https://docs.peppol.eu/tdd/sk/tdd-sk/>
