'use strict';
/*
 * Oficiálna validácia: CEN EN16931-UBL + PEPPOL-EN16931-UBL Schematron,
 * skompilované do SEF (SaxonJS) a vložené do HTML ako gzip+base64.
 */
const Validator = (() => {
  let cache = null;

  async function gunzipJson(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error('Chýbajú validačné pravidlá (' + id + ').');
    const bin = Uint8Array.from(atob(el.textContent.trim()), c => c.charCodeAt(0));
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Prehliadač nepodporuje DecompressionStream – použite aktuálny Edge, Chrome alebo Firefox.');
    }
    const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }

  function load() {
    if (!cache) {
      cache = Promise.all([gunzipJson('rules-cen'), gunzipJson('rules-peppol')])
        .then(([cen, peppol]) => ({ cen, peppol }))
        .catch(e => { cache = null; throw e; });
    }
    return cache;
  }

  async function runOne(sef, xml) {
    const res = await SaxonJS.transform({ stylesheetInternal: sef, sourceText: xml, destination: 'serialized' }, 'async');
    return res.principalResult;
  }

  const SVRL = 'http://purl.oclc.org/dsdl/svrl';
  function parseSvrl(svrl, source) {
    const dom = new DOMParser().parseFromString(svrl, 'application/xml');
    const out = [];
    for (const tag of ['failed-assert', 'successful-report']) {
      for (const el of Array.from(dom.getElementsByTagNameNS(SVRL, tag))) {
        const t = el.getElementsByTagNameNS(SVRL, 'text')[0];
        let en = t ? t.textContent.replace(/\s+/g, ' ').trim() : '';
        const id = el.getAttribute('id') || (/^\[([^\]]+)\]/.exec(en) || [])[1] || '?';
        en = en.replace(/^\[[^\]]+\]\s*-?\s*/, '');
        let flag = (el.getAttribute('flag') || el.getAttribute('role') || 'fatal').toLowerCase();
        if (flag === 'error') flag = 'fatal';
        const sk = source === 'cen' ? (window.SK_RULES || {})[id] : PEPPOL_SK[id];
        out.push({ id, flag, source, en, text: sk || en, translated: !!sk, location: el.getAttribute('location') || '', test: el.getAttribute('test') || '' });
      }
    }
    return out;
  }

  async function validate(xml) {
    const r = await load();
    const t0 = performance.now();
    const cen = parseSvrl(await runOne(r.cen, xml), 'cen');
    const peppol = parseSvrl(await runOne(r.peppol, xml), 'peppol');
    return { findings: cen.concat(peppol), ms: Math.round(performance.now() - t0) };
  }

  /** Prepojenie nálezu s poľami modelu (podľa location a BT kódov v texte). */
  function link(D, f) {
    if (f.fields && f.fields.length) return f;
    const loc = XP.resolveLocation(D.parsed, f.location);
    f.node = loc.node;
    f.attr = loc.attr;
    const bts = new Set(((f.en || '') + ' ' + (f.text || '')).match(/\b(BT|BG)-\d+\b/g) || []);
    let fields = [];
    if (loc.node) {
      const isRoot = loc.node === D.root;
      const within = (scope, fl) => {
        const anchor = fl.node || fl.ctx;
        return anchor && (scope === D.root || XP.isAncestorOrSelf(scope, anchor));
      };
      if (bts.size) {
        // každé spomenuté BT hľadaj v uzle nálezu, prípadne o 1–2 úrovne vyššie (napr. TaxCategory → TaxSubtotal)
        for (const bt of bts) {
          let scope = loc.node;
          for (let up = 0; up < 3 && scope; up++) {
            const hit = D.fields.filter(fl => fl.bt === bt && within(scope, fl));
            if (hit.length) { fields.push(...hit); break; }
            if (isRoot) break;
            scope = scope.parent;
            if (scope === D.root) break;
          }
        }
      } else {
        for (const fl of D.fields) {
          if (fl.node !== loc.node) continue;
          if (loc.attr && fl.attr !== loc.attr) continue;
          fields.push(fl);
        }
      }
      if (!fields.length) fields = D.fields.filter(fl => fl.node === loc.node && (!loc.attr || fl.attr === loc.attr));
      if (!fields.length) {
        // najbližšie pole pod daným uzlom
        fields = D.fields.filter(fl => fl.node && !fl.tech && XP.isAncestorOrSelf(loc.node, fl.node)).slice(0, 1);
      }
    }
    if (!fields.length && bts.size) fields = D.fields.filter(fl => bts.has(fl.bt) && !fl.tech);
    f.fields = Array.from(new Set(fields)).slice(0, 60);
    return f;
  }

  return { validate, link, load };
})();
