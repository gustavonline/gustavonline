import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogFromReadme, chooseFocus, renderProfile, replaceBlock, calendarProjection } from './update-profile.mjs';

// Synthetic repositories/counts exercise editorial policy, not production activity.
const make = (repo, commits, options = {}) => ({ repo, owner: repo.split('/')[0], url: `https://github.com/${repo}`, name: repo.split('/')[1], description: 'A useful project.', category: 'tools', status: 'Open source', commits, isPublic: true, pinned: false, ...options });
const fixture = [make('arcitai/factory', 0), make('onlinesourdough/AIOS-plugin', 1), make('gustavonline/bridge', 10), make('arcitai/canvas', 12, { fork: true, allowFork: true }), make('gustavonline/portfolio', 1000, { category: 'resources' }), make('gustavonline/community', 999, { category: 'community', stars: 10000 })];
const config = { anchors: fixture.slice(0, 2).map((p) => p.repo), active: fixture.slice(2, 4).map((p) => p.repo), projects: Object.fromEntries(fixture.map((p) => [p.repo, { category: p.category, status: p.status, ...(p.allowFork ? { allowFork: true } : {}) }])) };
const template = () => 'Owner-edited introduction.\n\n## Working on right now\n\n<!-- active-projects:start -->\n<!-- active-projects:end -->\n\n## Useful repos\n<!-- useful-projects:start -->\n' + fixture.map((p) => `- [${p.name}](${p.url}): ${p.description}`).join('\n') + '\n<!-- useful-projects:end -->\n\n**Open-source organisations**\n[Arc’IT AI](https://github.com/arcitai)\n\n<!-- portfolio-config\n' + JSON.stringify(config) + '\n-->\n';

test('curated focus resists landingpage bursts, stars and community work; allows two projects from one owner', () => {
  assert.deepEqual(chooseFocus(fixture, config).map((p) => p.repo), ['arcitai/factory', 'onlinesourdough/AIOS-plugin', 'arcitai/canvas']);
});
test('a small burst cannot replace the incumbent; a clear activity lead can', () => {
  assert.equal(chooseFocus(fixture, config, [fixture[2]])[2].repo, 'gustavonline/bridge');
  const changed = fixture.map((p) => p.repo === 'arcitai/canvas' ? { ...p, commits: 15 } : p);
  assert.equal(chooseFocus(changed, config, [fixture[2]])[2].repo, 'arcitai/canvas');
  const quiet = fixture.map((p) => ({ ...p, commits: p.repo === 'arcitai/canvas' ? 4 : 0 }));
  assert.equal(chooseFocus(quiet, config, [fixture[2]])[2].repo, 'gustavonline/bridge');
});
test('pins break equal activity ties only; private/archive/unapproved forks never enter focus', () => {
  const tied = fixture.map((p) => ({ ...p, commits: 10, pinned: p.repo === 'arcitai/canvas' }));
  assert.equal(chooseFocus(tied, config)[2].repo, 'arcitai/canvas');
  for (const patch of [{ isPublic: false }, { archived: true }, { allowFork: false }]) {
    const changed = tied.map((p) => p.repo === 'arcitai/canvas' ? { ...p, ...patch } : p);
    assert.equal(chooseFocus(changed, config)[2].repo, 'gustavonline/bridge');
  }
});
test('README roundtrip preserves owner prose and makes displayed names/summaries the projection source', () => {
  const parsed = catalogFromReadme(template());
  assert.equal(parsed.projects.length, 6);
  const focus = chooseFocus(fixture, config);
  const rest = fixture.filter((p) => !focus.includes(p));
  const rendered = renderProfile(template(), focus, rest, '2026-10-18');
  assert.ok(rendered.startsWith('Owner-edited introduction.'));
  assert.ok(rendered.includes('**Open-source organisations**\n[Arc’IT AI]'));
  assert.equal((rendered.match(/## Working on right now/g) ?? []).length, 1);
  assert.equal(catalogFromReadme(rendered).projects.length, 6);
  const edited = rendered.replace('[bridge](https://github.com/gustavonline/bridge): A useful project.', '[Bridge](https://github.com/gustavonline/bridge): A revised explanation.');
  assert.equal(catalogFromReadme(edited).projects.find((p) => p.repo.endsWith('/bridge')).description, 'A revised explanation.');
});
test('ambiguous, external or incomplete README sources fail before output generation', () => {
  assert.throws(() => replaceBlock('no markers', 'active-projects', ''), /exactly one/);
  assert.throws(() => catalogFromReadme(template().replace('https://github.com/gustavonline/bridge', 'https://example.com/bridge')), /Missing/);
  assert.throws(() => catalogFromReadme(template() + '\n- [duplicate](https://github.com/arcitai/factory): Duplicate.'), /duplicate/);
  assert.throws(() => chooseFocus(fixture.slice(0, 2), config), /Fewer than three/);
});
test('calendar preserves full anonymized counts and exact levels without normalization', () => {
  const calendar = { totalContributions: 751, weeks: [ { contributionDays: [{ date: '2026-10-17', weekday: 6, contributionCount: 750, contributionLevel: 'FOURTH_QUARTILE' }] }, { contributionDays: [{ date: '2026-10-18', weekday: 0, contributionCount: 1, contributionLevel: 'FIRST_QUARTILE' }] } ] };
  const projected = calendarProjection(calendar);
  assert.equal(projected.total, 751);
  assert.deepEqual(projected.weeks[0].days[0], { date: '2026-10-17', weekday: 6, count: 750, level: 4 });
  assert.throws(() => calendarProjection({ ...calendar, totalContributions: 752 }), /total mismatch/);
  const broken = structuredClone(calendar); broken.weeks[1].contributionDays[0].date = '2026-10-25';
  assert.throws(() => calendarProjection(broken), /Non-contiguous/);
});
