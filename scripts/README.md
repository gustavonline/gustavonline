# Profile refresh

`node scripts/update-profile.mjs` refreshes **Working on right now**, the grouped
**Useful repos** list and `data/github-profile.json` together. The profile README
owns project names, selection and the short summaries of projects without their
own story. Its hidden `portfolio-config` comment defines anchors, the eligible
active set, categories, statuses, optional icons and `readmeSection`.

Factory, The Onlinesourdough Method and OpenPaperDesign use `"readmeSection": "Why I built this"`.
Edit that section in each project's own root `README.md`. Write 1–4 short
paragraphs. After the first paragraph, GitHub attribution links are supported:
`[Michael Shimeles](https://github.com/michaelshimeles)`. Links may point to
GitHub profiles or repositories, with plain labels. Other inline Markdown,
HTML and lists are unsupported. Keep the first paragraph plain text and under
300 characters, each later paragraph under 1,000, and the whole section under
3,000. The first paragraph becomes the profile's short summary; all paragraphs
become the website's project text. The section ends at the next H1/H2 or a
horizontal rule. Duplicate, empty or unsupported sections fail the refresh and
leave the previous files intact. Other projects continue to use their short
profile-README summary. There is no second catalog or case copy on the website.

Schema 3 records the source README URL, exact commit revision and SHA-256 alongside
the paragraphs. The updater checks public visibility before reading any project
README and reads the same commit used for the repository metadata. The browser
receives only the generated public JSON and has no GitHub credentials.

Factory and The Onlinesourdough Method are stable anchors. The third slot uses the most commits by
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
from the rendered profile README before the projection is written. The public profile
uses short project bullets; commit counts and selection rules stay out of the
displayed text. Counts and their date range remain in the JSON for selection.
Recent commits are not the same measure as all contribution events and are not
a quality score.

The calendar uses GitHub's exact day counts and levels, including anonymized
private activity when the owner enables that public profile setting. Only dates,
counts and levels are exported; no private repository identities or content.
GitHub Actions runs daily at 05:23 UTC, manually, and on changes to the profile
README or updater. Project-README edits appear at the next run, not instantly.
It uses its scoped `GITHUB_TOKEN`, without a
personal secret. A local run may use the existing `gh` login. Incomplete remote
data or malformed README configuration fails before generated files are written.

Validate with `node --test scripts/update-profile.test.mjs`. For local website
preview, copy the generated JSON to `public/data/github-profile.json`.
`VITE_GITHUB_PROFILE_REFRESH=true` enables public refresh on page load; the website
retains a valid newer-schema snapshot if the remote response is older or invalid.
The production website workflow enables it. The generated snapshot is also
bundled for the first render and offline use.

Before the project README edits are published, use
`node scripts/update-profile.mjs --readme-overrides /absolute/preview-sources.json`.
That local-only JSON maps configured repository names to absolute README paths.
All selection and activity still come from GitHub; only the named README text is
read from the working copies. Those sources are labelled `local-preview` in the
projection. The Actions workflow never passes overrides. After approval, land the
three project README edits first, then this updater, run a normal refresh, copy the
verified projection to the website and deploy the website. Never publish a
preview projection as proof that its source sections are already on GitHub.
The website deploy workflow checks `scripts/check-profile-publish.mjs` and
refuses `local-preview` sources. The profile updater rejects overrides in
GitHub Actions. A normal local refresh records its Git checkout commit; an
override run explicitly marks the projection as a local preview.
