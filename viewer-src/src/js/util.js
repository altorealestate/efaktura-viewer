'use strict';
/* Pomocné funkcie: escapovanie, formátovanie (sk-SK), číselníky. */
const U = (() => {
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function fmtDate(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((v || '').trim());
    return m ? `${+m[3]}. ${+m[2]}. ${m[1]}` : (v || '');
  }

  const nfCache = {};
  function nf(min, max) {
    const k = min + ':' + max;
    return nfCache[k] || (nfCache[k] = new Intl.NumberFormat('sk-SK', { minimumFractionDigits: min, maximumFractionDigits: max }));
  }
  const isNum = v => v != null && /^\s*-?\d+(\.\d+)?\s*$/.test(String(v));

  function fmtNum(v, min = 0, max = 6) { return isNum(v) ? nf(min, max).format(Number(v)) : (v || ''); }

  function curSymbol(cur) {
    if (cur === 'EUR') return '€';
    return cur || '';
  }
  function fmtAmount(v, cur) {
    if (!isNum(v)) return v || '';
    return nf(2, 6).format(Number(v)) + (cur ? ' ' + curSymbol(cur) : '');
  }
  const fmtQty = v => fmtNum(v, 0, 6);
  const fmtPct = v => (isNum(v) ? nf(0, 4).format(Number(v)) + ' %' : (v || ''));

  function fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return nf(0, 1).format(b / 1024) + ' kB';
    return nf(0, 2).format(b / 1024 / 1024) + ' MB';
  }

  function plural(n, one, few, many) {
    return n === 1 ? one : (n >= 2 && n <= 4 ? few : many);
  }

  let regionNames = null;
  function countryName(code) {
    if (!code) return '';
    try {
      regionNames = regionNames || new Intl.DisplayNames(['sk'], { type: 'region' });
      const n = regionNames.of(code.toUpperCase());
      return n && n !== code ? n : code;
    } catch (_) { return code; }
  }

  function codeLabel(list, code) {
    if (!code) return '';
    const t = CODES[list] || {};
    return t[code] || '';
  }

  function vatLabel(cat) { return CODES.vat[cat] || ''; }

  /** Číselník Peppol pre pole: { name, url } alebo null. */
  function codeList(f, isCN) {
    let k = f.bt === 'BT-3' ? (isCN ? 'UNCL1001-cn' : 'UNCL1001-inv') : BT_CODELIST[f.bt];
    if (f.bt === 'BT-125' && f.attr === 'mimeCode') k = 'MimeCode';
    return k ? { name: CODELISTS[k], url: 'https://docs.peppol.eu/poacc/billing/3.0/codelist/' + k + '/' } : null;
  }

  /** „RIADOK FAKTÚRY“ → „Riadok faktúry“ (názvy skupín BG sú vo workbooku FS SR veľkými písmenami). */
  function sentence(s) {
    const t = String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return (t.charAt(0).toUpperCase() + t.slice(1)).replace(/\bdph\b/g, 'DPH');
  }

  return { esc, fmtDate, fmtNum, fmtAmount, fmtQty, fmtPct, fmtSize, plural, countryName, codeLabel, vatLabel, isNum, codeList, sentence };
})();
