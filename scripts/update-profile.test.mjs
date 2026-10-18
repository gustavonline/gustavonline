import test from 'node:test';
import assert from 'node:assert/strict';
import { selectProjects, renderActive, replaceActive, projectsFromReadme, calendarProjection } from './update-profile.mjs';

function entry(owner, name, commits, overrides = {}) {
  return { repository: { owner: { login: owner }, name, nameWithOwner: `${owner}/${name}`, url: `https://github.com/${owner}/${name}`, description: 'Real work', isPrivate: false, isFork: false, isArchived: false, ...overrides }, contributions: { nodes: commits.map((commitCount) => ({ commitCount })) } };
}
const entries = [entry('arcitai', 'factory', [5, 8]), entry('onlinesourdough', 'AIOS-plugin', [20]), entry('gustavonline', 'website', [9])];

test('selects the sum of public commits per home and excludes private/fork/archive/profile data', () => {
  const noisy = [...entries, entry('kastanje-labs', 'something', [999]), entry('gustavonline', 'secret', [999], { isPrivate: true }), entry('gustavonline', 'fork', [999], { isFork: true }), entry('gustavonline', 'old', [999], { isArchived: true }), entry('gustavonline', 'gustavonline', [999]), entry('arcitai', '.github', [999])];
  assert.deepEqual(selectProjects(noisy).map((p) => [p.repo, p.commits]), [['arcitai/factory', 13], ['onlinesourdough/AIOS-plugin', 20], ['gustavonline/website', 9]]);
});
test('ties are stable and unavailable owners fail without inventing activity', () => {
  const tied = [...entries, entry('gustavonline', 'alpha', [9])];
  assert.equal(selectProjects(tied)[2].name, 'alpha');
  assert.throws(() => selectProjects(entries.slice(1)), /No eligible activity/);
});
test('README is the projection source, preserves surrounding prose, escapes remote descriptions', () => {
  const projects = selectProjects([...entries.slice(0, 2), entry('gustavonline', 'website', [9], { description: 'hello | <script>\n[link]' })]);
  const template = 'Intro\n<!-- active-projects:start -->\nold\n<!-- active-projects:end -->\nUseful repos\n';
  const readme = replaceActive(template, renderActive(projects, '2026-10-18'));
  assert.ok(readme.startsWith('Intro\n'));
  assert.ok(readme.endsWith('\nUseful repos\n'));
  assert.deepEqual(projectsFromReadme(readme), projects);
  assert.equal(projects[2].description, 'hello script link');
  assert.equal(projectsFromReadme(readme.replace('hello script link', 'An edited explanation'))[2].description, 'An edited explanation');
  assert.throws(() => replaceActive('no marker', 'x'), /exactly one/);
  assert.throws(() => projectsFromReadme(readme.replace('https://github.com/gustavonline/website', 'https://example.com/website')), /exactly one/);
});
test('calendar preserves exact dates, weekday rows and contribution counts', () => {
  const calendar = { totalContributions: 6, weeks: [ { contributionDays: [{ date: '2026-10-17', weekday: 6, contributionCount: 4, contributionLevel: 'FOURTH_QUARTILE' }] }, { contributionDays: [{ date: '2026-10-18', weekday: 0, contributionCount: 2, contributionLevel: 'FIRST_QUARTILE' }] } ] };
  assert.deepEqual(calendarProjection(calendar), { from: '2026-10-17', to: '2026-10-18', total: 6, weeks: [{ days: [{ date: '2026-10-17', weekday: 6, count: 4, level: 4 }] }, { days: [{ date: '2026-10-18', weekday: 0, count: 2, level: 1 }] }] });
  assert.throws(() => calendarProjection({ ...calendar, totalContributions: 7 }), /total mismatch/);
  const broken = structuredClone(calendar);
  broken.weeks[1].contributionDays[0].date = '2026-10-25';
  assert.throws(() => calendarProjection(broken), /Non-contiguous/);
});
