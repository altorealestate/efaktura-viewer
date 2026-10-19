'use strict';
/*
 * Kontrola schémy UBL 2.1 (XSD) – prvý stupeň validácie v prístupových bodoch Peppol:
 * povolené elementy a ich poradie, počet výskytov, povinné elementy a atribúty, dátové typy hodnôt.
 * Model obsahu vzniká z oficiálnych XSD OASIS (tools/build_xsd.py → data/ubl21_xsd.json).
 * Obsah rozšírení (ext:ExtensionContent) sa nekontroluje.
 */
const XSD = (() => {
  const XSI = 'http://www.w3.org/2001/XMLSchema-instance';
  const MAX = 200;
  let S = null;

  function schema() {
    if (!S) {
      const d = window.UBL_XSD;
      S = {
        ns: d.ns,
        nsIdx: new Map(d.ns.map((u, i) => [u, i])),
        el: new Map(Object.entries(d.el)),
        types: d.t.map(t => (t.s
          ? Object.assign({ idx: new Map(t.s.map((p, i) => [p[0], i])) }, t)
          : Object.assign({ allowed: new Set([...(t.r || []), ...(t.o || [])]) }, t)))
      };
      S.extNs = d.ns.indexOf(NS.ext);
    }
    return S;
  }

  const keyOf = n => { const i = S.nsIdx.get(n.ns); return i === undefined ? null : i + ':' + n.local; };
  const prefixed = (ns, local) => (ns === NS.inv || ns === NS.cn ? local : (NS_PREFIX[ns] ? NS_PREFIX[ns] + ':' : '') + local);
  const disp = n => (n.parent ? prefixed(n.ns, n.local) : n.local);
  const dispKey = k => { const c = k.indexOf(':'); return prefixed(S.ns[+k.slice(0, c)], k.slice(c + 1)); };
  const short = s => (s.length > 60 ? s.slice(0, 57) + '…' : s);
  const collapse = s => s.replace(/[\t\n\r ]+/g, ' ').trim();

  /* ---------- lexikálne kontroly primitívnych typov XSD ---------- */
  const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function tzOk(tz) {
    if (!tz || tz === 'Z') return true;
    const h = +tz.slice(1, 3), m = +tz.slice(4, 6);
    return m <= 59 && (h < 14 || (h === 14 && m === 0));
  }
  function dateOk(v) {
    const m = /^-?(\d{4,})-(\d{2})-(\d{2})(Z|[+-]\d{2}:\d{2})?$/.exec(v);
    if (!m || (m[1].length > 4 && m[1][0] === '0') || /^0+$/.test(m[1])) return false;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1) return false;
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return d <= (mo === 2 && leap ? 29 : DAYS[mo - 1]) && tzOk(m[4]);
  }
  function timeOk(v) {
    const m = /^(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.exec(v);
    if (!m) return false;
    const h = +m[1], mi = +m[2], s = +m[3];
    const midnight = h === 24 && mi === 0 && s === 0 && !/[1-9]/.test(m[4] || '');
    return (h <= 23 || midnight) && mi <= 59 && s <= 59 && tzOk(m[5]);
  }

  /** base64 po odstránení bielych znakov – lineárny prechod (regulárny výraz pri prílohe s MB pretečie zásobník). */
  function base64Ok(raw) {
    let n = 0, pad = 0;
    for (let i = 0; i < raw.length; i++) {
      const c = raw.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) continue;
      if (c === 61) { pad++; n++; continue; }                                  // '='
      if (pad) return false;                                                   // znak za výplňou
      const ok = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 47;
      if (!ok) return false;
      n++;
    }
    return n % 4 === 0 && pad <= 2;
  }

  /** Vráti null, ak hodnota zodpovedá typu, inak { what, hint }. */
  function checkValue(p, raw) {
    const v = collapse(raw);
    switch (p) {
      case 'decimal':
        if (/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(v)) return null;
        return {
          what: 'nie je platné desatinné číslo (xs:decimal)',
          hint: /^[+-]?[\d\s\u00a0.]*,\d+$/.test(v) ? 'Desatinným oddeľovačom musí byť bodka, napr. 1656.25 (nie 1656,25), a bez medzier medzi tisíckami.'
            : /\d[\s\u00a0]\d/.test(v) ? 'Číslo nesmie obsahovať medzery medzi tisíckami.'
              : !v ? 'Hodnota je prázdna.' : 'Povolené sú len číslice, znamienko a desatinná bodka.'
        };
      case 'date':
        if (dateOk(v)) return null;
        return { what: 'nie je platný dátum (xs:date)', hint: /^\d{1,2}\.\s?\d{1,2}\.\s?\d{4}$/.test(v) ? 'Dátum musí byť vo formáte RRRR-MM-DD, napr. 2026-10-19.' : 'Dátum musí byť existujúci deň vo formáte RRRR-MM-DD.' };
      case 'time':
        return timeOk(v) ? null : { what: 'nie je platný čas (xs:time)', hint: 'Čas musí byť vo formáte hh:mm:ss.' };
      case 'boolean':
        return /^(true|false|1|0)$/.test(v) ? null : { what: 'nie je platná logická hodnota (xs:boolean)', hint: 'Povolené sú len hodnoty true alebo false.' };
      case 'base64Binary':
        return base64Ok(raw) ? null : { what: 'nie je platné kódovanie base64 (xs:base64Binary)', hint: 'Obsah prílohy je poškodený alebo neúplný.' };
      case 'language':
        return /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/.test(v) ? null : { what: 'nie je platný kód jazyka (xs:language)', hint: 'Napr. sk alebo en-GB.' };
      default:
        return null;
    }
  }

  /* ---------- prechod dokumentom ---------- */
  function validate(parsed) {
    schema();
    const out = [];
    let dropped = 0;
    const add = (id, n, text, o = {}) => {
      if (out.length >= MAX) { dropped++; return; }
      out.push(Object.assign({ id, flag: 'fatal', source: 'xsd', text, node: n, attr: null, line: n.line, fields: [] }, o));
    };
    const root = parsed.root;
    const rt = root && S.nsIdx.has(root.ns) ? S.el.get(keyOf(root)) : undefined;
    if (rt === undefined) return out;

    function checkAttrs(n, T) {
      const present = new Set();
      for (const a of n.attrs) {
        if (a.name === 'xmlns' || a.prefix === 'xmlns') continue;
        if (a.prefix) {
          const uri = a.prefix === 'xml' ? 'http://www.w3.org/XML/1998/namespace' : n.nsMap[a.prefix];
          if (uri === XSI) continue;
          add('XSD-06', n, `Atribút ${a.name} nie je v elemente <${disp(n)}> povolený (UBL atribúty nemajú prefix).`, { attr: a.name, line: parsed.lineOf(a.s) });
          continue;
        }
        present.add(a.local);
        if (!T.allowed || !T.allowed.has(a.local)) {
          add('XSD-06', n, `Atribút ${a.local} nie je v elemente <${disp(n)}> povolený (schéma UBL 2.1).`, { attr: a.local, line: parsed.lineOf(a.s) });
        } else if (T.at && T.at[a.local]) {
          const e = checkValue(T.at[a.local], a.value);
          if (e) add('XSD-05', n, `Hodnota „${short(a.value)}“ atribútu ${a.local} v <${disp(n)}> ${e.what}.`, { attr: a.local, line: parsed.lineOf(a.s), hint: e.hint });
        }
      }
      for (const r of T.r || []) {
        if (!present.has(r)) add('XSD-07', n, `Element <${disp(n)}> musí mať atribút ${r}.`, { attr: r });
      }
    }

    function checkSeq(n, T, stack) {
      const P = T.s, kids = n.children;
      const idx = kids.map(c => {
        const k = keyOf(c);
        if (k != null && T.idx.has(k)) return T.idx.get(k);
        if (T.idx.has('*') && c.ns && S.nsIdx.get(c.ns) !== S.extNs) return T.idx.get('*');
        return -1;
      });
      const last = new Map();
      idx.forEach((j, i) => { if (j >= 0) last.set(j, i); });
      const seen = new Array(P.length).fill(0);
      const reported = new Set();
      const missing = (q, at) => {
        if (reported.has(q)) return;
        reported.add(q);
        const need = P[q][1] > 1 ? ` (najmenej ${P[q][1]}×)` : '';
        add('XSD-03', n, `V elemente <${disp(n)}> chýba povinný element <${dispKey(P[q][0])}>${need}` +
          (at ? ` – podľa schémy UBL 2.1 má byť uvedený pred <${disp(at)}>.` : '.'), { line: at ? at.line : n.line });
      };
      let p = -1;
      for (let i = 0; i < kids.length; i++) {
        const c = kids[i], j = idx[i];
        if (j < 0) {
          const k = keyOf(c);
          const txt = k != null && S.el.has(k)
            ? `Element <${disp(c)}> nie je v elemente <${disp(n)}> povolený (schéma UBL 2.1).`
            : k != null ? `Element <${disp(c)}> v schéme UBL 2.1 neexistuje – skontrolujte názov elementu.`
              : c.ns ? `Element <${c.name}> (namespace „${c.ns}“) nie je v schéme UBL 2.1 povolený.`
                : `Element <${c.name}> nemá namespace – elementy UBL musia patriť do namespace cbc alebo cac.`;
          add('XSD-01', c, txt);
          continue;
        }
        if (j < p) {
          const after = kids[idx.findIndex(x => x > j)];
          add('XSD-02', c, `Element <${disp(c)}> je v nesprávnom poradí – podľa schémy UBL 2.1 musí byť uvedený pred <${disp(after)}>.`);
        } else {
          for (let q = p + 1; q < j; q++) {
            if (seen[q] < P[q][1] && !((last.get(q) || -1) > i)) missing(q, c);
          }
          p = j;
        }
        seen[j]++;
        if (P[j][2] >= 0 && seen[j] === P[j][2] + 1) {
          add('XSD-04', c, `Element <${disp(c)}> sa v elemente <${disp(n)}> môže vyskytovať najviac ${P[j][2]}× – tu je uvedený viackrát.`);
        }
        if (P[j][0] !== '*') stack.push([c, S.types[S.el.get(P[j][0])]]);
      }
      for (let q = 0; q < P.length; q++) if (seen[q] < P[q][1]) missing(q, null);
    }

    const stack = [[root, S.types[rt]]];
    while (stack.length) {
      const [n, T] = stack.pop();
      checkAttrs(n, T);
      if (T.s) {
        const txt = n.text.replace(/[\t\n\r ]+/g, '');
        if (txt) add('XSD-08', n, `Element <${disp(n)}> nesmie obsahovať text („${short(collapse(n.text))}“) – obsahuje len vnorené elementy.`);
        checkSeq(n, T, stack);
      } else {
        if (n.children.length) {
          add('XSD-09', n.children[0], `Element <${disp(n)}> nesmie obsahovať vnorené elementy (<${n.children[0].name}>).`);
          continue;
        }
        const e = checkValue(T.p, n.text);
        if (e) add('XSD-05', n, `Hodnota „${short(collapse(n.text))}“ v <${disp(n)}> ${e.what}.`, { hint: e.hint });
      }
    }
    out.sort((a, b) => a.line - b.line);
    if (dropped) out.push({ id: 'XSD-00', flag: 'fatal', source: 'xsd', text: `Ďalších ${dropped} chýb schémy UBL 2.1 sa nezobrazuje (zobrazených je prvých ${MAX}).`, node: null, line: null, fields: [] });
    return out;
  }

  return { validate, checkValue, dateOk, timeOk, base64Ok };
})();
