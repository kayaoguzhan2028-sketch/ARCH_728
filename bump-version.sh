#!/bin/sh
# Cache-busts every local <script src="...\.js"> / <link href="...\.css">
# tag across the site by stamping (or re-stamping) a ?v=TIMESTAMP query
# param on it. Run this once before each deploy.
#
# Why this is needed: .htaccess sets long-lived immutable caching on .js/
# .css (see the project root .htaccess), which is what lets browsers skip
# re-downloading them on every visit — but that only works if a changed file
# gets a new URL. Bumping ?v= here is what changes the URL.
#
# CDN tags (https://unpkg.com/..., https://cdn.jsdelivr.net/...) are
# deliberately left untouched — those URLs already pin an exact library
# version in the path itself, appending our own ?v= to them wouldn't cache-
# bust anything we control.
#
# A brand-new local <script>/<link> tag that doesn't have a ?v= yet also
# gets one added automatically the first time this runs on it.
#
# Uses sed (not awk) specifically because sed doesn't normalize line endings
# — an earlier awk-based version of this script silently rewrote every
# processed file's CRLF line endings to LF even when nothing else changed,
# which showed up as noise in `git status` on files that had no .js/.css
# tags at all. The grep pre-check below also means a file with nothing to
# version is never opened for writing in the first place.
#
# Usage: ./bump-version.sh   (run from the project root, or anywhere — it
# cd's to its own directory first)

cd "$(dirname "$0")" || exit 1

VERSION=$(date +%Y%m%d%H%M)

count=0
for f in $(find . -name "*.html" -not -path "./.git/*"); do
  # Skip files with nothing to do — avoids opening (and thus rewriting) a
  # file for zero actual change. Git Bash's sed/awk both do text-mode I/O on
  # Windows and quietly normalize CRLF->LF on *any* file they write back,
  # even one where no substitution matched — the first version of this
  # script learned that the hard way by touching 60+ unrelated pages' line
  # endings. Requiring an actual LOCAL (non-CDN) .js/.css reference or an
  # existing ?v= keeps this scoped to only the handful of files that
  # genuinely need a version bump.
  if ! grep -E '\.(js|css)"' "$f" | grep -qv 'https\?://' && ! grep -qE '\?v=[0-9]+"' "$f"; then
    continue
  fi
  before=$(cat "$f")
  sed -i -E "/https?:\/\//! { s/\?v=[0-9]+\"/?v=${VERSION}\"/g; s/\.js\"/.js?v=${VERSION}\"/g; s/\.css\"/.css?v=${VERSION}\"/g }" "$f"
  after=$(cat "$f")
  if [ "$before" != "$after" ]; then
    count=$((count + 1))
  fi
done

echo "$VERSION" > VERSION

echo "Bumped to ?v=$VERSION ($count file(s) changed). VERSION file updated."
