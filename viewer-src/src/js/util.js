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
  /** xs:decimal: „+20“, „.5“ aj „5.“ sú platné čísla. */
  const isNum = v => v != null && /^\s*[+-]?(\d+(\.\d*)?|\.\d+)\s*$/.test(String(v));

  /**
   * Presné formátovanie desatinného čísla po slovensky (medzera medzi tisícami, desatinná čiarka) bez
   * zaokrúhlenia – vizuál musí ukazovať presne hodnotu z XML, aj keď má viac desatinných miest.
   */
  function fmtDec(v, minFrac) {
    const m = /^\s*([+-]?)(\d*)(?:\.(\d*))?\s*$/.exec(String(v));
    let int = (m[2] || '0').replace(/^0+(?=\d)/, '');
    let frac = (m[3] || '').replace(/0+$/, '');
    if (frac.length < minFrac) frac = frac.padEnd(minFrac, '0');
    int = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
    const neg = m[1] === '-' && /[1-9]/.test(m[2] + (m[3] || ''));
    return (neg ? '-' : '') + int + (frac ? ',' + frac : '');
  }
  function fmtNum(v, min = 0) { return isNum(v) ? fmtDec(v, min) : (v || ''); }

  function curSymbol(cur) {
    if (cur === 'EUR') return '€';
    return cur || '';
  }
  function fmtAmount(v, cur) {
    if (!isNum(v)) return v || '';
    return fmtDec(v, 2) + (cur ? '\u00a0' + curSymbol(cur) : '');
  }
  const fmtQty = v => fmtNum(v, 0);
  const fmtPct = v => (isNum(v) ? fmtDec(v, 0) + '\u00a0%' : (v || ''));

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
    const v = own(own(CODES, list), String(code).trim());
    return typeof v === 'string' ? v : '';
  }

  function vatLabel(cat) { return codeLabel('vat', cat); }

  /** Číselník Peppol pre pole: { name, url } alebo null. */
  function codeList(f, isCN) {
    let k = f.bt === 'BT-3' ? (isCN ? 'UNCL1001-cn' : 'UNCL1001-inv') : own(BT_CODELIST, f.bt);
    if (f.bt === 'BT-125' && f.attr === 'mimeCode') k = 'MimeCode';
    return k ? { name: CODELISTS[k], url: 'https://docs.peppol.eu/poacc/billing/3.0/codelist/' + k + '/' } : null;
  }

  /** Odkaz len pre http(s) – iná schéma (javascript:, data:, relatívna cesta) sa zobrazí ako text. */
  const safeUrl = u => (/^https?:\/\/[^\s]+$/i.test(String(u || '').trim()) ? String(u).trim() : null);

  /** „RIADOK FAKTÚRY“ → „Riadok faktúry“ (názvy skupín BG sú vo workbooku FS SR veľkými písmenami). */
  function sentence(s) {
    const t = String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return (t.charAt(0).toUpperCase() + t.slice(1)).replace(/\bdph\b/g, 'DPH');
  }

  return { esc, fmtDate, fmtNum, fmtAmount, fmtQty, fmtPct, fmtSize, plural, countryName, codeLabel, vatLabel, isNum, codeList, sentence, safeUrl };
})();
