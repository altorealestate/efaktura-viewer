'use strict';
/*
 * Interné SK kontroly (nad rámec oficiálnych pravidiel CEN/Peppol).
 * Zdroje: PASR SK (Finančné riaditeľstvo SR, 23. 1. 2026), workbook FS SR
 * „Transpozície štandardu Peppol BIS v podmienkach SK legislatívy“ v1.12 (14. 10. 2026),
 * FAQ eFaktúra FS SR (12. 10. 2026), zákon č. 222/2004 Z. z. (§ 19, § 27, § 69, § 74, § 85o), Obchodný zákonník § 3a.
 */
const SK = (() => {
  /* ---------- mojibake (UTF-8 dekódované ako Windows-1250/1252 alebo ISO-8859-1) ---------- */
  const REV = {};
  function rev(cp) {
    if (!REV[cp]) {
      const m = new Map();
      if (cp === 'latin1') for (let b = 0x80; b <= 0xff; b++) m.set(b, b);
      else (window.CODEPAGES[cp] || []).forEach((u, i) => { if (!m.has(u)) m.set(u, 0x80 + i); });
      REV[cp] = m;
    }
    return REV[cp];
  }
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  const CP_NAME = { cp1250: 'Windows-1250', cp1252: 'Windows-1252', latin1: 'ISO-8859-1' };
  // výsledok opravy musí vyzerať ako text: latinka s diakritikou, interpunkcia, €, ™ (nie kombinujúce znaky,
  // azbuka, ani riadiace C1) – napr. správne „KRÍŽNA“ by inak „opravilo“ na „KR͎NA“
  const PLAUSIBLE = /^[\u00a0-\u017f\u0218-\u021b\u02c7\u02d8-\u02dd\u2010-\u2027\u2030-\u205e\u20ac\u2116\u2122]+$/u;
  const isUpper = ch => !!ch && ch !== ch.toLowerCase() && ch === ch.toUpperCase();
  const isLower = ch => !!ch && ch !== ch.toUpperCase() && ch === ch.toLowerCase();

  function fixRun(run) {
    for (const cp of ['cp1250', 'cp1252', 'latin1']) {
      const r = rev(cp);
      const bytes = [];
      let ok = true;
      for (const ch of run) {
        const c = ch.codePointAt(0);
        if (r.has(c)) bytes.push(r.get(c)); else { ok = false; break; }
      }
      if (!ok) continue;
      let out;
      try { out = utf8.decode(new Uint8Array(bytes)); } catch (_) { continue; }
      if (out.length < run.length && PLAUSIBLE.test(out)) return { text: out, cp };
    }
    return null;
  }

  /**
   * Oprava po úsekoch ne-ASCII znakov (správne časti textu ostanú), opakovane pri dvojitom prekódovaní.
   * Vracia { text, cp, n } (n = počet opravených znakov) alebo null.
   */
  function fixMojibake(s) {
    if (!s || !/[\u0080-\uffff]/.test(s)) return null;
    let cur = s, cp = null, n = 0;
    for (let pass = 0; pass < 3; pass++) {
      let changed = false;
      cur = cur.replace(/[\u0080-\uffff]{2,}/g, (run, at, str) => {
        const fx = fixRun(run);
        if (!fx) return run;
        // malé písmeno uprostred slova veľkými písmenami („SPÄŤ“ → „SPč“) je správny text, nie mojibake
        const nb = [str[at - 1], str[at + run.length]].filter(ch => isUpper(ch) || isLower(ch));
        if (nb.length && nb.every(isUpper) && [...fx.text].some(isLower)) return run;
        changed = true; cp = cp || fx.cp; n += fx.text.length;
        return fx.text;
      });
      if (!changed) break;
    }
    return cur !== s ? { text: cur, cp, n } : null;
  }

  /* ---------- identifikátory ---------- */
  function ibanCheck(iban) {
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return { ok: false, reason: 'nesprávny formát' };
    const cc = iban.slice(0, 2);
    const L = own(IBAN_LEN, cc);
    if (L && iban.length !== L) return { ok: false, reason: `má ${iban.length} znakov, pre ${cc} sa očakáva ${L}` };
    const r = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, ch => String(ch.charCodeAt(0) - 55));
    let m = 0;
    for (const d of r) m = (m * 10 + (+d)) % 97;
    if (m !== 1) return { ok: false, reason: 'nesprávny kontrolný súčet (mod 97)' };
    if (!L) return { ok: false, unknown: true, reason: `kód krajiny ${cc} nie je v registri IBAN` };
    return { ok: true };
  }
  const BIC_RE = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
  const skVatOk = v => /^SK[1-9]\d{9}$/.test(v) && Number(v.slice(2)) % 11 === 0;

  const country = P => ((P && P.addr && P.addr.country && P.addr.country.value) || '').toUpperCase();
  const vatSK = P => !!P && /^SK/i.test(((P.vat && P.vat.value) || '').trim());
  /** Subjekt usadený v SR (krajina SK, prípadne bez krajiny so slovenským Peppol ID / IČ DPH). */
  function isSK(P) {
    if (!P) return false;
    const c = country(P);
    if (c) return c === 'SK';
    const sch = P.endpointScheme && P.endpointScheme.value;
    return sch === '0245' || sch === '9950' || vatSK(P);
  }
  function dicOf(P) {
    if (P.taxReg && /^\d{10}$/.test((P.taxReg.value || '').trim())) return { v: P.taxReg.value.trim(), src: 'BT-32' };
    const v = ((P.vat && P.vat.value) || '').replace(/\s/g, '').toUpperCase();
    if (/^SK\d{10}$/.test(v)) return { v: v.slice(2), src: 'vat' };
    const ep = ((P.endpoint && P.endpoint.value) || '').replace(/\s/g, '').toUpperCase();
    if (/^(SK)?\d{10}$/.test(ep)) return { v: ep.replace(/^SK/, ''), src: 'ep' };
    return null;
  }

  /* ---------- SHA-1 + UUIDv5 (identifikátor faktúry pre SK TDD) ---------- */
  function sha1(bytes) {
    const ml = bytes.length;
    const buf = new Uint8Array(((ml + 9 + 63) >> 6) << 6);
    buf.set(bytes);
    buf[ml] = 0x80;
    const dv = new DataView(buf.buffer);
    const bits = ml * 8;
    dv.setUint32(buf.length - 4, bits >>> 0);
    dv.setUint32(buf.length - 8, Math.floor(bits / 4294967296));
    let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
    const w = new Uint32Array(80);
    for (let off = 0; off < buf.length; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 80; i++) { const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = (x << 1) | (x >>> 31); }
      let a = h0, b = h1, c = h2, d = h3, e = h4;
      for (let i = 0; i < 80; i++) {
        let f, k;
        if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
        else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
        else { f = b ^ c ^ d; k = 0xCA62C1D6; }
        const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
        e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = t;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
    }
    const out = new Uint8Array(20);
    const odv = new DataView(out.buffer);
    [h0, h1, h2, h3, h4].forEach((h, i) => odv.setUint32(i * 4, h));
    return out;
  }
  function uuid5(nsStr, name) {
    const ns = nsStr.replace(/-/g, '').match(/../g).map(h => parseInt(h, 16));
    const nb = new TextEncoder().encode(name);
    const buf = new Uint8Array(16 + nb.length);
    buf.set(ns);
    buf.set(nb, 16);
    const h = sha1(buf).slice(0, 16);
    h[6] = (h[6] & 0x0f) | 0x50;
    h[8] = (h[8] & 0x3f) | 0x80;
    const x = [...h].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
  }
  const TDD_NS = '3fd00464-9f15-52ce-8cdc-6dd374d5ad42';
  function tddUuid(D) {
    const parts = [D.seller.endpointScheme && D.seller.endpointScheme.value, D.seller.endpoint && D.seller.endpoint.value,
      D.typeCode.value, D.number.value, D.issueDate.value].map(v => (v || '').trim());
    if (parts.some(p => !p)) return null;
    const name = parts.join(' ');
    return { uuid: uuid5(TDD_NS, name), name };
  }

  /* ---------- prílohy ---------- */
  function attachmentInfo(b64raw) {
    const b64 = (b64raw || '').replace(/\s+/g, '');
    const ok = XSD.base64Ok(b64);
    const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
    const size = Math.max(0, b64.length * 3 / 4 - pad);
    let head = '';
    try { head = atob(b64.slice(0, 12)); } catch (_) { /* neplatné base64 */ }
    return { ok, size, isPdf: head.startsWith('%PDF'), isPng: head.startsWith('\x89PNG'), isJpg: head.startsWith('\xff\xd8\xff') };
  }

  /* ---------- sadzby DPH v SR (§ 27 zákona o DPH) ---------- */
  const ratesAt = date => (date >= '2025-01-01' ? [23, 19, 5] : [20, 10, 5]);
  // právne formy zapisované do obchodného registra (§ 3a ObZ: na obchodných listinách sa uvádza zápis)
  const OR_FORM = /\b(s\.\s?r\.\s?o\.?|spol\.\s?s\s?r\.\s?o\.?|a\.\s?s\.|j\.\s?s\.\s?a\.|k\.\s?s\.|v\.\s?o\.\s?s\.|družstvo)(?=$|[\s,.)])/i;

  /* ---------- kontroly ---------- */
  const PAY_TRANSFER = ['30', '31', '42', '58'];
  const SK_CATS = ['S', 'Z', 'E', 'AE', 'K', 'G', 'O'];
  const CORRECTIVE_INV = ['80', '84', '383', '384', '527'];

  function run(D) {
    const out = [];
    const add = (id, flag, text, o = {}) => out.push(Object.assign({ id, flag, source: 'sk', text }, o, { fields: (o.fields || []).filter(Boolean) }));
    const S = D.seller, B = D.buyer;
    const skSeller = isSK(S) || vatSK(S);                       // slovenský dodávateľ (usadený alebo platiteľ DPH v SR)
    const skVatSeller = vatSK(S) || vatSK(D.taxRep) || (isSK(S) && !(S.vat && S.vat.value));
    const type = (D.typeCode.value || '').trim();
    const negative = Number(D.totals.payable.value) < 0 || Number(D.totals.net.value) < 0;
    const corrective = D.isCN || CORRECTIVE_INV.includes(type);

    // 1) poškodená diakritika – kontroluje sa surový text (orezanie by odstránilo NBSP z bajtu „Š“ = C5 A0)
    const moj = [];
    for (const f of D.fields) {
      if (!f.raw || f.fmt === 'bin') continue;
      const fx = fixMojibake(f.raw);
      if (fx) { f.fixed = fx.text.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, ''); moj.push({ f, fx }); }
    }
    if (moj.length) {
      const strong = moj.length > 1 || moj.some(m => m.fx.n > 1);
      add('SK-ENC-01', strong ? 'error' : 'warning',
        `Poškodená diakritika v ${moj.length} ${U.plural(moj.length, 'poli', 'poliach', 'poliach')} – text bol pri exporte chybne prekódovaný (UTF-8 čítané ako ${CP_NAME[moj[0].fx.cp]}).`,
        {
          fields: moj.map(m => m.f),
          detail: moj.map(m => `${m.f.bt === 'TECH' ? '' : m.f.bt + ' '}${m.f.label}: „${m.f.value}“ → „${m.f.fixed}“`).join('\n'),
          hint: 'Súbor je technicky platný, ale texty sú v ňom uložené poškodené. Rovnako sa zobrazia príjemcovi aj vo výkaze pre FS. Oprava musí byť v exporte z ERP (dvojité prekódovanie).' +
            (strong ? '' : ' Zmena sa týka len jedného znaku – overte, či ide naozaj o chybu.')
        });
    }

    // 2) Peppol ID (EndpointID) slovenských subjektov
    for (const [P, bt, who] of [[S, 'BT-34', 'predávajúceho'], [B, 'BT-49', 'kupujúceho']]) {
      if (!P.endpoint || P.endpoint.missing) continue;
      const sch = ((P.endpointScheme && P.endpointScheme.value) || '').trim();
      const v = (P.endpoint.value || '').trim();
      if (isSK(P) && sch !== '0245') {
        const dic = dicOf(P);
        add('SK-PEPPOL-01', 'error',
          `Elektronická adresa ${who} (${bt}) je „${sch}:${v}“. Slovenské subjekty musia byť v sieti Peppol identifikované schémou 0245:DIČ (PASR SK).`,
          {
            fields: [P.endpoint, P.endpointScheme],
            detail: !dic ? 'Uveďte 10-miestne DIČ so schemeID="0245".'
              : `Očakávaná hodnota: <cbc:EndpointID schemeID="0245">${dic.v}</cbc:EndpointID>` +
                (dic.src === 'BT-32' ? ' (DIČ z BT-32)' : ' (odvodené z IČ DPH – člen skupiny DPH uvádza svoje vlastné DIČ, nie číslo skupiny)'),
            hint: 'FAQ FS SR (časť II, príklad č. 23): „Slovenské daňové subjekty podľa PASR musia mať schému 0245:DIČ a nie 9950.“ Doklad adresovaný na 9950 nemusí byť v centrálnom SK SMP doručiteľný.'
          });
      } else if (!isSK(P) && vatSK(P) && sch !== '0245' && country(P)) {
        add('SK-PEPPOL-04', 'info', `${who === 'predávajúceho' ? 'Predávajúci' : 'Kupujúci'} má slovenské IČ DPH, ale sídlo v krajine ${country(P)} – používa vlastné Peppol ID „${sch}:${v}“. Zahraničná osoba registrovaná na DPH v SR (§ 5) nemusí mať schému 0245.`, { fields: [P.endpoint] });
      }
      if (sch === '0245' && !/^\d{10}$/.test(v)) {
        add('SK-PEPPOL-02', 'error', `Peppol ID ${who} so schémou 0245 musí byť 10-miestne DIČ bez predpony „SK“ (aktuálne „${v}“).`, { fields: [P.endpoint] });
      }
      if (sch === '0245' && /^\d{10}$/.test(v) && P.vat && /^SK\d{10}$/.test(P.vat.value || '') && P.vat.value.slice(2) !== v) {
        add('SK-PEPPOL-03', 'info', `DIČ v Peppol ID ${who} (${v}) sa nezhoduje s IČ DPH (${P.vat.value}). Pri skupine DPH je to v poriadku (FAQ FS SR, časť I, príklady č. 78–80), inak skontrolujte.`, { fields: [P.endpoint, P.vat] });
      }
    }

    // 3) IČ DPH
    for (const [f, who] of [[S.vat, 'predávajúceho'], [B.vat, 'kupujúceho'], [D.taxRep && D.taxRep.vat, 'daňového zástupcu']]) {
      if (!f || !f.value || !/^SK/i.test(f.value)) continue;
      const v = f.value.replace(/\s/g, '').toUpperCase();
      if (!skVatOk(v)) add('SK-ID-01', 'error', `IČ DPH ${who} (${f.bt}) „${f.value}“ nemá platný tvar SK + 10 číslic alebo neprešlo kontrolou deliteľnosti 11.`, { fields: [f] });
    }
    if (skVatSeller && isSK(B) && B.vat && B.vat.missing) {
      const cats = D.vat.map(V => V.cat.value).concat(D.lines.map(L => L.cat.value));
      if (cats.includes('AE')) {
        add('SK-ID-05', 'error', 'Pri prenesení daňovej povinnosti v tuzemsku (kategória DPH AE, § 69 ods. 12 zákona o DPH) musí faktúra obsahovať IČ DPH odberateľa (BT-48) – § 74 ods. 1 písm. b).', { fields: [B.vat] });
      } else if (!corrective) {
        add('SK-ID-06', 'info', 'Nie je uvedené IČ DPH kupujúceho (BT-48). Ak je odberateľ platiteľ DPH, je to povinný údaj faktúry (§ 74 ods. 1 písm. b) zákona o DPH) a FS ho používa pri spracovaní údajov z faktúry.', { fields: [B.vat] });
      }
    }

    // 4) IČO (BT-30 / BT-47)
    for (const [P, bt, who] of [[S, 'BT-30', 'predávajúceho'], [B, 'BT-47', 'kupujúceho']]) {
      if (!isSK(P) || !P.legalId) continue;
      const f = P.legalId;
      if (f.missing) {
        add('SK-ID-02', 'warning', `Chýba IČO ${who} (${bt} – identifikátor zákonnej registrácie). FS SR: vyžaduje sa, ak bolo subjektu IČO pridelené.`, { fields: [f] });
        continue;
      }
      const v = f.value.replace(/\s/g, '');
      if (/^SK/i.test(v) || /^\d{10}$/.test(v)) {
        add('SK-ID-03', 'warning', `${bt} (${who}) obsahuje „${f.value}“ – to je IČ DPH/DIČ, nie IČO. Do ${bt} patrí IČO (8 číslic) so schemeID="0158".`, { fields: [f] });
      } else if (!/^\d{8}$/.test(v)) {
        add('SK-ID-03', 'warning', `${bt} (${who}) „${f.value}“ nemá tvar slovenského IČO (8 číslic).`, { fields: [f] });
      }
      const sch = P.legalIdScheme && P.legalIdScheme.value;
      if (sch && sch !== '0158') add('SK-ID-04', 'info', `Schéma identifikátora ${bt} je „${sch}“. Pre slovenské IČO je v číselníku ICD kód 0158.`, { fields: [P.legalIdScheme] });
      else if (!sch && /^\d{8}$/.test(v)) add('SK-ID-04', 'warning', `Pri IČO ${who} (${bt}) chýba schemeID="0158" (${bt}-1). FS SR: vyžaduje sa, ak bolo subjektu IČO pridelené.`, { fields: [f, P.legalIdScheme] });
    }

    // 5) zákonné náležitosti predávajúceho
    if (isSK(S) && S.legalInfo && S.legalInfo.missing) {
      const inOR = OR_FORM.test(S.name.value || '') || OR_FORM.test((S.trade && S.trade.value) || '');
      add('SK-LEG-01', inOR ? 'warning' : 'info',
        inOR
          ? 'Chýbajú dodatočné právne údaje predávajúceho (BT-33). Podnikateľ zapísaný v obchodnom registri uvádza na obchodných listinách označenie registra a číslo zápisu (§ 3a Obchodného zákonníka).'
          : 'Nie sú uvedené dodatočné právne údaje predávajúceho (BT-33). Ak je predávajúci podnikateľ zapísaný v obchodnom, živnostenskom alebo inom registri, § 3a Obchodného zákonníka vyžaduje označenie registra a číslo zápisu (neplatí napr. pre obce či fyzické osoby, ktoré nie sú podnikateľmi).',
        {
          fields: [S.legalInfo],
          hint: 'Vzor podľa FS SR (FAQ, časť II, príklad č. 34): „<Spoločnosť s ručením obmedzeným> zapísaná do <Obchodného registra Okresného súdu Žilina>, oddiel <s.r.o.>, vložka číslo <číslo vložky> zo dňa <DD.MM.RRRR>“.'
        });
    }
    if (!corrective) {
      for (const [P, who] of [[S, 'predávajúceho'], [B, 'kupujúceho']]) {
        if (!P.addr || !(skSeller || isSK(P))) continue;
        const miss = ['street', 'city', 'zip'].map(k => P.addr[k]).filter(f => f && f.missing);
        if (miss.length) add('SK-LEG-02', 'warning', `Neúplná adresa ${who}: chýba ${miss.map(f => f.bt + ' ' + f.label.toLowerCase()).join(', ')}. Zákon o DPH (§ 74 ods. 1 písm. a, b) vyžaduje adresu na faktúre.`, { fields: miss });
      }
    }

    // 6) DUZP
    // dátum RRRR-MM-DD (prípadná časová zóna sa ignoruje); neplatný formát rieši kontrola schémy
    const iso = v => { const m = /^(\d{4}-\d{2}-\d{2})(Z|[+-]\d{2}:\d{2})?$/.exec((v || '').trim()); return m ? m[1] : null; };
    const issue = iso(D.issueDate.value);
    if (skSeller && !corrective && D.taxPointDate.missing) {
      const dd = D.delivery.date && iso(D.delivery.date.value);
      const pe = D.period.end && iso(D.period.end.value);
      if (dd && issue && dd !== issue) {
        add('SK-DATE-01', 'warning',
          `Dátum dodania (BT-72: ${U.fmtDate(dd)}) sa líši od dátumu vyhotovenia (BT-2: ${U.fmtDate(issue)}), ale DUZP (BT-7 TaxPointDate) nie je uvedený.`,
          { fields: [D.taxPointDate, D.delivery.date, D.issueDate], hint: 'FS SR: BT-7 sa uvádza, ak je DUZP známy a líši sa od dátumu vyhotovenia (§ 74 ods. 1 písm. d) zákona o DPH).' });
      } else if (!dd && pe && issue && pe !== issue) {
        add('SK-DATE-01', 'info',
          `Faktúra uvádza fakturačné obdobie (koniec BT-74: ${U.fmtDate(pe)}), ale nie DUZP (BT-7). Overte, či sa DUZP líši od dátumu vyhotovenia (BT-2: ${U.fmtDate(issue)}) – ak áno, uvádza sa v BT-7.`,
          { fields: [D.taxPointDate, D.period.end, D.issueDate], hint: 'Pri opakovanom plnení je DUZP najneskôr posledný deň obdobia (§ 19 ods. 3 zákona o DPH). Pri elektrine, plyne, vode a teple fakturovaných popri nájomnom je DUZP dňom vyhotovenia faktúry (§ 19 ods. 3 písm. c)) – vtedy sa BT-7 neuvádza.' });
      }
    }
    if (skSeller && D.period.code && !D.period.code.missing) {
      add('SK-DATE-02', 'warning', 'Kód dátumu DUZP (BT-8) sa v SK nepoužíva – FS SR odporúča uvádzať priamo dátum BT-7 TaxPointDate.', { fields: [D.period.code] });
    }
    const due = iso(D.dueDate.value);
    if (due && issue && due < issue) {
      add('SK-DATE-03', 'warning', `Dátum splatnosti (${U.fmtDate(due)}) je skôr ako dátum vyhotovenia (${U.fmtDate(issue)}).`, { fields: [D.dueDate, D.issueDate] });
    }

    // 7) platobné údaje
    for (const P of D.payments) {
      const code = (P.code.value || '').trim();
      const acc = P.account, bic = P.bic;
      const accV = (acc.value || '').replace(/\s/g, '').toUpperCase();
      let ibanCC = null, bank = null;
      if (accV) {
        if (/^[A-Z]{2}\d{2}/.test(accV)) {
          const r = ibanCheck(accV);
          if (!r.ok) add('SK-PAY-01', r.unknown ? 'warning' : 'error', `IBAN (BT-84) „${acc.value}“ je neplatný – ${r.reason}.`, { fields: [acc] });
          else {
            ibanCC = accV.slice(0, 2);
            if (ibanCC === 'SK') {
              const bc = accV.slice(4, 8);
              const B0 = own(SK_BANKS, bc);
              bank = B0 ? { code: bc, bic: B0[0], name: B0[1] } : { code: bc };
              if (!B0) add('SK-PAY-10', 'info', `Kód banky ${bc} v IBAN (BT-84) nie je v číselníku NBS (${SK_BANKS_VER}). Overte číslo účtu.`, { fields: [acc] });
            }
          }
        } else if (skSeller && PAY_TRANSFER.includes(code)) {
          add('SK-PAY-09', 'info', `Číslo účtu (BT-84) „${acc.value}“ nie je vo formáte IBAN.`, { fields: [acc] });
        }
      } else if (PAY_TRANSFER.includes(code)) {
        add('SK-PAY-08', 'warning', `Pri platbe prevodom (kód ${code}) chýba číslo účtu príjemcu (BT-84). FS SR: číslo účtu dodávateľa je povinné.`, { fields: [acc] });
      }
      const bicV = (bic.value || '').replace(/\s/g, '').toUpperCase();
      if (bicV) {
        if (!BIC_RE.test(bicV)) {
          add('SK-PAY-02', 'warning',
            `BT-86 (BIC/SWIFT) obsahuje „${bic.value}“ – to nie je platný BIC (8 alebo 11 znakov, napr. GIBASKBX).` +
            (bank && bank.bic ? ` Podľa IBAN (kód banky ${bank.code} – ${bank.name}) by mal byť ${bank.bic}.` : ''),
            {
              fields: [bic],
              detail: 'Zdroj v XML: cac:PaymentMeans/cac:PayeeFinancialAccount/cac:FinancialInstitutionBranch/cbc:ID',
              hint: 'Každý prehliadač (aj online validátory) zobrazí ako SWIFT práve hodnotu z tohto elementu. Ak tam ERP zapisuje iný údaj (napr. kód banky alebo poradové číslo bankového účtu), treba opraviť mapovanie v exporte.'
            });
        } else if (ibanCC && bicV.slice(4, 6) !== ibanCC) {
          add('SK-PAY-03', 'warning', `Krajina v BIC (${bicV.slice(4, 6)}) nezodpovedá krajine IBAN (${ibanCC}).`, { fields: [bic, acc] });
        } else if (bank && bank.bic && bicV.slice(0, 8) !== bank.bic.slice(0, 8)) {
          add('SK-PAY-03', 'warning', `BIC ${bicV} nezodpovedá banke podľa IBAN (kód ${bank.code} – ${bank.name}, BIC ${bank.bic}).`, { fields: [bic, acc] });
        }
      } else if (bank && bank.bic && PAY_TRANSFER.includes(code)) {
        add('SK-PAY-04', 'info', `BIC (BT-86) nie je uvedený. Podľa IBAN ide o ${bank.name} – BIC ${bank.bic}.`, { fields: [bic] });
      }
      const pids = P.paymentId.filter(f => !f.missing);
      if (skSeller && !pids.length && PAY_TRANSFER.includes(code) && !corrective) {
        add('SK-PAY-05', 'info', 'Nie je uvedený variabilný symbol / platobná referencia (BT-83 PaymentID). FS SR: BT-83 slúži pre variabilný symbol (max. 10 číslic).', { fields: [P.paymentId[0]] });
      }
      for (const f of pids) {
        if (skSeller && !/^\d{1,10}$/.test(f.value)) add('SK-PAY-06', 'info', `Platobná referencia (BT-83) „${f.value}“ nie je vo formáte variabilného symbolu (max. 10 číslic).`, { fields: [f] });
      }
      if (code === '31') {
        add('SK-PAY-07', 'info', 'Kód spôsobu platby 31 = „Debit transfer“ (debetný prevod). Pre úhradu prevodom na účet dodávateľa sa štandardne používa 30 (Credit transfer) alebo 58 (SEPA credit transfer).', { fields: [P.code] });
      }
    }

    // 8) DPH – kategórie, sadzby a mena (slovenské pravidlá len pri IČ DPH SK)
    if (skVatSeller) {
      const seen = new Set();
      const cats = D.vat.map(V => [V.cat, V.rate]).concat(D.lines.map(L => [L.cat, L.rate]));
      // sadzba platí podľa dňa vzniku daňovej povinnosti (§ 27 ods. 5): BT-7, inak dátumy dodania/obdobia,
      // pri opravných dokladoch aj dátum pôvodnej faktúry (BT-26)
      let dates = D.taxPointDate.value ? [D.taxPointDate.value]
        : [D.delivery.date && D.delivery.date.value, D.period.start.value, D.period.end.value, issue]
          .concat(D.lines.flatMap(L => [L.pStart.value, L.pEnd.value]));
      if (corrective || negative) dates = dates.concat(D.preceding.map(p => p.date.value));
      dates = [...new Set(dates.map(iso).filter(Boolean))].sort();
      const uncertain = !D.taxPointDate.value && (corrective || negative) && !D.preceding.some(p => p.date.value);
      const allowed = new Set(dates.flatMap(ratesAt));
      if (uncertain) [20, 10].forEach(r => allowed.add(r));        // opravný doklad bez dátumu pôvodnej faktúry
      for (const [cf, rf] of cats) {
        const c = cf && cf.value;
        if (c && !SK_CATS.includes(c) && !seen.has('c' + c)) {
          seen.add('c' + c);
          add('SK-VAT-01', 'warning', `Kategória DPH „${c}“ sa v SR nepoužíva (FS SR: ${SK_CATS.join(', ')}).`, { fields: [cf] });
        }
        if (c === 'S' && rf && U.isNum(rf.value) && dates.length && !allowed.has(Number(rf.value)) && !seen.has('r' + rf.value)) {
          seen.add('r' + rf.value);
          const when = dates.length === 1 ? `k dátumu ${U.fmtDate(dates[0])}` : `pre obdobie ${U.fmtDate(dates[0])} – ${U.fmtDate(dates[dates.length - 1])}`;
          add('SK-VAT-02', 'warning', `Sadzba DPH ${U.fmtPct(rf.value)} pri kategórii S nie je platná slovenská sadzba ${when} (platné: ${[...allowed].sort((a, b) => b - a).join(' %, ')} %).`, {
            fields: [rf], hint: 'Rozhoduje sadzba platná v deň vzniku daňovej povinnosti (§ 27 ods. 5 zákona o DPH); do 31. 12. 2024 platili sadzby 20 %, 10 % a 5 %, od 1. 1. 2025 platia 23 %, 19 % a 5 %.'
          });
        }
      }
      const cur = (D.currency.value || '').trim().toUpperCase();
      const taxDue = D.vat.some(V => V.cat.value === 'S' && U.isNum(V.amount.value) && Number(V.amount.value) !== 0);
      if (cur && cur !== 'EUR' && taxDue && ((D.taxCurrency.value || '').trim().toUpperCase() !== 'EUR' || !D.taxTotalAcc)) {
        add('SK-VAT-03', 'warning', `Faktúra je v mene ${cur}. Výška dane sa musí uviesť aj v eurách (§ 74 ods. 1 písm. i) zákona o DPH) – uveďte kód meny DPH BT-6 = EUR a sumu DPH v eurách (BT-111).`, { fields: [D.currency, D.taxCurrency] });
      }
    }

    // 9) prílohy
    for (const A of D.attachments) {
      const fn = A.filename.value;
      if (fn && /[/\\:*?"<>|]/.test(fn)) {
        add('SK-ATT-01', 'warning', `Názov súboru prílohy „${fn}“ obsahuje znaky, ktoré nie sú povolené v názvoch súborov (/ \\ : * ? " < > |). Príjemca ju nemusí vedieť uložiť.`, { fields: [A.filename] });
      }
      if (A.bin.raw) {
        const info = attachmentInfo(A.bin.raw);
        A.info = info;
        const mime = (A.mime.value || '').trim().toLowerCase();
        const head = own({ 'application/pdf': [info.isPdf, 'hlavičkou PDF (%PDF)'], 'image/png': [info.isPng, 'hlavičkou PNG'], 'image/jpeg': [info.isJpg, 'hlavičkou JPEG'] }, mime);
        if (!info.ok) add('SK-ATT-02', 'error', 'Obsah prílohy (BT-125) nie je platné base64.', { fields: [A.bin] });
        else if (head && !head[0]) add('SK-ATT-02', 'warning', `Príloha je označená ako ${mime}, ale obsah nezačína ${head[1]}. Nástroj ju preto neotvorí ani nezobrazí – dá sa len stiahnuť.`, { fields: [A.bin, A.mime] });
        if (info.size > 10 * 1024 * 1024) add('SK-ATT-03', 'info', `Príloha má ${U.fmtSize(info.size)}. Peppol neurčuje pevný limit, poskytovatelia ho však môžu mať.`, { fields: [A.bin] });
      }
    }

    // 10) referencie
    if (D.contract.value && D.number.value && D.contract.value === D.number.value) {
      add('SK-REF-01', 'info', 'Referencia zmluvy (BT-12) je zhodná s číslom faktúry (BT-1) – pravdepodobne chybné mapovanie v ERP (do BT-12 patrí číslo zmluvy).', { fields: [D.contract, D.number] });
    }
    if (skSeller && (corrective || negative) && !D.preceding.some(p => p.id && !p.id.missing)) {
      add('SK-REF-02', corrective ? 'error' : 'warning',
        `${corrective ? 'Opravný doklad (dobropis, ťarchopis alebo opravná faktúra)' : 'Faktúra so zápornou sumou (pravdepodobne oprava)'} neobsahuje odkaz na pôvodnú faktúru (BT-25 cac:BillingReference/cac:InvoiceDocumentReference/cbc:ID). Doklad, ktorý mení elektronickú faktúru, musí obsahovať poradové číslo pôvodnej faktúry (§ 85o ods. 5 zákona o DPH v znení od 1. 1. 2027).`,
        { fields: [D.number], hint: 'FAQ FS SR, časť I, príklad č. 50 a časť II, príklady č. 39 a 49: poradové číslo pôvodnej faktúry sa uvádza v poli BT-25.' });
    }
    return out;
  }

  return { run, fixMojibake, ibanCheck, tddUuid, uuid5, attachmentInfo, isSK, BIC_RE };
})();
