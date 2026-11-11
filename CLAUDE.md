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
- The workflow only changes version numbers. New features still need the page's feature text updated by hand.
- Before pushing, `git pull` first, because the workflow commits to `main` too.

## Architecture

### Pages

| File | Stylesheet | Background |
|------|-----------|------------|
| `index.html` | `style.css` + `main.js` | `#0d1117` |
| `shelf.html`, `matchbox.html`, `artisync.html` | inline `<style>` and `<script>` | `#0a0a0f` |

All pages use the same blue-purple palette (`#5b8dee` → `#7c6ff7`) and the Inter font. The project pages are self-contained by design: they don't load `style.css`, `project.css` or `main.js`. `project.css` is unused and safe to delete. `main.js` (used only by `index.html`) fades in `.fade-in` elements, staggers `.stagger-children`, and sets `.nav-active`.

### The project pages share one layout

`shelf.html`, `matchbox.html` and `artisync.html` have the same structure, class names and page CSS (the `--pg-*` tokens). When you change one, change the others to match. A new project page should start as a copy of one of them.

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

Emoji render as blank boxes in some browsers, such as Flatpak browsers without a colour emoji font. Every icon is an inline SVG symbol from the `p-*` sprite at the top of each page's `<body>`, written as `<svg class="pi"><use href="#p-name"/></svg>`. In JS, the matching helper is `ICO('name')` on Matchbox and ArtiSync. To add an icon, add a `<symbol>` to that page's sprite: a 24×24 viewBox, `stroke="currentColor"` at width 1.8, with round caps and joins. Plain text arrows and marks such as ← → ↗ ✓ ✕ ★ are fine.

### Interactive demos

- **Shelf:** a recreation of the real web app's dark theme (Archivo font, jewel-case covers). Every class is prefixed `s-` and scoped under `.sh-demo`, so it can't clash with page classes like `.btn` and `.hero`. The library (artists, albums, songs) is fictional, and covers are CSS gradients or inline SVG.
- **Matchbox:** a recreation of the Electron/React app. `LIBRARY` (TV shows), `MOVIES` and the `state` object drive it, and posters come from TMDB image URLs.
- **ArtiSync:** a recreation of the Qt app. `RELEASES` holds 24 albums across 4 artists, and `ARTIST_DATA` drives the artist dropdown and sidebar. Its classes are `.mockup-*`, `.win-*`, `.wt-*`, `.wsb`, `.wc-*`, `.wap-*` and `.mock-*`, and it uses its own tokens (`--surface`, `--fg`, `--accent`…). `applyTheme()` (9 themes) sets those tokens **only on `.mockup-window`**, so the rest of the page is unaffected.

## `unused for now/` directory

Contains old experimental versions of a music manager page. Safe to ignore or delete.
