# Profile refresh

`node scripts/update-profile.mjs` updates **Working on right now**, **Useful repos**
and `data/github-profile.json` together. GitHub Actions runs it every six hours,
when the profile README, catalog or updater changes, and on manual dispatch.
Project changes appear at the next successful run; GitHub can delay scheduled jobs.
The workflow uses its scoped `GITHUB_TOKEN`. No new service, personal token or
model-generated copy is required.

## What you still choose

[data/projects.json](../data/projects.json) owns the selected projects, two fixed
anchors, activity candidates, categories, statuses and optional local icons.
It replaces the old hidden `portfolio-config` in the profile README. Adding a
project here makes it eligible; unlisted repositories are never auto-discovered
or published just because they have many commits.

Each entry keeps its GitHub global `nodeId`. The object key is a readable selection
key and initial repository hint. The updater looks up that ID and uses GitHub's
current `nameWithOwner` for the real link, so renames and transfers among
`gustavonline`, `arcitai` and `onlinesourdough` do not require editing two sites.
A transfer outside these selected owners stops the refresh for review. A genuinely
new successor repository has a different ID and still needs one deliberate catalog
change; a similarly named fork is never guessed. OpenPaperDesign now selects
`gustavonline/openpaperdesign`, replacing the archived Arc’IT fork.

Optional `name` keeps a chosen display title such as **Local AI inference for
Omarchy**. Without it, the current README H1 supplies the name, then the repository
name if no plain H1 is available. An optional `summary` is a deliberate editorial
override, currently used for Pi Desktop's community handoff. These choices live
in the catalog rather than in generated bullets.

## Where the text comes from

Normally the project supplies its own text:

1. A live `## Why I built this` section supplies the short description and longer
   website paragraphs. Keep 1–4 plain paragraphs, with the first under 300
   characters, each later paragraph under 1,000 and the total under 3,000.
   GitHub attribution links are supported after the first paragraph. Other rich
   markup, duplicate sections and malformed story sections fail visibly.
2. Without that section, use the first short prose paragraph beneath the README
   H1. Logos, badges, fenced examples, revision/status metadata and maintainer
   credits are skipped. Simple inline links/emphasis/code become plain text;
   installation sections are excluded. Long paragraphs are not cut mid-sentence.
3. If the README has no suitable short introduction, use the repository's GitHub
   description. `"textSource": "description"` chooses that field directly,
   currently for the portfolio itself.

The normal 300-character limit matches the existing website contract. If no usable
source exists, the run fails with the repository named; add or improve its own
summary or choose an explicit catalog override. Ordinary edits to generated
project bullets will be replaced at the next refresh. The personal introduction
and other text outside the two marked blocks remain owner-edited.

Public visibility is checked before reading README text. Each README is fetched
from the exact default-branch commit used for activity. Motivation sections retain
their public commit URL and SHA-256 in schema 3. Archived/private projects and
unapproved forks are omitted while their catalog entries remain intact; this no
longer breaks the next refresh. Unavailable IDs, incomplete API responses or
malformed input abort before the generated files are written. The workflow commits
README and JSON together only after a successful run.

## What comes forward

Agentic Systems and The Onlinesourdough Method are fixed anchors. The third slot
uses Gustav's commits on the public default branch over the last 30 days, among
`active` tools. GitHub pins break ties, then catalog order. The incumbent keeps its
place until a challenger has at least five commits and 1.5 times its activity.
This avoids reshuffling for a small burst. If fewer than three eligible tools
remain, the run keeps the last successful output by failing before publication.

All other selected public projects appear under Tools & experiments, Community
or Resources. Within a group pins come first, then recent commits and catalog
order. Community and Resources projects never take an activity slot. Stars are
metadata, not a ranking signal. The contribution calendar exports GitHub's exact
public day counts/levels, including anonymized private activity when the owner
has enabled it; no private repository names or contents are exported.

## Website and checks

The website reads the generated public JSON on page load, with its bundled snapshot
as a fallback. It does not select or rank independently. The schema and existing
website parser are unchanged. No website deployment is needed for an ordinary
successful remote refresh. An already open page needs a reload. A website redeploy
can refresh its bundled/offline snapshot separately.

```sh
node --test scripts/update-profile.test.mjs
node scripts/update-profile.mjs
```

A local refresh uses the existing `gh` login. Tests cover rename/transfer identity,
archived/private omissions across repeated runs, copy extraction, editorial
choices, ranking, calendar accuracy and failure preserving both generated files.
A real API refresh and website-parser check complete release validation.

For an unpublished project README preview:

```sh
node scripts/update-profile.mjs --readme-overrides /absolute/preview-sources.json
```

The JSON maps selected catalog keys to absolute README paths. Overrides affect
only text; identity and activity still come from GitHub. Preview projections are
marked `local-preview`, rejected in GitHub Actions and blocked by the website's
publish check. Do not publish an override snapshot as evidence of live source text.
