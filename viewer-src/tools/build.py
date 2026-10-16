"""Zostaví jeden offline HTML súbor eFaktura-Viewer.html zo zdrojov vo viewer-src/.

Použitie:  python viewer-src/tools/build.py  [výstupný_súbor]
"""
import base64
import datetime
import html
import json
import pathlib
import sys

SRC = pathlib.Path(__file__).resolve().parent.parent          # viewer-src/
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else SRC.parent / 'eFaktura-Viewer.html'

JS_FILES = ['codes.js', 'util.js', 'xmlparse.js', 'model.js', 'skchecks.js', 'validate.js', 'render.js', 'app.js']


def read(rel):
    return (SRC / rel).read_text(encoding='utf-8')


def safe_json(v):
    return json.dumps(v, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')


def no_script_end(name, text):
    if '</script' in text.lower():
        raise SystemExit(f'{name} obsahuje "</script" – nedá sa vložiť inline')
    return text


def main():
    page = read('src/index.html')
    meta = json.loads(read('rules/versions.json'))
    meta['built'] = datetime.date.today().strftime('%d. %m. %Y').lstrip('0').replace(' 0', ' ')
    data = {
        'RULES_META': meta,
        'SK_BT': json.loads(read('data/sk_bt.json')),
        'SK_RULES': json.loads(read('data/sk_rules.json')),
        'CODEPAGES': json.loads(read('data/codepages.json')),
    }
    data_js = ''.join(f'window.{k}={safe_json(v)};\n' for k, v in data.items())
    app_js = '\n'.join(no_script_end(f, read('src/js/' + f)) for f in JS_FILES)
    parts = {
        '/*INJECT:CSS*/': read('src/styles.css'),
        '/*INJECT:DATA*/': data_js,
        '/*INJECT:SAXON*/': no_script_end('SaxonJS2.rt.js', read('vendor/SaxonJS2.rt.js')),
        '/*INJECT:APP*/': app_js,
        '<!--INJECT:DEMO-->': no_script_end('demo', read('data/demo-base-example.xml').strip()),
        '<!--INJECT:RULES_CEN-->': base64.b64encode((SRC / 'rules/CEN.sef.json.gz').read_bytes()).decode('ascii'),
        '<!--INJECT:RULES_PEPPOL-->': base64.b64encode((SRC / 'rules/PEPPOL.sef.json.gz').read_bytes()).decode('ascii'),
        '<!--INJECT:SAXON_LICENSE-->': html.escape(read('vendor/LICENSE-SaxonJS.txt')),
    }
    for key, value in parts.items():
        if page.count(key) != 1:
            raise SystemExit(f'Značka {key} sa v index.html nachádza {page.count(key)}×')
        page = page.replace(key, value)
    OUT.write_text(page, encoding='utf-8', newline='\n')
    print(f'Zostavené: {OUT}  ({OUT.stat().st_size / 1024 / 1024:.2f} MB)')


if __name__ == '__main__':
    main()
