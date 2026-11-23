# Building the Loft demo

`loft-demo/` on the site is the real Loft web app (copied unchanged from Loft's `src/loft/web`),
with `loft-demo/demo/mock.js` standing in for the server. The stand-in answers from
`loft-demo/demo/db.json` and the files beside it: a recording of a real Loft server running on a
made-up library. `loft-demo/sw.js` serves the covers, page images and book files, which the app
loads straight into the page. `loft-demo/index.html` installs that service worker, then opens the app
(`app.html`).

When Loft's web app changes, record the demo again so it matches. You need Loft's source, `uv`,
`node` (22 or newer), Chromium, and Python with Pillow.

```bash
WORK=/tmp/loft-demo-work            # anywhere; it's thrown away afterwards
LOFT=~/src/Loft                     # Loft's source
SITE="$PWD"                         # the website repo
T=$SITE/tools/loft-demo

# 1. The made-up library: 20 books (EPUB, CBZ comics, a PDF), and one more for a member to submit
python3 $T/make_library.py $WORK/books
LIB=extra.json python3 $T/make_library.py $WORK/extra

# 2. A real Loft server on it, in a throwaway data folder (leave it running)
cd $LOFT && LOFT_CONFIG=/nonexistent.toml LOFT_BOOKS_DIRS=$WORK/books LOFT_DATA_DIR=$WORK/data \
  LOFT_PORT=4599 LOFT_HOST=127.0.0.1 uv run loft &

# 3. People, reading, talk; then record it all into the site
python3 $T/setup1.py $WORK/ids.json   # the admin (Etienne), four members, sections, a scan
python3 $T/read.py $WORK              # each person reads in the real reader; books get their tags
python3 $T/setup2.py $WORK            # messages, statuses, shelves, a request, a submission, a join request
python3 $T/record.py $WORK $LOFT $SITE
```

`record.py` replaces everything in `loft-demo/` except `index.html`, `sw.js` and `demo/mock.js`, which
belong to the demo. If the app starts asking the server for something new, `demo/mock.js` needs to
answer it. Its rules are ports of the server's own (`library.py`, `browse.py`, `statuses.py`,
`reading.py`, `discussion.py`, `fuzzy.py`).

To check the demo, serve the site and open `/loft-demo/` (a service worker needs `http://localhost`
or https, not a `file://` page):

```bash
python3 -m http.server 8765   # then http://localhost:8765/loft-demo/
```

Every book, author, person and message in the demo is made up.
