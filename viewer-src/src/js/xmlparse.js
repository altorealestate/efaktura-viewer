'use strict';
/*
 * Tolerantný XML parser, ktorý si pre každý element pamätá pozíciu v zdrojovom texte
 * (offset, riadok). Slúži na prepojenie vizuálu faktúry so zdrojovým XML.
 * Well-formedness overuje samostatne DOMParser (checkWellFormed).
 */
const XP = (() => {
  const NS_XML = 'http://www.w3.org/XML/1998/namespace';

  function decodeEntities(s) {
    if (s.indexOf('&') < 0) return s;
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (m, e) => {
      switch (e) {
        case 'lt': return '<';
        case 'gt': return '>';
        case 'amp': return '&';
        case 'quot': return '"';
        case 'apos': return "'";
      }
      const cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(cp); } catch (_) { return m; }
    });
  }

  function lineIndex(text) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
    return starts;
  }

  function lineOf(starts, off) {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= off) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  }

  function splitName(name) {
    const c = name.indexOf(':');
    return c > 0 ? [name.slice(0, c), name.slice(c + 1)] : ['', name];
  }

  function parse(text) {
    const nodes = [];
    const tokens = [];
    const issues = [];
    const docNode = { nid: -1, name: '#document', children: [], nsMap: { xml: NS_XML, '': '' } };
    const stack = [docNode];
    const n = text.length;
    const top = () => stack[stack.length - 1];
    let i = 0;

    while (i < n) {
      const lt = text.indexOf('<', i);
      if (lt !== i) {
        const e = lt < 0 ? n : lt;
        const cur = top();
        tokens.push({ t: 'text', s: i, e, nid: cur.nid });
        if (cur !== docNode) cur.textParts.push(decodeEntities(text.slice(i, e)));
        else if (text.slice(i, e).trim()) issues.push({ off: i, msg: 'Text mimo koreňového elementu' });
        i = e;
        continue;
      }
      if (text.startsWith('<?', i)) {
        let e = text.indexOf('?>', i + 2);
        e = e < 0 ? n : e + 2;
        tokens.push({ t: 'pi', s: i, e, nid: -1 });
        i = e;
        continue;
      }
      if (text.startsWith('<!--', i)) {
        let e = text.indexOf('-->', i + 4);
        e = e < 0 ? n : e + 3;
        tokens.push({ t: 'comment', s: i, e, nid: top().nid });
        i = e;
        continue;
      }
      if (text.startsWith('<![CDATA[', i)) {
        const c = text.indexOf(']]>', i + 9);
        const e = c < 0 ? n : c + 3;
        const cur = top();
        tokens.push({ t: 'cdata', s: i, e, nid: cur.nid });
        if (cur !== docNode) cur.textParts.push(text.slice(i + 9, c < 0 ? n : c));
        i = e;
        continue;
      }
      if (text.startsWith('<!', i)) {
        let e = text.indexOf('>', i);
        e = e < 0 ? n : e + 1;
        tokens.push({ t: 'doctype', s: i, e, nid: -1 });
        i = e;
        continue;
      }
      if (text.startsWith('</', i)) {
        const gt = text.indexOf('>', i);
        const lt2 = text.indexOf('<', i + 2);
        const closed = gt >= 0 && (lt2 < 0 || gt < lt2);
        const e = closed ? gt + 1 : (lt2 < 0 ? n : lt2);
        const name = text.slice(i + 2, closed ? gt : e).trim();
        if (!closed) issues.push({ off: i, msg: `Neukončená koncová značka </${name}` });
        let k = stack.length - 1;
        while (k > 0 && stack[k].name !== name) k--;
        if (k > 0) {
          for (let j = stack.length - 1; j > k; j--) {
            const el = stack[j];
            el.closeStart = i; el.end = i; el.unclosed = true;
            issues.push({ off: el.start, msg: `Element <${el.name}> nie je uzavretý` });
          }
          const el = stack[k];
          el.closeStart = i; el.end = e; el.closeComplete = closed;
          stack.length = k;
          tokens.push({ t: 'close', s: i, e, nid: el.nid });
        } else {
          issues.push({ off: i, msg: `Neočakávaná koncová značka </${name}>` });
          tokens.push({ t: 'close', s: i, e, nid: -1 });
        }
        i = e;
        continue;
      }
      // počiatočná značka (rešpektuje úvodzovky v atribútoch)
      let j = i + 1, q = null;
      while (j < n) {
        const c = text[j];
        if (q) { if (c === q) q = null; }
        else if (c === '"' || c === "'") q = c;
        else if (c === '>' || c === '<') break;
        j++;
      }
      const closedTag = j < n && text[j] === '>';
      const e = closedTag ? j + 1 : j;
      let inner = text.slice(i + 1, j);
      let selfClose = false;
      if (inner.endsWith('/')) { selfClose = true; inner = inner.slice(0, -1); }
      const nm = /^[^\s/>]+/.exec(inner);
      const name = nm ? nm[0] : '';
      const attrs = [];
      const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
      re.lastIndex = name.length;
      let a;
      while ((a = re.exec(inner))) {
        const [prefix, local] = splitName(a[1]);
        attrs.push({
          name: a[1], prefix, local,
          value: decodeEntities(a[3] !== undefined ? a[3] : a[4]),
          s: i + 1 + a.index, e: i + 1 + a.index + a[0].length
        });
      }
      const parent = top();
      const nsMap = Object.create(parent.nsMap);
      for (const at of attrs) {
        if (at.name === 'xmlns') nsMap[''] = at.value;
        else if (at.prefix === 'xmlns') nsMap[at.local] = at.value;
      }
      const [prefix, local] = splitName(name);
      const el = {
        nid: nodes.length, name, prefix, local, ns: nsMap[prefix] || '',
        attrs, attrMap: {}, parent: parent === docNode ? null : parent,
        children: [], textParts: [], start: i, openEnd: e, closeStart: -1, end: -1,
        nsMap, selfClose
      };
      for (const at of attrs) if (at.prefix !== 'xmlns' && at.name !== 'xmlns') el.attrMap[at.local] = at.value;
      nodes.push(el);
      parent.children.push(el);
      if (parent === docNode && docNode.children.length > 1) issues.push({ off: i, msg: 'Dokument obsahuje viac ako jeden koreňový element' });
      if (!closedTag) issues.push({ off: i, msg: `Neukončená značka <${name}` });
      tokens.push({ t: selfClose ? 'empty' : 'open', s: i, e, nid: el.nid });
      if (selfClose) { el.closeStart = e; el.end = e; } else stack.push(el);
      i = e;
    }
    const unclosed = [];
    for (let k = stack.length - 1; k > 0; k--) {
      const el = stack[k];
      el.end = n; el.closeStart = n; el.unclosed = true;
      unclosed.push(el);
      issues.push({ off: el.start, msg: `Element <${el.name}> nie je uzavretý` });
    }
    const starts = lineIndex(text);
    for (const el of nodes) {
      el.text = el.textParts.join('');
      delete el.textParts;
      el.line = lineOf(starts, el.start);
      el.endLine = lineOf(starts, Math.max(el.start, el.end - 1));
    }
    return {
      text, nodes, tokens, issues, unclosed,
      root: docNode.children[0] || null,
      lineStarts: starts,
      lineOf: off => lineOf(starts, off)
    };
  }

  /** Overenie well-formedness cez DOMParser prehliadača. */
  function checkWellFormed(text) {
    try {
      const dom = new DOMParser().parseFromString(text, 'application/xml');
      const err = dom.getElementsByTagName('parsererror')[0];
      if (!err) return { ok: true };
      let msg = (err.textContent || 'Chyba parsovania XML').replace(/\s+/g, ' ').trim();
      msg = msg.replace(/^This page contains the following errors:\s*/i, '')
        .replace(/\s*Below is a rendering of the page up to the first error\.?$/i, '');
      const m = /line\s+(\d+)(?:\s+at\s+column\s+(\d+))?/i.exec(msg) || /(?:riadok|Line Number)\s*(\d+)(?:,\s*Column\s*(\d+))?/i.exec(msg);
      return { ok: false, msg, line: m ? +m[1] : null, col: m && m[2] ? +m[2] : null };
    } catch (e) {
      return { ok: false, msg: String(e && e.message || e) };
    }
  }

  /**
   * Pokus o opravu nekompletného XML (len pre náhľad): doplní chýbajúce '>' na konci
   * a koncové značky neuzavretých elementov. Vracia null, ak sa nedá opraviť.
   */
  function tryRepair(text) {
    let fixed = text.replace(/\s+$/, '');
    const notes = [];
    if (/<\/[^<>\s]+\s*$/.test(fixed)) { fixed += '>'; notes.push('doplnený znak „>“ na konci súboru'); }
    let p = parse(fixed);
    if (p.unclosed.length) {
      const closing = p.unclosed.map(el => `</${el.name}>`).join('');
      fixed += closing;
      notes.push('doplnené koncové značky ' + p.unclosed.map(el => `</${el.name}>`).join(' '));
    }
    if (!notes.length || !checkWellFormed(fixed).ok) return null;
    return { text: fixed, notes };
  }

  /** Mapovanie SVRL location (napr. /Q{ns}Invoice[1]/Q{ns}TaxTotal[1]/@x) na uzol. */
  function resolveLocation(parsed, loc) {
    if (!loc || !parsed.root) return { node: null, attr: null };
    const steps = [];
    let i = 0;
    while (i < loc.length) {
      if (loc[i] !== '/') break;
      i++;
      let ns = null, isAttr = false, idx = 1;
      if (loc[i] === '@') { isAttr = true; i++; }
      if (loc.startsWith('Q{', i)) {
        const e = loc.indexOf('}', i);
        ns = loc.slice(i + 2, e);
        i = e + 1;
      } else if (loc.startsWith('*:', i)) i += 2;
      const m = /^[^[/]*/.exec(loc.slice(i));
      let local = m[0];
      i += local.length;
      while (loc[i] === '[') {
        let depth = 0, e = i;
        for (; e < loc.length; e++) {
          if (loc[e] === '[') depth++;
          else if (loc[e] === ']' && --depth === 0) break;
        }
        const pred = loc.slice(i + 1, e);
        if (/^\d+$/.test(pred)) idx = +pred;
        else {
          const nm = /namespace-uri\(\)\s*=\s*'([^']*)'/.exec(pred);
          if (nm) ns = nm[1];
          const ln = /local-name\(\)\s*=\s*'([^']*)'/.exec(pred);
          if (ln) local = ln[1];
        }
        i = e + 1;
      }
      if (local.includes(':')) local = local.split(':')[1];
      steps.push({ ns, local, idx, isAttr });
    }
    let node = null, attr = null;
    for (let s = 0; s < steps.length; s++) {
      const st = steps[s];
      if (st.isAttr) { attr = st.local; break; }
      if (/^(text|comment|node|processing-instruction)\(/.test(st.local) || st.local === '*') break;
      const cands = s === 0 ? [parsed.root] : node.children;
      const matches = cands.filter(c => c.local === st.local && (st.ns == null || c.ns === st.ns));
      const nx = matches[st.idx - 1];
      if (!nx) break;
      node = nx;
    }
    return { node, attr };
  }

  function isAncestorOrSelf(anc, node) {
    for (let x = node; x; x = x.parent) if (x === anc) return true;
    return false;
  }

  return { parse, checkWellFormed, tryRepair, resolveLocation, isAncestorOrSelf, decodeEntities, lineOf };
})();
