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

### Two separate CSS palettes

All pages share the same blue-purple palette (`--accent: #5b8dee`, `--accent2: #7c6ff7`) and Inter font. The project pages (`artisync.html`, `matchbox.html`, `shelf.html`) use self-contained inline `<style>` blocks; `index.html` uses `style.css`.

| File | Stylesheet | Background |
|------|-----------|------------|
| `index.html` | `style.css` | `#0d1117` |
| `music-manager.html` | inline `<style>` | `#0a0a0f` |
| `matchbox.html` | inline `<style>` | `#0a0a0f` |
| `artisync.html` | inline `<style>` | `#0a0a0f` |
| `shelf.html` | inline `<style>` | `#0a0a0f` |

`shelf.html` follows the `matchbox.html` structure (nav, hero, demo, features, download, setup, tech stack). Its interactive demo recreates the real Shelf web app's dark theme (Archivo font, jewel-case covers). All demo classes are prefixed `s-` and scoped under `.sh-demo` so they don't clash with page classes like `.btn` and `.hero`. The demo library (artists, albums, songs) is fictional; covers are CSS gradients.

### Project pages are fully self-contained

Both `music-manager.html` and `matchbox.html` do **not** import `style.css`, `project.css`, or `main.js`. All CSS lives in an inline `<style>` block and all JS in an inline `<script>` block. This is intentional.

### `main.js` is loaded only by `index.html`

Handles: `IntersectionObserver` scroll fade-in on `.fade-in` elements, staggered delay for `.stagger-children` children, and `.nav-active` class on nav links.

The project pages have their own equivalent `IntersectionObserver` using `.reveal` / `.reveal.visible` classes — separate from `main.js`.

### `project.css` is unused — safe to delete

## Nav pattern (project pages)

Both `music-manager.html` and `matchbox.html` share the same nav structure:
- `← Etienne Axiak` back link on the left (`.nav-back`)
- App brand in the centre (`.nav-brand` — logo img + name span) — **music-manager only**
- Nav links on the right (`.nav-links`)
- Hamburger + mobile menu below 860px (`.hamburger`, `#mobileMenu`, `toggleMenu()`/`closeMenu()`)

The `index.html` nav is intentionally different (portfolio home — shows section anchors via `.nav-name` + `<ul>`).

## Interactive Mockup in `matchbox.html`

The page contains a full interactive desktop app simulation of the real Electron/React Matchbox app. Key state variables:

```js
let currentArtist  = 'Avenged Sevenfold';
let currentRelease = 'httk';   // default on load
let executed       = false;
let currentMockTab = 'preview';
```

Data is hardcoded in two objects:
- `RELEASES` — 24 albums across 4 artists (A7X, Metallica, Iron Maiden, Tool), each with a gradient, track list, and log lines.
- `ARTIST_DATA` — maps artist name → `{ path, albums, sidebar, count }`. `albums` drives the dropdown; `sidebar` drives the left panel.

Themes (9 total, default = Dark) are applied by `applyTheme()` which sets CSS custom properties **only on `.mockup-window`**, leaving the rest of the page unaffected.

## Known Issues

No open structural issues. Both project pages have a working mobile hamburger menu and consistent nav patterns.

## `unused for now/` directory

Contains old experimental versions of the music manager page. Safe to ignore or delete.
