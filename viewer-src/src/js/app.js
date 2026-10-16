'use strict';
/* Riadenie aplikácie: načítanie súborov, stav, udalosti, prepojenie vizuál ↔ XML ↔ nálezy. */
const App = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const DEFAULT_OPTS = { showBT: false, showEmpty: false, fixMoj: false, wrap: false, theme: 'auto', leftW: 58 };
  const state = { docs: [], cur: -1, tab: 'findings', filter: 'all', mapQ: '', mapMissing: false, sel: null, opts: loadOpts() };
  let docSeq = 0;
  let queue = Promise.resolve();
  const xmlView = { docId: null, lines: [], byLine: new Map() };

  function loadOpts() {
    try { return Object.assign({}, DEFAULT_OPTS, JSON.parse(localStorage.getItem('efv-opts') || '{}')); }
    catch (_) { return Object.assign({}, DEFAULT_OPTS); }
  }
  function saveOpts() { try { localStorage.setItem('efv-opts', JSON.stringify(state.opts)); } catch (_) { /* súkromné okno */ } }
  const cur = () => state.docs[state.cur];

  /* ---------- načítanie a analýza ---------- */
  const xmlF = (id, flag, text, o = {}) => Object.assign({ id, flag, source: 'xml', text, fields: [] }, o);

  function decode(d, bytes) {
    let start = 0;
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) start = 3;
    if ((bytes[0] === 0xFF && bytes[1] === 0xFE) || (bytes[0] === 0xFE && bytes[1] === 0xFF)) {
      d.text = new TextDecoder(bytes[0] === 0xFF ? 'utf-16le' : 'utf-16be').decode(bytes.subarray(2));
      d.findings.push(xmlF('XML-02', 'fatal', 'Súbor je v kódovaní UTF-16. Peppol vyžaduje UTF-8.'));
      return;
    }
    try {
      d.text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(start));
    } catch (_) {
      d.text = new TextDecoder('windows-1250').decode(bytes.subarray(start));
      d.findings.push(xmlF('XML-02', 'fatal', 'Súbor nie je platné UTF-8 (obsahuje neplatné bajty). Pre náhľad bol dekódovaný ako Windows-1250. Peppol vyžaduje UTF-8.'));
    }
  }

  function analyze(d) {
    const text = d.text;
    const decl = /^\s*<\?xml[^>]*?encoding\s*=\s*["']([^"']+)["']/i.exec(text);
    if (decl && !/^utf-?8$/i.test(decl[1])) {
      d.findings.push(xmlF('XML-03', 'warning', `XML deklarácia uvádza kódovanie „${decl[1]}“. Peppol vyžaduje UTF-8.`, { line: 1 }));
    }
    d.workText = text;
    const wf = XP.checkWellFormed(text);
    if (!wf.ok) {
      const rep = XP.tryRepair(text);
      const tail = text.replace(/\s+$/, '').slice(-40).replace(/\s+/g, ' ');
      d.findings.push(xmlF('XML-01', 'fatal', 'XML nie je well-formed – súbor je poškodený alebo neúplný. ' + wf.msg, {
        line: wf.line,
        detail: (rep ? 'Automatická oprava pre náhľad: ' + rep.notes.join('; ') + '.\n' : '') + `Koniec súboru: „…${tail}“`,
        hint: rep
          ? 'Vizualizácia a validácia nižšie sú z opravenej kópie. Originálny súbor by prístupový bod Peppol odmietol – skontrolujte export (napr. orezaný posledný znak).'
          : 'Súbor sa nepodarilo automaticky opraviť – zobrazený je len XML zdroj.'
      }));
      if (rep) { d.workText = rep.text; d.repaired = rep.notes; }
      else { d.parsed = XP.parse(text); d.model = null; d.validation = 'skipped'; return; }
    }
    d.parsed = XP.parse(d.workText);
    const r = d.parsed.root;
    const ubl = r && ((r.local === 'Invoice' && r.ns === NS.inv) || (r.local === 'CreditNote' && r.ns === NS.cn));
    if (!ubl) {
      const what = r && r.ns === NS.cii ? 'UN/CEFACT CII (CrossIndustryInvoice)' : (r ? `<${r.name}> (${r.ns || 'bez namespace'})` : 'žiadny');
      d.findings.push(xmlF('XML-04', 'fatal', `Dokument nie je UBL 2.1 Invoice ani CreditNote – koreňový element: ${what}. Nástroj podporuje Peppol BIS Billing 3.0 v syntaxi UBL.`, { line: r ? r.line : null }));
      d.model = null; d.validation = 'skipped';
      return;
    }
    d.model = Model.extract(d.parsed);
    d.tdd = SK.tddUuid(d.model);
    d.findings.push(...SK.run(d.model));
    applyFindings(d);
  }

  const SRC_RANK = { xml: 0, cen: 1, peppol: 2, sk: 3 };
  function applyFindings(d) {
    if (d.model) {
      for (const f of d.model.fields) { f.findings = []; f.sev = null; }
      for (const fd of d.findings) {
        if (fd.source === 'cen' || fd.source === 'peppol') Validator.link(d.model, fd);
        for (const fl of fd.fields || []) {
          fl.findings.push(fd);
          if (!fl.sev || View.SEV_RANK[fd.flag] < View.SEV_RANK[fl.sev]) fl.sev = fd.flag;
        }
      }
    }
    d.findings.sort((a, b) => (View.SEV_RANK[a.flag] - View.SEV_RANK[b.flag]) || (SRC_RANK[a.source] - SRC_RANK[b.source]));
  }

  function addDoc(name, buf) {
    const d = { uid: ++docSeq, name, size: buf.byteLength, findings: [], validation: 'pending' };
    decode(d, new Uint8Array(buf));
    try { analyze(d); }
    catch (e) {
      console.error(e);
      d.findings.push(xmlF('APP-01', 'fatal', 'Neočakávaná chyba pri spracovaní: ' + (e && e.message || e)));
      d.parsed = d.parsed || XP.parse(d.text);
      d.model = null; d.validation = 'skipped';
    }
    state.docs.push(d);
    state.cur = state.docs.length - 1;
    state.sel = null;
    if (!d.model) state.tab = d.findings.length ? 'findings' : 'xml';
    renderAll();
    queue = queue.then(() => runValidation(d));
  }

  async function runValidation(d) {
    if (d.validation === 'skipped') { refresh(d); return; }
    d.validation = 'running';
    refresh(d);
    await new Promise(r => setTimeout(r, 40));
    try {
      const res = await Validator.validate(d.workText);
      d.findings = d.findings.filter(f => f.source !== 'cen' && f.source !== 'peppol').concat(res.findings);
      d.validation = 'done';
      d.valMs = res.ms;
    } catch (e) {
      console.error(e);
      d.validation = 'error';
      d.validationError = 'Chyba validačného jadra: ' + (e && e.message || e);
    }
    applyFindings(d);
    refresh(d);
  }

  function refresh(d) {
    if (cur() === d) renderAll(); else renderFileList();
  }

  async function openFiles(fileList) {
    for (const file of Array.from(fileList)) {
      try { addDoc(file.name, await file.arrayBuffer()); }
      catch (e) { alert('Súbor ' + file.name + ' sa nepodarilo načítať: ' + e.message); }
    }
  }

  /* ---------- vykreslenie ---------- */
  function renderFileList() {
    const box = $('#files');
    box.innerHTML = state.docs.map((d, i) => {
      const c = View.counts(d.findings);
      const st = d.validation === 'running' || d.validation === 'pending' ? 'run' : c.err ? 'bad' : c.warning ? 'warn' : 'ok';
      return `<button class="file-chip${i === state.cur ? ' active' : ''}" data-doc="${i}" title="${U.esc(d.name)}"><span class="dot ${st}"></span><span class="fn">${U.esc(d.name)}</span><span class="x" data-close="${i}" title="Zavrieť">×</span></button>`;
    }).join('');
    box.hidden = state.docs.length < 2;
  }

  function renderAll() {
    clearHover();
    paperIdx = null;
    View.setOpts(state.opts);
    const b = document.body;
    b.classList.toggle('show-bt', state.opts.showBT);
    b.classList.toggle('xml-wrap', state.opts.wrap);
    b.classList.toggle('has-doc', !!cur());
    $$('[data-opt]').forEach(el => { el.setAttribute('aria-pressed', String(!!state.opts[el.dataset.opt])); });
    renderFileList();
    const d = cur();
    if (!d) return;
    $('#paper').innerHTML = View.renderInvoice(d);
    $('#status').innerHTML = View.renderStatus(d);
    $('#doc-name').textContent = d.name;
    renderTabs();
    renderInspector();
    markSelection(false);
  }

  function renderTabs() {
    const d = cur();
    if (!d) return;
    const c = View.counts(d.findings);
    $('#tab-findings-n').textContent = d.findings.length ? String(d.findings.length) : '';
    $('#tab-findings-n').className = 'badge ' + (c.err ? 'bad' : c.warning ? 'warn' : d.findings.length ? 'info' : '');
    const na = d.model ? d.model.attachments.length : 0;
    $('#tab-att-n').textContent = na ? String(na) : '';
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === state.tab));
    $$('.pane').forEach(p => { p.hidden = p.dataset.pane !== state.tab; });
    if (state.tab === 'findings') {
      $$('[data-filter]').forEach(bn => {
        const k = bn.dataset.filter;
        const n = k === 'all' ? d.findings.length : k === 'err' ? c.err : k === 'warning' ? c.warning : c.info;
        bn.querySelector('.n').textContent = n;
        bn.classList.toggle('active', state.filter === k);
      });
      $('#findings-list').innerHTML = View.renderFindings(d, state.filter);
    } else if (state.tab === 'xml') {
      renderXmlPane(d);
    } else if (state.tab === 'map') {
      $('#map-body').innerHTML = View.renderMapping(d, state.mapQ, state.mapMissing);
    } else if (state.tab === 'att') {
      $('#att-body').innerHTML = View.renderAttachments(d);
    }
  }

  function renderXmlPane(d) {
    const body = $('#xml-body');
    if (xmlView.docId !== d.uid || !body.firstChild) {
      body.innerHTML = View.renderXml(d);
      xmlView.docId = d.uid;
      xmlView.lines = $$('.xl', body);
      xmlView.byLine = new Map(xmlView.lines.map(el => [+el.dataset.l, el]));
    }
    $('#xml-info').textContent = `${U.fmtNum(d.parsed.lineStarts.length)} riadkov · ${U.fmtSize(d.size)}` + (d.repaired ? ' · zobrazená opravená kópia' : '');
  }

  function renderInspector() {
    $('#inspector').innerHTML = View.renderInspector(cur(), state.sel);
  }

  /* ---------- výber ---------- */
  function rangesForSel() {
    const d = cur(), s = state.sel;
    if (!d || !s) return null;
    const R = { ranges: [], nids: [], fields: [] };
    const addNode = (n, attrLine) => {
      if (!n) return;
      if (attrLine) R.ranges.push([attrLine, attrLine]);
      else if (n === d.parsed.root) R.ranges.push([n.line, n.line]);
      else R.ranges.push([n.line, n.endLine]);
      R.nids.push(n.nid);
    };
    const addField = f => {
      R.fields.push(f);
      if (f.node) addNode(f.node, f.attr ? f.line : null);
      else if (f.ctx) R.ranges.push([f.ctx.line, f.ctx.line]);
    };
    if (s.type === 'field') addField(d.model.fields[s.id]);
    else if (s.type === 'node') addNode(d.parsed.nodes[s.id]);
    else if (s.type === 'line') R.ranges.push([s.line, s.line]);
    else if (s.type === 'finding') {
      const f = d.findings[s.id];
      (f.fields || []).forEach(addField);
      if (f.node && f.node !== d.parsed.root) addNode(f.node);
      if (!R.ranges.length && f.line) R.ranges.push([f.line, f.line]);
      if (!R.ranges.length && f.node) addNode(f.node);
    }
    return R;
  }

  function markSelection(scroll) {
    $$('.f.sel, .f.fsel, .chip.sel, tr.sel, .fd.sel').forEach(e => e.classList.remove('sel', 'fsel'));
    const R = rangesForSel();
    const s = state.sel;
    if (R) {
      const fids = new Set(R.fields.map(f => f.id));
      let first = null;
      $$('#paper .f[data-f]').forEach(el => {
        if (fids.has(+el.dataset.f)) {
          el.classList.add(s.type === 'finding' ? 'fsel' : 'sel');
          first = first || el;
        }
      });
      $$('#map-body tr[data-f]').forEach(el => { if (fids.has(+el.dataset.f)) el.classList.add('sel'); });
      if (s.type === 'node') $$(`#map-body tr[data-n="${s.id}"]`).forEach(el => el.classList.add('sel'));
      if (s.type === 'finding') $$(`#findings-list .fd[data-fi="${s.id}"]`).forEach(el => el.classList.add('sel'));
      if (scroll && first && s.type !== 'field') first.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    highlightXml(R, scroll);
  }

  function highlightXml(R, scroll) {
    if (state.tab !== 'xml') return;
    const body = $('#xml-body');
    $$('.hl', body).forEach(e => e.classList.remove('hl'));
    $$('.hl-n', body).forEach(e => e.classList.remove('hl-n'));
    if (!R || !R.ranges.length) return;
    let first = null;
    const ranges = R.ranges.slice().sort((a, b) => a[0] - b[0]);
    for (const el of xmlView.lines) {
      const no = +el.dataset.l;
      if (ranges.some(([a, b]) => no >= a && no <= b)) { el.classList.add('hl'); first = first || el; }
    }
    for (const nid of R.nids) $$(`[data-n="${nid}"]`, body).forEach(e => e.classList.add('hl-n'));
    if (scroll && first) first.scrollIntoView({ block: 'center' });
  }

  function select(sel, o = {}) {
    state.sel = sel;
    if (o.tab && state.tab !== o.tab) { state.tab = o.tab; renderTabs(); }
    renderInspector();
    markSelection(o.scroll !== false);
  }

  function selectNode(nid, o, attr) {
    const d = cur();
    if (!d || !d.model) return select({ type: 'node', id: nid }, o);
    const fs = fieldsByNode(d).get(nid) || [];
    const best = (attr && fs.find(f => f.attr === attr)) || fs.find(f => !f.tech && !f.attr) || fs.find(f => !f.tech) || fs[0];
    select(best ? { type: 'field', id: best.id } : { type: 'node', id: nid }, o);
  }

  /* ---------- prílohy ---------- */
  const blobCache = new Map();
  function attBlob(i) {
    const d = cur();
    const key = d.uid + ':' + i;
    if (blobCache.has(key)) return blobCache.get(key);
    const A = d.model.attachments[i];
    const b64 = (A.bin.raw || '').replace(/\s+/g, '');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    let mime = (A.mime.value || 'application/octet-stream').trim();
    if (A.info && A.info.isPdf) mime = 'application/pdf';
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const name = (A.filename.fixed || A.filename.value || A.id.value || 'priloha').replace(/[/\\:*?"<>|]+/g, '_');
    const r = { url, mime, name };
    blobCache.set(key, r);
    return r;
  }

  function attAction(kind, i) {
    let a;
    try { a = attBlob(i); } catch (e) { alert('Prílohu sa nepodarilo dekódovať: ' + e.message); return; }
    if (kind === 'open') window.open(a.url, '_blank');
    else if (kind === 'download') {
      const link = document.createElement('a');
      link.href = a.url; link.download = a.name;
      document.body.appendChild(link); link.click(); link.remove();
    } else if (kind === 'preview') {
      const box = $('#att-prev-' + i);
      if (/^image\//.test(a.mime)) box.innerHTML = `<img src="${a.url}" alt="">`;
      else if (a.mime === 'application/pdf') box.innerHTML = `<iframe src="${a.url}" title="Náhľad prílohy"></iframe>`;
      else box.innerHTML = '<div class="muted small">Tento typ súboru nemá náhľad – použite Stiahnuť.</div>';
    }
  }

  /* ---------- pomocné ---------- */
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Skopírované'); }
    catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Skopírované'); } catch (_) { /* nič */ }
      ta.remove();
    }
  }
  let toastT;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, 1400);
  }

  function applyTheme() {
    const th = state.opts.theme;
    if (th === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = th;
    const lbl = { auto: 'Téma: auto', light: 'Téma: svetlá', dark: 'Téma: tmavá' }[th];
    $('#btn-theme').title = lbl;
    $('#btn-theme').setAttribute('aria-label', lbl);
  }
  function applyLayout() { document.documentElement.style.setProperty('--left-w', state.opts.leftW + '%'); }

  /* ---------- prechod myšou: XML ↔ vizuál (zvýraznenie, spojnica, karta) ---------- */
  const wide = window.matchMedia('(min-width: 901px)');
  const hov = { key: null, mode: null, H: null, lineEl: null, tipEl: null, xmlLines: [], els: [], cardT: 0, scrollT: 0, raf: 0 };
  let paperIdx = null;
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

  function paperEls(id) {
    if (!paperIdx) {
      paperIdx = new Map();
      for (const el of $$('#paper .f[data-f]')) {
        const k = +el.dataset.f;
        if (!paperIdx.has(k)) paperIdx.set(k, []);
        paperIdx.get(k).push(el);
      }
    }
    return paperIdx.get(id) || [];
  }

  function fieldsByNode(d) {
    if (!d.byNode) {
      d.byNode = new Map();
      for (const f of d.model ? d.model.fields : []) {
        if (!f.node) continue;
        if (!d.byNode.has(f.node.nid)) d.byNode.set(f.node.nid, []);
        d.byNode.get(f.node.nid).push(f);
      }
    }
    return d.byNode;
  }

  function xmlLineEl(no) {
    for (let l = no; l >= 1; l--) { const el = xmlView.byLine.get(l); if (el) return el; }
    return null;
  }

  /** Element v XML pod myšou: span s data-n; pri odsadení alebo čísle riadku prvý neprázdny token riadka. */
  function xmlTarget(t) {
    const line = t.closest('#xml-body .xl');
    if (!line) return null;
    let span = t.closest('[data-n]');
    if (!span || !span.textContent.trim()) span = $$('[data-n]', line).find(s => s.textContent.trim()) || null;
    return span ? { line, span, nid: +span.dataset.n, attr: span.dataset.a || null } : null;
  }

  /** Ktoré polia patria k elementu: vlastné (atribút → jeho pole), inak polia potomkov (agregát = skupina BG). */
  function resolveNode(d, nid, attr) {
    const n = d.parsed.nodes[nid];
    if (!n || n === d.parsed.root) return null;
    const H = { mode: 'xml', kind: 'none', node: n, attr, fields: [], shown: new Set(), group: null, findings: [] };
    if (d.model) {
      const own = fieldsByNode(d).get(nid) || [];
      let fs = attr ? own.filter(f => f.attr === attr) : [];
      if (!fs.length) fs = own.slice().sort((a, b) => (a.attr ? 1 : 0) - (b.attr ? 1 : 0));
      if (fs.length) H.kind = 'field';
      else if (n.children.length) {
        fs = d.model.fields.filter(f => f.node && f.node !== n && XP.isAncestorOrSelf(n, f.node));
        H.group = ublGroup(n);
        H.kind = fs.length === 1 && !H.group ? 'field' : fs.length ? 'group' : 'none';
      }
      H.fields = fs;
      for (const f of fs) if (paperEls(f.id).length) H.shown.add(f.id);
    }
    H.findings = H.fields.flatMap(f => f.findings).concat(d.findings.filter(fd => fd.node === n));
    return H;
  }

  function clearHover() {
    clearTimeout(hov.cardT); clearTimeout(hov.scrollT);
    if (!hov.key) return;
    hov.els.forEach(el => el.classList.remove('hov', 'hov-g'));
    hov.xmlLines.forEach(el => el.classList.remove('hov', 'hov-r'));
    Object.assign(hov, { key: null, mode: null, H: null, lineEl: null, tipEl: null, xmlLines: [], els: [] });
    $('#tip').hidden = true;
    $('#links').innerHTML = '';
  }

  function xmlHover(e) {
    const d = cur();
    const T = d && xmlTarget(e.target);
    if (!T) { clearHover(); return; }
    const key = `x${T.nid}:${T.attr || ''}:${T.line.dataset.l}`;
    if (key === hov.key) return;
    clearHover();
    const H = resolveNode(d, T.nid, T.attr);
    if (!H) return;
    Object.assign(hov, { key, mode: 'xml', H, lineEl: T.line });
    if (H.kind === 'group') {
      for (let l = H.node.line; l <= H.node.endLine; l++) {
        const el = xmlView.byLine.get(l);
        if (el) { el.classList.add('hov-r'); hov.xmlLines.push(el); }
      }
    }
    T.line.classList.add('hov');
    hov.xmlLines.push(T.line);
    hov.els = H.fields.flatMap(f => paperEls(f.id));
    hov.els.forEach(el => el.classList.add(H.kind === 'group' ? 'hov-g' : 'hov'));
    drawLinks();
    if (hov.els.length && wide.matches) hov.scrollT = setTimeout(revealPaper, 140);
    hov.cardT = setTimeout(() => { if (hov.key === key) showCard(d, H, T.line); }, 220);
  }

  function paperHover(el) {
    const d = cur();
    const f = d && d.model && d.model.fields[+el.dataset.f];
    if (!f || (hov.key === 'p' + f.id && hov.tipEl === el)) return;
    clearHover();
    Object.assign(hov, { key: 'p' + f.id, mode: 'paper', tipEl: el });
    const link = state.tab === 'xml' && !!f.node && wide.matches;
    if (link) {
      const a = f.attr ? f.line : f.node.line;
      const b = f.attr || f.node === d.parsed.root ? a : f.node.endLine;
      for (let l = a; l <= b; l++) {
        const x = l === a ? xmlLineEl(l) : xmlView.byLine.get(l);
        if (x && !hov.xmlLines.includes(x)) { x.classList.add('hov'); hov.xmlLines.push(x); }
      }
      el.classList.add('hov');
      hov.els = [el];
      drawLinks();
      hov.scrollT = setTimeout(revealXml, 140);
    }
    showCard(d, { mode: 'paper', kind: 'field', fields: [f], shown: new Set([f.id]), findings: f.findings }, el, link);
  }

  /** Karta: pri XML pod riadkom (ako v náhľade), pri vizuáli nad údajom tak, aby nezakryla XML. */
  function showCard(d, H, anchor, link) {
    const tip = $('#tip');
    const card = H.mode === 'xml';
    tip.innerHTML = View.hoverCard(d, H);
    tip.classList.toggle('card', card);
    const br = $('#xml-body').getBoundingClientRect();
    tip.style.maxWidth = card ? Math.max(260, Math.min(420, br.width - 72)) + 'px' : '';
    tip.hidden = false;
    const r = anchor.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const above = r.top - th - 6, below = r.bottom + 6;
    let x, y;
    if (card) {
      x = clamp(br.left + 64, 8, window.innerWidth - tw - 8);
      y = below + th > window.innerHeight - 8 ? above : below;
    } else {
      x = Math.max(8, Math.min(r.left, (link ? br.left - 8 : window.innerWidth - 8) - tw));
      y = link ? (above >= 8 ? above : below) : (below + th > window.innerHeight - 8 ? above : below);
    }
    tip.style.left = x + 'px';
    tip.style.top = Math.max(8, y) + 'px';
  }

  /** Obdĺžniky prvkov zlúčené do zhlukov – najprv podľa bloku vizuálu (riadok tabuľky, sekcia), potom podľa blízkosti. */
  const BLOCK = 'tr, .party, .box, .inv-head > div, .inv-foot';
  function clusters(els) {
    const G = 22;
    const byBlock = new Map();
    for (const el of els) {
      if (!el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) continue;
      const blk = el.closest(BLOCK) || el;
      const c = byBlock.get(blk);
      if (c) Object.assign(c, { l: Math.min(c.l, r.left), t: Math.min(c.t, r.top), r: Math.max(c.r, r.right), b: Math.max(c.b, r.bottom), n: c.n + 1 });
      else byBlock.set(blk, { l: r.left, t: r.top, r: r.right, b: r.bottom, n: 1 });
    }
    const cs = [...byBlock.values()];
    for (let merged = true; merged;) {
      merged = false;
      for (let i = 0; i < cs.length && !merged; i++) {
        for (let j = i + 1; j < cs.length; j++) {
          const a = cs[i], b = cs[j];
          if (a.l - G <= b.r && b.l - G <= a.r && a.t - G <= b.b && b.t - G <= a.b) {
            cs[i] = { l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b), n: a.n + b.n };
            cs.splice(j, 1);
            merged = true;
            break;
          }
        }
      }
    }
    return cs.sort((a, b) => a.t - b.t);
  }

  function paperView() {
    const left = $('#left');
    const lb = left.getBoundingClientRect();
    return { l: lb.left, r: lb.left + left.clientWidth, t: $('.left-bar', left).getBoundingClientRect().bottom, b: lb.top + left.clientHeight };
  }

  function drawLinks() {
    const svg = $('#links');
    const anchor = hov.mode === 'xml' ? hov.lineEl : hov.xmlLines[0];
    if (!hov.key || !anchor || !anchor.isConnected || !hov.els.length || !wide.matches || state.tab !== 'xml') { svg.innerHTML = ''; return; }
    const xb = $('#xml-body').getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    const ax = xb.left + 3, ay = clamp(ar.top + ar.height / 2, xb.top + 4, xb.bottom - 4);
    const V = paperView();
    const group = hov.H && hov.H.kind === 'group';
    let boxes = '', lines = '', dots = `<circle class="lk-dot" cx="${ax}" cy="${ay}" r="4"/>`;
    for (const c of clusters(hov.els).slice(0, 4)) {
      const inView = c.b > V.t && c.t < V.b;
      if (inView && group) {
        boxes += `<rect class="lk-box" x="${c.l - 5}" y="${c.t - 4}" width="${c.r - c.l + 10}" height="${c.b - c.t + 8}" rx="5"/>`;
      }
      const px = Math.min(c.r + (group ? 5 : 3), V.r - 3);
      const py = clamp((c.t + c.b) / 2, V.t + 5, V.b - 5);
      const k = Math.max(36, (ax - px) * 0.5);
      const dPath = `M${px},${py} C${px + k},${py} ${ax - k},${ay} ${ax},${ay}`;
      lines += `<path class="lk-halo" d="${dPath}"/><path class="lk-line" d="${dPath}"/>`;
      dots += `<circle class="lk-dot" cx="${px}" cy="${py}" r="3.5"/>`;
    }
    svg.innerHTML = `<defs><clipPath id="lk-clip"><rect x="${V.l}" y="${V.t}" width="${V.r - V.l}" height="${Math.max(0, V.b - V.t)}"/></clipPath></defs>` +
      `<g clip-path="url(#lk-clip)">${boxes}</g>${lines}${dots}`;
  }

  function scheduleDraw() {
    if (!hov.raf) hov.raf = requestAnimationFrame(() => { hov.raf = 0; drawLinks(); });
  }

  /** Ak údaj nie je vo vizuáli viditeľný, posunie ho do zorného poľa. */
  function revealPaper() {
    if (hov.mode !== 'xml' || !hov.els.length) return;
    const V = paperView();
    const cs = clusters(hov.els);
    if (!cs.length || cs.some(c => c.t >= V.t + 4 && c.b <= V.b - 4)) return;
    const h = V.b - V.t, mid = V.t + h / 2;
    const c = cs.reduce((p, q) => (Math.abs((q.t + q.b) / 2 - mid) < Math.abs((p.t + p.b) / 2 - mid) ? q : p));
    const delta = c.b - c.t > h - 40 ? c.t - V.t - 16 : (c.t + c.b) / 2 - (V.t + h * 0.4);
    $('#left').scrollBy({ top: delta, behavior: 'smooth' });
  }

  function revealXml() {
    if (hov.mode !== 'paper' || !hov.xmlLines.length) return;
    const body = $('#xml-body');
    const br = body.getBoundingClientRect();
    const r = hov.xmlLines[0].getBoundingClientRect();
    const r2 = hov.xmlLines[hov.xmlLines.length - 1].getBoundingClientRect();
    if (r.top >= br.top + 4 && r2.bottom <= br.bottom - 4) return;
    body.scrollBy({ top: r.top - (br.top + br.height * 0.4), behavior: 'smooth' });
  }

  /* ---------- udalosti ---------- */
  function bind() {
    $('#file-input').addEventListener('change', e => { openFiles(e.target.files); e.target.value = ''; });
    $$('[data-action="open"]').forEach(b => b.addEventListener('click', () => $('#file-input').click()));
    $$('[data-action="demo"]').forEach(b => b.addEventListener('click', () => {
      const txt = $('#demo-xml').textContent.trim();
      addDoc('ukážka-peppol-base-example.xml', new TextEncoder().encode(txt).buffer);
    }));
    $('#btn-print').addEventListener('click', () => window.print());
    $('#btn-theme').addEventListener('click', () => {
      const order = ['auto', 'light', 'dark'];
      state.opts.theme = order[(order.indexOf(state.opts.theme) + 1) % 3];
      saveOpts(); applyTheme();
    });
    $$('[data-opt]').forEach(el => el.addEventListener('click', () => {
      const k = el.dataset.opt;
      state.opts[k] = !state.opts[k];
      saveOpts();
      if (k === 'wrap') { document.body.classList.toggle('xml-wrap', state.opts.wrap); el.setAttribute('aria-pressed', String(state.opts.wrap)); return; }
      renderAll();
    }));
    $$('.tab').forEach(t => t.addEventListener('click', () => {
      clearHover();
      state.tab = t.dataset.tab;
      renderTabs();
      markSelection(true);
    }));
    $$('[data-filter]').forEach(bn => bn.addEventListener('click', () => { state.filter = bn.dataset.filter; renderTabs(); markSelection(false); }));
    $('#map-q').addEventListener('input', e => { state.mapQ = e.target.value; renderTabs(); markSelection(false); });
    $('#map-missing').addEventListener('change', e => { state.mapMissing = e.target.checked; renderTabs(); markSelection(false); });

    document.addEventListener('click', e => {
      const t = e.target;
      const close = t.closest('[data-close]');
      if (close) {
        e.stopPropagation();
        const i = +close.dataset.close;
        state.docs.splice(i, 1);
        if (state.cur >= state.docs.length) state.cur = state.docs.length - 1;
        state.sel = null; xmlView.docId = null;
        renderAll();
        return;
      }
      const chipDoc = t.closest('[data-doc]');
      if (chipDoc) { state.cur = +chipDoc.dataset.doc; state.sel = null; renderAll(); return; }
      const copyBtn = t.closest('[data-copy]');
      if (copyBtn) { copy(copyBtn.dataset.copy); return; }
      const att = t.closest('[data-att]');
      if (att) { attAction(att.dataset.att, +att.dataset.ai); return; }
      const gl = t.closest('[data-goto-line]');
      if (gl) {
        e.preventDefault();
        if (state.sel && state.sel.type !== 'line') select(state.sel, { tab: 'xml' });
        else select({ type: 'line', line: +gl.dataset.gotoLine }, { tab: 'xml' });
        return;
      }
      if (t.closest('a[href^="http"]')) return;
      const fi = t.closest('[data-fi]');
      if (fi && !t.closest('[data-f]')) { select({ type: 'finding', id: +fi.dataset.fi }); return; }
      const fEl = t.closest('[data-f]');
      if (fEl) {
        const inPaper = !!t.closest('#paper');
        select({ type: 'field', id: +fEl.dataset.f }, { tab: inPaper ? 'xml' : undefined });
        return;
      }
      const xt = xmlTarget(t);
      if (xt) { selectNode(xt.nid, undefined, xt.attr); return; }
      const nEl = t.closest('#map-body [data-n]');
      if (nEl) { selectNode(+nEl.dataset.n); return; }
      const lineEl = t.closest('#xml-body .xl');
      if (lineEl) { select({ type: 'line', line: +lineEl.dataset.l }); }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { state.sel = null; renderInspector(); markSelection(false); }
    });

    const paper = $('#paper');
    paper.addEventListener('mouseover', e => { const el = e.target.closest('.f[data-f]'); if (el) paperHover(el); });
    paper.addEventListener('mouseout', e => {
      const el = e.target.closest('.f[data-f]');
      if (el && !el.contains(e.relatedTarget) && hov.mode === 'paper') clearHover();
    });
    // pri prechode po XML sa vizuál posúva programovo – vtedy sa spojnica len prekreslí
    $('#left').addEventListener('scroll', () => { if (hov.mode === 'paper') clearHover(); else if (hov.mode) scheduleDraw(); }, { passive: true });
    const xmlBody = $('#xml-body');
    xmlBody.addEventListener('mousemove', xmlHover);
    xmlBody.addEventListener('mouseleave', () => { if (hov.mode === 'xml') clearHover(); });
    xmlBody.addEventListener('scroll', () => {
      if (hov.mode === 'xml') $('#tip').hidden = true;
      if (hov.mode) scheduleDraw();
    }, { passive: true });
    window.addEventListener('resize', clearHover);

    // drag & drop
    let dragDepth = 0;
    window.addEventListener('dragenter', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
    window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => {
      e.preventDefault();
      dragDepth = 0;
      document.body.classList.remove('dragging');
      if (e.dataTransfer && e.dataTransfer.files.length) openFiles(e.dataTransfer.files);
    });
    // vloženie XML zo schránky
    document.addEventListener('paste', e => {
      if (e.target.closest && e.target.closest('input, textarea')) return;
      const txt = e.clipboardData && e.clipboardData.getData('text/plain');
      if (txt && /^\s*</.test(txt)) addDoc('vlozene-zo-schranky.xml', new TextEncoder().encode(txt).buffer);
    });

    // zmena šírky panelov
    const gutter = $('#gutter');
    gutter.addEventListener('pointerdown', e => {
      gutter.setPointerCapture(e.pointerId);
      const move = ev => {
        const w = Math.min(80, Math.max(30, ev.clientX / window.innerWidth * 100));
        state.opts.leftW = Math.round(w);
        applyLayout();
      };
      const up = () => { gutter.removeEventListener('pointermove', move); gutter.removeEventListener('pointerup', up); saveOpts(); };
      gutter.addEventListener('pointermove', move);
      gutter.addEventListener('pointerup', up);
    });
  }

  function init() {
    applyTheme();
    applyLayout();
    bind();
    $('#rules-ver').textContent = window.RULES_META ? window.RULES_META.label : '';
    renderAll();
    Validator.load().catch(e => console.warn('Pravidlá sa nepodarilo pripraviť:', e));
  }

  return { init, state, addDoc };
})();

document.addEventListener('DOMContentLoaded', App.init);
