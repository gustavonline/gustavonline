import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const owners = ['arcitai', 'onlinesourdough', 'gustavonline'];
const plain = (text) => String(text ?? '').replace(/[|\r\n]/g, ' ').replace(/[<>\[\]\\]/g, '').replace(/\s+/g, ' ').trim();
const validCount = (value) => Number.isSafeInteger(value) && value >= 0;
const repoPattern = /^(arcitai|onlinesourdough|gustavonline)\/[A-Za-z0-9_.-]+$/;
const categories = { tools: 'Tools & experiments', community: 'Community', resources: 'Resources' };

export function replaceBlock(readme, name, body) {
  const begin = `<!-- ${name}:start -->`, end = `<!-- ${name}:end -->`;
  const start = readme.indexOf(begin), finish = readme.indexOf(end);
  if (start < 0 || finish < start || readme.indexOf(begin, start + 1) >= 0 || readme.indexOf(end, finish + 1) >= 0) throw new Error(`README must contain exactly one ${name} block`);
  return readme.slice(0, start) + `${begin}\n${body}\n${end}` + readme.slice(finish + end.length);
}

/** Names/summaries come from visible README content; the comment sets eligibility. */
export function catalogFromReadme(readme) {
  const configs = [...readme.matchAll(/<!-- portfolio-config\n([\s\S]*?)\n-->/g)];
  if (configs.length !== 1) throw new Error('README needs one portfolio-config comment');
  const config = JSON.parse(configs[0][1]);
  if (!Array.isArray(config.anchors) || config.anchors.length !== 2 || !Array.isArray(config.active) || !config.projects) throw new Error('Invalid portfolio configuration');
  const found = new Map();
  const add = (repo, name, description) => {
    const key = repo.toLowerCase();
    if (!repoPattern.test(repo) || found.has(key)) throw new Error(`Invalid or duplicate catalog repository: ${repo}`);
    found.set(key, { repo, owner: repo.split('/')[0], url: `https://github.com/${repo}`, name: plain(name), description: plain(description) });
  };
  for (const m of readme.matchAll(/^\| \[([^\]]+)\]\(https:\/\/github\.com\/([^ )]+)\) \| ([^|]+) \| \d+ \|$/gm)) add(m[2], m[1], m[3]);
  for (const m of readme.matchAll(/^- \[([^\]]+)\]\(https:\/\/github\.com\/([^ )]+)\): (.+)$/gm)) add(m[2], m[1], m[3]);
  const projects = Object.entries(config.projects).map(([repo, meta]) => {
    const project = found.get(repo.toLowerCase());
    if (!repoPattern.test(repo) || !project || !categories[meta.category] || !project.description || !project.name) throw new Error(`Missing/invalid README project: ${repo}`);
    if (meta.icon && (!/^\/assets\/[A-Za-z0-9/_.-]+\.svg$/.test(meta.icon) || meta.icon.includes('..'))) throw new Error('Invalid local project icon');
    return { ...project, ...meta, repo, owner: repo.split('/')[0], url: `https://github.com/${repo}` };
  });
  const unique = [...config.anchors, ...config.active];
  if (new Set(unique).size !== unique.length || unique.some((repo) => !config.projects[repo] || config.projects[repo].category !== 'tools')) throw new Error('Focus must use distinct curated tools');
  return { config, projects };
}

/** Two editorial anchors, then activity among explicitly eligible tools. */
export function chooseFocus(projects, config, previous = []) {
  const eligible = projects.filter((p) => p.isPublic && !p.archived && (!p.fork || p.allowFork));
  const byRepo = new Map(eligible.map((p) => [p.repo, p]));
  const anchors = config.anchors.map((repo) => byRepo.get(repo)).filter(Boolean);
  const active = config.active.map((repo) => byRepo.get(repo)).filter(Boolean);
  active.sort((a, b) => b.commits - a.commits || Number(b.pinned) - Number(a.pinned) || config.active.indexOf(a.repo) - config.active.indexOf(b.repo));
  let winner = active[0];
  const incumbent = active.find((p) => previous.some((old) => old.repo === p.repo));
  if (incumbent && winner && winner.repo !== incumbent.repo && (winner.commits < 5 || winner.commits < incumbent.commits * 1.5)) winner = incumbent;
  const focus = [...anchors, ...(winner ? [winner] : [])];
  for (const project of active) if (focus.length < 3 && !focus.some((p) => p.repo === project.repo)) focus.push(project);
  if (focus.length !== 3) throw new Error('Fewer than three valid focus projects; keeping previous files');
  return focus;
}

export function renderProfile(readme, focus, more, date) {
  const active = 'The methods and tools I’m focused on at the moment.\n\n' +
    '| Project | Focus | Recent commits |\n| --- | --- | ---: |\n' +
    focus.map((p) => `| [${p.name}](${p.url}) | ${p.description} | ${p.commits} |`).join('\n') +
    `\n\n<sub>Public commits by me in the 30 days to ${date}. Factory and AIOS stay in focus; the third project follows activity among my selected tools.</sub>`;
  const useful = Object.entries(categories).map(([category, title]) => {
    const items = more.filter((p) => p.category === category);
    return items.length ? `**${title}**\n\n` + items.map((p) => `- [${p.name}](${p.url}): ${p.description}`).join('\n') : '';
  }).filter(Boolean).join('\n\n');
  return replaceBlock(replaceBlock(readme, 'active-projects', active), 'useful-projects', useful);
}

export function calendarProjection(calendar) {
  const levels = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
  const weeks = calendar.weeks.map((week) => ({ days: week.contributionDays.map((d) => {
    const stamp = Date.parse(`${d.date}T00:00:00Z`);
    if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== d.date || new Date(stamp).getUTCDay() !== d.weekday || !validCount(d.contributionCount) || !(d.contributionLevel in levels)) throw new Error('Invalid contribution calendar from GitHub');
    return { date: d.date, weekday: d.weekday, count: d.contributionCount, level: levels[d.contributionLevel] };
  }) }));
  const days = weeks.flatMap((week) => week.days);
  if (!days.length) throw new Error('Empty contribution calendar');
  for (let i = 1; i < days.length; i++) if (Date.parse(days[i].date) - Date.parse(days[i - 1].date) !== 86400000) throw new Error('Non-contiguous contribution calendar');
  if (days.reduce((n, day) => n + day.count, 0) !== calendar.totalContributions) throw new Error('Contribution total mismatch');
  return { from: days[0].date, to: days.at(-1).date, total: calendar.totalContributions, weeks };
}

async function queryGitHub(query, variables) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}); no files changed`);
  const payload = await response.json();
  if (payload.errors?.length || !payload.data) throw new Error('GitHub returned incomplete data; no files changed');
  return payload.data;
}

export async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const readmePath = path.join(root, 'README.md');
  const original = await readFile(readmePath, 'utf8');
  const { config, projects: catalog } = catalogFromReadme(original);
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 86400000).toISOString();
  const calendarFrom = new Date(now.getTime() - 364 * 86400000).toISOString().slice(0, 10) + 'T00:00:00Z';
  const { user } = await queryGitHub(`query($to:DateTime!,$calendarFrom:DateTime!){user(login:"gustavonline"){
    id pinnedItems(first:6,types:[REPOSITORY]){nodes{... on Repository{nameWithOwner}}}
    contributionsCollection(from:$calendarFrom,to:$to){contributionCalendar{totalContributions weeks{contributionDays{date weekday contributionCount contributionLevel}}}}
  }}`, { to: now.toISOString(), calendarFrom });
  if (!user) throw new Error('GitHub profile unavailable');
  const pins = new Set(user.pinnedItems.nodes.map((p) => p.nameWithOwner.toLowerCase()));
  const queries = catalog.map((p, index) => {
    const [owner, name] = p.repo.split('/');
    return `r${index}:repository(owner:${JSON.stringify(owner)},name:${JSON.stringify(name)}){isPrivate isArchived isFork stargazerCount defaultBranchRef{target{... on Commit{history(first:1,since:$from,until:$to,author:{id:$author}){totalCount}}}}}`;
  });
  const data = await queryGitHub(`query($from:GitTimestamp!,$to:GitTimestamp!,$author:ID!){${queries.join('\n')}}`, { from, to: now.toISOString(), author: user.id });
  const projects = catalog.flatMap((p, index) => {
    const repo = data[`r${index}`];
    if (!repo) throw new Error(`Repository unavailable: ${p.repo}`);
    if (repo.isPrivate || repo.isArchived || (repo.isFork && !p.allowFork)) return [];
    const commits = repo.defaultBranchRef?.target?.history?.totalCount;
    if (!validCount(commits) || !validCount(repo.stargazerCount)) throw new Error(`Incomplete repository activity: ${p.repo}`);
    return [{ ...p, commits, isPublic: true, archived: repo.isArchived, fork: repo.isFork, stars: repo.stargazerCount, pinned: pins.has(p.repo.toLowerCase()) }];
  });
  let previous = [];
  try { previous = JSON.parse(await readFile(path.join(root, 'data/github-profile.json'), 'utf8')).projects ?? []; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const focus = chooseFocus(projects, config, previous);
  const more = projects.filter((p) => !focus.some((f) => f.repo === p.repo)).sort((a, b) => Object.keys(categories).indexOf(a.category) - Object.keys(categories).indexOf(b.category) || Number(b.pinned) - Number(a.pinned) || b.commits - a.commits || catalog.findIndex((p) => p.repo === a.repo) - catalog.findIndex((p) => p.repo === b.repo));
  const readme = renderProfile(original, focus, more, now.toISOString().slice(0, 10));
  const renderedCatalog = catalogFromReadme(readme).projects;
  const projectOutput = (p) => {
    const visible = renderedCatalog.find((item) => item.repo === p.repo);
    return { owner: p.owner, repo: p.repo, name: visible.name, url: p.url, description: visible.description, commits: p.commits, isPublic: true, category: p.category, status: p.status, ...(p.icon ? { icon: p.icon } : {}), pinned: p.pinned, stars: p.stars };
  };
  const projection = { schemaVersion: 2, generatedAt: now.toISOString(), sourceReadme: 'https://github.com/gustavonline/gustavonline/blob/main/README.md', sourceRevision: process.env.GITHUB_SHA || 'local-preview', readmeSha256: createHash('sha256').update(readme).digest('hex'), windowDays: 30,
    projects: focus.map(projectOutput), moreProjects: more.map(projectOutput), contributions: calendarProjection(user.contributionsCollection.contributionCalendar) };
  await mkdir(path.join(root, 'data'), { recursive: true });
  await writeFile(readmePath, readme);
  await writeFile(path.join(root, 'data/github-profile.json'), JSON.stringify(projection, null, 2) + '\n');
  console.log(focus.map((p) => `${p.repo}: ${p.commits} commits`).join('\n'));
  console.log(`${more.length} supporting projects; ${projection.contributions.total} contributions across ${projection.contributions.weeks.length} weeks`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
