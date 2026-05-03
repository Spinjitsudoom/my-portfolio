# Project Handoff — Etienne Axiak Portfolio Site

## Overview

This is a static portfolio website for **Etienne Axiak**, hosted on GitHub Pages. It showcases his software projects with a dark, GitHub-inspired theme. There is no build system, no framework, no npm — everything is plain HTML, CSS, and vanilla JavaScript.

**Owner:** Etienne Axiak  
**Email:** etienneaxiakgalaxy@gmail.com  
**GitHub username:** Spinjitsudoom  
**Intended hosting:** GitHub Pages (push `main` branch, enable Pages in repo settings)

---

## File Structure

```
/
├── index.html               — Portfolio home page
├── music-manager.html       — Project page: Music Manager Ultimate (ACTIVE, fully built)
├── tmdb-media-manager.html  — Project page: TMDB Media Manager (HIDDEN — not linked from index)
├── style.css                — Global styles (home page + shared base)
├── project.css              — Styles for project pages (loaded alongside style.css)
├── main.js                  — Global JS: scroll fade-in animations, nav active state
│
└── unused for now/          — Folder of older/experimental versions (not served or linked)
    ├── music-manager.html       — An older iteration of the music manager page
    ├── music-managernewww.html  — Another experimental version
    ├── project.css
    └── style.css
```

> **Note:** `musicmanagerold.html` was previously in the root but was moved. If it still appears in the root, it is an old static mockup page and not part of the active site.

---

## Page Inventory

### `index.html` — Home / Portfolio

- **Nav:** Site title ("Etienne Axiak") + links to About, Projects, Contact
- **Hero:** Full-viewport section with name, tagline, "See My Projects" CTA. Animated in on page load via CSS keyframes.
- **About:** Short bio paragraph
- **Projects:** Card grid. Currently only one visible card — Music Manager Ultimate — linking to `music-manager.html`. The TMDB Media Manager card is intentionally removed (the page still exists at `tmdb-media-manager.html`).
- **Contact:** Email link
- **Scripts:** `main.js` loaded at bottom

**Animation classes used (wired up by `main.js`):**
- `.fade-in` on `.container` divs in About and Contact sections
- `.fade-in` on the Projects `<h2>`
- `.stagger-children` on `.projects-grid` — JS adds `.fade-in` + staggered `transition-delay` to each child card

---

### `music-manager.html` — Music Manager Ultimate (PRIMARY PROJECT PAGE)

This is the most complex file (~2200 lines). It is **self-contained** — all CSS is inlined in a `<style>` block at the top, and all JavaScript is in `<script>` blocks at the bottom. It does **not** depend on `style.css`, `project.css`, or `main.js`.

**Color scheme (CSS variables defined in `:root`):**
```
--bg:        #0a0a0f   (page background)
--bg2:       #0f0f18
--surface:   #13131e   (card/panel background)
--surface2:  #1a1a28
--surface3:  #222235
--border:    #252538
--border2:   #2e2e48
--accent:    #5b8dee   (primary blue)
--accent2:   #7c6ff7   (secondary purple)
--accent-g:  gradient from accent → accent2
--green:     #3ddc84
--amber:     #f5a623
--red:       #ff5f57
--fg:        #e8e8f0   (primary text)
--fg2:       #9898b8   (muted text)
--fg3:       #55556a   (very muted)
```

**Nav (lines ~757–783):**
- Fixed, always-on glass blur background (`backdrop-filter: blur(16px)`)
- Left: `← Etienne Axiak` link back to `index.html` (class `.nav-back`)
- Right: nav links — Features, How it works, Download, FAQ, GitHub
- **No logo, no CTA download button** — this was intentionally simplified to match the portfolio nav style

**Page sections (in order):**
1. **Hero** — App name, tagline, badges (Open Source / Free / Windows & Linux / Spotify connected), Download + GitHub buttons
2. **App Mockup** (`#mockup-section`) — Fully interactive simulated app UI (see Interactive Mockup section below)
3. **Features** (`#features`) — 8 feature cards in a responsive grid
4. **How It Works** (`#how-it-works`) — 6-step numbered workflow with connecting line
5. **Spotify API Setup** — 3-step numbered instructions
6. **Audio Conversion** — Format support table + FFmpeg note
7. **Download** (`#download`) — 3 platform cards: Windows, AppImage, Flatpak
8. **FAQ** (`#faq`) — Expandable `<details>` accordion items
9. **Footer** — MIT license, GitHub link, copyright

**Scroll animations:** This page uses its own `IntersectionObserver` (not `main.js`) — elements with class `.reveal` fade up when scrolled into view.

---

### `tmdb-media-manager.html` — TMDB Media Manager (HIDDEN)

- Exists but is **not linked** from `index.html` — intentionally hidden until the project is ready to show
- Uses `style.css` + `project.css` (external stylesheets, unlike `music-manager.html`)
- Has the same nav structure as the original project.css-based pages: `← Etienne Axiak` on left
- To re-enable: add a card back to the `#projects` grid in `index.html` linking to `tmdb-media-manager.html`

---

## CSS Architecture

### `style.css` — Global base

Applies to `index.html` and `tmdb-media-manager.html`. **Does not apply to `music-manager.html`** (which is self-contained).

Key sections:
- CSS variables (matching dark GitHub palette: `--bg: #0d1117`, `--accent: #58a6ff`, etc.)
- Nav (sticky, glass blur)
- Hero (full-viewport, radial glow, CSS keyframe entrance animation)
- Buttons (`.btn`, `.btn-small`)
- Sections (`.section`, `.section.alt`, `.container`)
- Project card grid (`.card`, `.card-link`, `.projects-grid`)
- Scroll animations (`.fade-in` / `.fade-in.visible`)
- Hero entrance keyframes (`heroUp`)
- Nav active state (`.nav-active`)
- Card hover glow

### `project.css` — Project page extras

Loaded alongside `style.css` on project pages. Applies to `tmdb-media-manager.html` (and was used by the old version of `music-manager.html`).

Key sections:
- `.nav-name` — the back link style
- `.project-hero` — hero for project pages
- `.hero-actions`, `.hero-meta`, `.hero-badge` — hero button row + badges
- Two-column layout: `.project-layout`, `.project-main`, `.project-sidebar`
- Prose blocks: `.prose-block`, code blocks, `.note`, `.steps`
- App mockup styles (`.mockup-wrap`, `.titlebar`, `.app-toolbar`, `.app-status-bar`, `.app-body`, `.app-sidebar`, `.app-centre`, `.art-panel`, `.app-footer-bar`, track rows, etc.)
- Feature card grid (`.feature-cards`, `.feature-card`)
- Workflow steps (`.workflow-steps`, `.workflow-step`, `.step-num`, `.step-body`)
- Download cards (`.dl-cards`, `.dl-card`, `.dl-btn`, `.dl-note`)
- FAQ accordion (`.faq-list`, `.faq-item` using `<details>`/`<summary>`)
- Interactive mockup animations (`.track-anim`, `.preview-area.refreshing`, `.spotify-dot` pulse)

### `main.js` — Global interactions

Loaded by `index.html` and the old-style project pages. **Not loaded by `music-manager.html`** (self-contained).

Does three things:
1. **Scroll fade-in:** `IntersectionObserver` watches all `.fade-in` elements, adds `.visible` class when they enter the viewport
2. **Stagger children:** For `.stagger-children` parents, JS adds `.fade-in` + incremental `transition-delay` to each direct child
3. **Nav active state:** Second `IntersectionObserver` watches `section[id]` elements, toggles `.nav-active` on matching `nav ul a[href="#id"]`

---

## Interactive App Mockup (music-manager.html)

The most complex feature of the site. It simulates the actual Music Manager Ultimate desktop app UI inside the browser.

**What's interactive:**
- **Sidebar releases** — clicking any album row updates the entire UI: preview tracks, status bar, toolbar album dropdown, art panel gradient + metadata
- **Preview / Log tabs** — switches between the file rename preview and a simulated operation log
- **Execute Rename + Tag button** — animates through "Renaming…" → "✓ Done", switches to Log tab automatically
- **Undo button** — resets to Preview tab with original filenames, re-enables Execute
- **File menu** — "File ▾" dropdown opens with Settings and Convert options
- **Settings modal** — shows theme picker (9 colour themes, clicking one changes the accent colour live) and Auto-convert toggle
- **Convert modal** — shows format picker, quality presets, animated progress bar when "Convert" is clicked
- **Artist/Album dropdowns** in toolbar — clicking opens a dropdown list, selecting an item updates the album display
- **Fetch Artwork button** — simulates a fetch with a spinner animation
- **Spotify dot** — pulses continuously via CSS animation

**Album data (defined in the JS `RELEASES` object):**
Seven Avenged Sevenfold albums with full track lists, confidence scores, metadata, and gradient colours:
- `sttst` — Sounding the Seventh Trumpet (2001)
- `wtf` — Waking the Fallen (2003)
- `coe` — City of Evil (2005)
- `nm` — Nightmare (2010)
- `httk` — Hail to the King (2013) ← default selected on load
- `ts` — The Stage (2016)
- `libad` — Life Is But a Dream... (2023)

**Key JS function names:**
- `mockSelect(id, el)` — selects an album, re-renders the full UI
- `mockTab(name)` — switches Preview / Log tab
- `mockExecute()` — triggers the execute animation
- `mockUndo()` — undoes the execute state
- `renderTracks(id)` — builds track row HTML for preview pane
- `renderLog(id)` — builds log line HTML for log pane
- `mockFileMenu()` — toggles File dropdown
- `openModal(id)` / `closeModal(id)` — opens/closes Settings or Convert modals
- `runConvert()` — animates the convert progress bar
- `mockFetch()` — animates the Fetch Artwork button

---

## GitHub Projects Referenced

| Project | Repo | Status on site |
|---|---|---|
| Music Manager Ultimate | `Spinjitsudoom/MusicManagerUltimate` | Fully built page, linked from home |
| TMDB Media Manager | `Spinjitsudoom/TMDB-Media-Manager` | Page exists but hidden |

---

## GitHub Pages Deployment

The repo has **not yet been pushed to a remote**. To deploy:

```bash
# One-time setup
git remote add origin https://github.com/Spinjitsudoom/YOUR-REPO-NAME.git
git push -u origin main
```

Then in the GitHub repo:
- Settings → Pages → Source: Deploy from branch → `main` → `/ (root)` → Save

The site will be live at `https://spinjitsudoom.github.io/YOUR-REPO-NAME/` (or `https://spinjitsudoom.github.io/` if the repo is named `spinjitsudoom.github.io`).

---

## Known Gaps / Things Left To Do

- **`tmdb-media-manager.html` is hidden** — the TMDB Media Manager project page exists and is complete but was intentionally removed from the home page. Re-add when ready.
- **No GitHub remote set yet** — the local git repo has 7 commits but no remote. Needs to be pushed.
- **`musicmanagerold.html`** — an old static version of the music manager page that may still be in the project root. It has a `← Etienne Axiak` back button added but is otherwise legacy. Can be deleted or left in place — it is not linked from the main site.
- **Mobile nav on `music-manager.html`** — the hamburger menu HTML and `toggleMenu()` function exist but the hamburger button itself was removed from the nav during a redesign. Mobile users on narrow screens will see the nav links hidden (CSS hides `.nav-links` below a breakpoint). Either add the hamburger back or adjust the CSS breakpoint.
- **`music-manager.html` uses a hardcoded `MusicManager.png`** favicon/logo (`<link rel="icon" ... src="MusicManager.png">`). This file does not exist in the repo — the icon will silently fail. Either add the PNG or remove the `<link>` tag.
- **No 404 page** — GitHub Pages will show a default 404. A custom `404.html` could redirect back to `index.html`.

---

## Style Conventions

- **Colours:** Two palettes in use. `index.html` / `tmdb-media-manager.html` use the `style.css` GitHub palette (`#0d1117` background, `#58a6ff` accent). `music-manager.html` uses its own deeper palette (`#0a0a0f` background, `#5b8dee` / `#7c6ff7` dual accent).
- **Typography:** System font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`) throughout.
- **No external fonts, no CDN dependencies** — fully offline-capable.
- **No framework** — no React, Vue, Tailwind, etc. All layout is CSS Grid / Flexbox.
- **Animations:** CSS transitions + `IntersectionObserver`. No GSAP or animation libraries.
- **No comments in code** — the codebase follows a no-comments convention; naming is intended to be self-documenting.

---

## Adding a New Project

1. Create a new HTML page (e.g. `my-project.html`) — copy `tmdb-media-manager.html` as a starting point since it uses the shared `style.css` + `project.css` stack
2. Add a card to the `#projects` grid in `index.html`:
```html
<a href="my-project.html" class="card card-link">
  <div class="card-icon">🔧</div>
  <h3>Project Name</h3>
  <p>Short description.</p>
  <div class="card-tags">
    <span class="tag">Python</span>
  </div>
  <div class="card-links">
    <span class="btn-small">Learn More →</span>
  </div>
</a>
```
3. The `.stagger-children` class on `.projects-grid` means new cards automatically get the scroll fade-in animation — no JS changes needed.
