"""Step 1 on the demo Loft server: admin, people, sections, a scan. Saves the book and file ids (ids.json)."""
import http.cookiejar, json, sys, time, urllib.request

U = 'http://127.0.0.1:4599/api'
PW = 'demo-password-123'


class Client:
    def __init__(self):
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def call(self, method, path, body=None, ok=True):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(U + path, data=data, method=method, headers={'Content-Type': 'application/json'} if data else {})
        try:
            with self.op.open(req) as r:
                t = r.read()
                return json.loads(t) if t else None
        except urllib.error.HTTPError as e:
            msg = e.read().decode()
            if ok: raise SystemExit(f'{method} {path}: {e.code} {msg}')
            return {'error': e.code, 'detail': msg}


admin = Client()
admin.call('POST', '/setup', {'username': 'Etienne', 'password': PW})
for name in ('Sam', 'Jo', 'Priya', 'Lena'):
    admin.call('POST', '/users', {'username': name, 'password': PW})
admin.call('PATCH', '/library', {'sections': [
    {'name': 'Fiction', 'tags': ['Literary', 'Mystery', 'Historical', 'Fiction']},
    {'name': 'Fantasy', 'tags': ['Fantasy']},
    {'name': 'Science fiction', 'tags': ['Science fiction']},
    {'name': 'Non-fiction', 'tags': ['Non-fiction']},
    {'name': 'Comics', 'tags': ['Comics']},
], 'join_requests': True})
admin.call('POST', '/scan')
for _ in range(120):
    s = admin.call('GET', '/scan')
    if not s.get('running'): break
    time.sleep(1)
print('scan:', s.get('last'))
books = admin.call('GET', '/books?sort=added&offset=0&limit=100')
out = {}
for b in books['books']:
    d = admin.call('GET', f'/books/{b["id"]}')
    out[d['title']] = {'id': d['id'], 'files': [(f['id'], f['format'], f.get('readable')) for f in d['files']]}
print(json.dumps(out, indent=0, ensure_ascii=False))
json.dump(out, open(sys.argv[1], 'w'), ensure_ascii=False)
