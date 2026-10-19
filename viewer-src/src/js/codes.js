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

/** Bezpečné vyhľadanie v číselníku – kód „constructor“ či „__proto__“ z XML nesmie vrátiť člen Object.prototype. */
const own = (o, k) => (o != null && k != null && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

const CODES = {
  // UNTDID 1001 (D.16B) – typ dokladu; podmnožiny Peppol: UNCL1001-inv, UNCL1001-cn
  doc: {
    '71': 'Žiadosť o platbu', '80': 'Ťarchopis k tovaru alebo službám', '81': 'Dobropis k tovaru alebo službám',
    '82': 'Faktúra za merané služby', '83': 'Dobropis (finančné úpravy)', '84': 'Ťarchopis (finančné úpravy)',
    '102': 'Daňové oznámenie', '130': 'Hárok fakturačných údajov',
    '202': 'Priame ocenenie platby', '203': 'Predbežné ocenenie platby', '204': 'Ocenenie platby',
    '211': 'Priebežná žiadosť o platbu', '218': 'Žiadosť o konečnú platbu po dokončení prác', '219': 'Žiadosť o platbu za dokončené jednotky',
    '261': 'Samofakturačný dobropis', '262': 'Súhrnný dobropis (tovar a služby)', '295': 'Faktúra za cenové rozdiely',
    '296': 'Dobropis za cenové rozdiely', '308': 'Delcredere dobropis', '325': 'Predbežná faktúra (proforma)', '326': 'Čiastková faktúra',
    '331': 'Obchodná faktúra s baliacim listom', '380': 'Faktúra', '381': 'Dobropis', '382': 'Provízny list', '383': 'Ťarchopis',
    '384': 'Opravná faktúra', '385': 'Súhrnná faktúra', '386': 'Zálohová faktúra', '387': 'Faktúra za prenájom',
    '388': 'Daňová faktúra (daňový doklad)', '389': 'Samofakturácia', '390': 'Delcredere faktúra', '393': 'Faktoringová faktúra',
    '394': 'Leasingová faktúra', '395': 'Konsignačná faktúra', '396': 'Faktoringový dobropis', '420': 'Dobropis s platbou OCR',
    '456': 'Debetné avízo', '457': 'Storno debetu', '458': 'Storno kreditu', '527': 'Samofakturačný ťarchopis',
    '532': 'Dobropis špeditéra', '553': 'Správa špeditéra o nezrovnalostiach vo faktúre', '575': 'Faktúra poisťovateľa',
    '623': 'Faktúra špeditéra', '633': 'Doklad o prístavných poplatkoch', '751': 'Faktúra – informácia pre účtovanie',
    '780': 'Faktúra za prepravu', '817': 'Oznámenie o nároku (reklamácii)', '870': 'Konzulárna faktúra',
    '875': 'Čiastková faktúra (stavebníctvo)', '876': 'Čiastková konečná faktúra (stavebníctvo)', '877': 'Konečná faktúra (stavebníctvo)',
    '935': 'Colná faktúra'
  },
  docTitle: {
    '380': 'FAKTÚRA', '381': 'DOBROPIS', '383': 'ŤARCHOPIS', '384': 'OPRAVNÁ FAKTÚRA', '386': 'ZÁLOHOVÁ FAKTÚRA',
    '388': 'DAŇOVÝ DOKLAD', '389': 'SAMOFAKTURÁCIA', '261': 'SAMOFAKTURAČNÝ DOBROPIS', '326': 'ČIASTKOVÁ FAKTÚRA',
    '393': 'FAKTORINGOVÁ FAKTÚRA', '395': 'KONSIGNAČNÁ FAKTÚRA', '396': 'FAKTORINGOVÝ DOBROPIS', '82': 'FAKTÚRA ZA MERANÉ SLUŽBY',
    '80': 'ŤARCHOPIS', '81': 'DOBROPIS', '83': 'DOBROPIS', '84': 'ŤARCHOPIS', '875': 'ČIASTKOVÁ FAKTÚRA',
    '876': 'ČIASTKOVÁ KONEČNÁ FAKTÚRA', '877': 'KONEČNÁ FAKTÚRA'
  },
  // UNTDID 4461 – spôsob platby
  pay: {
    '1': 'Nešpecifikované', '10': 'Hotovosť', '20': 'Šek', '30': 'Bankový prevod (kreditný)', '31': 'Debetný prevod',
    '42': 'Platba na bankový účet', '48': 'Platobná karta', '49': 'Inkaso', '54': 'Kreditná karta', '55': 'Debetná karta',
    '57': 'Trvalá dohoda (standing agreement)', '58': 'SEPA prevod', '59': 'SEPA inkaso', '68': 'Online platobná služba',
    '97': 'Zápočet medzi partnermi', 'ZZZ': 'Iný (dohodnutý) spôsob'
  },
  // UNTDID 5305 – kategória DPH
  vat: {
    'S': 'Základná / znížená sadzba', 'Z': 'Nulová sadzba', 'E': 'Oslobodené od dane', 'AE': 'Prenesenie daňovej povinnosti',
    'K': 'Oslobodené dodanie v rámci EÚ', 'G': 'Vývoz mimo EÚ (oslobodené)', 'O': 'Mimo predmetu DPH',
    'L': 'IGIC (Kanárske ostrovy)', 'M': 'IPSI (Ceuta a Melilla)', 'B': 'Prenesená DPH (Taliansko)'
  },
  // UNTDID 2005 – kód dátumu DUZP
  taxPoint: { '3': 'Dátum vystavenia faktúry', '35': 'Skutočný dátum dodania', '432': 'Dátum úhrady' },
  // UN/ECE Rec 20 a 21 (Peppol UNECERec20, rev. 11e) – najčastejšie merné jednotky
  unit: {
    'H87': 'ks', 'C62': 'ks (jednotka)', 'EA': 'ks (každý)', 'XPP': 'ks (voľný kus)', 'SET': 'súprava', 'PR': 'pár', 'DZN': 'tucet',
    'XPK': 'balenie', 'XPA': 'balíček', 'XBX': 'krabica', 'XCT': 'kartón', 'XPX': 'paleta', 'XBG': 'vrecko', 'XSA': 'vrece',
    'XRO': 'rolka', 'XBO': 'fľaša', 'NAR': 'počet položiek', 'NMP': 'počet balení', 'LS': 'paušál',
    'E48': 'služba', 'ZZ': 'vzájomne dohodnutá', 'ACT': 'činnosť', 'E49': 'pracovný deň',
    'SEC': 's', 'MIN': 'min', 'HUR': 'hod.', 'DAY': 'deň', 'WEE': 'týždeň', 'MON': 'mesiac', 'QAN': 'štvrťrok', 'ANN': 'rok',
    'GRM': 'g', 'KGM': 'kg', 'TNE': 't', 'MGM': 'mg',
    'MMT': 'mm', 'CMT': 'cm', 'MTR': 'm', 'KMT': 'km', 'MTK': 'm²', 'MTQ': 'm³', 'CMK': 'cm²', 'MQH': 'm³/h',
    'MLT': 'ml', 'LTR': 'l', 'DLT': 'dl', 'HLT': 'hl',
    'KWH': 'kWh', 'MWH': 'MWh', 'GWH': 'GWh', 'D32': 'TWh', 'KWT': 'kW', 'MAW': 'MW', 'WTT': 'W', 'KVA': 'kVA',
    'GV': 'GJ', '3B': 'MJ', 'GJ': 'g/ml',
    'TKM': 'tkm', 'P1': '%', 'A9': 'sadzba', 'IE': 'osoba'
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
  'BT-130': 'UNECERec20', 'BT-150': 'UNECERec20', 'BT-18-1': 'UNCL1153', 'BT-128-1': 'UNCL1153',
  'BT-34-1': 'eas', 'BT-49-1': 'eas', 'BT-90-1': 'SEPA',
  'BT-29-1': 'ICD', 'BT-30-1': 'ICD', 'BT-46-1': 'ICD', 'BT-47-1': 'ICD', 'BT-157-1': 'ICD',
  'BT-60-1': 'ICD', 'BT-61-1': 'ICD', 'BT-71-1': 'ICD'
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
    case 'AdditionalDocumentReference': {
      // s kódom 130 ide o fakturovaný objekt (BT-18), v dobropise s kódom 50 o projekt (BT-11) – nie o prílohu
      const c = ((n.children.find(x => x.local === 'DocumentTypeCode') || {}).text || '').trim();
      return c === '130' || (c === '50' && PP === '' && n.parent && n.parent.local === 'CreditNote') ? null : 'BG-24';
    }
    case 'InvoiceLine': case 'CreditNoteLine': return 'BG-25';
    case 'Price': return 'BG-29';
    case 'ClassifiedTaxCategory': return 'BG-30';
    case 'Item': return 'BG-31';
    case 'AdditionalItemProperty': return 'BG-32';
    case 'BillingReference': return 'BG-3';
    default: return null;
  }
}

/*
 * Kód banky v slovenskom IBAN (pozície 5–8) → BIC. Podľa NBS „Číselník identifikačných kódov platobného systému SR“,
 * verzia 226 platná od 8. 10. 2026 (https://nbs.sk – CSV AP0001). null = poskytovateľ bez BIC.
 */
const SK_BANKS_VER = 'NBS, verzia 226 (8. 10. 2026)';
const SK_BANKS = {
  '0200': ['SUBASKBX', 'Všeobecná úverová banka'],
  '0720': ['NBSBSKBX', 'Národná banka Slovenska'],
  '0900': ['GIBASKBX', 'Slovenská sporiteľňa'],
  '1100': ['TATRSKBX', 'Tatra banka'],
  '1111': ['UNCRSKBX', 'UniCredit Bank Czech Republic and Slovakia, pobočka'],
  '3000': ['SLZBSKBA', 'Slovenská záručná a rozvojová banka'],
  '3100': ['LUBASKBX', 'Prima banka Slovensko (kód pre bežné platby)'],
  '5600': ['KOMASK2X', 'Prima banka Slovensko'],
  '5900': ['PRVASKBA', 'Prvá stavebná sporiteľňa'],
  '6500': ['POBNSKBA', '365.bank'],
  '7300': ['INGBSKBX', 'ING Bank N.V., pobočka'],
  '7500': ['CEKOSKBX', 'Československá obchodná banka'],
  '7930': ['WUSTSKBA', 'Bausparkasse Wüstenrot, pobočka'],
  '8100': ['KOMBSKBA', 'Komerční banka, pobočka'],
  '8120': ['BSLOSK22', 'Penta Bank'],
  '8130': ['CITISKBA', 'Citibank Europe, pobočka'],
  '8160': ['EXSKSKBX', 'EXIMBANKA SR'],
  '8180': ['SPSRSKBA', 'Štátna pokladnica'],
  '8191': [null, 'Centrálny depozitár cenných papierov SR'],
  '8320': ['JTBPSKBA', 'J&T BANKA, pobočka'],
  '8330': ['FIOZSKBA', 'Fio banka, pobočka'],
  '8360': ['BREXSKBX', 'mBank S.A., pobočka'],
  '8370': ['OBKLSKBA', 'Oberbank AG, pobočka'],
  '8400': [null, 'COFIDIS SA, pobočka'],
  '8420': ['BFKKSKBB', 'BKS Bank AG, pobočka'],
  '8450': ['BPKOSKBB', 'PKO BP S.A., pobočka'],
  '9950': [null, 'Nexi Central Europe'],
  '9952': ['TPAYSKBX', 'Trust Pay'],
  '9955': ['PANXSK22', 'Unifiedpost Payments, organizačná zložka'],
  '9956': ['PYYUSK22', 'Payout']
};

/* Dĺžky IBAN podľa registra IBAN (ISO 13616, SWIFT). Francúzske zámorské územia používajú FR, Åland FI. */
const IBAN_LEN = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BI: 27, BR: 29, BY: 28, CH: 21, CR: 22,
  CY: 28, CZ: 24, DE: 22, DJ: 27, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FK: 18, FO: 18, FR: 27, GB: 22,
  GE: 22, GI: 23, GL: 18, GR: 27, GT: 28, HN: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30,
  KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, LY: 25, MC: 27, MD: 24, ME: 22, MK: 19, MN: 20,
  MR: 27, MT: 31, MU: 30, NI: 28, NL: 18, NO: 15, OM: 23, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22,
  RU: 33, SA: 24, SC: 31, SD: 18, SE: 24, SI: 19, SK: 24, SM: 27, SO: 23, ST: 25, SV: 28, TL: 23, TN: 24, TR: 26,
  UA: 29, VA: 22, VG: 24, XK: 20, YE: 30
};

/* Slovenské preklady všeobecných pravidiel Peppol BIS 3.0 (CEN pravidlá prekladá oficiálny workbook FS SR). */
const PEPPOL_SK = {
  'PEPPOL-EN16931-R001': 'Musí byť uvedený typ obchodného procesu (BT-23 ProfileID).',
  'PEPPOL-EN16931-R002': 'Na úrovni dokladu je povolená najviac jedna poznámka (BT-22), okrem prípadu, keď sú kupujúci aj predávajúci nemecké subjekty.',
  'PEPPOL-EN16931-R003': 'Musí byť uvedené referenčné označenie kupujúceho (BT-10) alebo číslo objednávky (BT-13).',
  'PEPPOL-EN16931-R004': 'Identifikátor špecifikácie (BT-24) musí začínať hodnotou „urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0“ a dodržať pravidlá formátu identifikátora (nesmie obsahovať „::“).',
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
