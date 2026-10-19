'use strict';
/*
 * Model faktúry: mapovanie obchodných termínov (BT/BG) Peppol BIS Billing 3.0 / EN 16931
 * na elementy UBL 2.1. Každá zobrazená hodnota je "pole" (field) s odkazom na uzol v XML.
 */
const Model = (() => {
  /* ---------- jednoduchý selektor nad stromom z XP.parse ---------- */
  function parseStep(step) {
    // napr. cac:PartyTaxScheme[cac:TaxScheme/cbc:ID='VAT']  |  @schemeID
    const m = /^(@)?([A-Za-z]+:)?([A-Za-z0-9_.-]+)((?:\[[^\]]+\])*)$/.exec(step);
    if (!m) throw new Error('Zlý krok cesty: ' + step);
    const preds = [];
    const pr = /\[([^\]=!]+?)\s*(!=|=)\s*'([^']*)'\]/g;
    let p;
    while ((p = pr.exec(m[4] || ''))) preds.push({ path: p[1].trim(), op: p[2], val: p[3] });
    return { attr: !!m[1], ns: m[2] ? NS[m[2].slice(0, -1)] : null, local: m[3], preds };
  }

  const stepCache = new Map();
  function steps(path) {
    let s = stepCache.get(path);
    if (!s) {
      s = splitPath(path).map(parseStep);
      stepCache.set(path, s);
    }
    return s;
  }

  function splitPath(path) {
    const out = [];
    let depth = 0, cur = '';
    for (const ch of path) {
      if (ch === '[') depth++;
      if (ch === ']') depth--;
      if (ch === '/' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out.filter(Boolean);
  }

  /** Vráti pole zhôd {node, attr}. */
  function sel(ctx, path) {
    if (!ctx) return [];
    let cur = [{ node: ctx, attr: null }];
    for (const st of steps(path)) {
      const next = [];
      for (const c of cur) {
        if (st.attr) {
          if (c.node.attrMap[st.local] !== undefined) next.push({ node: c.node, attr: st.local });
          continue;
        }
        for (const ch of c.node.children) {
          if (ch.local !== st.local || (st.ns && ch.ns !== st.ns)) continue;
          if (st.preds.every(pd => predOk(ch, pd))) next.push({ node: ch, attr: null });
        }
      }
      cur = next;
      if (!cur.length) break;
    }
    return cur;
  }

  // porovnanie ako v pravidlách CEN: normalize-space(upper-case(…)) – napr. TaxScheme „vat“ je tiež DPH
  const norm = s => s.replace(/[ \t\r\n]+/g, ' ').trim().toUpperCase();
  function predOk(node, pd) {
    const vals = sel(node, pd.path).map(h => norm(h.attr ? h.node.attrMap[h.attr] : h.node.text));
    const want = norm(pd.val);
    return pd.op === '=' ? vals.includes(want) : !vals.includes(want);
  }

  /** Orezanie len bielych znakov XML (medzera, tab, CR, LF) – NBSP je súčasť hodnoty. */
  const xmlTrim = s => s.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');

  const one = (ctx, path) => sel(ctx, path)[0] || null;
  const val = (ctx, path) => {
    const h = one(ctx, path);
    return h ? xmlTrim(h.attr ? h.node.attrMap[h.attr] : h.node.text) : null;
  };

  function qname(node) {
    const p = NS_PREFIX[node.ns];
    if (!node.parent) return node.local;            // koreň: Invoice / CreditNote
    return p ? p + ':' + node.local : node.name;
  }

  function absPath(node, attr) {
    const parts = [];
    for (let x = node; x; x = x.parent) {
      let seg = qname(x);
      if (x.parent) {
        const sib = x.parent.children.filter(c => c.local === x.local && c.ns === x.ns);
        if (sib.length > 1) seg += '[' + (sib.indexOf(x) + 1) + ']';
      }
      parts.unshift(seg);
    }
    return '/' + parts.join('/') + (attr ? '/@' + attr : '');
  }

  /* ---------- register polí ---------- */
  class Registry {
    constructor() { this.fields = []; }
    add(bt, hit, ctx, path, o = {}) {
      const node = hit ? hit.node : null;
      const attr = hit ? hit.attr : null;
      const raw = hit ? (attr ? node.attrMap[attr] : node.text) : null;
      const info = (window.SK_BT || {})[bt] || {};
      const f = {
        id: this.fields.length, bt, label: o.label || info.n || bt, short: o.short || null,
        node, attr, raw, value: raw != null ? xmlTrim(raw) : null, missing: !hit,
        fmt: o.fmt || 'text', list: o.list || null, ctx, relPath: path, group: o.group || null,
        tech: !!o.tech, important: !!o.important, findings: [], sev: null
      };
      if (f.fmt === 'amount' && node) f.cur = node.attrMap.currencyID || null;
      if ((f.fmt === 'qty') && node) f.unit = node.attrMap.unitCode || null;
      f.xpath = hit ? absPath(node, attr) : (ctx ? absPath(ctx) : (o.base || '')) + '/' + path;
      f.line = node ? (attr ? lineOfAttr(node, attr) : node.line) : null;
      this.fields.push(f);
      return f;
    }
    f(bt, ctx, path, o) { return this.add(bt, ctx ? one(ctx, path) : null, ctx, path, o); }
    fa(bt, ctx, path, o) {
      const hits = ctx ? sel(ctx, path) : [];
      return hits.length ? hits.map(h => this.add(bt, h, ctx, path, o)) : [this.add(bt, null, ctx, path, o)];
    }
  }

  let currentParsed = null;
  function lineOfAttr(node, attr) {
    const a = node.attrs.find(x => x.local === attr);
    return a && currentParsed ? currentParsed.lineOf(a.s) : node.line;
  }

  /* ---------- extrakcia ---------- */
  function party(R, ctx, map, base, group) {
    const P = { node: ctx, group };
    const o = (extra) => Object.assign({ base, group }, extra || {});
    P.name = R.f(map.name, ctx, 'cac:PartyLegalEntity/cbc:RegistrationName', o({ important: true }));
    P.trade = map.trade ? R.f(map.trade, ctx, 'cac:PartyName/cbc:Name', o()) : null;
    P.ids = [];
    for (const h of sel(ctx, 'cac:PartyIdentification/cbc:ID')) {
      const isSepa = group === 'BG-4' && (h.node.attrMap.schemeID || '').trim() === 'SEPA';
      const bt = isSepa ? 'BT-90' : map.ids;
      if (!bt) continue;
      const f = R.add(bt, h, ctx, 'cac:PartyIdentification/cbc:ID', o({ label: isSepa ? 'Bankou priradený identifikátor príjemcu (SEPA)' : null }));
      f.scheme = R.add(bt + '-1', one(h.node, '@schemeID'), h.node, '@schemeID', o({ tech: true }));
      P.ids.push(f);
    }
    if (map.legalId) {
      P.legalId = R.f(map.legalId, ctx, 'cac:PartyLegalEntity/cbc:CompanyID', o({ important: true }));
      P.legalIdScheme = R.f(map.legalId + '-1', P.legalId.node, '@schemeID', o({ tech: true }));
    }
    if (map.vat) P.vat = R.f(map.vat, ctx, "cac:PartyTaxScheme[cac:TaxScheme/cbc:ID='VAT']/cbc:CompanyID", o({ important: true }));
    if (map.taxReg) P.taxReg = R.f(map.taxReg, ctx, "cac:PartyTaxScheme[cac:TaxScheme/cbc:ID!='VAT']/cbc:CompanyID", o());
    for (const ts of sel(ctx, 'cac:PartyTaxScheme/cac:TaxScheme/cbc:ID')) R.add('TECH', ts, ctx, 'cac:PartyTaxScheme/cac:TaxScheme/cbc:ID', o({ tech: true, label: 'Daňová schéma (VAT)' }));
    if (map.legalInfo) P.legalInfo = R.f(map.legalInfo, ctx, 'cac:PartyLegalEntity/cbc:CompanyLegalForm', o({ important: true }));
    if (map.endpoint) {
      P.endpoint = R.f(map.endpoint, ctx, 'cbc:EndpointID', o({ important: true }));
      P.endpointScheme = R.f(map.endpoint + '-1', P.endpoint.node, '@schemeID', o({ tech: true }));
    }
    if (map.street) {
      const A = 'cac:PostalAddress/';
      const aBase = base;
      P.addr = {
        node: one(ctx, 'cac:PostalAddress')?.node || null,
        street: R.f(map.street, ctx, A + 'cbc:StreetName', o({ important: true, base: aBase })),
        street2: R.f(map.street2, ctx, A + 'cbc:AdditionalStreetName', o()),
        line3: R.f(map.line3, ctx, A + 'cac:AddressLine/cbc:Line', o()),
        city: R.f(map.city, ctx, A + 'cbc:CityName', o({ important: true })),
        zip: R.f(map.zip, ctx, A + 'cbc:PostalZone', o({ important: true })),
        region: R.f(map.region, ctx, A + 'cbc:CountrySubentity', o()),
        country: R.f(map.country, ctx, A + 'cac:Country/cbc:IdentificationCode', o({ important: true, fmt: 'country' }))
      };
    }
    if (map.cName) {
      P.contact = {
        name: R.f(map.cName, ctx, 'cac:Contact/cbc:Name', o()),
        tel: R.f(map.cTel, ctx, 'cac:Contact/cbc:Telephone', o()),
        mail: R.f(map.cMail, ctx, 'cac:Contact/cbc:ElectronicMail', o())
      };
    }
    return P;
  }

  function address(R, ctx, bts, base, group) {
    const o = (extra) => Object.assign({ base, group }, extra || {});
    return {
      node: ctx,
      street: R.f(bts[0], ctx, 'cbc:StreetName', o()),
      street2: R.f(bts[1], ctx, 'cbc:AdditionalStreetName', o()),
      line3: R.f(bts[2], ctx, 'cac:AddressLine/cbc:Line', o()),
      city: R.f(bts[3], ctx, 'cbc:CityName', o()),
      zip: R.f(bts[4], ctx, 'cbc:PostalZone', o()),
      region: R.f(bts[5], ctx, 'cbc:CountrySubentity', o()),
      country: R.f(bts[6], ctx, 'cac:Country/cbc:IdentificationCode', o({ fmt: 'country' }))
    };
  }

  function allowanceCharge(R, ac, isCharge, level, base) {
    const g = level === 'doc' ? (isCharge ? 'BG-21' : 'BG-20') : level === 'line' ? (isCharge ? 'BG-28' : 'BG-27') : 'BG-29';
    const B = level === 'doc'
      ? (isCharge ? ['BT-99', 'BT-100', 'BT-101', 'BT-104', 'BT-105', 'BT-102', 'BT-103'] : ['BT-92', 'BT-93', 'BT-94', 'BT-97', 'BT-98', 'BT-95', 'BT-96'])
      : (isCharge ? ['BT-141', 'BT-142', 'BT-143', 'BT-144', 'BT-145'] : ['BT-136', 'BT-137', 'BT-138', 'BT-139', 'BT-140']);
    const o = (extra) => Object.assign({ base, group: g }, extra || {});
    R.f('TECH', ac, 'cbc:ChargeIndicator', o({ tech: true, label: 'Indikátor prirážky (true = prirážka, false = zrážka)' }));
    const X = {
      node: ac, isCharge, group: g,
      amount: R.f(B[0], ac, 'cbc:Amount', o({ fmt: 'amount' })),
      baseAmount: R.f(B[1], ac, 'cbc:BaseAmount', o({ fmt: 'amount' })),
      pct: R.f(B[2], ac, 'cbc:MultiplierFactorNumeric', o({ fmt: 'pct' })),
      reason: R.f(B[3], ac, 'cbc:AllowanceChargeReason', o()),
      reasonCode: R.f(B[4], ac, 'cbc:AllowanceChargeReasonCode', o({ fmt: 'code' }))
    };
    if (level === 'doc') {
      X.cat = R.f(B[5], ac, 'cac:TaxCategory/cbc:ID', o({ fmt: 'code', list: 'vat' }));
      X.rate = R.f(B[6], ac, 'cac:TaxCategory/cbc:Percent', o({ fmt: 'pct' }));
      for (const ts of sel(ac, 'cac:TaxCategory/cac:TaxScheme/cbc:ID')) R.add('TECH', ts, ac, 'cac:TaxCategory/cac:TaxScheme/cbc:ID', o({ tech: true, label: 'Daňová schéma (VAT)' }));
    }
    return X;
  }

  function extract(parsed) {
    currentParsed = parsed;
    const root = parsed.root;
    const isCN = root.local === 'CreditNote';
    const R = new Registry();
    const D = { parsed, root, isCN, R };
    const rb = '/' + root.local;

    // --- hlavička ---
    D.customization = R.f('BT-24', root, 'cbc:CustomizationID', { important: true, group: 'BG-2' });
    D.profile = R.f('BT-23', root, 'cbc:ProfileID', { important: true, group: 'BG-2' });
    D.number = R.f('BT-1', root, 'cbc:ID', { important: true });
    D.issueDate = R.f('BT-2', root, 'cbc:IssueDate', { fmt: 'date', important: true });
    D.typeCode = R.f('BT-3', root, isCN ? 'cbc:CreditNoteTypeCode' : 'cbc:InvoiceTypeCode', { fmt: 'code', list: 'doc', important: true });
    D.currency = R.f('BT-5', root, 'cbc:DocumentCurrencyCode', { important: true });
    D.taxCurrency = R.f('BT-6', root, 'cbc:TaxCurrencyCode');
    D.taxPointDate = R.f('BT-7', root, 'cbc:TaxPointDate', { fmt: 'date', important: true });
    D.dueDate = R.f('BT-9', root, isCN ? 'cac:PaymentMeans/cbc:PaymentDueDate' : 'cbc:DueDate', { fmt: 'date', important: true });
    D.buyerRef = R.f('BT-10', root, 'cbc:BuyerReference', { important: true });
    D.project = isCN
      ? R.f('BT-11', root, "cac:AdditionalDocumentReference[cbc:DocumentTypeCode='50']/cbc:ID")
      : R.f('BT-11', root, 'cac:ProjectReference/cbc:ID');
    D.contract = R.f('BT-12', root, 'cac:ContractDocumentReference/cbc:ID');
    D.order = R.f('BT-13', root, 'cac:OrderReference/cbc:ID', { important: true });
    D.salesOrder = R.f('BT-14', root, 'cac:OrderReference/cbc:SalesOrderID');
    D.receipt = R.f('BT-15', root, 'cac:ReceiptDocumentReference/cbc:ID');
    D.despatch = R.f('BT-16', root, 'cac:DespatchDocumentReference/cbc:ID');
    D.tender = R.f('BT-17', root, 'cac:OriginatorDocumentReference/cbc:ID');
    D.object = R.f('BT-18', root, "cac:AdditionalDocumentReference[cbc:DocumentTypeCode='130']/cbc:ID");
    if (D.object.node) D.objectScheme = R.f('BT-18-1', D.object.node, '@schemeID', { tech: true });
    for (const h of sel(root, 'cac:AdditionalDocumentReference/cbc:DocumentTypeCode')) R.add('TECH', h, root, 'cac:AdditionalDocumentReference/cbc:DocumentTypeCode', { tech: true, label: 'Kód typu dokumentu (130 = fakturovaný objekt, 50 = projekt)' });
    D.accountingCost = R.f('BT-19', root, 'cbc:AccountingCost');
    D.paymentTerms = R.f('BT-20', root, 'cac:PaymentTerms/cbc:Note', { important: true });
    D.notes = R.fa('BT-22', root, 'cbc:Note', { group: 'BG-1' }).filter(f => !f.missing);
    D.preceding = sel(root, 'cac:BillingReference').map(h => ({
      node: h.node,
      id: R.f('BT-25', h.node, 'cac:InvoiceDocumentReference/cbc:ID', { group: 'BG-3' }),
      date: R.f('BT-26', h.node, 'cac:InvoiceDocumentReference/cbc:IssueDate', { fmt: 'date', group: 'BG-3' })
    }));

    // --- strany ---
    const sp = one(root, 'cac:AccountingSupplierParty/cac:Party');
    D.seller = party(R, sp && sp.node, {
      name: 'BT-27', trade: 'BT-28', ids: 'BT-29', legalId: 'BT-30', vat: 'BT-31', taxReg: 'BT-32', legalInfo: 'BT-33', endpoint: 'BT-34',
      street: 'BT-35', street2: 'BT-36', line3: 'BT-162', city: 'BT-37', zip: 'BT-38', region: 'BT-39', country: 'BT-40',
      cName: 'BT-41', cTel: 'BT-42', cMail: 'BT-43'
    }, rb + '/cac:AccountingSupplierParty/cac:Party', 'BG-4');
    const bp = one(root, 'cac:AccountingCustomerParty/cac:Party');
    D.buyer = party(R, bp && bp.node, {
      name: 'BT-44', trade: 'BT-45', ids: 'BT-46', legalId: 'BT-47', vat: 'BT-48', endpoint: 'BT-49',
      street: 'BT-50', street2: 'BT-51', line3: 'BT-163', city: 'BT-52', zip: 'BT-53', region: 'BT-54', country: 'BT-55',
      cName: 'BT-56', cTel: 'BT-57', cMail: 'BT-58'
    }, rb + '/cac:AccountingCustomerParty/cac:Party', 'BG-7');

    const pp = one(root, 'cac:PayeeParty');
    if (pp) {
      D.payee = { node: pp.node };
      D.payee.name = R.f('BT-59', pp.node, 'cac:PartyName/cbc:Name', { group: 'BG-10' });
      D.payee.ids = sel(pp.node, 'cac:PartyIdentification/cbc:ID').map(h => {
        const sepa = (h.node.attrMap.schemeID || '').trim() === 'SEPA';
        const f = R.add(sepa ? 'BT-90' : 'BT-60', h, pp.node, 'cac:PartyIdentification/cbc:ID', { group: 'BG-10' });
        f.scheme = R.add(f.bt + '-1', one(h.node, '@schemeID'), h.node, '@schemeID', { tech: true, group: 'BG-10' });
        return f;
      });
      D.payee.legalId = R.f('BT-61', pp.node, 'cac:PartyLegalEntity/cbc:CompanyID', { group: 'BG-10' });
      D.payee.legalIdScheme = D.payee.legalId.node && R.f('BT-61-1', D.payee.legalId.node, '@schemeID', { tech: true, group: 'BG-10' });
    }
    const tr = one(root, 'cac:TaxRepresentativeParty');
    if (tr) {
      D.taxRep = { node: tr.node };
      D.taxRep.name = R.f('BT-62', tr.node, 'cac:PartyName/cbc:Name', { group: 'BG-11' });
      D.taxRep.vat = R.f('BT-63', tr.node, 'cac:PartyTaxScheme/cbc:CompanyID', { group: 'BG-11' });
      for (const ts of sel(tr.node, 'cac:PartyTaxScheme/cac:TaxScheme/cbc:ID')) R.add('TECH', ts, tr.node, 'cac:PartyTaxScheme/cac:TaxScheme/cbc:ID', { tech: true, label: 'Daňová schéma (VAT)' });
      const ad = one(tr.node, 'cac:PostalAddress');
      D.taxRep.addr = address(R, ad && ad.node, ['BT-64', 'BT-65', 'BT-164', 'BT-66', 'BT-67', 'BT-68', 'BT-69'], absPath(tr.node) + '/cac:PostalAddress', 'BG-12');
    }

    // --- dodanie a obdobie ---
    const dl = one(root, 'cac:Delivery');
    D.delivery = { node: dl ? dl.node : null };
    D.delivery.date = R.f('BT-72', dl && dl.node, 'cbc:ActualDeliveryDate', { fmt: 'date', base: rb + '/cac:Delivery', group: 'BG-13', important: true });
    if (dl) {
      D.delivery.name = R.f('BT-70', dl.node, 'cac:DeliveryParty/cac:PartyName/cbc:Name', { group: 'BG-13' });
      D.delivery.locId = R.f('BT-71', dl.node, 'cac:DeliveryLocation/cbc:ID', { group: 'BG-13' });
      D.delivery.locScheme = D.delivery.locId.node && R.f('BT-71-1', D.delivery.locId.node, '@schemeID', { tech: true, group: 'BG-13' });
      const da = one(dl.node, 'cac:DeliveryLocation/cac:Address');
      D.delivery.addr = address(R, da && da.node, ['BT-75', 'BT-76', 'BT-165', 'BT-77', 'BT-78', 'BT-79', 'BT-80'], absPath(dl.node) + '/cac:DeliveryLocation/cac:Address', 'BG-15');
    }
    const ip = one(root, 'cac:InvoicePeriod');
    D.period = {
      node: ip ? ip.node : null,
      start: R.f('BT-73', ip && ip.node, 'cbc:StartDate', { fmt: 'date', base: rb + '/cac:InvoicePeriod', group: 'BG-14' }),
      end: R.f('BT-74', ip && ip.node, 'cbc:EndDate', { fmt: 'date', base: rb + '/cac:InvoicePeriod', group: 'BG-14' }),
      code: R.f('BT-8', ip && ip.node, 'cbc:DescriptionCode', { fmt: 'code', list: 'taxPoint', base: rb + '/cac:InvoicePeriod' })
    };

    // --- platba ---
    D.payments = sel(root, 'cac:PaymentMeans').map(h => {
      const n = h.node, g = 'BG-16';
      const P = { node: n };
      P.code = R.f('BT-81', n, 'cbc:PaymentMeansCode', { fmt: 'code', list: 'pay', group: g, important: true });
      P.text = R.f('BT-82', n, 'cbc:PaymentMeansCode/@name', { group: g });
      P.paymentId = R.fa('BT-83', n, 'cbc:PaymentID', { group: g, important: true });
      const acc = one(n, 'cac:PayeeFinancialAccount');
      P.accNode = acc ? acc.node : null;
      P.account = R.f('BT-84', n, 'cac:PayeeFinancialAccount/cbc:ID', { group: 'BG-17', important: true });
      P.accName = R.f('BT-85', n, 'cac:PayeeFinancialAccount/cbc:Name', { group: 'BG-17' });
      P.bic = R.f('BT-86', n, 'cac:PayeeFinancialAccount/cac:FinancialInstitutionBranch/cbc:ID', { group: 'BG-17', important: true });
      P.card = R.f('BT-87', n, 'cac:CardAccount/cbc:PrimaryAccountNumberID', { group: 'BG-18' });
      P.cardHolder = R.f('BT-88', n, 'cac:CardAccount/cbc:HolderName', { group: 'BG-18' });
      if (one(n, 'cac:CardAccount/cbc:NetworkID')) R.f('TECH', n, 'cac:CardAccount/cbc:NetworkID', { tech: true, label: 'Sieť platobnej karty' });
      P.mandate = R.f('BT-89', n, 'cac:PaymentMandate/cbc:ID', { group: 'BG-19' });
      P.payerAcc = R.f('BT-91', n, 'cac:PaymentMandate/cac:PayerFinancialAccount/cbc:ID', { group: 'BG-19' });
      return P;
    });

    // --- zrážky / prirážky na úrovni dokladu ---
    D.allowances = sel(root, 'cac:AllowanceCharge').map(h =>
      allowanceCharge(R, h.node, val(h.node, 'cbc:ChargeIndicator') === 'true', 'doc', absPath(h.node)));

    // --- DPH ---
    D.vat = [];
    D.taxTotals = sel(root, 'cac:TaxTotal').map(h => {
      const n = h.node;
      const amtHit = one(n, 'cbc:TaxAmount');
      const cur = amtHit ? (amtHit.node.attrMap.currencyID || '').trim() : '';
      const hasSub = !!one(n, 'cac:TaxSubtotal');
      const isAcc = !hasSub && D.taxCurrency.value && cur === D.taxCurrency.value && cur !== D.currency.value;
      const T = { node: n, accounting: isAcc };
      T.amount = R.f(isAcc ? 'BT-111' : 'BT-110', n, 'cbc:TaxAmount', { fmt: 'amount', group: 'BG-22', important: true });
      for (const s of sel(n, 'cac:TaxSubtotal')) {
        const sn = s.node, g = 'BG-23';
        const V = { node: sn };
        V.base = R.f('BT-116', sn, 'cbc:TaxableAmount', { fmt: 'amount', group: g });
        V.amount = R.f('BT-117', sn, 'cbc:TaxAmount', { fmt: 'amount', group: g });
        V.cat = R.f('BT-118', sn, 'cac:TaxCategory/cbc:ID', { fmt: 'code', list: 'vat', group: g });
        V.rate = R.f('BT-119', sn, 'cac:TaxCategory/cbc:Percent', { fmt: 'pct', group: g });
        V.exReason = R.f('BT-120', sn, 'cac:TaxCategory/cbc:TaxExemptionReason', { group: g });
        V.exCode = R.f('BT-121', sn, 'cac:TaxCategory/cbc:TaxExemptionReasonCode', { fmt: 'code', group: g });
        for (const ts of sel(sn, 'cac:TaxCategory/cac:TaxScheme/cbc:ID')) R.add('TECH', ts, sn, 'cac:TaxCategory/cac:TaxScheme/cbc:ID', { tech: true, label: 'Daňová schéma (VAT)' });
        D.vat.push(V);
      }
      return T;
    });
    D.taxTotal = (D.taxTotals.find(t => !t.accounting) || {}).amount || R.f('BT-110', null, 'cac:TaxTotal/cbc:TaxAmount', { base: rb, fmt: 'amount', important: true });
    D.taxTotalAcc = (D.taxTotals.find(t => t.accounting) || {}).amount || null;

    // --- súčty ---
    const lm = one(root, 'cac:LegalMonetaryTotal');
    const lmn = lm && lm.node, lb = rb + '/cac:LegalMonetaryTotal', og = { fmt: 'amount', base: lb, group: 'BG-22' };
    D.totals = {
      node: lmn,
      lines: R.f('BT-106', lmn, 'cbc:LineExtensionAmount', Object.assign({ important: true }, og)),
      allowances: R.f('BT-107', lmn, 'cbc:AllowanceTotalAmount', og),
      charges: R.f('BT-108', lmn, 'cbc:ChargeTotalAmount', og),
      net: R.f('BT-109', lmn, 'cbc:TaxExclusiveAmount', Object.assign({ important: true }, og)),
      gross: R.f('BT-112', lmn, 'cbc:TaxInclusiveAmount', Object.assign({ important: true }, og)),
      prepaid: R.f('BT-113', lmn, 'cbc:PrepaidAmount', og),
      rounding: R.f('BT-114', lmn, 'cbc:PayableRoundingAmount', og),
      payable: R.f('BT-115', lmn, 'cbc:PayableAmount', Object.assign({ important: true }, og))
    };

    // --- prílohy ---
    D.attachments = sel(root, 'cac:AdditionalDocumentReference')
      .filter(h => {
        const c = val(h.node, 'cbc:DocumentTypeCode');
        return c !== '130' && !(isCN && c === '50');
      })
      .map(h => {
        const n = h.node, g = 'BG-24';
        const A = { node: n };
        A.id = R.f('BT-122', n, 'cbc:ID', { group: g });
        A.desc = R.f('BT-123', n, 'cbc:DocumentDescription', { group: g });
        A.uri = R.f('BT-124', n, 'cac:Attachment/cac:ExternalReference/cbc:URI', { group: g });
        A.bin = R.f('BT-125', n, 'cac:Attachment/cbc:EmbeddedDocumentBinaryObject', { group: g, fmt: 'bin', label: 'Priložený dokument (obsah base64)' });
        A.mime = R.f('BT-125', n, 'cac:Attachment/cbc:EmbeddedDocumentBinaryObject/@mimeCode', { group: g, label: 'Priložený dokument – typ MIME' });
        A.filename = R.f('BT-125', n, 'cac:Attachment/cbc:EmbeddedDocumentBinaryObject/@filename', { group: g, label: 'Priložený dokument – názov súboru' });
        return A;
      });

    // --- riadky ---
    const lineTag = isCN ? 'cac:CreditNoteLine' : 'cac:InvoiceLine';
    const qtyTag = isCN ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity';
    D.lines = sel(root, lineTag).map(h => {
      const n = h.node, g = 'BG-25';
      const L = { node: n };
      L.id = R.f('BT-126', n, 'cbc:ID', { group: g });
      L.note = R.f('BT-127', n, 'cbc:Note', { group: g });
      L.object = R.f('BT-128', n, 'cac:DocumentReference/cbc:ID', { group: g });
      L.objectScheme = L.object.node && R.f('BT-128-1', L.object.node, '@schemeID', { tech: true, group: g });
      for (const t of sel(n, 'cac:DocumentReference/cbc:DocumentTypeCode')) R.add('TECH', t, n, 'cac:DocumentReference/cbc:DocumentTypeCode', { tech: true, label: 'Kód typu dokumentu (130)' });
      L.qty = R.f('BT-129', n, qtyTag, { fmt: 'qty', group: g });
      L.unit = R.f('BT-130', n, qtyTag + '/@unitCode', { fmt: 'code', list: 'unit', group: g });
      L.net = R.f('BT-131', n, 'cbc:LineExtensionAmount', { fmt: 'amount', group: g });
      L.orderLine = R.f('BT-132', n, 'cac:OrderLineReference/cbc:LineID', { group: g });
      L.accCost = R.f('BT-133', n, 'cbc:AccountingCost', { group: g });
      L.pStart = R.f('BT-134', n, 'cac:InvoicePeriod/cbc:StartDate', { fmt: 'date', group: 'BG-26' });
      L.pEnd = R.f('BT-135', n, 'cac:InvoicePeriod/cbc:EndDate', { fmt: 'date', group: 'BG-26' });
      L.allowances = sel(n, 'cac:AllowanceCharge').map(a =>
        allowanceCharge(R, a.node, val(a.node, 'cbc:ChargeIndicator') === 'true', 'line', absPath(a.node)));
      const pr = one(n, 'cac:Price');
      const prn = pr && pr.node;
      L.price = R.f('BT-146', prn, 'cbc:PriceAmount', { fmt: 'amount', group: 'BG-29', base: absPath(n) + '/cac:Price' });
      if (prn) {
        if (one(prn, 'cac:AllowanceCharge')) R.f('TECH', prn, 'cac:AllowanceCharge/cbc:ChargeIndicator', { tech: true, label: 'Indikátor zľavy z ceny (musí byť false)' });
        L.priceDisc = R.f('BT-147', prn, 'cac:AllowanceCharge/cbc:Amount', { fmt: 'amount', group: 'BG-29' });
        L.priceGross = R.f('BT-148', prn, 'cac:AllowanceCharge/cbc:BaseAmount', { fmt: 'amount', group: 'BG-29' });
        L.baseQty = R.f('BT-149', prn, 'cbc:BaseQuantity', { fmt: 'qty', group: 'BG-29' });
        L.baseUnit = R.f('BT-150', prn, 'cbc:BaseQuantity/@unitCode', { fmt: 'code', list: 'unit', group: 'BG-29' });
      }
      const it = one(n, 'cac:Item');
      const itn = it && it.node;
      L.name = R.f('BT-153', itn, 'cbc:Name', { group: 'BG-31', base: absPath(n) + '/cac:Item' });
      L.desc = R.f('BT-154', itn, 'cbc:Description', { group: 'BG-31' });
      L.sellerId = R.f('BT-155', itn, 'cac:SellersItemIdentification/cbc:ID', { group: 'BG-31' });
      L.buyerId = R.f('BT-156', itn, 'cac:BuyersItemIdentification/cbc:ID', { group: 'BG-31' });
      L.stdId = R.f('BT-157', itn, 'cac:StandardItemIdentification/cbc:ID', { group: 'BG-31' });
      if (L.stdId.node) L.stdIdScheme = R.f('BT-157-1', L.stdId.node, '@schemeID', { tech: true });
      L.classif = itn ? sel(itn, 'cac:CommodityClassification/cbc:ItemClassificationCode').map(c => {
        const f = R.add('BT-158', c, itn, 'cac:CommodityClassification/cbc:ItemClassificationCode', { group: 'BG-31' });
        f.scheme = (c.node.attrMap.listID || '') + (c.node.attrMap.listVersionID ? ' ' + c.node.attrMap.listVersionID : '');
        return f;
      }) : [];
      L.origin = R.f('BT-159', itn, 'cac:OriginCountry/cbc:IdentificationCode', { fmt: 'country', group: 'BG-31' });
      L.cat = R.f('BT-151', itn, 'cac:ClassifiedTaxCategory/cbc:ID', { fmt: 'code', list: 'vat', group: 'BG-30' });
      L.rate = R.f('BT-152', itn, 'cac:ClassifiedTaxCategory/cbc:Percent', { fmt: 'pct', group: 'BG-30' });
      if (itn) for (const ts of sel(itn, 'cac:ClassifiedTaxCategory/cac:TaxScheme/cbc:ID')) R.add('TECH', ts, itn, 'cac:ClassifiedTaxCategory/cac:TaxScheme/cbc:ID', { tech: true, label: 'Daňová schéma (VAT)' });
      L.props = itn ? sel(itn, 'cac:AdditionalItemProperty').map(p => ({
        name: R.f('BT-160', p.node, 'cbc:Name', { group: 'BG-32' }),
        value: R.f('BT-161', p.node, 'cbc:Value', { group: 'BG-32' })
      })) : [];
      return L;
    });

    D.fields = R.fields;
    D.unmapped = findUnmapped(parsed, R.fields);
    return D;
  }

  /** Listové elementy, ktoré nie sú pokryté žiadnym poľom (rozšírenia, nepodporované elementy). */
  function findUnmapped(parsed, fields) {
    const covered = new Set();
    for (const f of fields) if (f.node && !f.attr) covered.add(f.node);
    const out = [];
    for (const n of parsed.nodes) {
      if (n.children.length) continue;
      if (covered.has(n)) continue;
      out.push(n);
    }
    return out;
  }

  return { extract, sel, one, val, absPath };
})();
