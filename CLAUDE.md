# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Static portfolio site for Etienne Axiak. Plain HTML/CSS/vanilla JS — no build system, no bundler, no npm, no framework. Preview any page by opening the HTML file directly in a browser.

## Deployment

GitHub Pages from the root of `main`. The remote `origin` is `https://github.com/Spinjitsudoom/my-portfolio.git`; to deploy, push `main`:
```bash
git push origin main
```
The site is live at `https://spinjitsudoom.github.io/my-portfolio/`. No build step needed.

### New releases update the pages automatically

`.github/workflows/update-releases.yml` runs hourly (and by hand from the Actions tab). `.github/scripts/update_releases.py` reads each project page's version from its **"All builds are vX.Y.Z"** line. It compares that with the project's latest GitHub release and replaces every mention of the old version on the page. It writes a page only if every download link on it exists in the release. If any link is missing, the run fails and GitHub emails about it.

- Keep the "All builds are vX.Y.Z" line on each project page, since the script finds the version there.
- Pin download links to the tag (`releases/download/vX.Y.Z/<file>`), never `releases/latest/download/<versioned file>`, which 404s as soon as a newer release ships. ArtiSync's file names carry no version, so its `latest/download` links are fine.
- A project with no full release yet (GitHub's "latest" skips pre-releases) is skipped, so its page's links aren't checked until the first release.
- The workflow only changes version numbers. New features still need the page's feature text updated by hand.
- Before pushing, `git pull` first, because the workflow commits to `main` too.

## Architecture

### Pages

| File | Stylesheet | Background |
|------|-----------|------------|
| `index.html` | `style.css` + `main.js` | `#0d1117` |
| `shelf.html`, `loft.html`, `droppix.html`, `matchbox.html`, `artisync.html` | inline `<style>` and `<script>` | `#0a0a0f` |

All pages use the same blue-purple palette (`#5b8dee` → `#7c6ff7`) and the Inter font. The project pages are self-contained by design: they don't load `style.css`, `project.css` or `main.js`. `project.css` is unused and safe to delete. `main.js` (used only by `index.html`) fades in `.fade-in` elements, staggers `.stagger-children`, and sets `.nav-active`.

### The project pages share one layout

`shelf.html`, `loft.html`, `droppix.html`, `matchbox.html` and `artisync.html` have the same structure, class names and page CSS (the `--pg-*` tokens). When you change one, change the others to match. A new project page should start as a copy of one of them.

1. **Nav:** `← Etienne Axiak` (`.nav-back`) on the left, then `.nav-links` (Features, Download, Setup, GitHub; ArtiSync also has FAQ). Below 860px a `.hamburger` opens `#mobileMenu` via `toggleMenu()`/`closeMenu()`.
2. **Hero:** `.hero-logo`, `.tag`, an `h1` with `.grad`, the lead text, `.hero-btns`, and `.hero-pills`.
3. **Demo:** `.demo-section` holds the interactive app recreation.
4. **Features:** `#features` with `h2.sh` and a `.features-grid` of `.feat` cards.
5. **Download:** `#download` on `--pg-bg2`, with "Get <span>X</span>", `.dl-card`s, `.dl-source`, and the "All builds are vX.Y.Z" line.
6. **Setup:** `#setup` holds the "How it Works" `.steps`.
7. **Tech Stack:** `.stack-grid`.
8. **Footer:** the one-line footer.

ArtiSync also has a conversion-formats block inside Features and an FAQ section (`#faq`).

### Icons: SVG only, never emoji

Emoji render as blank boxes in some browsers, such as Flatpak browsers without a colour emoji font. Every icon is an inline SVG symbol from the `p-*` sprite at the top of each page's `<body>`, written as `<svg class="pi"><use href="#p-name"/></svg>`. In JS, the matching helper is `ICO('name')` on Matchbox and ArtiSync. The Shelf demo carries its own sprite of the real app's icons. To add an icon, add a `<symbol>` to that page's sprite: a 24×24 viewBox, `stroke="currentColor"` at width 1.8, with round caps and joins. Plain text arrows and marks such as ← → ↗ ✓ ✕ ★ are fine.

### Interactive demos

- **Shelf:** a recreation of the real web app's dark theme (Archivo font, jewel-case covers). Every class is prefixed `s-` and scoped under `.sh-demo`, so it can't clash with page classes like `.btn` and `.hero`. The library (artists, albums, songs) is fictional, and covers are CSS gradients or inline SVG.
- **Matchbox:** a recreation of the Electron/React app. `LIBRARY` (TV shows), `MOVIES` and the `state` object drive it, and posters come from TMDB image URLs.
- **droppix:** a recreation of the PC's Qt control panel (`.dg`, with the app's own tokens on `.dg` only, light and dark) beside a desk with the PC's monitor and the tablet. Both screens show one desktop in desktop pixels (`.dp-vd`, scaled with `transform`): the monitor is 1920×1080 and the tablet (1280×800, or 800×1280 when turned) sits below it. Each desktop window has a copy on each screen, and Sketch draws on both copies' canvases. The tablet's own screens (`.dp-and` connect screen, menu, settings, keyboard) are the Android app's, in real pixels. Labels and log lines follow the real app's (`host/gui/`, `android/…/res/layout/`).
- **Loft:** not a recreation. The demo is the real Loft web app in an `<iframe>` of `loft-demo/`: Loft's own `src/loft/web` files, copied unchanged, with `loft-demo/demo/mock.js` standing in for the server. The stand-in answers from a recording of a real Loft server on a made-up library (`loft-demo/demo/`), and `loft-demo/sw.js` serves the covers and page images. Don't edit the app's files by hand. When Loft's web app changes, record the demo again with `tools/loft-demo/` (its README has the steps).
- **ArtiSync:** a recreation of ArtiSync 3's PySide6 window: Library, Releases, the album's tracks and details, the action bar, and the Settings and Convert dialogs. Its classes are prefixed `as-`, and `applyTheme()` sets the app's own tokens (a port of its `gui/theme.py`, 9 themes) **only on `.as-win`**. `DZ` holds real Deezer releases (track lists, genres, cover ids) for four artists, and covers load from Deezer's image server. `LIB` is a made-up music folder of badly named files. The matching is a port of the app's `base_engine.py` and `session.py`, so its scores are the app's; if the app's matcher changes, port it again.

## `loft-demo/` and `tools/`

`loft-demo/` is the Loft page's demo (see Interactive demos), about 13 MB with its recorded books, covers and page images. Its pages are marked `noindex`. `tools/loft-demo/` holds the scripts that build it. Neither is linked from the site's navigation.

`tools/og/make.py` renders the link-preview images in `og/` (1200×630 JPEGs) with headless Chromium: `python3 tools/og/make.py droppix home`. A new project page needs its own entry there, and its logo on the home image.

## `unused for now/` directory

Contains old experimental versions of a music manager page. Safe to ignore or delete.
