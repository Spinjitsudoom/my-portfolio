#!/usr/bin/env python3
"""Keep the project pages in step with each project's latest GitHub release.

For each page, the version it shows is read from its "All builds are vX.Y.Z"
line. If the project has a newer release, every mention of the old version on
the page (download links, file names, install commands, the demo's version
badge) becomes the new one.

Every download link on every page is then checked against the release's
actual files. A page is only written if all of its links point at files that
exist; otherwise the problems are listed and the script exits with status 1,
so the workflow fails and GitHub emails about it.

Usage: update_releases.py [--root DIR] [--message-file FILE]
Set GITHUB_TOKEN to avoid the API's anonymous rate limit.
"""
import argparse
import json
import os
import pathlib
import re
import sys
import urllib.request

OWNER = 'Spinjitsudoom'
PAGES = {
    'shelf.html': 'shelf',
    'matchbox.html': 'Matchbox',
    'artisync.html': 'ArtiSync',
}
CURRENT = re.compile(r'All builds are v(\d+(?:\.\d+)+)')


def latest_release(repo):
    req = urllib.request.Request(
        f'https://api.github.com/repos/{OWNER}/{repo}/releases/latest',
        headers={'Accept': 'application/vnd.github+json',
                 'User-Agent': 'portfolio-release-check'})
    token = os.environ.get('GITHUB_TOKEN')
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    return data['tag_name'], {a['name'] for a in data['assets']}


def bad_links(page, html, repo, tag, assets):
    link = re.compile(
        rf'https://github\.com/{OWNER}/{re.escape(repo)}/releases/'
        r'(?:latest/download|download/([^/"\s]+))/([^"\s<]+)', re.I)
    problems = []
    for m in link.finditer(html):
        pinned, name = m.group(1), m.group(2)
        if pinned and pinned != tag:
            problems.append(f'{page}: link pinned to {pinned}, latest is {tag}: {m.group(0)}')
        if name not in assets:
            problems.append(f'{page}: {name} is not a file in {repo} {tag}: {m.group(0)}')
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default=pathlib.Path(__file__).resolve().parents[2])
    ap.add_argument('--message-file')
    args = ap.parse_args()
    root = pathlib.Path(args.root)

    changes, problems = [], []
    for page, repo in PAGES.items():
        path = root / page
        html = path.read_text(encoding='utf-8')
        m = CURRENT.search(html)
        if not m:
            problems.append(f'{page}: no "All builds are vX.Y.Z" line to read the version from')
            continue
        old = m.group(1)
        tag, assets = latest_release(repo)
        new = tag.lstrip('v')
        if new != old:
            # Whole version numbers only: not inside 10.7.3 or 0.7.31.
            html = re.sub(rf'(?<![\d.]){re.escape(old)}(?!\.?\d)', new, html)
        found = bad_links(page, html, repo, tag, assets)
        if found:
            problems += found
            print(f'{page}: NOT updated, {len(found)} broken link(s)')
            continue
        if new != old:
            path.write_text(html, encoding='utf-8')
            changes.append(f'{repo} {old} -> {new}')
            print(f'{page}: {old} -> {new}')
        else:
            print(f'{page}: up to date ({tag}), links OK')

    if changes and args.message_file:
        pathlib.Path(args.message_file).write_text(
            f'Update to the latest releases: {", ".join(changes)}\n\n'
            'Automatic update by the release-check workflow.\n', encoding='utf-8')
    if problems:
        print('\nProblems:', *problems, sep='\n  ', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
