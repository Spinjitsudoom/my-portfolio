"""Record the demo Loft server into the website's loft-demo/ folder: the real web app's files, and a
snapshot of the server (as the admin, Alex) that the in-page stand-in serves.

Usage: record.py WORK_DIR LOFT_SOURCE_DIR SITE_DIR
"""
import http.cookiejar, json, shutil, sqlite3, sys, time, urllib.request, urllib.parse
from pathlib import Path

D, SRC, SITE = (Path(a) for a in sys.argv[1:4])
OUT = SITE / 'loft-demo'
DATA = OUT / 'demo'
U = 'http://127.0.0.1:4599/api'
DB = D / 'data' / 'loft.db'
PAGE_W = 1000

op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def raw(method, path, body=None):
    req = urllib.request.Request(U + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={'Content-Type': 'application/json'} if body is not None else {})
    with op.open(req) as r:
        return r.read(), r.headers.get('content-type', '')


def get(path):
    return json.loads(raw('GET', path)[0])


raw('POST', '/login', {'username': 'Alex', 'password': 'demo-password-123'})

# ── The app itself, unchanged (its sw.js is replaced by the demo's) ──────────────────────────────
# The demo's own files (index.html, sw.js, demo/mock.js) stay; the app and the recording are replaced.
keep = {p: (OUT / p).read_bytes() for p in ('index.html', 'sw.js', 'demo/mock.js') if (OUT / p).exists()}
if OUT.exists():
    shutil.rmtree(OUT)
web = SRC / 'src' / 'loft' / 'web'
shutil.copytree(web, OUT, ignore=shutil.ignore_patterns('sw.js'))
(OUT / 'index.html').rename(OUT / 'app.html')
app = (OUT / 'app.html').read_text(encoding='utf-8')
app = app.replace('  <script src="vendor/page-flip.browser.js"></script>',
                  '  <script src="demo/mock.js"></script>  <!-- the demo: answers the app\'s server calls from a recording -->\n'
                  '  <script src="vendor/page-flip.browser.js"></script>', 1)
app = app.replace('<meta name="description"', '<meta name="robots" content="noindex">\n  <meta name="description"', 1)
(OUT / 'app.html').write_text(app, encoding='utf-8')
DATA.mkdir()
for p, body in keep.items():
    (OUT / p).write_bytes(body)
for sub in ('covers', 'pages', 'chapters', 'files'):
    (DATA / sub).mkdir()

# ── What the server knows, straight from its database ──────────────────────────────────────────
con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
REF = time.time()
users = {r['id']: r['username'] for r in con.execute('SELECT id, username FROM users')}
books_db = {r['id']: dict(r) for r in con.execute('SELECT id, added_at, sort_title FROM books')}

stacks = get('/stacks?by=series')
extra = {b['id']: b for c in stacks['cases'] for b in c['books']}

books = []
order = [b['id'] for b in get('/books?sort=added&offset=0&limit=200')['books']]
for bid in sorted(books_db):
    d = get(f'/books/{bid}')
    for k in ('progress', 'shelves', 'status', 'series_books'):
        d.pop(k, None)
    x = extra[bid]
    d.update(sort_title=books_db[bid]['sort_title'], formats=x['formats'], size=x['size'], pages=x['pages'],
             added_at=REF - 86400 * 30 + 3600 * (len(order) - order.index(bid)) * 7)
    books.append(d)
    img, _ = raw('GET', f'/books/{bid}/cover?w=480&v={d["cover_v"]}')
    (DATA / 'covers' / f'{bid}.jpg').write_bytes(img)

files = {}
for b in books:
    for f in b['files']:
        fid = f['id']
        body, ctype = raw('GET', f'/files/{fid}')
        (DATA / 'files' / f'{fid}.{f["format"]}').write_bytes(body)
        if f['readable'] == 'flow':
            flow = get(f'/files/{fid}/flow')
            files[fid] = {'kind': 'flow', 'flow': flow, 'name': f'{b["title"]}.{f["format"]}'}
            for n in range(len(flow['chapters'])):
                html, _ = raw('GET', f'/files/{fid}/chapters/{n}?v={flow["version"]}')
                (DATA / 'chapters' / f'{fid}-{n}.html').write_bytes(html)
        else:
            man = get(f'/files/{fid}/manifest')
            files[fid] = {'kind': 'pages', 'manifest': man, 'name': f'{b["title"]}.{f["format"]}'}
            for i in range(man['count']):
                img, _ = raw('GET', f'/files/{fid}/pages/{i}?w={PAGE_W}&v={man["version"]}')
                (DATA / 'pages' / f'{fid}-{i}.jpg').write_bytes(img)

# Alex's own reading: progress, statuses set by hand, shelves (Want to read is one), bookmarks.
H, DAY = 3600, 86400
when = {}   # book title -> how long ago it was last read
progress = {}
for r in con.execute('SELECT * FROM progress WHERE user_id = 1'):
    progress[r['book_id']] = {'file_id': r['file_id'], 'page': r['page'], 'pages': r['pages'], 'position': r['position'],
                              'finished': bool(r['finished']), 'updated_at': r['updated_at'],
                              'locator': json.loads(r['locator']) if r['locator'] else None}
title_of = {b['id']: b['title'] for b in books}
ago = {'Salt in the Lamp': 2 * H, 'Starfall Academy': 1 * DAY + 3 * H, 'Harbour Patrol, Vol. 1': 3 * DAY,
       'The Keeper of Grey Harbour': 24 * DAY, 'Paper Orchard': 19 * DAY}
for bid, p in progress.items():
    p['updated_at'] = REF - ago.get(title_of[bid], 5 * DAY)
marks = {r['book_id']: {'status': r['status'], 'set_at': REF - {'Paper Orchard': 18 * DAY}.get(title_of[r['book_id']], 40 * DAY)}
         for r in con.execute('SELECT * FROM book_status WHERE user_id = 1')}
shelves = []
for s in con.execute('SELECT * FROM shelves WHERE user_id = 1'):
    items = [{'book_id': r['book_id'], 'added_at': REF - ({'want': 6 * DAY}.get(s['kind'], 8 * DAY)) - k * DAY}
             for k, r in enumerate(con.execute('SELECT * FROM shelf_books WHERE shelf_id = ? ORDER BY added_at DESC', (s['id'],)))]
    shelves.append({'id': s['id'], 'name': s['name'], 'kind': s['kind'], 'books': items})

# Everyone's messages, with where each writer was; spread over the last days.
msg_ago = [4 * DAY, 2 * DAY + 5 * H, 26 * H, 20 * H, 3 * H, 9 * DAY, 5 * DAY]
messages = []
for k, r in enumerate(con.execute('SELECT * FROM messages ORDER BY id')):
    messages.append({'id': r['id'], 'book_id': r['book_id'], 'user_id': r['user_id'], 'by': users.get(r['user_id'], 'Someone who has left'),
                     'parent_id': r['parent_id'], 'body': r['body'], 'position': r['position'], 'place': r['place'],
                     'at': REF - (msg_ago[k] if k < len(msg_ago) else H), 'edited': False, 'removed': bool(r['removed'])})
notif_ago = {'reply': 20 * H, 'request': 2 * DAY, 'submission': 6 * H, 'join': 40 * 60}
notifications = [{**n, 'at': REF - notif_ago.get(n['kind'], H)} for n in get('/notifications')['items']]

# Admin screens: as the server answers them, with this computer's folders swapped for ordinary ones.
fake = lambda o: json.loads(json.dumps(o).replace(str(D / 'data'), '/home/alex/.local/share/loft').replace(str(D / 'books'), '/home/alex/Books'))
recorded = {}
for path in ('/status', '/me', '/settings', '/library', '/users', '/backups', '/updates', '/check', '/check/ignored',
             '/sections', '/requests', '/requests?closed=true', '/submissions', '/submissions/mine', '/join-requests',
             '/scan', '/autofill', '/ping'):
    try:
        recorded[path] = fake(get(path))
    except urllib.error.HTTPError as e:
        print('skipped', path, e.code)

sub = recorded.get('/submissions') or []
if sub:
    img, _ = raw('GET', f'/uploads/{sub[0]["token"]}/cover')
    (DATA / 'covers' / 'upload.jpg').write_bytes(img)

# The test files are tiny; real ones are megabytes. The stacks size a spine by its file (when the
# page count isn't known), so each book gets a typical size there (its page still shows the real one).
import random
for b in books:
    r = random.Random(b['title'])
    b['size'] = int((r.uniform(45, 95) if 'cbz' in b['formats'] else r.uniform(9, 16) if 'pdf' in b['formats'] else r.uniform(0.7, 6.5)) * 1e6)

snapshot = {'ref': REF, 'me': 1, 'users': users, 'books': books, 'files': {str(k): v for k, v in files.items()},
            'progress': {str(k): v for k, v in progress.items()}, 'marks': {str(k): v for k, v in marks.items()},
            'shelves': shelves, 'messages': messages, 'notifications': notifications, 'recorded': recorded}
(DATA / 'db.json').write_text(json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print('books', len(books), 'files', len(files), 'messages', len(messages), 'notifications', len(notifications))
print('recorded', sorted(recorded))
