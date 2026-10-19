# Pôvod a licencie validačných pravidiel

| Súbor | Pôvod | Licencia |
|---|---|---|
| `CEN-EN16931-UBL.sch` | CEN/TC 434 – validačné artefakty EN 16931 (verzia 1.3.16), distribuované cez <https://docs.peppol.eu/poacc/billing/3.0/files/> | European Union Public Licence (EUPL) 1.2 |
| `PEPPOL-EN16931-UBL.sch` | OpenPeppol AISBL – Peppol BIS Billing 3.0.21, <https://docs.peppol.eu/poacc/billing/3.0/files/> | © OpenPeppol AISBL; obchodné termíny EN 16931 reprodukované so súhlasom CEN |
| `CEN.sef.json.gz`, `PEPPOL.sef.json.gz` | pravidlá z vyššie uvedených `.sch`, skompilované nástrojmi SchXslt 1.10.1 (MIT) a xslt3 2.7.0 (Saxonica) pre SaxonJS | ako zdrojové `.sch` |
| `ubl-2.1/` | OASIS UBL 2.1 (os-UBL-2.1, runtime schémy „xsdrt“), <https://docs.oasis-open.org/ubl/os-UBL-2.1/> | © OASIS Open 2013; šírenie podľa OASIS IPR Policy (copyright notice je v každom súbore) |

`.sch` súbory v tomto priečinku sú oficiálne znenie bez zmeny. Zmenená je forma (Schematron je skompilovaný do formátu
SEF, aby sa dal spustiť v prehliadači) a jedna výkonnostná úprava pri kompilácii (`tools/update_rules.py`, `OPTIMIZE`):

- v kontextoch švédskych pravidiel SE-R-003 až SE-R-005 sa predikát `//cac:AccountingSupplierParty/…` (a
  `//cac:AccountingCustomerParty/…`) nahrádza `/*/cac:AccountingSupplierParty/…`. Podľa XSD UBL 2.1 sú tieto
  elementy len priamymi potomkami koreňa, takže význam je rovnaký. SaxonJS však pôvodný zápis vyhodnocoval pre každý
  riadok faktúry prechodom celého dokumentu (faktúra s 2 000 riadkami sa validovala vyše minúty, teraz približne 5 s).
  Oficiálne unit testy Peppol 3.0.21 dávajú s úpravou rovnaký výsledok.

Nemecké pravidlo DE-R-019 (kontrola IBAN cez `xs:integer`) SaxonJS nevyhodnotí správne, lebo celé čísla počíta
s presnosťou double. Nástroj preto nález DE-R-019 vynechá, ak je IBAN podľa mod 97 platný (`app.js`, `engineFalseAlarm`).

`data/ubl21_xsd.json` je model obsahu vygenerovaný z `ubl-2.1/` skriptom `tools/build_xsd.py`.

CEN, OpenPeppol ani OASIS nenesú zodpovednosť za použitie týchto artefaktov v tomto nástroji.

## Ďalšie údaje

- Kódy bánk (SK IBAN → BIC) v `src/js/codes.js`: Národná banka Slovenska, číselník identifikačných kódov platobného
  systému SR, verzia 226 (8. 10. 2026).
- Slovenské názvy BT a texty pravidiel: workbook FS SR v1.12. Texty pravidiel UBL-CR/SR/DT, ktoré workbook neprekladá,
  dopĺňa `tools/sk_fixes.py` podľa anglického znenia CEN.

## Zdroje

- Peppol BIS Billing 3.0: <https://docs.peppol.eu/poacc/billing/3.0/>
- OASIS UBL 2.1: <https://docs.oasis-open.org/ubl/os-UBL-2.1/>
- FS SR – eFaktúra (PASR, workbook v1.12, FAQ): <https://www.financnasprava.sk/sk/podnikatelia/dane/dan-z-pridanej-hodnoty/e-faktura>
- Peppol SK Tax Data Document: <https://docs.peppol.eu/tdd/sk/tdd-sk/>
- NBS – kódy bánk: <https://nbs.sk/>
