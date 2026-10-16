"""Aktualizuje validačné pravidlá EN 16931 / Peppol BIS 3.0 a znovu zostaví eFaktura-Viewer.html.

Postup:
  1. stiahne aktuálne CEN-EN16931-UBL.sch a PEPPOL-EN16931-UBL.sch z docs.peppol.eu,
  2. skompiluje ich: Schematron → XSLT (SchXslt 1.10.1) → SEF pre SaxonJS (xslt3 2.7.0, Node.js),
  3. overí ich na oficiálnych príkladoch Peppol (žiadny príklad nesmie mať chybu),
  4. uloží rules/*.sef.json.gz + rules/versions.json a spustí build.py.

Node.js a nástroje sa (ak nie sú v systéme) stiahnu do %LOCALAPPDATA%\\efaktura-viewer-tools (cca 60 MB, mimo OneDrive).
Použitie:  python viewer-src/tools/update_rules.py [--mandatory RRRR-MM-DD]
"""
import argparse
import datetime
import gzip
import io
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile

TOOLS = pathlib.Path(__file__).resolve().parent
SRC = TOOLS.parent
RULES = SRC / 'rules'
CACHE = pathlib.Path(os.environ.get('LOCALAPPDATA') or pathlib.Path.home() / '.cache') / 'efaktura-viewer-tools'
NODE_VER = 'v24.21.0'
DOCS = 'https://docs.peppol.eu/poacc/billing/3.0/files/'
SCHXSLT = 'https://repo1.maven.org/maven2/name/dmaus/schxslt/schxslt/1.10.1/schxslt-1.10.1.jar'

SMOKE_JS = r"""
const SaxonJS = require('saxon-js'); const fs = require('fs');
const [sefCen, sefPeppol, ...files] = process.argv.slice(2);
const pk = [JSON.parse(fs.readFileSync(sefCen, 'utf8')), JSON.parse(fs.readFileSync(sefPeppol, 'utf8'))];
let bad = 0;
for (const f of files) {
  const xml = fs.readFileSync(f, 'utf8');
  for (const p of pk) {
    const out = SaxonJS.transform({ stylesheetInternal: p, sourceText: xml, destination: 'serialized' }, 'sync').principalResult;
    const fatal = [...out.matchAll(/<svrl:failed-assert\b[^>]*flag="fatal"[^>]*id="([^"]*)"|<svrl:failed-assert\b[^>]*id="([^"]*)"[^>]*flag="fatal"/g)];
    if (fatal.length) { bad++; console.log('CHYBA', f, fatal.map(m => m[1] || m[2]).join(',')); }
  }
}
console.log(files.length + ' príkladov, ' + bad + ' s chybou');
process.exit(bad ? 1 : 0);
"""


def log(msg):
    print('»', msg, flush=True)


def fetch(url):
    log('sťahujem ' + url)
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read()


def long_path(p):
    p = str(p)
    return '\\\\?\\' + p if os.name == 'nt' and not p.startswith('\\\\?\\') else p


def ensure_node():
    sys_node = shutil.which('node')
    sys_npm = shutil.which('npm')
    if sys_node and sys_npm:
        return [sys_node], [sys_npm]
    if os.name != 'nt':
        raise SystemExit('Nainštalujte Node.js 18+ (node a npm v PATH).')
    node_dir = CACHE / 'node'
    node = node_dir / 'node.exe'
    npm_cli = node_dir / 'npm' / 'bin' / 'npm-cli.js'
    if not node.exists():
        data = fetch(f'https://nodejs.org/dist/{NODE_VER}/node-{NODE_VER}-win-x64.zip')
        z = zipfile.ZipFile(io.BytesIO(data))
        pre = f'node-{NODE_VER}-win-x64/'
        for info in z.infolist():
            if info.is_dir():
                continue
            rel = info.filename[len(pre):]
            if rel == 'node.exe' or rel.startswith('node_modules/npm/'):
                target = node_dir / (rel if rel == 'node.exe' else 'npm/' + rel[len('node_modules/npm/'):])
                os.makedirs(long_path(target.parent), exist_ok=True)
                with open(long_path(target), 'wb') as fh:
                    fh.write(z.read(info))
    return [str(node)], [str(node), str(npm_cli)]


def ensure_tools(node, npm):
    work = CACHE / 'npm'
    work.mkdir(parents=True, exist_ok=True)
    if not (work / 'node_modules' / 'xslt3').exists():
        (work / 'package.json').write_text('{"name":"efv-rules","private":true}', encoding='utf-8')
        subprocess.run(npm + ['install', '--no-audit', '--no-fund', 'xslt3@2.7.0', 'saxon-js@2.7.0'], cwd=work, check=True)
    sx = CACHE / 'schxslt'
    if not (sx / 'xslt' / '2.0' / 'pipeline-for-svrl.xsl').exists():
        zipfile.ZipFile(io.BytesIO(fetch(SCHXSLT))).extractall(sx)
    return work, sx / 'xslt' / '2.0' / 'pipeline-for-svrl.xsl'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mandatory', help='dátum, od ktorého je verzia Peppol povinná (RRRR-MM-DD), len informatívne')
    args = ap.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    node, npm = ensure_node()
    work, pipeline = ensure_tools(node, npm)
    xslt3 = node + [str(work / 'node_modules' / 'xslt3' / 'xslt3.js')]
    tmp = CACHE / 'build'
    tmp.mkdir(exist_ok=True)

    meta = {}
    for key, name in (('cen', 'CEN-EN16931-UBL'), ('peppol', 'PEPPOL-EN16931-UBL')):
        sch = fetch(DOCS + name + '.sch')
        (tmp / (name + '.sch')).write_bytes(sch)
        text = sch.decode('utf-8')
        if key == 'cen':
            m = re.search(r'Schematron version (\d+(?:\.\d+)+)\s*-\s*Last update:\s*(\d{4}-\d{2}-\d{2})', text)
            meta['cen'] = {'version': m.group(1) if m else '?', 'date': m.group(2) if m else '?'}
        else:
            m = re.search(r'Last update:\s*(\d{4})\s+(\w+)\s+release\s+(\d+(?:\.\d+)+)', text)
            meta['peppol'] = {'version': m.group(3) if m else '?', 'release': f'{m.group(2)} {m.group(1)}' if m else '?'}
        meta[key]['asserts'] = len(re.findall(r'<assert\b', text))
        log(f'kompilujem {name} ({meta[key]["asserts"]} pravidiel)')
        subprocess.run(xslt3 + [f'-xsl:{pipeline}', f'-s:{tmp / (name + ".sch")}', f'-o:{tmp / (name + ".xsl")}'], check=True)
        subprocess.run(xslt3 + [f'-xsl:{tmp / (name + ".xsl")}', f'-export:{tmp / (key + ".sef.json")}', '-nogo', '-relocate:on'], check=True)

    log('overujem na oficiálnych príkladoch Peppol')
    ex_dir = tmp / 'examples'
    shutil.rmtree(ex_dir, ignore_errors=True)
    zipfile.ZipFile(io.BytesIO(fetch(DOCS + 'BIS-Billing3-Examples.zip'))).extractall(ex_dir)
    examples = [str(p) for p in ex_dir.rglob('*.xml')]
    (work / 'smoke.js').write_text(SMOKE_JS, encoding='utf-8')
    r = subprocess.run(node + [str(work / 'smoke.js'), str(tmp / 'cen.sef.json'), str(tmp / 'peppol.sef.json')] + examples, cwd=work)
    if r.returncode:
        raise SystemExit('Pravidlá neprešli kontrolou na príkladoch – aktualizácia zrušená, pôvodné pravidlá ostávajú.')

    for key, name in (('cen', 'CEN'), ('peppol', 'PEPPOL')):
        with gzip.open(RULES / f'{name}.sef.json.gz', 'wb', compresslevel=9) as g:
            g.write((tmp / f'{key}.sef.json').read_bytes())
        shutil.copy(tmp / (('CEN' if key == 'cen' else 'PEPPOL') + '-EN16931-UBL.sch'), RULES)
    c, p = meta['cen'], meta['peppol']
    if args.mandatory:
        p['mandatory'] = args.mandatory
    versions = {
        'label': f'CEN {c["version"]} · Peppol BIS {p["version"]}',
        'long': f'EN 16931 UBL {c["version"]} ({c["date"]}, {c["asserts"]} pravidiel) a Peppol BIS Billing {p["version"]} '
                f'({p["release"]}{", povinné od " + p["mandatory"] if p.get("mandatory") else ""}, {p["asserts"]} pravidiel)',
        'cen': c, 'peppol': p,
        'compiler': 'SchXslt 1.10.1 + xslt3 2.7.0 → SEF pre SaxonJS 2.7',
        'compiled': datetime.date.today().isoformat(),
        'sk': json.loads((RULES / 'versions.json').read_text(encoding='utf-8')).get('sk', {}),
    }
    (RULES / 'versions.json').write_text(json.dumps(versions, ensure_ascii=False, indent=2), encoding='utf-8')
    log('pravidlá aktualizované: ' + versions['label'])
    subprocess.run([sys.executable, str(TOOLS / 'build.py')], check=True)


if __name__ == '__main__':
    main()
