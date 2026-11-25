"""Renders og/<name>.jpg, the link-preview images, with headless Chromium.

Usage: python3 tools/og/make.py [name ...]   (default: all of them)
Needs chromium-browser and ImageMagick (magick).
"""
import pathlib, subprocess, sys, tempfile
SITE = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(tempfile.mkdtemp())
BASE = '''<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800;900&display=swap" rel="stylesheet">
<style>
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;background:#0a0a0f;font-family:Inter,sans-serif;color:#e8e8f0;position:relative}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:48px 48px}
.g1{position:absolute;width:700px;height:500px;right:-200px;top:-220px;background:radial-gradient(closest-side,rgba(124,111,247,.28),transparent);}
.g2{position:absolute;width:700px;height:500px;left:-250px;bottom:-250px;background:radial-gradient(closest-side,rgba(59,130,246,.18),transparent);}
.url{position:absolute;right:80px;top:82px;color:#8b8fa8;font-size:21px;font-weight:500}
.wrap{position:absolute;left:80px;top:72px;right:80px}
.top{display:flex;gap:42px;align-items:flex-start}
.logo{width:168px;height:168px;border-radius:36px;display:block}
.tag{display:inline-block;border:1px solid rgba(91,141,238,.45);background:rgba(59,130,246,.14);color:#a9c1ff;border-radius:30px;padding:7px 18px;font-size:19px;font-weight:600;letter-spacing:.14em;text-transform:uppercase}
h1{font-size:96px;font-weight:900;letter-spacing:-.035em;line-height:1.08;margin-top:14px;background:linear-gradient(135deg,#5b8dee,#7c6ff7);-webkit-background-clip:text;color:transparent;padding-bottom:6px}
.lead{font-size:35px;line-height:1.42;color:#d9dbe8;margin-top:44px;max-width:960px}
.pills{position:absolute;left:80px;top:510px;display:flex;gap:14px}
.pill{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);border-radius:10px;padding:11px 20px;font-size:21px;color:#c9ccdb}
.apps{position:absolute;left:80px;top:490px;display:flex;gap:26px;align-items:center}
.app{display:flex;gap:14px;align-items:center;font-size:27px;font-weight:600}
.app img{width:68px;height:68px;border-radius:15px}
</style></head><body><div class="grid"></div><div class="g1"></div><div class="g2"></div><div class="url">spinjitsudoom.github.io/my-portfolio</div>
'''
PAGES = {
 'droppix': f'''<div class="wrap"><div class="top"><img class="logo" src="file://{SITE}/droppix-logo.svg"><div><span class="tag">Second screen for Linux</span><h1>droppix</h1></div></div>
<p class="lead">An Android tablet as a real second screen for your Linux PC, with touch, stylus and sound.</p></div>
<div class="pills"><span class="pill">Plasma, GNOME, Sway, Hyprland &amp; more</span><span class="pill">Android 5.0+</span><span class="pill">Any browser</span><span class="pill">USB or Wi-Fi</span></div>''',
 'home': f'''<div class="wrap"><span class="tag">Developer</span><h1 style="font-size:104px">Etienne Axiak</h1>
<p class="lead" style="margin-top:22px">Open-source apps for your own music, books, media and screens.</p></div>
<div class="apps">''' + ''.join(f'<span class="app"><img src="file://{SITE}/{i}">{n}</span>' for n, i in [('Shelf','shelf-logo.svg'),('Loft','loft-logo.svg'),('droppix','droppix-logo.svg'),('Matchbox','matchbox-logo.svg'),('ArtiSync','ArtiSync.png')]) + '</div>',
}
for name in sys.argv[1:] or PAGES:
    html = OUT / f'{name}.html'
    html.write_text(BASE + PAGES[name] + '</body></html>')
    png = OUT / f'{name}.png'
    subprocess.run(['chromium-browser', '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
                    '--window-size=1200,630', '--virtual-time-budget=4000', f'--screenshot={png}', f'file://{html}'], check=True, capture_output=True)
    subprocess.run(['magick', str(png), '-quality', '88', str(SITE / 'og' / f'{name}.jpg')], check=True)
    print('wrote og/' + name + '.jpg')
