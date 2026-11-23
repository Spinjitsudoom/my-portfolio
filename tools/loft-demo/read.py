"""Step 2: each person reads, in the real reader (headless Chromium, through cdp.mjs), so their
progress is what the app itself saves. Then every book gets its tags, and the comics and the PDF
their details, the way an admin would fill them in on the book's Edit page.

Usage: read.py WORK_DIR   (WORK_DIR holds ids.json from setup1.py)
"""
import http.cookiejar, json, subprocess, sys, urllib.request
from pathlib import Path

W = Path(sys.argv[1])
HERE = Path(__file__).parent
U = 'http://127.0.0.1:4599'
ids = {t: v['id'] for t, v in json.load(open(W / 'ids.json')).items()}

PLAN = {
    'Sam': [('Salt in the Lamp', .12), ('Starfall Academy', .93)],
    'Jo': [('Salt in the Lamp', .30)],
    'Priya': [('Salt in the Lamp', .71)],
    'Lena': [('Starfall Academy', .20)],
    # Etienne last, Salt in the Lamp last of all: it's the book Home opens on.
    'Etienne': [('The Keeper of Grey Harbour', 1.0), ('Paper Orchard', .21), ('Harbour Patrol, Vol. 1', .5),
                ('Starfall Academy', .64), ('Salt in the Lamp', .38)],
}
LOGIN = ("fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},"
         "body:JSON.stringify({username:'%s',password:'demo-password-123'})}).then(r=>r.status)")
GO_TO = ("(()=>{const s=document.querySelector('.scrubber');s.value=Math.round(%f*Number(s.max));"
         "s.dispatchEvent(new Event('change'));})()")

for who, reads in PLAN.items():
    steps = [{"size": [1280, 860]}, {"go": U + "/"}, {"wait": 1200}, {"js": LOGIN % who}, {"go": U + "/#/"}, {"wait": 1500}]
    for title, frac in reads:
        steps += [{"go": f"{U}/#/read/{ids[title]}"}, {"wait": 4000}, {"js": GO_TO % frac}, {"wait": 3500},
                  {"print": "'%s · %s: ' + document.querySelector('.reader-where')?.textContent" % (who, title)},
                  {"go": U + "/#/"}, {"wait": 2000}]
    plan = W / f'read-{who}.json'
    plan.write_text(json.dumps(steps))
    subprocess.run(['node', str(HERE / 'cdp.mjs'), str(plan)], check=True)

# Tags for every book; author, series and the rest for the comics and the PDF (their files carry none).
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def call(method, path, body=None):
    req = urllib.request.Request(U + '/api' + path, data=json.dumps(body).encode() if body is not None else None,
                                 method=method, headers={'Content-Type': 'application/json'})
    with op.open(req) as r:
        return json.loads(r.read() or b'null')


call('POST', '/login', {'username': 'Etienne', 'password': 'demo-password-123'})
for b in json.load(open(HERE / 'library.json')):
    patch = {'tags': b['tags']}
    if b['format'] != 'epub':
        patch.update(authors=[b['author']], description=b['blurb'], publisher=b['publisher'], published=str(b['year']), language='en')
        if b.get('series'):
            patch.update(series=b['series'], series_index=b['n'])
    call('PATCH', f'/books/{ids[b["title"]]}', patch)
print('details filled in')
