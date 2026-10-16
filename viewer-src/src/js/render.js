'use strict';
/* Vykresľovanie: vizuál faktúry, XML zdroj, nálezy, mapovanie polí, prílohy, inšpektor. */
const View = (() => {
  const esc = U.esc;
  const SEV_RANK = { fatal: 0, error: 1, warning: 2, info: 3 };
  const SEV_LABEL = { fatal: 'Chyba', error: 'Chyba', warning: 'Upozornenie', info: 'Info' };
  const SRC_LABEL = { cen: 'EN 16931', peppol: 'Peppol BIS 3.0', sk: 'SK kontrola', xml: 'XML' };
  const TRANSFER = ['30', '31', '42', '58'];
  let opts = { showBT: false, showEmpty: false, fixMoj: false };
  const setOpts = o => { opts = o; };

  /* ---------- polia ---------- */
  const sevCls = f => (f && f.sev ? ' s-' + f.sev : '');
  const btTag = f => (f.bt && f.bt !== 'TECH' ? `<sup class="bt">${esc(f.bt)}</sup>` : '');
  const dispVal = f => (opts.fixMoj && f.fixed ? f.fixed : f.value);
  const has = f => !!(f && !f.missing);

  function fmtIban(v) {
    const s = (v || '').replace(/\s/g, '');
    return /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s) && s === v ? s.replace(/(.{4})/g, '$1 ').trim() : v;
  }

  function fmtValue(f, as) {
    const v = dispVal(f);
    if (as === 'raw') return esc(v);
    if (as === 'iban') return esc(fmtIban(v));
    if (as === 'country') return esc(U.countryName(v));
    if (as === 'label') return esc(U.codeLabel(f.list, v) || v);
    switch (f.fmt) {
      case 'date': return esc(U.fmtDate(v));
      case 'amount': return esc(U.fmtAmount(v, f.cur));
      case 'qty': return esc(U.fmtQty(v));
      case 'pct': return esc(U.fmtPct(v));
      case 'country': return esc(v);
      case 'code': {
        const l = f.list ? U.codeLabel(f.list, v) : '';
        return l ? `${esc(l)} <span class="code">${esc(v)}</span>` : esc(v);
      }
      case 'bin': return `<span class="code">[obsah base64 – ${esc(U.fmtSize(SK.attachmentInfo(f.raw).size))}]</span>`;
      default: return esc(v).replace(/\n/g, '<br>');
    }
  }

  /** HTML hodnoty poľa (klikateľný span) alebo '' ak je prázdne a nemá sa zobraziť. */
  function fv(f, o = {}) {
    if (!f) return '';
    if (f.missing) {
      if (!(f.sev || (opts.showEmpty && (f.important || o.empty)))) return '';
      return `<span class="f missing${sevCls(f)}" data-f="${f.id}">${esc(o.ph || 'nevyplnené')}${btTag(f)}</span>`;
    }
    const fx = opts.fixMoj && f.fixed ? ' fixed' : '';
    return `<span class="f${sevCls(f)}${fx}" data-f="${f.id}">${fmtValue(f, o.as)}${btTag(f)}</span>`;
  }

  function kv(label, ...parts) {
    const html = parts.filter(Boolean).join(' ');
    if (!html.trim()) return '';
    const onlyMissing = html.includes('class="f missing') && !/class="f(?! missing)/.test(html);
    return `<div class="kv${onlyMissing ? ' only-missing' : ''}"><span class="k">${esc(label)}</span><span class="v">${html}</span></div>`;
  }
  function mi(label, html) {
    return html ? `<span class="mi"><span class="k">${esc(label)}</span> ${html}</span>` : '';
  }

  /* ---------- vizuál faktúry ---------- */
  function addressHtml(A) {
    if (!A) return '';
    const zipCity = [fv(A.zip), fv(A.city)].filter(Boolean).join(' ');
    return [fv(A.street), fv(A.street2), fv(A.line3), zipCity, fv(A.region), fv(A.country, { as: 'country' })]
      .filter(Boolean).map(x => `<div>${x}</div>`).join('');
  }

  function partyHtml(title, P, kind) {
    if (!P) return '';
    const trade = has(P.trade) && P.trade.value !== P.name.value ? `<div class="p-trade">${fv(P.trade)}</div>` : (P.trade && P.trade.sev ? fv(P.trade) : '');
    const ep = has(P.endpoint)
      ? `${fv(P.endpointScheme, { as: 'raw' })}<span class="sep">:</span>${fv(P.endpoint)}` + (P.endpointScheme && CODES.eas[P.endpointScheme.value] ? ` <span class="code">${esc(CODES.eas[P.endpointScheme.value])}</span>` : '')
      : fv(P.endpoint, { empty: true });
    const ids = [
      kv(SK.isSK(P) ? 'IČO' : 'Registračné číslo', fv(P.legalId, { empty: true }), has(P.legalIdScheme) ? `<span class="code">schéma ${fv(P.legalIdScheme)}</span>` : ''),
      kind === 'seller' ? kv('DIČ', fv(P.taxReg)) : '',
      kv('IČ DPH', fv(P.vat, { empty: true })),
      kv('Peppol ID', ep),
      ...P.ids.map(f => kv(f.bt === 'BT-90' ? 'ID veriteľa SEPA' : 'Identifikátor', fv(f), has(f.scheme) ? `<span class="code">${fv(f.scheme)}</span>` : '')),
      P.legalInfo ? kv('Zápis v registri', fv(P.legalInfo, { empty: true })) : ''
    ].join('');
    const C = P.contact || {};
    const contact = [fv(C.name), fv(C.tel), fv(C.mail)].filter(Boolean).join('<span class="sdot">·</span>');
    return `<section class="party ${kind}">
      <h3>${esc(title)}</h3>
      <div class="p-name">${fv(P.name, { empty: true })}</div>${trade}
      <div class="p-addr">${addressHtml(P.addr)}</div>
      <div class="p-ids">${ids}</div>
      ${contact ? `<div class="p-contact"><span class="k">Kontakt</span> ${contact}</div>` : ''}
    </section>`;
  }

  function datesHtml(D) {
    const per = (has(D.period.start) || has(D.period.end) || D.period.start.sev || D.period.end.sev)
      ? kv('Fakturačné obdobie', [fv(D.period.start), fv(D.period.end)].filter(Boolean).join(' – ')) : '';
    return `<section class="box dates"><h4>Dátumy</h4>
      ${kv('Dátum vyhotovenia', fv(D.issueDate, { empty: true }))}
      ${kv('Dátum zdaniteľného plnenia (DUZP)', fv(D.taxPointDate, { empty: true }))}
      ${kv('Dátum dodania', fv(D.delivery.date))}
      ${per}
      ${kv('Kód DUZP', fv(D.period.code))}
      ${kv('Dátum splatnosti', fv(D.dueDate, { empty: true }))}
      ${kv('Platobné podmienky', fv(D.paymentTerms))}
    </section>`;
  }

  function paymentHtml(D) {
    if (!D.payments.length) {
      return `<section class="box pay"><h4>Platobné údaje</h4><div class="muted small">Faktúra neobsahuje platobné inštrukcie (BG-16).</div></section>`;
    }
    const blocks = D.payments.map(P => {
      const tr = TRANSFER.includes((P.code.value || '').trim());
      return `<div class="pay-block">
        ${kv('Spôsob úhrady', fv(P.code), has(P.text) ? '– ' + fv(P.text) : '')}
        ${kv('IBAN / číslo účtu', fv(P.account, { as: 'iban', empty: tr }))}
        ${kv('BIC / SWIFT', fv(P.bic, { as: 'raw', empty: tr }))}
        ${kv('Názov účtu', fv(P.accName))}
        ${P.paymentId.map(f => kv('Variabilný symbol / referencia', fv(f, { as: 'raw', empty: tr }))).join('')}
        ${kv('Platobná karta', fv(P.card), fv(P.cardHolder))}
        ${kv('Mandát inkasa', fv(P.mandate))}
        ${kv('Účet platiteľa', fv(P.payerAcc))}
      </div>`;
    }).join('');
    return `<section class="box pay"><h4>Platobné údaje</h4>${blocks}</section>`;
  }

  function refsHtml(D) {
    const rows = [
      kv('Referencia kupujúceho', fv(D.buyerRef, { empty: true })),
      kv('Objednávka', fv(D.order)),
      kv('Predajná zákazka', fv(D.salesOrder)),
      kv('Zmluva', fv(D.contract)),
      kv('Projekt', fv(D.project)),
      kv('Príjemka', fv(D.receipt)),
      kv('Dodací list', fv(D.despatch)),
      kv('Súťaž / VO', fv(D.tender)),
      kv('Fakturovaný objekt', fv(D.object), D.objectScheme && has(D.objectScheme) ? `<span class="code">${fv(D.objectScheme)}</span>` : ''),
      kv('Účtovná referencia', fv(D.accountingCost)),
      ...D.preceding.map(p => kv('Predchádzajúca faktúra', fv(p.id), has(p.date) ? 'z ' + fv(p.date) : ''))
    ].join('');
    return rows ? `<section class="box refs"><h4>Referencie</h4><div class="cols">${rows}</div></section>` : '';
  }

  function extraPartiesHtml(D) {
    const out = [];
    if (D.delivery.node && (D.delivery.name || D.delivery.addr || D.delivery.locId)) {
      const body = [kv('Príjemca dodávky', fv(D.delivery.name)), kv('ID miesta', fv(D.delivery.locId))].join('') +
        (D.delivery.addr && D.delivery.addr.node ? `<div class="p-addr">${addressHtml(D.delivery.addr)}</div>` : '');
      if (body.trim()) out.push(`<section class="box"><h4>Miesto dodania</h4>${body}</section>`);
    }
    if (D.payee) {
      out.push(`<section class="box"><h4>Príjemca platby</h4>${kv('Názov', fv(D.payee.name, { empty: true }))}${D.payee.ids.map(f => kv(f.bt === 'BT-90' ? 'ID veriteľa SEPA' : 'Identifikátor', fv(f))).join('')}${kv('IČO', fv(D.payee.legalId))}</section>`);
    }
    if (D.taxRep) {
      out.push(`<section class="box"><h4>Daňový zástupca</h4>${kv('Názov', fv(D.taxRep.name, { empty: true }))}${kv('IČ DPH', fv(D.taxRep.vat, { empty: true }))}<div class="p-addr">${addressHtml(D.taxRep.addr)}</div></section>`);
    }
    return out.length ? `<div class="grid2">${out.join('')}</div>` : '';
  }

  function acDesc(A) {
    return [fv(A.reason), has(A.reasonCode) ? `<span class="code">${fv(A.reasonCode, { as: 'raw' })}</span>` : '',
      has(A.pct) ? `${fv(A.pct)} z ${fv(A.baseAmount)}` : (has(A.baseAmount) ? `základ ${fv(A.baseAmount)}` : '')].filter(Boolean).join(' ');
  }

  function linesHtml(D) {
    const rows = D.lines.map(L => {
      const meta = [
        mi('Kód', fv(L.sellerId)),
        mi('Kód kupujúceho', fv(L.buyerId)),
        mi(L.stdIdScheme && L.stdIdScheme.value === '0160' ? 'GTIN' : 'Štandardný kód', fv(L.stdId)),
        ...L.classif.map(c => mi('Klasifikácia' + (c.scheme ? ' ' + c.scheme : ''), fv(c))),
        mi('Pôvod', fv(L.origin, { as: 'country' })),
        mi('Obdobie', [fv(L.pStart), fv(L.pEnd)].filter(Boolean).join(' – ')),
        mi('Riadok objednávky', fv(L.orderLine)),
        mi('Účtovná ref.', fv(L.accCost)),
        mi('Objekt', fv(L.object)),
        ...L.props.map(p => mi(dispVal(p.name) || 'Atribút', fv(p.name, { as: 'raw' }) + ': ' + fv(p.value)))
      ].filter(Boolean).join('');
      const priceExtra = [
        has(L.priceGross) ? `brutto ${fv(L.priceGross)}` : '',
        has(L.priceDisc) ? `zľava ${fv(L.priceDisc)}` : '',
        has(L.baseQty) && Number(L.baseQty.value) !== 1 ? `za ${fv(L.baseQty)} ${fv(L.baseUnit, { as: 'label' })}` : (has(L.baseQty) ? `<span class="muted">za ${fv(L.baseQty)} ${fv(L.baseUnit, { as: 'label' })}</span>` : '')
      ].filter(Boolean).join('<br>');
      const acs = L.allowances.map(A => `<div class="l-ac">${A.isCharge ? 'Prirážka' : 'Zľava'}: ${acDesc(A)} <b>${A.isCharge ? '+' : '−'}${fv(A.amount)}</b></div>`).join('');
      return `<tr>
        <td class="c-id">${fv(L.id, { empty: true })}</td>
        <td class="c-item">
          <div class="l-name">${fv(L.name, { empty: true })}</div>
          ${has(L.desc) || L.desc.sev ? `<div class="l-desc">${fv(L.desc)}</div>` : ''}
          ${has(L.note) || L.note.sev ? `<div class="l-note">${fv(L.note)}</div>` : ''}
          ${meta ? `<div class="l-meta">${meta}</div>` : ''}
          ${acs}
        </td>
        <td class="num">${fv(L.qty, { empty: true })}</td>
        <td>${fv(L.unit, { as: 'label', empty: true })}</td>
        <td class="num">${fv(L.price, { empty: true })}${priceExtra ? `<div class="l-price">${priceExtra}</div>` : ''}</td>
        <td class="num">${fv(L.rate)} ${fv(L.cat, { as: 'raw' })}</td>
        <td class="num strong">${fv(L.net, { empty: true })}</td>
      </tr>`;
    }).join('');
    return `<table class="lines">
      <thead><tr><th>#</th><th>Položka</th><th class="num">Množstvo</th><th>MJ</th><th class="num">Cena/MJ bez DPH</th><th class="num">DPH</th><th class="num">Spolu bez DPH</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="muted">Faktúra neobsahuje žiadne riadky.</td></tr>'}</tbody>
    </table>`;
  }

  function docAcHtml(D) {
    if (!D.allowances.length) return '';
    const rows = D.allowances.map(A => `<tr>
      <td>${A.isCharge ? 'Prirážka' : 'Zľava'}</td><td>${acDesc(A)}</td>
      <td class="num">${fv(A.rate)} ${fv(A.cat, { as: 'raw' })}</td>
      <td class="num strong">${A.isCharge ? '' : '−'}${fv(A.amount, { empty: true })}</td></tr>`).join('');
    return `<h4 class="sec">Zľavy a prirážky na úrovni dokladu</h4>
      <table class="ac"><thead><tr><th>Typ</th><th>Dôvod / výpočet</th><th class="num">DPH</th><th class="num">Suma bez DPH</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function vatHtml(D) {
    const rows = D.vat.map(V => `<tr>
      <td>${fv(V.cat, { as: 'raw', empty: true })} <span class="muted small">${esc(U.vatLabel(V.cat.value))}</span>${has(V.exReason) || has(V.exCode) ? `<div class="small">${fv(V.exCode)} ${fv(V.exReason)}</div>` : ''}</td>
      <td class="num">${fv(V.rate)}</td>
      <td class="num">${fv(V.base, { empty: true })}</td>
      <td class="num">${fv(V.amount, { empty: true })}</td></tr>`).join('');
    return `<table class="vat"><caption>Rekapitulácia DPH</caption>
      <thead><tr><th>Kategória</th><th class="num">Sadzba</th><th class="num">Základ dane</th><th class="num">DPH</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="muted">Bez rozpisu DPH</td></tr>'}</tbody></table>`;
  }

  function totalsHtml(D) {
    const T = D.totals;
    const r = (label, f, cls = '', o = {}) => {
      const h = fv(f, o);
      return h ? `<tr class="${cls}"><th>${esc(label)}</th><td class="num">${h}</td></tr>` : '';
    };
    return `<table class="totals">
      ${r('Súčet riadkov', T.lines, '', { empty: true })}
      ${r('Zľavy na doklade', T.allowances)}
      ${r('Prirážky na doklade', T.charges)}
      ${r('Spolu bez DPH', T.net, 'sub', { empty: true })}
      ${r('DPH', D.taxTotal, '', { empty: true })}
      ${D.taxTotalAcc ? r('DPH v účtovnej mene', D.taxTotalAcc) : ''}
      ${r('Spolu s DPH', T.gross, 'sub', { empty: true })}
      ${r('Uhradené zálohy', T.prepaid)}
      ${r('Zaokrúhlenie', T.rounding)}
      ${r('K úhrade', T.payable, 'grand', { empty: true })}
    </table>`;
  }

  function attachmentsPaper(D) {
    if (!D.attachments.length) return '';
    const items = D.attachments.map(A => `<li>${fv(A.filename, { as: 'raw' }) || fv(A.id)}
      ${has(A.mime) ? `<span class="code">${fv(A.mime, { as: 'raw' })}</span>` : ''}
      ${A.info ? `<span class="muted small">${esc(U.fmtSize(A.info.size))}</span>` : ''}
      ${has(A.desc) ? '– ' + fv(A.desc) : ''} ${has(A.uri) ? fv(A.uri) : ''}
      <span class="muted small">ref. ${fv(A.id)}</span></li>`).join('');
    return `<section class="box att"><h4>Prílohy</h4><ul>${items}</ul></section>`;
  }

  function renderInvoice(doc) {
    const D = doc.model;
    if (!D) return `<div class="paper empty-paper"><p>Vizualizácia nie je k dispozícii.</p></div>`;
    const code = (D.typeCode.value || '').trim();
    const title = CODES.docTitle[code] || (D.isCN ? 'DOBROPIS' : 'FAKTÚRA');
    const notes = D.notes.map(f => `<p>${fv(f)}</p>`).join('');
    const pay = D.payments[0];
    const tdd = doc.tdd;
    return `<article class="paper">
      <header class="inv-head">
        <div>
          <div class="inv-title">${esc(title)}</div>
          <div class="inv-no">č. ${fv(D.number, { empty: true })}</div>
          <div class="inv-type">${fv(D.typeCode)}${has(D.currency) ? ' · mena ' + fv(D.currency) : ''}${has(D.taxCurrency) ? ' · účtovná mena DPH ' + fv(D.taxCurrency) : ''}</div>
        </div>
        <div class="inv-due">
          <div class="k">K úhrade</div>
          <div class="amt">${fv(D.totals.payable, { empty: true })}</div>
          ${has(D.dueDate) ? `<div class="k">splatné ${fv(D.dueDate)}</div>` : ''}
          ${pay && has(pay.account) ? `<div class="iban">${fv(pay.account, { as: 'iban' })}</div>` : ''}
        </div>
      </header>
      <div class="parties">${partyHtml('Dodávateľ', D.seller, 'seller')}${partyHtml('Odberateľ', D.buyer, 'buyer')}</div>
      <div class="grid2">${datesHtml(D)}${paymentHtml(D)}</div>
      ${refsHtml(D)}
      ${extraPartiesHtml(D)}
      ${notes ? `<section class="box notes"><h4>Poznámky</h4>${notes}</section>` : ''}
      ${linesHtml(D)}
      ${docAcHtml(D)}
      <div class="bottom">${vatHtml(D)}${totalsHtml(D)}</div>
      ${attachmentsPaper(D)}
      <footer class="inv-foot">
        <div>${mi('Špecifikácia', fv(D.customization, { empty: true }))}</div>
        <div>${mi('Proces', fv(D.profile, { empty: true }))}</div>
        ${tdd ? `<div><span class="mi"><span class="k">SK TDD UUID</span> <code title="UUIDv5 z: ${esc(tdd.name)}">${esc(tdd.uuid)}</code> <span class="muted small">(vypočítané, informatívne)</span></span></div>` : ''}
      </footer>
    </article>`;
  }

  /* ---------- XML zdroj ---------- */
  function tagSegments(s) {
    const out = [];
    const m0 = /^<\/?/.exec(s);
    let i = m0[0].length;
    out.push([m0[0], 'x-p']);
    const nm = /^[^\s/>]+/.exec(s.slice(i));
    if (nm) { out.push([nm[0], 'x-name']); i += nm[0].length; }
    while (i < s.length) {
      const rest = s.slice(i);
      let m;
      if ((m = /^\s+/.exec(rest))) out.push([m[0], '']);
      else if ((m = /^[^\s=/>"']+/.exec(rest))) out.push([m[0], 'x-an']);
      else if ((m = /^("[^"]*"?|'[^']*'?)/.exec(rest))) out.push([m[0], 'x-av']);
      else if ((m = /^(\/?>|=)/.exec(rest))) out.push([m[0], 'x-p']);
      else { m = [rest[0]]; out.push([m[0], 'x-p']); }
      i += m[0].length;
    }
    return out;
  }

  function renderXml(doc) {
    const P = doc.parsed, T = P.text;
    const lines = [];
    let cur = '', no = 1;
    const flush = () => { lines.push(`<div class="xl" data-l="${no}"><span class="ln">${no}</span><span class="lc">${cur || ' '}</span></div>`); cur = ''; };
    const emit = (text, cls, nid) => {
      const parts = text.split('\n');
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) { flush(); no++; }
        const p = parts[i].replace(/\r$/, '');
        if (p) cur += cls || nid >= 0 ? `<span${cls ? ` class="${cls}"` : ''}${nid >= 0 ? ` data-n="${nid}"` : ''}>${esc(p)}</span>` : esc(p);
      }
    };
    for (const tk of P.tokens) {
      const s = T.slice(tk.s, tk.e);
      if ((tk.t === 'text' || tk.t === 'cdata') && s.length > 400) {
        const nl = (s.match(/\n/g) || []).length;
        cur += `<span class="x-text" data-n="${tk.nid}">${esc(s.slice(0, 100).replace(/\s+/g, ' '))}</span><span class="x-trunc" data-n="${tk.nid}">… skrytých ${esc(U.fmtNum(s.length))} znakov${nl ? ' / ' + nl + ' riadkov' : ''}</span>`;
        if (nl) { flush(); no += nl; }
      } else if (tk.t === 'open' || tk.t === 'empty' || tk.t === 'close') {
        for (const [txt, cls] of tagSegments(s)) emit(txt, cls, tk.nid);
      } else {
        emit(s, tk.t === 'text' ? 'x-text' : 'x-' + tk.t, tk.nid);
      }
    }
    flush();
    return lines.join('');
  }

  /* ---------- nálezy ---------- */
  function findingLine(doc, f) {
    if (f.line) return f.line;
    if (f.node) return f.node.line;
    const fl = (f.fields || []).find(x => x.line);
    return fl ? fl.line : null;
  }

  function renderFindings(doc, filter) {
    const list = doc.findings.map((f, i) => ({ f, i })).filter(({ f }) =>
      filter === 'all' || (filter === 'err' && (f.flag === 'fatal' || f.flag === 'error')) || f.flag === filter);
    if (!doc.findings.length) {
      return doc.validation === 'running'
        ? '<div class="empty-state small">Prebieha validácia…</div>'
        : '<div class="empty-state ok">Žiadne nálezy – doklad vyhovuje všetkým kontrolám.</div>';
    }
    if (!list.length) return '<div class="empty-state small">Žiadne nálezy pre zvolený filter.</div>';
    return list.map(({ f, i }) => {
      const line = findingLine(doc, f);
      const chips = (f.fields || []).filter(x => !x.tech || f.source !== 'sk').slice(0, 8)
        .map(x => `<span class="chip" data-f="${x.id}">${esc(x.bt === 'TECH' ? x.label : x.bt)}${x.missing ? ' <i>chýba</i>' : ''}</span>`).join('');
      return `<div class="fd s-${f.flag}" data-fi="${i}">
        <div class="fd-h"><span class="sev">${SEV_LABEL[f.flag] || f.flag}</span><code>${esc(f.id)}</code><span class="src src-${f.source}">${SRC_LABEL[f.source] || f.source}</span>${line ? `<span class="ln-ref">riadok ${line}</span>` : ''}</div>
        <div class="fd-t">${esc(f.text)}</div>
        ${f.detail ? `<pre class="fd-d">${esc(f.detail)}</pre>` : ''}
        ${f.hint ? `<div class="fd-hint">${esc(f.hint)}</div>` : ''}
        ${f.translated ? `<details class="fd-en"><summary>Originálne znenie pravidla</summary><div>${esc(f.en)}</div>${f.test ? `<code class="test">${esc(f.test)}</code>` : ''}</details>` : (f.test ? `<details class="fd-en"><summary>Test pravidla (XPath)</summary><code class="test">${esc(f.test)}</code></details>` : '')}
        ${chips ? `<div class="fd-f">${chips}</div>` : ''}
      </div>`;
    }).join('');
  }

  /* ---------- mapovanie polí ---------- */
  function renderMapping(doc, q, showMissing) {
    const D = doc.model;
    if (!D) return '';
    const ql = (q || '').toLowerCase();
    const rows = D.fields.filter(f => (!f.missing || (showMissing && (f.important || f.sev) && !f.tech)))
      .filter(f => !ql || [f.bt, f.label, f.value, f.xpath].some(x => (x || '').toLowerCase().includes(ql)))
      .map(f => `<tr data-f="${f.id}" class="${f.missing ? 'missing' : ''}${sevCls(f)}">
        <td class="bt-c">${esc(f.bt === 'TECH' ? '—' : f.bt)}</td>
        <td>${esc(f.label)}</td>
        <td class="val">${f.missing ? '<i>chýba</i>' : esc(f.fmt === 'bin' ? '[base64]' : (f.value || '').slice(0, 160))}</td>
        <td class="xp"><code>${esc(f.xpath)}</code></td>
        <td class="num">${f.line || ''}</td></tr>`).join('');
    const un = D.unmapped.filter(n => !ql || n.name.toLowerCase().includes(ql) || (n.text || '').toLowerCase().includes(ql))
      .map(n => `<tr data-n="${n.nid}"><td class="bt-c">?</td><td><code>${esc(n.name)}</code></td><td class="val">${esc((n.text || '').trim().slice(0, 160))}</td><td class="xp"><code>${esc(Model.absPath(n))}</code></td><td class="num">${n.line}</td></tr>`).join('');
    return `<table class="map"><thead><tr><th>BT</th><th>Obchodný termín (FS SR)</th><th>Hodnota</th><th>XPath v XML</th><th class="num">Riadok</th></tr></thead><tbody>${rows}</tbody></table>
      ${un ? `<h4 class="sec">Elementy bez priradeného BT (${D.unmapped.length})</h4><p class="muted small">Elementy, ktoré nástroj nevie priradiť k obchodnému termínu Peppol BIS 3.0 – napr. rozšírenia alebo nepodporované elementy (overte nálezy UBL-CR).</p>
        <table class="map"><tbody>${un}</tbody></table>` : ''}`;
  }

  /* ---------- prílohy ---------- */
  function renderAttachments(doc) {
    const D = doc.model;
    if (!D || !D.attachments.length) return '<div class="empty-state small">Doklad nemá prílohy (BG-24).</div>';
    return D.attachments.map((A, i) => {
      const embedded = !!A.bin.raw;
      return `<div class="att-card" data-ai="${i}">
        <div class="att-h"><b>${esc(A.filename.value || A.id.value || 'príloha')}</b> ${has(A.mime) ? `<span class="code">${esc(A.mime.value)}</span>` : ''} ${A.info ? `<span class="muted small">${esc(U.fmtSize(A.info.size))}</span>` : ''}</div>
        <div class="small">${kv('ID (BT-122)', fv(A.id))}${kv('Popis (BT-123)', fv(A.desc))}${kv('Externý odkaz (BT-124)', has(A.uri) ? `<a href="${esc(A.uri.value)}" target="_blank" rel="noopener">${esc(A.uri.value)}</a>` : '')}</div>
        ${embedded ? `<div class="att-act"><button class="btn" data-att="preview" data-ai="${i}">Náhľad</button><button class="btn" data-att="open" data-ai="${i}">Otvoriť v novom okne</button><button class="btn" data-att="download" data-ai="${i}">Stiahnuť</button></div><div class="att-prev" id="att-prev-${i}"></div>` : ''}
      </div>`;
    }).join('');
  }

  /* ---------- inšpektor ---------- */
  function btInfoHtml(bt) {
    const I = (window.SK_BT || {})[bt];
    if (!I) return '';
    return `<details class="ins-more"><summary>Popis termínu (EN 16931 / FS SR)</summary>
      ${I.d ? `<p>${esc(I.d)}</p>` : ''}
      ${I.u ? `<p class="muted">${esc(I.u).replace(/\n/g, '<br>')}</p>` : ''}
      ${I.r ? `<p><b>Povinnosť podľa SK legislatívy:</b> ${esc(I.r)}${I.law ? ` <span class="muted">(${esc(I.law)})</span>` : ''}</p>` : ''}
      ${I.x ? `<p class="small">${esc(I.x).replace(/\n/g, '<br>')}</p>` : ''}
      ${I.url ? `<p><a href="${esc(I.url)}" target="_blank" rel="noopener">Dokumentácia Peppol BIS 3.0 ↗</a></p>` : ''}
    </details>`;
  }

  function insFindings(doc, list) {
    if (!list.length) return '';
    return `<div class="ins-fd">${list.map(f => `<div class="mini-fd s-${f.flag}" data-fi="${doc.findings.indexOf(f)}"><span class="sev">${SEV_LABEL[f.flag]}</span> <code>${esc(f.id)}</code> ${esc(f.text)}</div>`).join('')}</div>`;
  }

  function renderInspector(doc, sel) {
    if (!doc || !sel) {
      return `<div class="ins-empty">Kliknite na ľubovoľný údaj vo faktúre – zobrazí sa, z ktorého elementu XML pochádza (BT kód, XPath, riadok).</div>`;
    }
    if (sel.type === 'field') {
      const f = doc.model.fields[sel.id];
      const grp = f.group && (window.SK_BT || {})[f.group];
      const formatted = f.missing ? '' : fmtValue(f);
      return `<div class="ins-h"><span class="ins-bt">${esc(f.bt === 'TECH' ? 'technický' : f.bt)}</span><b>${esc(f.label)}</b>${grp ? `<span class="grp">${esc(f.group)} · ${esc(grp.n)}</span>` : ''}</div>
        <div class="ins-row"><span class="k">Hodnota</span><span class="v">${f.missing ? '<i>Element v XML chýba</i>' : formatted}</span></div>
        ${!f.missing && f.fmt !== 'bin' && f.raw !== null ? `<div class="ins-row"><span class="k">Text v XML</span><code class="raw">${esc(f.raw)}</code></div>` : ''}
        ${f.fixed ? `<div class="ins-row"><span class="k">Správne asi</span><span class="v fixed-v">${esc(f.fixed)}</span></div>` : ''}
        <div class="ins-row"><span class="k">${f.missing ? 'Očakávané v' : 'XPath'}</span><code class="xp">${esc(f.xpath)}</code><button class="btn tiny" data-copy="${esc(f.xpath)}">Kopírovať</button></div>
        <div class="ins-row"><span class="k">Riadok</span><span class="v">${f.line ? `<a href="#" data-goto-line="${f.line}">${f.line}</a> <span class="muted small">(zobraziť v XML)</span>` : '—'}</span></div>
        ${insFindings(doc, f.findings)}
        ${btInfoHtml(f.bt)}`;
    }
    if (sel.type === 'node') {
      const n = doc.parsed.nodes[sel.id];
      const attrs = n.attrs.filter(a => a.prefix !== 'xmlns' && a.name !== 'xmlns').map(a => `<code>${esc(a.name)}="${esc(a.value)}"</code>`).join(' ');
      const txt = (n.text || '').trim();
      return `<div class="ins-h"><span class="ins-bt">element</span><b>${esc(n.name)}</b></div>
        ${txt && !n.children.length ? `<div class="ins-row"><span class="k">Hodnota</span><code class="raw">${esc(txt.slice(0, 300))}${txt.length > 300 ? '…' : ''}</code></div>` : ''}
        ${attrs ? `<div class="ins-row"><span class="k">Atribúty</span><span class="v">${attrs}</span></div>` : ''}
        <div class="ins-row"><span class="k">XPath</span><code class="xp">${esc(Model.absPath(n))}</code><button class="btn tiny" data-copy="${esc(Model.absPath(n))}">Kopírovať</button></div>
        <div class="ins-row"><span class="k">Riadky</span><span class="v">${n.line}${n.endLine !== n.line ? '–' + n.endLine : ''}</span></div>
        ${n.children.length ? '' : '<div class="muted small">Tento element nemá v nástroji priradený obchodný termín (BT).</div>'}`;
    }
    if (sel.type === 'finding') {
      const f = doc.findings[sel.id];
      const line = findingLine(doc, f);
      return `<div class="ins-h"><span class="ins-bt s-${f.flag}">${SEV_LABEL[f.flag]}</span><b>${esc(f.id)}</b><span class="grp">${SRC_LABEL[f.source]}</span></div>
        <div class="ins-row"><span class="v">${esc(f.text)}</span></div>
        ${f.location ? `<div class="ins-row"><span class="k">Miesto</span><code class="xp">${esc(f.node ? Model.absPath(f.node, f.attr) : f.location)}</code></div>` : ''}
        ${line ? `<div class="ins-row"><span class="k">Riadok</span><a href="#" data-goto-line="${line}">${line}</a></div>` : ''}
        ${(f.fields || []).length ? `<div class="ins-row"><span class="k">Polia</span><span class="v">${f.fields.slice(0, 12).map(x => `<span class="chip" data-f="${x.id}">${esc(x.bt === 'TECH' ? x.label : x.bt + ' ' + x.label)}</span>`).join(' ')}</span></div>` : ''}`;
    }
    return '';
  }

  /* ---------- stav ---------- */
  function counts(list) {
    const c = { err: 0, warning: 0, info: 0 };
    for (const f of list) {
      if (f.flag === 'fatal' || f.flag === 'error') c.err++;
      else if (f.flag === 'warning') c.warning++;
      else c.info++;
    }
    return c;
  }
  const cTxt = c => `${c.err} ${U.plural(c.err, 'chyba', 'chyby', 'chýb')} · ${c.warning} ${U.plural(c.warning, 'upozornenie', 'upozornenia', 'upozornení')}${c.info ? ` · ${c.info} info` : ''}`;

  function renderStatus(doc) {
    const off = doc.findings.filter(f => f.source === 'cen' || f.source === 'peppol');
    const sk = doc.findings.filter(f => f.source === 'sk');
    const co = counts(off), cs = counts(sk);
    const xmlBad = doc.findings.some(f => f.source === 'xml' && f.flag === 'fatal');
    let offCls, offTxt;
    if (doc.validation === 'running' || doc.validation === 'pending') { offCls = 'run'; offTxt = 'Prebieha validácia…'; }
    else if (doc.validation === 'error') { offCls = 'bad'; offTxt = 'Validáciu sa nepodarilo spustiť'; }
    else if (doc.validation === 'skipped') { offCls = 'bad'; offTxt = 'Nevalidované'; }
    else if (co.err) { offCls = 'bad'; offTxt = 'NEVYHOVUJE'; }
    else if (xmlBad) { offCls = 'bad'; offTxt = 'NEVYHOVUJE – poškodené XML'; }
    else { offCls = 'ok'; offTxt = co.warning ? 'VYHOVUJE (s upozorneniami)' : 'VYHOVUJE'; }
    const offSub = doc.validation === 'done'
      ? (xmlBad ? 'Pravidlá na opravenej kópii: ' : '') + cTxt(co) + ` · ${esc(RULES_META.label)}`
      : esc(doc.validationError || (doc.validation === 'skipped' ? 'XML nie je možné spracovať' : ''));
    const skCls = cs.err ? 'bad' : cs.warning ? 'warn' : 'ok';
    const D = doc.model;
    const meta = D ? [
      esc(U.codeLabel('doc', D.typeCode.value) || D.typeCode.value || ''),
      D.number.value ? 'č. ' + esc(D.number.value) : '',
      D.totals.payable.value ? esc(U.fmtAmount(D.totals.payable.value, D.totals.payable.cur)) : '',
      D.seller.name.value ? esc(D.seller.name.value) + ' → ' + esc(D.buyer.name.value || '?') : ''
    ].filter(Boolean).join(' · ') : '';
    return `<div class="st-row ${offCls}"><span class="st-dot"></span><div><div class="st-t">Peppol BIS 3.0 / EN 16931: <b>${offTxt}</b></div>
        <div class="st-s">${offSub}</div></div></div>
      <div class="st-row ${skCls}"><span class="st-dot"></span><div><div class="st-t">SK kontroly (FS SR / PASR): <b>${cs.err ? 'nájdené chyby' : cs.warning ? 'upozornenia' : 'bez problémov'}</b></div>
        <div class="st-s">${cTxt(cs)}</div></div></div>
      ${xmlBad ? `<div class="st-row bad"><span class="st-dot"></span><div><div class="st-t"><b>XML súbor je poškodený</b>${doc.repaired ? ' – zobrazený je opravený náhľad' : ''}</div><div class="st-s">Takýto súbor by prístupový bod Peppol odmietol.</div></div></div>` : ''}
      ${meta ? `<div class="st-meta">${meta}</div>` : ''}`;
  }

  return {
    setOpts, renderInvoice, renderXml, renderFindings, renderMapping, renderAttachments,
    renderInspector, renderStatus, counts, SEV_RANK
  };
})();
