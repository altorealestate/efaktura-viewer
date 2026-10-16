'use strict';
/* Číselníky a konštanty (slovenské popisy). Ak kód nie je v zozname, zobrazí sa samotný kód. */
const NS = {
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
  inv: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  cn: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
  cii: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100'
};
const NS_PREFIX = Object.fromEntries(Object.entries(NS).map(([k, v]) => [v, k]));

const CODES = {
  // UNTDID 1001 – typ dokladu
  doc: {
    '71': 'Žiadosť o platbu', '80': 'Ťarchopis (služby)', '81': 'Dobropis (služby)', '82': 'Faktúra za merané služby',
    '84': 'Ťarchopis (finančné úpravy)', '102': 'Výkaz o vykonaných prácach', '130': 'Faktúračné údaje',
    '202': 'Priame platobné ocenenie', '203': 'Overené platobné ocenenie', '204': 'Predbežné platobné ocenenie',
    '211': 'Priebežná faktúra (stavebníctvo)', '218': 'Konečná platba', '219': 'Čiastková platba', '261': 'Samofakturačný dobropis',
    '262': 'Súhrnný dobropis', '295': 'Faktúra za cenové rozdiely', '296': 'Dobropis za cenové rozdiely',
    '308': 'Delcredere dobropis', '325': 'Zálohová faktúra (proforma)', '326': 'Čiastková faktúra', '331': 'Obchodná faktúra (obchodná transakcia)',
    '380': 'Faktúra', '381': 'Dobropis', '382': 'Provízny list', '383': 'Ťarchopis', '384': 'Opravná faktúra',
    '385': 'Konsolidovaná faktúra', '386': 'Zálohová faktúra', '387': 'Nájomná faktúra', '388': 'Daňová faktúra (daňový doklad)',
    '389': 'Samofakturácia', '390': 'Delcredere faktúra', '393': 'Faktoringová faktúra', '394': 'Leasingová faktúra',
    '395': 'Konsignačná faktúra', '396': 'Faktoringový dobropis', '420': 'Optická faktúra', '456': 'Opravný ťarchopis',
    '457': 'Storno ťarchopisu', '527': 'Samofakturačný ťarchopis', '532': 'Dobropis od prepravcu', '575': 'Poisťovacia faktúra',
    '623': 'Faktúra špeditéra', '633': 'Prístavná faktúra', '751': 'Faktúra – informácia pre účtovanie',
    '780': 'Faktúra za prepravu', '817': 'Reklamačná faktúra', '870': 'Konzulárna faktúra', '875': 'Čiastková faktúra (stavebníctvo)',
    '876': 'Čiastková konečná faktúra (stavebníctvo)', '877': 'Konečná faktúra (stavebníctvo)', '935': 'Colná faktúra'
  },
  docTitle: {
    '380': 'FAKTÚRA', '381': 'DOBROPIS', '383': 'ŤARCHOPIS', '384': 'OPRAVNÁ FAKTÚRA', '386': 'ZÁLOHOVÁ FAKTÚRA',
    '388': 'DAŇOVÝ DOKLAD', '389': 'SAMOFAKTURÁCIA', '261': 'SAMOFAKTURAČNÝ DOBROPIS', '326': 'ČIASTKOVÁ FAKTÚRA',
    '393': 'FAKTORINGOVÁ FAKTÚRA', '395': 'KONSIGNAČNÁ FAKTÚRA', '396': 'FAKTORINGOVÝ DOBROPIS', '82': 'FAKTÚRA ZA MERANÉ SLUŽBY',
    '80': 'ŤARCHOPIS', '81': 'DOBROPIS', '875': 'ČIASTKOVÁ FAKTÚRA', '876': 'ČIASTKOVÁ KONEČNÁ FAKTÚRA', '877': 'KONEČNÁ FAKTÚRA'
  },
  // UNTDID 4461 – spôsob platby
  pay: {
    '1': 'Nešpecifikované', '10': 'Hotovosť', '20': 'Šek', '30': 'Bankový prevod (kreditný)', '31': 'Debetný prevod',
    '42': 'Platba na bankový účet', '48': 'Platobná karta', '49': 'Inkaso', '54': 'Kreditná karta', '55': 'Debetná karta',
    '57': 'Trvalý príkaz', '58': 'SEPA prevod', '59': 'SEPA inkaso', '68': 'Online platobná služba', '97': 'Zápočet medzi partnermi',
    'ZZZ': 'Iný (dohodnutý) spôsob'
  },
  // UNTDID 5305 – kategória DPH
  vat: {
    'S': 'Základná / znížená sadzba', 'Z': 'Nulová sadzba', 'E': 'Oslobodené od dane', 'AE': 'Prenesenie daňovej povinnosti',
    'K': 'Oslobodené dodanie v rámci EÚ', 'G': 'Vývoz mimo EÚ (oslobodené)', 'O': 'Mimo predmetu DPH',
    'L': 'IGIC (Kanárske ostrovy)', 'M': 'IPSI (Ceuta a Melilla)', 'B': 'Prenesená DPH (Taliansko)'
  },
  // UNTDID 2005 – kód dátumu DUZP
  taxPoint: { '3': 'Dátum vystavenia faktúry', '35': 'Skutočný dátum dodania', '432': 'Dátum úhrady' },
  // UN/ECE Rec 20 – najčastejšie merné jednotky
  unit: {
    'H87': 'ks', 'C62': 'ks (jednotka)', 'EA': 'ks (každý)', 'XPP': 'ks (balík)', 'PCE': 'ks', 'SET': 'súprava', 'PR': 'pár',
    'XPK': 'balenie', 'PK': 'balenie', 'XBX': 'krabica', 'XPX': 'paleta', 'NAR': 'počet položiek', 'LS': 'paušál',
    'E48': 'služba', 'ZZ': 'vzájomne dohodnutá', 'ACT': 'činnosť', 'E49': 'pracovný deň',
    'SEC': 's', 'MIN': 'min', 'HUR': 'hod.', 'DAY': 'deň', 'WEE': 'týždeň', 'MON': 'mesiac', 'QAN': 'štvrťrok', 'ANN': 'rok',
    'GRM': 'g', 'KGM': 'kg', 'TNE': 't', 'MGM': 'mg',
    'MMT': 'mm', 'CMT': 'cm', 'MTR': 'm', 'KMT': 'km', 'MTK': 'm²', 'MTQ': 'm³', 'HAR': 'ha', 'CMK': 'cm²',
    'MLT': 'ml', 'LTR': 'l', 'DLT': 'dl', 'HLT': 'hl',
    'KWH': 'kWh', 'MWH': 'MWh', 'GWH': 'GWh', 'KWT': 'kW', 'WTT': 'W', 'KVA': 'kVA', 'GJ': 'GJ', 'MJ': 'MJ',
    'TKM': 'tkm', 'P1': '%', 'A9': 'sadzba', 'IE': 'osoba', 'NMP': 'počet balení', 'D64': 'blok', 'B16': 'tucet'
  },
  eas: {
    '0245': 'SK DIČ', '9950': 'SK IČ DPH', '0158': 'SK IČO', '0088': 'GLN (GS1)', '0060': 'DUNS',
    '0192': 'NO – org. číslo', '0184': 'DK – CVR', '0007': 'SE – org. číslo', '0208': 'BE – číslo podniku',
    '9925': 'BE – IČ DPH', '9930': 'DE – IČ DPH', '0204': 'DE – Leitweg-ID',
    '0106': 'NL – KvK', '0190': 'NL – OIN', '9944': 'NL – IČ DPH', '0009': 'FR – SIRET', '0002': 'FR – SIRENE',
    '9957': 'FR – IČ DPH', '0211': 'IT – Partita IVA', '9906': 'IT – IČ DPH', '0151': 'AU – ABN'
  }
};

/* Číselníky Peppol BIS 3.0 (https://docs.peppol.eu/poacc/billing/3.0/codelist/<kľúč>/) a BT, ktoré ich používajú. */
const CODELISTS = {
  'UNCL1001-inv': 'Typ faktúry (UNTDID 1001)', 'UNCL1001-cn': 'Typ dobropisu (UNTDID 1001)',
  ISO4217: 'Kódy mien (ISO 4217)', ISO3166: 'Kódy krajín (ISO 3166-1 alpha-2)',
  UNCL2005: 'Kód dátumu DPH (UNTDID 2005)', UNCL4461: 'Spôsob platby (UNTDID 4461)',
  UNCL5305: 'Kategória DPH (UNTDID 5305)', vatex: 'Dôvod oslobodenia od DPH (VATEX)',
  UNCL5189: 'Dôvod zrážky (UNTDID 5189)', UNCL7161: 'Dôvod prirážky (UNTDID 7161)',
  UNECERec20: 'Merné jednotky (UN/ECE odporúčanie č. 20 a 21)', UNCL7143: 'Klasifikácia položky (UNTDID 7143)',
  eas: 'Schéma elektronickej adresy (EAS)', ICD: 'Schéma identifikátora (ISO 6523 ICD)',
  UNCL1153: 'Schéma identifikátora objektu (UNTDID 1153)', MimeCode: 'Typ MIME prílohy', SEPA: 'Indikátor SEPA'
};
const BT_CODELIST = {
  'BT-5': 'ISO4217', 'BT-6': 'ISO4217', 'BT-8': 'UNCL2005', 'BT-81': 'UNCL4461', 'BT-121': 'vatex',
  'BT-40': 'ISO3166', 'BT-55': 'ISO3166', 'BT-69': 'ISO3166', 'BT-80': 'ISO3166', 'BT-159': 'ISO3166',
  'BT-95': 'UNCL5305', 'BT-102': 'UNCL5305', 'BT-118': 'UNCL5305', 'BT-151': 'UNCL5305',
  'BT-98': 'UNCL5189', 'BT-140': 'UNCL5189', 'BT-105': 'UNCL7161', 'BT-145': 'UNCL7161',
  'BT-130': 'UNECERec20', 'BT-150': 'UNECERec20', 'BT-158': 'UNCL7143', 'BT-18-1': 'UNCL1153',
  'BT-34-1': 'eas', 'BT-49-1': 'eas', 'BT-90-1': 'SEPA',
  'BT-29-1': 'ICD', 'BT-30-1': 'ICD', 'BT-46-1': 'ICD', 'BT-47-1': 'ICD', 'BT-157-1': 'ICD'
};

/* Agregáty UBL → skupina obchodných termínov (BG) podľa EN 16931; časť závisí od nadradeného elementu. */
function ublGroup(n) {
  const P = n.parent ? n.parent.local : '', PP = n.parent && n.parent.parent ? n.parent.parent.local : '';
  const isLine = x => x === 'InvoiceLine' || x === 'CreditNoteLine';
  const charge = () => ((n.children.find(c => c.local === 'ChargeIndicator') || {}).text || '').trim() === 'true';
  switch (n.local) {
    case 'AccountingSupplierParty': return 'BG-4';
    case 'AccountingCustomerParty': return 'BG-7';
    case 'Party': return { AccountingSupplierParty: 'BG-4', AccountingCustomerParty: 'BG-7' }[P] || null;
    case 'PostalAddress': return { AccountingSupplierParty: 'BG-5', AccountingCustomerParty: 'BG-8', TaxRepresentativeParty: 'BG-12' }[P === 'Party' ? PP : P] || null;
    case 'Contact': return { AccountingSupplierParty: 'BG-6', AccountingCustomerParty: 'BG-9' }[PP] || null;
    case 'PayeeParty': return 'BG-10';
    case 'TaxRepresentativeParty': return 'BG-11';
    case 'Delivery': return 'BG-13';
    case 'Address': return P === 'DeliveryLocation' ? 'BG-15' : null;
    case 'InvoicePeriod': return isLine(P) ? 'BG-26' : 'BG-14';
    case 'PaymentMeans': return 'BG-16';
    case 'PayeeFinancialAccount': return 'BG-17';
    case 'CardAccount': return 'BG-18';
    case 'PaymentMandate': return 'BG-19';
    case 'AllowanceCharge': return !n.parent || !n.parent.parent ? (charge() ? 'BG-21' : 'BG-20') : isLine(P) ? (charge() ? 'BG-28' : 'BG-27') : null;
    case 'LegalMonetaryTotal': return 'BG-22';
    case 'TaxSubtotal': return 'BG-23';
    case 'AdditionalDocumentReference': return 'BG-24';
    case 'InvoiceLine': case 'CreditNoteLine': return 'BG-25';
    case 'Price': return 'BG-29';
    case 'ClassifiedTaxCategory': return 'BG-30';
    case 'Item': return 'BG-31';
    case 'AdditionalItemProperty': return 'BG-32';
    case 'BillingReference': return 'BG-3';
    default: return null;
  }
}

/* Kód banky v slovenskom IBAN (pozície 5–8) → BIC. Orientačný zoznam podľa číselníka NBS. */
const SK_BANKS = {
  '0200': ['SUBASKBX', 'Všeobecná úverová banka'],
  '0720': ['NBSBSKBX', 'Národná banka Slovenska'],
  '0900': ['GIBASKBX', 'Slovenská sporiteľňa'],
  '1100': ['TATRSKBX', 'Tatra banka'],
  '1111': ['UNCRSKBX', 'UniCredit Bank Czech Republic and Slovakia'],
  '3000': ['SLZBSKBA', 'Slovenská záručná a rozvojová banka'],
  '3100': ['LUBASKBX', 'Prima banka Slovensko (býv. Sberbank)'],
  '5200': ['OTPVSKBX', 'OTP Banka Slovensko'],
  '5600': ['KOMASK2X', 'Prima banka Slovensko'],
  '6500': ['POBNSKBA', '365.bank (býv. Poštová banka)'],
  '7300': ['INGBSKBX', 'ING Bank N.V., pobočka'],
  '7500': ['CEKOSKBX', 'Československá obchodná banka'],
  '7930': ['WUSTSKBA', 'Wüstenrot stavebná sporiteľňa'],
  '8050': ['COBASKBX', 'Commerzbank AG, pobočka'],
  '8100': ['KOMBSKBA', 'Komerční banka, pobočka'],
  '8120': ['BSLOSK22', 'Privatbanka'],
  '8130': ['CITISKBA', 'Citibank Europe, pobočka'],
  '8170': ['KBSPSKBX', 'ČSOB stavebná sporiteľňa'],
  '8180': ['SPSRSKBA', 'Štátna pokladnica'],
  '8330': ['FIOZSKBA', 'Fio banka, pobočka'],
  '8360': ['BREXSKBX', 'mBank S.A., pobočka'],
  '8370': ['OBKLSKBA', 'Oberbank AG, pobočka'],
  '8420': ['BFKKSKBB', 'BKS Bank AG, pobočka'],
  '8430': ['KODBSKBX', 'KDB Bank Europe, pobočka'],
  '9952': ['TPAYSKBX', 'Trust Pay']
};

const IBAN_LEN = {
  SK: 24, CZ: 24, AT: 20, DE: 22, HU: 28, PL: 28, SI: 19, HR: 21, IT: 27, FR: 27, ES: 24, NL: 18, BE: 16, LU: 20,
  IE: 22, PT: 25, GB: 22, CH: 21, LI: 21, DK: 18, SE: 24, NO: 15, FI: 18, EE: 20, LV: 21, LT: 20, RO: 24, BG: 22,
  GR: 27, CY: 28, MT: 31, IS: 26
};

/* Slovenské preklady všeobecných pravidiel Peppol BIS 3.0 (CEN pravidlá prekladá oficiálny workbook FS SR). */
const PEPPOL_SK = {
  'PEPPOL-EN16931-R001': 'Musí byť uvedený typ obchodného procesu (BT-23 ProfileID).',
  'PEPPOL-EN16931-R002': 'Na úrovni dokladu je povolená najviac jedna poznámka (BT-22), okrem prípadu, keď sú kupujúci aj predávajúci nemecké subjekty.',
  'PEPPOL-EN16931-R003': 'Musí byť uvedené referenčné označenie kupujúceho (BT-10) alebo číslo objednávky (BT-13).',
  'PEPPOL-EN16931-R004': 'Identifikátor špecifikácie (BT-24) musí začínať hodnotou „urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0“.',
  'PEPPOL-EN16931-R005': 'Kód účtovnej meny DPH (BT-6) sa musí líšiť od kódu meny faktúry (BT-5), ak je uvedený.',
  'PEPPOL-EN16931-R007': 'Typ obchodného procesu (BT-23) musí mať schválený identifikátor (napr. urn:fdc:peppol.eu:2017:poacc:billing:01:1.0).',
  'PEPPOL-EN16931-R008': 'Dokument nesmie obsahovať prázdne elementy.',
  'PEPPOL-EN16931-R010': 'Musí byť uvedená elektronická adresa kupujúceho (BT-49 EndpointID).',
  'PEPPOL-EN16931-R020': 'Musí byť uvedená elektronická adresa predávajúceho (BT-34 EndpointID).',
  'PEPPOL-EN16931-R040': 'Suma zrážky/prirážky sa musí rovnať základu × percento / 100, ak sú základ aj percento uvedené.',
  'PEPPOL-EN16931-R041': 'Ak je uvedené percento zrážky/prirážky, musí byť uvedený aj jej základ.',
  'PEPPOL-EN16931-R042': 'Ak je uvedený základ zrážky/prirážky, musí byť uvedené aj percento.',
  'PEPPOL-EN16931-R043': 'Hodnota ChargeIndicator musí byť „true“ alebo „false“.',
  'PEPPOL-EN16931-R044': 'Prirážka na úrovni ceny nie je povolená – v cene je povolená len hodnota „false“ (zrážka).',
  'PEPPOL-EN16931-R046': 'Cena za položku netto (BT-146) sa musí rovnať cene brutto (BT-148) mínus zľava z ceny (BT-147).',
  'PEPPOL-EN16931-R051': 'Všetky atribúty currencyID musia mať hodnotu meny faktúry (BT-5), okrem celkovej sumy DPH v účtovnej mene (BT-111).',
  'PEPPOL-EN16931-R053': 'Musí byť uvedený práve jeden TaxTotal s rozpisom DPH (TaxSubtotal).',
  'PEPPOL-EN16931-R054': 'Ak je uvedený kód účtovnej meny DPH, musí byť uvedený práve jeden TaxTotal bez rozpisu DPH.',
  'PEPPOL-EN16931-R055': 'Celková suma DPH a celková suma DPH v účtovnej mene musia mať rovnaké znamienko.',
  'PEPPOL-EN16931-R061': 'Pri inkase musí byť uvedená referencia mandátu (BT-89).',
  'PEPPOL-EN16931-R080': 'Na úrovni dokladu je povolená najviac jedna referencia projektu (BT-11).',
  'PEPPOL-EN16931-R100': 'Na riadku je povolený najviac jeden fakturovaný objekt (BT-128).',
  'PEPPOL-EN16931-R101': 'Element DocumentReference na riadku sa smie použiť len pre identifikátor fakturovaného objektu (BT-128).',
  'PEPPOL-EN16931-R110': 'Počiatočný dátum obdobia riadku (BT-134) musí byť v rámci fakturačného obdobia (BG-14).',
  'PEPPOL-EN16931-R111': 'Konečný dátum obdobia riadku (BT-135) musí byť v rámci fakturačného obdobia (BG-14).',
  'PEPPOL-EN16931-R120': 'Čistá suma riadku (BT-131) sa musí rovnať množstvo × (cena netto / základné množstvo) + prirážky − zrážky na riadku.',
  'PEPPOL-EN16931-R121': 'Základné množstvo ceny (BT-149) musí byť kladné číslo väčšie ako nula.',
  'PEPPOL-EN16931-R130': 'Kód mernej jednotky základného množstva ceny (BT-150) musí byť rovnaký ako pri fakturovanom množstve (BT-130).',
  'PEPPOL-EN16931-CL001': 'MIME kód prílohy musí byť z povolenej podmnožiny IANA (application/pdf, image/png, image/jpeg, text/csv, xlsx, ods).',
  'PEPPOL-EN16931-CL002': 'Kód dôvodu zrážky musí byť z číselníka UNCL 5189.',
  'PEPPOL-EN16931-CL003': 'Kód dôvodu prirážky musí byť z číselníka UNCL 7161.',
  'PEPPOL-EN16931-CL006': 'Kód dátumu DUZP (BT-8) musí byť z číselníka UNCL 2005.',
  'PEPPOL-EN16931-CL007': 'Kód meny musí byť podľa ISO 4217.',
  'PEPPOL-EN16931-CL008': 'Schéma elektronickej adresy (EndpointID/@schemeID) musí byť z číselníka EAS.',
  'PEPPOL-EN16931-F001': 'Dátum musí byť vo formáte RRRR-MM-DD.',
  'PEPPOL-EN16931-P0100': 'Kód typu faktúry (BT-3) musí zodpovedať profilu.',
  'PEPPOL-EN16931-P0101': 'Kód typu dobropisu (BT-3) musí zodpovedať profilu.',
  'PEPPOL-EN16931-P0104': 'Pri kóde oslobodenia VATEX-EU-G musí byť použitá kategória DPH G.',
  'PEPPOL-EN16931-P0105': 'Pri kóde oslobodenia VATEX-EU-O musí byť použitá kategória DPH O.',
  'PEPPOL-EN16931-P0106': 'Pri kóde oslobodenia VATEX-EU-IC musí byť použitá kategória DPH K.',
  'PEPPOL-EN16931-P0107': 'Pri kóde oslobodenia VATEX-EU-AE musí byť použitá kategória DPH AE.',
  'PEPPOL-EN16931-P0108': 'Pri kóde oslobodenia VATEX-EU-D musí byť použitá kategória DPH E.',
  'PEPPOL-EN16931-P0109': 'Pri kóde oslobodenia VATEX-EU-F musí byť použitá kategória DPH E.',
  'PEPPOL-EN16931-P0110': 'Pri kóde oslobodenia VATEX-EU-I musí byť použitá kategória DPH E.',
  'PEPPOL-EN16931-P0111': 'Pri kóde oslobodenia VATEX-EU-J musí byť použitá kategória DPH E.',
  'PEPPOL-EN16931-P0112': 'Typ faktúry 326 alebo 384 je povolený len vtedy, ak sú kupujúci aj predávajúci nemecké subjekty.',
  'PEPPOL-COMMON-R040': 'GLN musí mať platný formát podľa pravidiel GS1.'
};
