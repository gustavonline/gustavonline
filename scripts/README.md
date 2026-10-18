# Profile refresh

`node scripts/update-profile.mjs` refreshes the marked **What I'm working on** table in the root README. It chooses the repository with the most commits attributed to Gustav by GitHub's contribution API in the previous 30 days, once per owner: `arcitai`, `onlinesourdough`, `gustavonline`. GitHub's contribution rules apply, including eligible branches and author attribution. Private repositories, forks, archives and profile infrastructure are excluded. A missing owner or an incomplete API response fails without replacing the published files.

The script then parses that README table to produce `data/github-profile.json`, together with the real contribution calendar. The website consumes this projection; it does not select its own projects. The README is the human-readable source for the selection and summaries. Known project summaries live in the small catalog in the updater; other repositories use their public GitHub description. Useful repos remain curated by hand.

GitHub Actions runs daily and on manual dispatch. It uses its own scoped `GITHUB_TOKEN`; no personal token or frontend secret is needed. A local run can use the existing `gh` login. Test with `node --test scripts/update-profile.test.mjs`.

For the local website preview, copy `data/github-profile.json` to its `public/data/` directory. `VITE_GITHUB_PROFILE_REFRESH=true` also enables a public refresh from this repository; failed refreshes retain the bundled snapshot.
