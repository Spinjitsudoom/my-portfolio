"""The demo library for Loft: 20 made-up books (EPUB, CBZ comics, a PDF), with covers.
Every title, author and word in them is invented for the demo.  Usage: make_library.py OUT_DIR"""
import html, io, json, math, pathlib, random, sys, zipfile
from PIL import Image, ImageDraw, ImageFont

OUT = pathlib.Path(sys.argv[1])
HERE = pathlib.Path(__file__).parent
SERIF_B = '/usr/share/fonts/google-noto/NotoSerif-Bold.ttf'
SERIF = '/usr/share/fonts/google-noto/NotoSerif-Regular.ttf'
SANS = '/usr/share/fonts/google-noto/NotoSans-Medium.ttf'
SANS_B = '/usr/share/fonts/google-noto/NotoSans-Black.ttf'
font = lambda p, s: ImageFont.truetype(p, s)
import os
BOOKS = json.loads((HERE / os.environ.get('LIB', 'library.json')).read_text())

STORY = [
    "The lighthouse keeper had not seen a ship in eleven days, which was why the knock at the door seemed, at first, like something the wind had invented.",
    "She set down the lamp. Outside, the sea was the colour of old pewter, and the rain came sideways off it in long grey ropes. Whoever was knocking had walked a long way to do it.",
    "“You’ll be wanting the map,” said the stranger, before she had the door fully open. He was younger than his voice, and wetter than seemed possible for one person.",
    "She did not have a map. She had a kettle, a cat named Admiral, and a logbook nobody had asked to read in thirty years. But there was something in the way he said it that made her step aside.",
    "Later she would say it was the boots. Nobody walks the cliff path in boots like that unless they mean to arrive somewhere, and she had always had a soft spot for people who meant things.",
    "The kettle took its time. It always did when there was company, as if it knew. The stranger stood dripping on the rag rug and looked at the logbook on the table the way some people look at a fire.",
    "“Thirty years,” he said. “Every ship, every storm, every light seen out past the point. You never missed a night.” It was not a question, and she did not answer it.",
    "Admiral, who trusted no one, walked twice around the stranger’s boots and then sat on them. That settled it, as far as the cat was concerned, and the cat had been right before.",
    "By morning the rain had gone east and taken the clouds with it. The harbour lay flat and bright below the lamp room, and the boats knocked gently against the quay as if they were asking to be let out.",
    "He was asleep in the chair by the stove, the map still folded inside his coat. She had not asked to see it. She had a feeling she already knew what it showed, and that she would not like it.",
    "The village had always told one story about the light: that it had never once gone dark. The logbook told another. On the night of the great storm, forty years before, there was a gap of an hour where no one had written anything at all.",
    "She ran her finger down the page. Nine o’clock, wind north-west, rising. Ten o’clock, nothing. Eleven o’clock, in a hand that was not her mother’s: All safe. Light seen from the water.",
    "“Who wrote that?” the stranger asked, from the chair. She had not heard him wake. He was looking at the page over her shoulder, and his face had gone very still.",
    "Down on the quay, old Mr Penhallow was mending nets and pretending not to watch the lighthouse. Everyone in the village pretended not to watch the lighthouse. It was the one thing they all agreed on.",
    "The path down to the harbour was steep and slick with weed, and she took it slowly, the stranger a few steps behind. Gulls rose off the rocks as they passed and settled again, complaining.",
    "At the bottom, the sea had left a line of things along the shingle: rope, a bottle, half a crate, and something small and brass that caught the light. She picked it up before she could think better of it.",
    "It was a key, green at the edges, with a number stamped into the bow. Fourteen. There were fourteen steps up to the lamp room, she thought, and then wished she hadn’t.",
    "The stranger held out his hand for it, and for a long moment she considered dropping it back into the sea. Instead she put it in her pocket, where it sat heavier than any key had a right to.",
]
GUIDE = [
    "Start small. The first attempt is never the one you keep, and that is the point of it: you learn more from a lopsided try than from a week of reading about the perfect one.",
    "Most of what goes wrong comes down to patience. Give things the time they ask for, check on them less often than you want to, and resist the urge to fix what is only still happening.",
    "Keep notes, even short ones. A date, what you tried, what happened. In a month you will have forgotten, and the notebook will remember for you.",
    "There is no single right way to do this, only ways that suit the place you are and the time you have. Take what follows as a set of starting points rather than rules.",
    "Look closely before you change anything. The answer is usually already in front of you, in the colour, the texture, the way the light falls or the way the air smells after rain.",
    "If something works, do it again exactly as before, and only then begin to change one thing at a time. Changing everything at once teaches you nothing.",
    "Share what you make. Half the pleasure is in the giving, and the other half is in hearing what someone else noticed that you missed.",
    "When in doubt, go outside. Most of the questions in this book are answered more quickly by ten minutes of looking than by an hour of reading.",
    "The tools matter less than you think. A good eye and a bit of persistence will take you further than anything you can buy.",
    "Expect the seasons to change your plans. What is easy in spring is hard in winter, and the other way round, and both are worth knowing.",
]


def rgb(hexs):
    return tuple(int(hexs[i:i + 2], 16) for i in (1, 3, 5))


def wrap(d, text, f, width):
    out, cur = [], ''
    for w in text.split():
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=f) <= width: cur = t
        else: out.append(cur); cur = w
    out.append(cur)
    return out


def gradient(W, H, c1, c2):
    im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
    a, z = rgb(c1), rgb(c2)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(a[k] + (z[k] - a[k]) * t) for k in range(3)))
    return im


def cover(b):
    W, H = 600, 900
    im = gradient(W, H, *b['colors']); d = ImageDraw.Draw(im)
    ink = b.get('ink', '#f4ecdf'); style = b['style']
    if style == 'band': d.rectangle([0, 560, W, 600], fill=ink)
    elif style == 'circle': d.ellipse([150, 470, 450, 770], outline=ink, width=10)
    elif style == 'frame': d.rectangle([36, 36, W - 36, H - 36], outline=ink, width=4)
    elif style == 'stripes':
        for i in range(6): d.rectangle([0, 600 + i * 40, W, 618 + i * 40], fill=ink)
    if style == 'comic':
        for y in range(0, H, 16):
            for x in range((y // 16) % 2 * 8, W, 16): d.ellipse([x, y, x + 5, y + 5], fill=tuple(max(0, c - 40) for c in rgb(b['colors'][0])))
        f = font(SANS_B, 76); y = 120
        for line in wrap(d, b['title'].upper(), f, W - 100):
            w = d.textlength(line, font=f); d.text(((W - w) / 2 + 4, y + 4), line, font=f, fill='#1a1a1a'); d.text(((W - w) / 2, y), line, font=f, fill=ink); y += 84
        d.ellipse([170, 420, 470, 720], fill='#7a3fb0'); d.ellipse([250, 500, 290, 540], fill='#fff'); d.ellipse([350, 500, 390, 540], fill='#fff')
        d.ellipse([262, 512, 282, 532], fill='#111'); d.ellipse([362, 512, 382, 532], fill='#111')
        for k in range(6):
            x = 190 + k * 50; d.line([(x, 690), (x - 20 + k * 8, 820)], fill='#7a3fb0', width=26)
    else:
        f = font(SERIF_B, b.get('size', 72)); y = 140
        for line in wrap(d, b['title'], f, W - 120):
            w = d.textlength(line, font=f); d.text(((W - w) / 2, y), line, font=f, fill=ink); y += int(f.size * 1.18)
    fa = font(SANS, 30); w = d.textlength(b['author'].upper(), font=fa)
    d.text(((W - w) / 2, H - 120), b['author'].upper(), font=fa, fill=ink)
    return im


def jpg(im, q=88):
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=q); return buf.getvalue()


def epub(path, b):
    rnd = random.Random(b['title'])
    pool = GUIDE if b.get('kind') == 'guide' else STORY
    meta = [f"<dc:title>{html.escape(b['title'])}</dc:title>", f"<dc:creator opf:role=\"aut\">{html.escape(b['author'])}</dc:creator>",
            "<dc:language>en</dc:language>", f"<dc:description>{html.escape(b['blurb'])}</dc:description>",
            f"<dc:publisher>{html.escape(b['publisher'])}</dc:publisher>", f"<dc:date>{b['year']}-0{1 + b['year'] % 9}-1{b['year'] % 9}</dc:date>",
            *[f"<dc:subject>{html.escape(s)}</dc:subject>" for s in b['tags']], '<meta name="cover" content="cover-img"/>']
    if b.get('series'):
        meta += [f'<meta name="calibre:series" content="{html.escape(b["series"])}"/>', f'<meta name="calibre:series_index" content="{b["n"]}"/>']
    chapters = b['chapters']
    manifest = ['<item id="cover-img" href="images/cover.jpg" media-type="image/jpeg"/>',
                '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
                '<item id="css" href="style.css" media-type="text/css"/>']
    spine = []
    for i in range(len(chapters)):
        manifest.append(f'<item id="c{i}" href="c{i}.xhtml" media-type="application/xhtml+xml"/>'); spine.append(f'<itemref idref="c{i}"/>')
    opf = (f'<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">'
           f'<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf"><dc:identifier id="id">urn:uuid:loft-demo-{b["id"]}</dc:identifier>{"".join(meta)}</metadata>'
           f'<manifest>{"".join(manifest)}</manifest><spine toc="ncx">{"".join(spine)}</spine></package>')
    ncx = ('<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap>'
           + ''.join(f'<navPoint id="n{i}" playOrder="{i + 1}"><navLabel><text>{html.escape(c)}</text></navLabel><content src="c{i}.xhtml"/></navPoint>' for i, c in enumerate(chapters))
           + '</navMap></ncx>')
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, 'w') as z:
        z.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
        z.writestr('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
        z.writestr('OEBPS/content.opf', opf); z.writestr('OEBPS/toc.ncx', ncx)
        z.writestr('OEBPS/style.css', 'p{margin:0;text-indent:1.3em} h1+p{text-indent:0}')
        z.writestr('OEBPS/images/cover.jpg', jpg(cover(b)))
        for i, title in enumerate(chapters):
            n = rnd.randint(28, 36)
            start = rnd.randrange(len(pool))
            paras = [b['blurb']] if i == 0 else []
            paras += [pool[(start + k * 5) % len(pool)] for k in range(n)]
            body = ''.join(f'<p>{html.escape(p)}</p>' for p in paras)
            z.writestr(f'OEBPS/c{i}.xhtml', f'<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>{html.escape(title)}</title><link rel="stylesheet" href="style.css" type="text/css"/></head>'
                                            f'<body><h1>{html.escape(title)}</h1>{body}</body></html>')


LINES = ['Rookie! Grab the rope!', 'Is that... a tentacle?', 'Nobody said there’d be octopi.', 'It’s OCTOPUSES.', 'Not now, Marco!',
         'Hold on to the boat!', 'SPLOOSH!', 'We’re gonna need a bigger net.', 'Report: one (1) octopus.', 'It took my hat.',
         'Day one. Going great.', 'Shift’s over in ten minutes...', 'Did it just WAVE at us?', 'Write it up as “wildlife”.',
         'Sarge is gonna love this.', 'Why is it wearing my hat?', 'Back to the station!', 'It followed us home.']
LAYOUTS = [[(0, 0, 2, 1), (0, 1, 1, 1), (1, 1, 1, 1), (0, 2, 2, 1)], [(0, 0, 1, 1), (1, 0, 1, 1), (0, 1, 2, 1), (0, 2, 1, 1), (1, 2, 1, 1)],
           [(0, 0, 2, 1), (0, 1, 2, 1), (0, 2, 1, 1), (1, 2, 1, 1)], [(0, 0, 1, 2), (1, 0, 1, 1), (1, 1, 1, 1), (0, 2, 2, 1)]]


def comic_page(b, k, rnd):
    W, H = 1200, 1800
    im = Image.new('RGB', (W, H), '#f6f1e6'); d = ImageDraw.Draw(im)
    if k == 0:
        return cover(b).resize((W, H))
    m, g = 50, 26
    cw, ch = (W - 2 * m - g) / 2, (H - 2 * m - 2 * g) / 3
    fb = font(SANS_B, 34)
    for j, (cx, cy, sw, sh) in enumerate(LAYOUTS[k % len(LAYOUTS)]):
        x0 = m + cx * (cw + g); y0 = m + cy * (ch + g); x1 = x0 + sw * cw + (sw - 1) * g; y1 = y0 + sh * ch + (sh - 1) * g
        hue = (rnd.random() * 360)
        import colorsys
        top = tuple(int(c * 255) for c in colorsys.hls_to_rgb(hue / 360, .62, .55)); bot = tuple(int(c * 255) for c in colorsys.hls_to_rgb(((hue + 40) % 360) / 360, .38, .5))
        panel = gradient(int(x1 - x0), int(y1 - y0), '#%02x%02x%02x' % top, '#%02x%02x%02x' % bot)
        pd = ImageDraw.Draw(panel)
        pw, ph = panel.size
        pd.rectangle([0, int(ph * .72), pw, ph], fill=tuple(max(0, c - 50) for c in bot))   # the water
        for _ in range(2):
            r = rnd.randint(60, 150); x = rnd.randint(0, pw); y = int(ph * .72)
            pd.ellipse([x - r, y - r, x + r, y + r], fill='#%02x%02x%02x' % tuple(int(c * 255) for c in colorsys.hls_to_rgb(((hue + 180) % 360) / 360, .66, .6)))
        im.paste(panel, (int(x0), int(y0)))
        d.rectangle([x0, y0, x1, y1], outline='#111', width=7)
        if rnd.random() < .8:
            text = LINES[(k * 3 + j) % len(LINES)].upper()
            lines = wrap(d, text, fb, (x1 - x0) * .62)
            bw = max(d.textlength(l, font=fb) for l in lines) + 44; bh = len(lines) * 42 + 30
            bx = x0 + 30 + rnd.random() * max(1, (x1 - x0) - bw - 60); by = y0 + 30
            d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=34, fill='#fff', outline='#111', width=5)
            d.polygon([(bx + 50, by + bh - 3), (bx + 90, by + bh - 3), (bx + 60, by + bh + 40)], fill='#fff', outline='#111')
            d.line([(bx + 52, by + bh - 2), (bx + 88, by + bh - 2)], fill='#fff', width=6)
            for n, l in enumerate(lines): d.text((bx + 22, by + 15 + n * 42), l, font=fb, fill='#111')
    d.text((W / 2 - 10, H - 40), str(k), font=font(SANS, 24), fill='#555')
    return im


def cbz(path, b):
    rnd = random.Random(b['title'])
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, 'w') as z:
        for k in range(b['pages']):
            z.writestr(f'{b["title"]} - {k:03d}.jpg', jpg(comic_page(b, k, rnd), 82))


CLOUDS = [('Cumulus', 'Fair-weather heaps with flat bases and bright, cauliflower tops. They come with sunshine and usually leave by evening.'),
          ('Stratus', 'A low grey sheet that hides the hills and turns the day dim. Drizzle, at most.'),
          ('Cirrus', 'High, thin strands of ice, combed out by the wind. Weather may change in a day or two.'),
          ('Cumulonimbus', 'The towering storm cloud, anvil-topped. Thunder, heavy showers, sometimes hail. Go inside.'),
          ('Altocumulus', 'Rows of small white rolls in the middle sky, sometimes called a mackerel sky.'),
          ('Nimbostratus', 'Thick, dark and featureless, bringing long steady rain or snow. Bring the umbrella.'),
          ('Cirrostratus', 'A milky veil high up that draws a halo around the sun or moon.'),
          ('Stratocumulus', 'Lumpy grey patches with blue between them. The most common cloud of all.'),
          ('Altostratus', 'A grey-blue layer through which the sun looks as if seen through frosted glass.'),
          ('Cirrocumulus', 'Tiny high ripples, like grains of sand, that rarely last long.')]


def pdf(path, b):
    pages = [cover(b).resize((1240, 1860))]
    for name, text in CLOUDS:
        im = Image.new('RGB', (1240, 1860), '#fbfaf6'); d = ImageDraw.Draw(im)
        sky = gradient(1080, 760, '#8fb3d9', '#dfeaf4'); sd = ImageDraw.Draw(sky)
        rnd = random.Random(name)
        for _ in range(9):
            x, y, r = rnd.randint(80, 1000), rnd.randint(200, 560), rnd.randint(50, 130)
            sd.ellipse([x - r, y - r * .7, x + r, y + r * .7], fill='#ffffff')
        im.paste(sky, (80, 120))
        d.text((80, 940), name, font=font(SERIF_B, 92), fill='#1d2a33')
        y = 1080
        for line in wrap(d, text, font(SERIF, 44), 1080): d.text((80, y), line, font=font(SERIF, 44), fill='#33414b'); y += 62
        d.text((80, 1700), 'FIELD GUIDE TO CLOUDS', font=font(SANS, 26), fill='#8a96a0')
        pages.append(im)
    path.parent.mkdir(parents=True, exist_ok=True)
    pages[0].save(path, 'PDF', resolution=150, save_all=True, append_images=pages[1:],
                  title=b['title'], author=b['author'])


for b in BOOKS:
    d = OUT / b['author'] / b['title']
    if b['format'] == 'cbz': cbz(d / f"{b['title']}.cbz", b)
    elif b['format'] == 'pdf': pdf(d / f"{b['title']}.pdf", b)
    else: epub(d / f"{b['title']}.epub", b)
print(len(BOOKS), 'books in', OUT)
