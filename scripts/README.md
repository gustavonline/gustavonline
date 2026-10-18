# Profile refresh

`node scripts/update-profile.mjs` refreshes **Working on right now**, the grouped
**Useful repos** list and `data/github-profile.json` together. The README is the
editorial source: edit visible project names/descriptions there. Its hidden
`portfolio-config` comment defines anchors, the eligible active set, categories,
statuses and optional icons. There is no competing catalog in the script.

Factory and AIOS are stable anchors. The third slot uses the most commits by
Gustav on the public default branch in 30 days, among explicitly selected tools.
GitHub pins break activity ties, then README order. An incumbent remains until a
challenger has at least five commits and 1.5 times its activity. Portfolio and
community-handoff projects cannot take a focus slot. Stars are metadata, never a
ranking signal. Explicitly maintained forks such as OpenPaperDesign are eligible;
other forks, private and archived repositories are excluded.

All other catalog projects appear under Tools & experiments, Community or
Resources. Within a group pins come first, then recent commits and README order.
The website uses the resulting `projects` and `moreProjects` arrays in that order;
it does not rank or select independently. Names and summaries are parsed back
from the rendered README before the projection is written. The public profile
uses short project bullets; commit counts and selection rules stay out of the
displayed text. Counts and their date range remain in the JSON for selection.
Recent commits are not the same measure as all contribution events and are not
a quality score.

The calendar uses GitHub's exact day counts and levels, including anonymized
private activity when the owner enables that public profile setting. Only dates,
counts and levels are exported; no private repository identities or content.
GitHub Actions runs daily/manual with its scoped `GITHUB_TOKEN`, without a
personal secret. A local run may use the existing `gh` login. Incomplete remote
data or malformed README configuration fails before generated files are written.

Validate with `node --test scripts/update-profile.test.mjs`. For local website
preview, copy the generated JSON to `public/data/github-profile.json`.
`VITE_GITHUB_PROFILE_REFRESH=true` enables public refresh; the website retains a
valid newer-schema snapshot if the remote response is older or invalid.
