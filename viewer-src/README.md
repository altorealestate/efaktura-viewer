# eFaktúra XML Viewer – zdrojové súbory

Interný prehliadač a validátor e-faktúr **Peppol BIS Billing 3.0** (UBL 2.1 Invoice / CreditNote).
Hotový nástroj je jeden súbor **`../eFaktura-Viewer.html`**. Otvorí sa dvojklikom v Edge, Chrome alebo Firefoxe,
funguje offline a otvorené XML nikam neodosiela.

## Čo robí

- **Vizuál faktúry s pôvodom údajov.** Každý údaj je prepojený s elementom XML. Pri podržaní myši sa zobrazí BT kód
  a XPath, po kliknutí sa údaj zvýrazní v zdrojovom XML (záložka *XML*), vrátane čísla riadku.
- **Oficiálna validácia** v rovnakých stupňoch ako v prístupových bodoch Peppol:
  - schéma UBL 2.1 (XSD) – poradie a počet elementov, povinné elementy a atribúty, formát čísel a dátumov,
  - Schematron EN 16931 (CEN) a Peppol BIS 3.0, skompilovaný pre SaxonJS.
  Všetko beží v prehliadači.
- **SK kontroly.** Ide o interné doplnkové kontroly podľa podkladov FS SR (PASR, transpozícia Peppol BIS v1.12, FAQ):
  - Peppol ID `0245:DIČ`
  - IČO v BT-30/BT-47
  - IČ DPH (mod 11)
  - zápis v OR (BT-33)
  - DUZP (BT-7)
  - IBAN, BIC/SWIFT a ich vzájomná zhoda
  - variabilný symbol (BT-83)
  - sadzby DPH podľa dňa vzniku daňovej povinnosti, DPH v eurách pri cudzej mene
  - IČ DPH odberateľa (prenesenie daňovej povinnosti)
  - odkaz na pôvodnú faktúru pri opravných dokladoch (BT-25)
  - poškodená diakritika
  - prílohy
- **Mapovanie polí.** Tabuľka všetkých BT s hodnotou, XPath a riadkom, plus elementy bez priradeného BT.
- **Prílohy.** Náhľad, otvorenie a stiahnutie vloženého PDF (BT-125), napr. na porovnanie s vizuálom z XML.
  Náhľad a otvorenie sú len pre PDF, PNG a JPEG (podľa obsahu súboru); ostatné typy sa dajú len stiahnuť.
- Ďalej podporuje viac súborov naraz, vloženie XML zo schránky (Ctrl+V), tlač vizuálu do PDF, svetlú aj tmavú tému.

## Štruktúra

| Cesta | Obsah |
|---|---|
| `src/index.html`, `src/styles.css` | šablóna stránky a štýly |
| `src/js/xmlparse.js` | XML parser s pozíciami (riadky/offsety), oprava neúplného XML pre náhľad |
| `src/js/xsd.js` | kontrola schémy UBL 2.1 podľa modelu `data/ubl21_xsd.json` |
| `src/js/model.js` | mapovanie BT/BG → UBL XPath (Invoice aj CreditNote) |
| `src/js/skchecks.js` | SK kontroly, IBAN/BIC, mojibake, UUIDv5 pre SK TDD |
| `src/js/validate.js` | spúšťanie Schematronu (SaxonJS) a prepojenie nálezov s poľami |
| `src/js/render.js`, `src/js/app.js` | vykresľovanie a ovládanie |
| `data/sk_bt.json`, `data/sk_rules.json` | slovenské názvy BT a texty pravidiel EN 16931 z workbooku FS SR v1.12 |
| `data/ubl21_xsd.json` | model obsahu UBL 2.1 vygenerovaný z `rules/ubl-2.1/*.xsd` |
| `rules/*.sch`, `rules/*.sef.json.gz`, `rules/versions.json` | zdrojové a skompilované pravidlá |
| `rules/ubl-2.1/` | oficiálne XSD OASIS UBL 2.1 (runtime) |
| `vendor/SaxonJS2.rt.js` | XSLT 3.0 engine (Saxonica, licencia vo `vendor/LICENSE-SaxonJS.txt`) |
| `tools/build.py` | zostavenie `../eFaktura-Viewer.html` |
| `tools/update_rules.py` | stiahnutie a kompilácia nových pravidiel Peppol + zostavenie |
| `tools/extract_fs.py` | aktualizácia SK údajov z nového workbooku FS SR |
| `tools/sk_fixes.py` | doplnenie chýbajúcich prekladov pravidiel a opravy chýb workbooku (spúšťa ho `extract_fs.py`) |
| `tools/build_xsd.py` | vygeneruje `data/ubl21_xsd.json` z XSD UBL 2.1 |

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

Stav k 19. 10. 2026:

- Všetkých 10 oficiálnych príkladov Peppol BIS 3.0 prejde bez chýb (schéma aj pravidlá).
- Oficiálne unit testy: CEN 1.3.16 – 1131 z 1131, Peppol 3.0.21 – 672 z 673. Jediný rozdiel je DE-R-019
  (presnosť celých čísel v SaxonJS), ktorý nástroj rieši vlastnou kontrolou IBAN.
- Kontrola schémy UBL 2.1 sa zhoduje s referenčným validátorom libxml2 (lxml) na 2 887 z 2 888 súborov
  (oficiálne príklady, unit testy a 845 zámerne poškodených variantov). Jediný rozdiel: neplatné base64 v prílohe
  nástroj správne označí ako chybu, libxml2 ho prepustí.
- Výkon v Edge: faktúra s 1 000 riadkami sa overí približne za 13 s (predtým 28 s). Pri 2 000 riadkoch to trvá
  asi 25 s (CEN 18 s, Peppol 5,5 s); predtým validácia v prehliadači nedobehla ani za 10 minút.

## Obmedzenia

- Podporuje len syntax UBL (Peppol). Faktúru v CII rozpozná, ale nezobrazí.
- Obsah rozšírení `ext:UBLExtensions` (napr. podpisy) sa podľa schémy nekontroluje. Peppol rozšírenia aj tak nepovoľuje
  (pravidlo UBL-CR-001).
- Validácia beží v hlavnom vlákne prehliadača (SaxonJS nepodporuje Web Worker). Pri veľmi veľkých faktúrach stránka
  počas validácie nereaguje; nástroj na to upozorní.
- SK kontroly nie sú oficiálne validačné pravidlá FS SR. Upozorňujú na nedostatky, ktoré oficiálna validácia nezachytí.
- Tabuľka kód banky → BIC (`codes.js`) zodpovedá číselníku NBS verzie 226; pri zmene v NBS ju treba aktualizovať.
- SK TDD UUID v pätičke je informatívny výpočet podľa workbooku FS SR.
