# Notion navigation icons

Optional navigation assets in three visual families. They do not install a
method, create a database, change a source route or replace an existing brand.
The published core and Agentic System root marks remain their canonical marks.
Use the PNG files as Notion icons; the Agentic System SVGs remain editable.

- `osm`: open espresso glyphs with warm orange details and a light warm canvas.
- `agentic`: cream glyphs on the original solid blue rounded tile.
- `gustavonline`: open charcoal glyphs with orange and muted olive accents on
  a light neutral canvas.

The document and lightning icons in `osm` reuse the approved Knowledge and
Skills assets from OSM Content. Other open glyphs were produced with the
built-in image generator, using those approved assets as visual references.
The prompts specified a single centered bold symbol, consistent rounded
strokes and scale, no enclosing badge or outer border, no words or 3D effects.
Navigation subjects are encoded in the filenames.

The blue family deliberately uses a deterministic SVG background and browser
PNG export. Generated transparency variants were rejected: automated
background extraction had removed parts of the blue tile. In the final SVGs,
the blue rounded rectangle is a fully opaque shape and only the exterior is
transparent. Blue `#4265A0` and cream `#FFFAF0` match the original root mark.
There are no filters, shadows, masks or bitmap background-removal operations.

`preview.html` shows every family and the blue tiles on light, gray and dark
backgrounds. The read-only alpha inspector checks opaque interior samples and
transparent exterior corners; the visual check also covers the full silhouette
and small-size legibility. Failed generated drafts are not published here.

To rebuild the blue SVG/PNG pairs, run
`node scripts/notion-icons/generate_agentic.mjs` from the repository. It uses
the installed Playwright CLI skill and an isolated browser session. It does
not open an account or read a personal workspace.
