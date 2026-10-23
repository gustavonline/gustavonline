import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogFromReadme, chooseFocus, renderProfile, replaceBlock, calendarProjection, readmeParagraphs, loadProjectReadmes } from './update-profile.mjs';

// Synthetic repositories/counts exercise editorial policy, not production activity.
const make = (repo, commits, options = {}) => ({ repo, owner: repo.split('/')[0], url: `https://github.com/${repo}`, name: repo.split('/')[1], description: 'A useful project.', category: 'tools', status: 'Open source', commits, isPublic: true, pinned: false, ...options });
const fixture = [make('arcitai/factory', 0), make('onlinesourdough/OSM-plugin', 1), make('gustavonline/bridge', 10), make('arcitai/canvas', 12, { fork: true, allowFork: true }), make('gustavonline/portfolio', 1000, { category: 'resources' }), make('gustavonline/community', 999, { category: 'community', stars: 10000 })];
const config = { anchors: fixture.slice(0, 2).map((p) => p.repo), active: fixture.slice(2, 4).map((p) => p.repo), projects: Object.fromEntries(fixture.map((p) => [p.repo, { category: p.category, status: p.status, ...(p.allowFork ? { allowFork: true } : {}) }])) };
const template = () => 'Owner-edited introduction.\n\n## Working on right now\n\n<!-- active-projects:start -->\n<!-- active-projects:end -->\n\n## Useful repos\n<!-- useful-projects:start -->\n' + fixture.map((p) => `- [${p.name}](${p.url}): ${p.description}`).join('\n') + '\n<!-- useful-projects:end -->\n\n**Open-source organisations**\n[Arc’IT AI](https://github.com/arcitai)\n\n<!-- portfolio-config\n' + JSON.stringify(config) + '\n-->\n';

test('curated focus resists landingpage bursts, stars and community work; allows two projects from one owner', () => {
  assert.deepEqual(chooseFocus(fixture, config).map((p) => p.repo), ['arcitai/factory', 'onlinesourdough/OSM-plugin', 'arcitai/canvas']);
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
  const rendered = renderProfile(template(), focus, rest);
  assert.ok(rendered.startsWith('Owner-edited introduction.'));
  assert.ok(rendered.includes('**Open-source organisations**\n[Arc’IT AI]'));
  assert.equal((rendered.match(/## Working on right now/g) ?? []).length, 1);
  assert.equal(catalogFromReadme(rendered).projects.length, 6);
  const edited = rendered.replace('[bridge](https://github.com/gustavonline/bridge): A useful project.', '[Bridge](https://github.com/gustavonline/bridge): A revised explanation.');
  assert.equal(catalogFromReadme(edited).projects.find((p) => p.repo.endsWith('/bridge')).description, 'A revised explanation.');
});
test('profile refresh keeps focus as editable bullets without commit tables or selection commentary', () => {
  const focus = chooseFocus(fixture, config);
  const rest = fixture.filter((p) => !focus.includes(p));
  const rendered = renderProfile(template(), focus, rest);
  const block = rendered.split('<!-- active-projects:start -->')[1].split('<!-- active-projects:end -->')[0];
  assert.equal(block.trim().split('\n').length, 3);
  assert.ok(block.trim().split('\n').every((line) => line.startsWith('- [')));
  assert.doesNotMatch(block, /\||commits|30 days|Updated|stay in focus|follows activity/i);
  const edited = rendered.replace('[factory](https://github.com/arcitai/factory): A useful project.', '[Factory](https://github.com/arcitai/factory): My modular software toolkit.');
  assert.equal(catalogFromReadme(edited).projects.find((p) => p.repo === 'arcitai/factory').description, 'My modular software toolkit.');
  assert.equal(renderProfile(rendered, focus, rest), rendered);
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

test('README section preserves paragraph boundaries and stops before the next section or upstream README', () => {
  const story = '# Tool\n\n## Why I built this\n\nI wanted a canvas.\n\nIt keeps diagrams\nand designs together.\n\n';
  for (const ending of ['## Install\nNever include this.', '---\n# Upstream\nNever include this.', '']) {
    assert.deepEqual(readmeParagraphs((story + ending).replaceAll('\n', '\r\n')), ['I wanted a canvas.', 'It keeps diagrams and designs together.']);
  }
  const examples = '```md\n## Why I built this\nNot a live section.\n```\n<!-- ## Why I built this -->\n';
  assert.deepEqual(readmeParagraphs(examples + story), ['I wanted a canvas.', 'It keeps diagrams and designs together.']);
});

test('missing, duplicate, empty, oversized or structured sections fail rather than inventing website copy', () => {
  const heading = '## Why I built this\n\n';
  for (const invalid of ['No section', heading, heading + 'One.\n\n' + heading + 'Two.', heading + 'x'.repeat(301), heading + 'A.\n\nB.\n\nC.\n\nD.\n\nE.', heading + '- A list.', heading + '<script>no</script>', heading + '[linked](https://example.com)', heading + '```sh\ncode\n```', heading + '### Nested\nText']) {
    assert.throws(() => readmeParagraphs(invalid));
  }
  for (const body of ['Valid intro.\n\n~~~js\ncode\n~~~', '    indentedCode()', 'Valid intro.\n\n    indentedCode()', 'Valid intro.\n\nTitle\n=====', 'Valid intro.\n\nTitle\n---']) {
    assert.throws(() => readmeParagraphs(heading + body), /plain paragraphs/);
  }
});

test('one project README supplies both the visible profile summary and full website prose', async () => {
  const item = { ...fixture[0], readmeSection: 'Why I built this' };
  const text = '## Why I built this\n\nThe project motivation.\n\nThe technical approach.\n';
  const source = { text, revision: 'a'.repeat(40), url: `https://github.com/${item.repo}/blob/${'a'.repeat(40)}/README.md#why-i-built-this` };
  const [updated, untouched] = await loadProjectReadmes([item, fixture[1]], async () => source);
  assert.equal(updated.description, 'The project motivation.');
  assert.deepEqual(updated.readme.paragraphs, ['The project motivation.', 'The technical approach.']);
  assert.equal(updated.readme.revision, source.revision);
  assert.match(updated.readme.sha256, /^[a-f0-9]{64}$/);
  assert.equal(untouched, fixture[1]);
  const rendered = renderProfile(template(), [updated, fixture[1], fixture[2]], fixture.slice(3));
  assert.equal(catalogFromReadme(rendered).projects[0].description, updated.readme.paragraphs[0]);
  assert.doesNotMatch(rendered, /The technical approach/);
  await assert.rejects(loadProjectReadmes([item], async () => ({ ...source, text: 'missing' })), /exactly one/);
  await assert.rejects(loadProjectReadmes([{ ...item, isPublic: false }], async () => { throw new Error('Must not read private source'); }), /Refusing private/);
});

test('attribution links survive extraction; unsupported links and rich markup abort refresh', () => {
  const intro = '## Why I built this\n\nI wanted a canvas.\n\n';
  const credit = 'Built on paper-rs by [Michael Shimeles](https://github.com/michaelshimeles).';
  assert.deepEqual(readmeParagraphs(intro + credit), ['I wanted a canvas.', credit]);
  assert.deepEqual(readmeParagraphs(intro + 'See [paper-rs](https://github.com/michaelshimeles/paper-rs).'), ['I wanted a canvas.', 'See [paper-rs](https://github.com/michaelshimeles/paper-rs).']);
  for (const invalid of ['[author](javascript:alert(1))', '[author](https://github.com.evil.test/person)', '[author](https://github.com@evil.test/person)', '[author](https://example.com/person)', '[author](//github.com/person)', '![image](https://github.com/person)', '[**bold**](https://github.com/person)', '[<img>](https://github.com/person)']) {
    assert.throws(() => readmeParagraphs(intro + invalid), /plain paragraphs/);
  }
  assert.throws(() => readmeParagraphs('## Why I built this\n\n' + credit), /first paragraph/);
});
