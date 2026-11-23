"""Step 3 on the demo Loft server: discussions, statuses, shelves, a request, a submission, a join request."""
import http.cookiejar, json, sys, time, urllib.request, urllib.parse

D = sys.argv[1]
U = 'http://127.0.0.1:4599/api'
PW = 'demo-password-123'
ids = {t: v['id'] for t, v in json.load(open(f'{D}/ids.json')).items()}


class Client:
    def __init__(self, name):
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.call('POST', '/login', {'username': name, 'password': PW})

    def call(self, method, path, body=None, raw=None, ctype=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        headers = {'Content-Type': ctype or 'application/json'} if data is not None else {}
        req = urllib.request.Request(U + path, data=data, method=method, headers=headers)
        try:
            with self.op.open(req) as r:
                t = r.read()
                return json.loads(t) if t else None
        except urllib.error.HTTPError as e:
            raise SystemExit(f'{method} {path}: {e.code} {e.read().decode()}')


me, sam, jo, priya, lena = (Client(n) for n in ('Etienne', 'Sam', 'Jo', 'Priya', 'Lena'))
salt, star = ids['Salt in the Lamp'], ids['Starfall Academy']

say = lambda who, book, text, parent=None: who.call('POST', f'/books/{book}/discussion', {'body': text, 'parent_id': parent})
say(sam, salt, 'The chapter where the harbour freezes overnight is the creepiest thing I’ve read all year.')
time.sleep(1.1)
jo_msg = say(jo, salt, 'Is anyone else reading the logbook entries out loud? Admiral the cat is the real hero of this series.')
time.sleep(1.1)
mine = say(me, salt, 'Admiral sitting on the stranger’s boots is the best moment in the whole series so far.', None)
time.sleep(1.1)
say(sam, salt, 'He’s been right about everyone so far, so I trust the cat.', mine['id'] if mine and 'id' in mine else None)
time.sleep(1.1)
say(priya, salt, 'WAIT. The handwriting in the logbook was hers the whole time?! I need to go back and reread everything.')
time.sleep(1.1)
say(lena, star, 'The sorting-by-starlight ceremony is such a good opening.')
time.sleep(1.1)
say(sam, star, 'I did NOT see the headmaster being the second student coming. Thirty years late to his own exam.')

# Etienne's own statuses and shelves
me.call('PUT', f'/books/{ids["Paper Orchard"]}/status', {'status': 'incomplete'})
me.call('PUT', f'/books/{ids["Field Guide to Clouds"]}/status', {'status': 'want'})
me.call('PUT', f'/books/{ids["Midnight at the Museum of Clocks"]}/status', {'status': 'want'})
me.call('PUT', f'/books/{ids["A Short History of Long Walks"]}/status', {'status': 'finished'})
shelf = me.call('POST', '/shelves', {'name': 'Holiday reads'})
for t in ('The Quiet Engine', 'The Cartographer’s Apprentice', 'Small Hours'):
    me.call('PUT', f'/shelves/{shelf["id"]}/books/{ids[t]}')

# A request with votes, and a book submitted for approval
req = jo.call('POST', '/requests', {'title': 'The Lantern Maker', 'author': 'Ada Quill', 'note': 'Sam says it’s like Starfall for grown-ups.'})
rid = req['id'] if isinstance(req, dict) and 'id' in req else None
print('request:', req)
if rid:
    sam.call('POST', f'/requests/{rid}/vote', {'on': True})
    lena.call('POST', f'/requests/{rid}/vote', {'on': True})
raw = open(f'{D}/extra/Odile Marsh/The Winter Ferry/The Winter Ferry.epub', 'rb').read()
up = sam.call('PUT', '/uploads?name=' + urllib.parse.quote('The Winter Ferry.epub'), raw=raw, ctype='application/epub+zip')
print('upload keys:', list(up))
sub = sam.call('POST', f'/uploads/{up["token"]}/submit', {'details': up.get('details', {})})
print('submitted:', sub if not isinstance(sub, dict) else {k: sub[k] for k in list(sub)[:4]})

# Someone asking to join, and a backup
anon = urllib.request.build_opener()
req = urllib.request.Request(U + '/join', data=json.dumps({'username': 'Marco', 'password': PW, 'note': 'Jo’s brother. She says you have all the Harbour Patrol comics.'}).encode(),
                             method='POST', headers={'Content-Type': 'application/json'})
print('join:', anon.open(req).status)
print('backup:', me.call('POST', '/backups'))
print('notifications:', json.dumps(me.call('GET', '/notifications'), ensure_ascii=False)[:1200])
