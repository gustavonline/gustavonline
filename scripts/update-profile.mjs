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

const statuses = ['Community maintained', 'Community handoff', 'Resources', 'In development', 'Open source', 'Public preview'];

/** Selection is independent of the generated README, including omitted projects. */
export function validateCatalog(config) {
  if (config?.schemaVersion !== 1 || !Array.isArray(config.anchors) || config.anchors.length !== 2 || !Array.isArray(config.active) || !config.projects || Array.isArray(config.projects)) throw new Error('Invalid project catalog');
  const entries = Object.entries(config.projects);
  if (!entries.length || entries.length > 50) throw new Error('Expected 1–50 selected repositories');
  const ids = new Set();
  for (const [repo, meta] of entries) {
    if (!repoPattern.test(repo) || !meta || !categories[meta.category] || !statuses.includes(meta.status)) throw new Error(`Invalid selected project: ${repo}`);
    if (meta.allowFork !== undefined && typeof meta.allowFork !== 'boolean') throw new Error(`Invalid fork selection: ${repo}`);
    if (typeof meta.nodeId !== 'string' || !/^[A-Za-z0-9_+/=-]{8,200}$/.test(meta.nodeId) || ids.has(meta.nodeId)) throw new Error(`Invalid or duplicate repository ID: ${repo}`);
    ids.add(meta.nodeId);
    if (meta.icon && (!/^\/assets\/[A-Za-z0-9/_.-]+\.svg$/.test(meta.icon) || meta.icon.includes('..'))) throw new Error('Invalid local project icon');
    if (meta.textSource !== undefined && meta.textSource !== 'description') throw new Error(`Invalid text source: ${repo}`);
    for (const [key, limit] of [['name', 80], ['summary', 300]]) {
      if (meta[key] !== undefined && (typeof meta[key] !== 'string' || !meta[key].trim() || meta[key].length > limit || plain(meta[key]) !== meta[key])) throw new Error(`Invalid ${key} override: ${repo}`);
    }
  }
  const focus = [...config.anchors, ...config.active];
  if (new Set(focus).size !== focus.length || focus.some(repo => !config.projects[repo] || config.projects[repo].category !== 'tools')) throw new Error('Focus must use distinct selected tools');
  return config;
}

/** A node ID follows the chosen repository; names and owners are current API data. */
export function resolveProjects(config, nodes) {
  validateCatalog(config);
  const entries = Object.entries(config.projects);
  if (!Array.isArray(nodes) || nodes.length !== entries.length) throw new Error('Incomplete repository lookup; keeping previous files');
  const projects = [], seen = new Set(), omitted = [];
  entries.forEach(([catalogRepo, settings], index) => {
    const repo = nodes[index];
    if (!repo || repo.id !== settings.nodeId || typeof repo.isPrivate !== 'boolean' || typeof repo.isArchived !== 'boolean' || typeof repo.isFork !== 'boolean') throw new Error(`Repository lookup unavailable: ${catalogRepo}; keeping previous files`);
    if (repo.isPrivate || repo.isArchived || (repo.isFork && !settings.allowFork)) {
      omitted.push(catalogRepo);
      return;
    }
    if (!repoPattern.test(repo.nameWithOwner) || seen.has(repo.nameWithOwner.toLowerCase())) throw new Error(`Repository left the selected owners or duplicated another project: ${catalogRepo}`);
    seen.add(repo.nameWithOwner.toLowerCase());
    const commits = repo.defaultBranchRef?.target?.history?.totalCount;
    const revision = repo.defaultBranchRef?.target?.oid;
    if (!validCount(commits) || !validCount(repo.stargazerCount) || !/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error(`Incomplete repository activity: ${catalogRepo}`);
    projects.push({ ...settings, catalogRepo, repo: repo.nameWithOwner, owner: repo.nameWithOwner.split('/')[0], url: `https://github.com/${repo.nameWithOwner}`, githubDescription: repo.description, commits, revision, isPublic: true, archived: false, fork: repo.isFork, stars: repo.stargazerCount });
  });
  return { projects, omitted };
}

/** Reduce simple inline Markdown to text without copying links or HTML into a summary. */
function inlineText(value) {
  const text = value.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1').replace(/\*([^*]+)\*/g, '$1').trim();
  return /[<>\[\]`*\\]/.test(text) ? null : plain(text);
}

export function readmeIntro(readme) {
  if (readme === null) return { title: null, description: null };
  if (typeof readme !== 'string' || readme.length > 250000) throw new Error('Project README is missing or too large');
  const lines = readme.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '').replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1\s*$/gm, '').split('\n');
  const heading = lines.findIndex(line => /^# +\S/.test(line));
  if (heading < 0) return { title: null, description: null };
  const title = inlineText(lines[heading].replace(/^# +/, '').replace(/ +#+\s*$/, ''));
  const end = lines.findIndex((line, index) => index > heading && /^#{1,6}\s|^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line));
  const blocks = lines.slice(heading + 1, end < 0 ? undefined : end).join('\n').split(/\n\s*\n/);
  for (const block of blocks) {
    if (!block.trim() || /[<>]|^\s*(?:[-+*]\s|\d+[.)]\s|\||!\[|\[!\[)/m.test(block)) continue;
    const text = inlineText(block.replace(/\s+/g, ' ').trim());
    if (text && /^(?:(?:revision|version|updated|last updated|license|status|author)\s*:|maintained by\b)/i.test(text)) continue;
    if (text) return { title, description: text.length <= 300 ? text : null };
  }
  return { title, description: null };
}

// This small authoring format supports GitHub attribution links, not general Markdown.
const githubAttribution = /(?<!!)\[([^\[\]\r\n]+)\]\((https:\/\/github\.com\/[A-Za-z0-9-]+(?:\/[A-Za-z0-9_.-]+)?\/?)\)/g;

/** Extract short paragraphs and optional GitHub credit links, never the installation guide. */
export function readmeParagraphs(readme, section = 'Why I built this', required = true) {
  if (typeof readme !== 'string' || readme.length > 250000) throw new Error('Project README is missing or too large');
  const lines = readme.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const sections = [];
  let current = null;
  let fence = null;
  for (const line of lines) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (current) current.push(line);
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      continue;
    }
    if (fence) { if (current) current.push(line); continue; }
    if (current && /^\s*(?:=+|-+)\s*$/.test(line) && current.at(-1)?.trim()) throw new Error(`"${section}" must contain plain paragraphs only`);
    if (line.trimEnd() === `## ${section}`) {
      current = [];
      sections.push(current);
    } else if (/^#{1,2}\s|^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) current = null;
    else if (current) current.push(line);
  }
  if (!sections.length && !required) return null;
  if (sections.length !== 1) throw new Error(`Project README needs exactly one "## ${section}" section`);
  const sectionText = sections[0].join('\n');
  const body = sectionText.trim();
  // Keep allowed links in the source; validate the remaining text rather than
  // accepting arbitrary Markdown or silently removing an unsupported qualification.
  const prose = sectionText.replace(githubAttribution, '$1');
  if (/[<>`*_\[\]\\]|^ {0,3}~{3,}|^(?: {4,}|\t)\S|^\s*=+\s*$|^\s*(?:#{1,6}\s|[-+]\s|\d+[.)]\s|\|)/m.test(prose)) throw new Error(`"${section}" must contain plain paragraphs with optional GitHub attribution links only`);
  const paragraphs = body.split(/\n\s*\n/).map((text) => text.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!paragraphs.length || paragraphs.length > 4 || paragraphs[0].length > 300 || paragraphs.some((p) => p.length > 1000) || paragraphs.join('').length > 3000) throw new Error(`"${section}" needs 1–4 short paragraphs; the first must fit 300 characters`);
  if (paragraphs[0].includes('[')) throw new Error(`"${section}" first paragraph must be plain text for the profile summary`);
  return paragraphs;
}

/** Project READMEs own current text; the catalog can keep an explicit short override. */
export async function loadProjectReadmes(projects, readSource) {
  return Promise.all(projects.map(async (project) => {
    if (!project.isPublic) throw new Error(`Refusing private README: ${project.repo}`);
    const source = project.name && (project.summary || project.textSource === 'description') ? { text: null } : await readSource(project);
    const intro = readmeIntro(source.text);
    const paragraphs = !project.summary && project.textSource !== 'description' && typeof source.text === 'string' ? readmeParagraphs(source.text, 'Why I built this', false) : null;
    const description = project.summary ?? (project.textSource === 'description' ? inlineText(project.githubDescription ?? '') : paragraphs?.[0] ?? intro.description ?? inlineText(project.githubDescription ?? ''));
    const name = project.name ?? intro.title ?? project.repo.split('/')[1];
    if (!description || description.length > 300 || !name || name.length > 80) throw new Error(`No usable project title/summary: ${project.repo}. Edit its README/description or add a catalog override.`);
    return { ...project, name, description, ...(paragraphs && !project.summary ? { readme: {
      section: 'Why I built this', url: source.url + '#why-i-built-this', revision: source.revision,
      sha256: createHash('sha256').update(source.text).digest('hex'), paragraphs,
    } } : {}) };
  }));
}

/** Two editorial anchors, then activity among explicitly eligible tools. */
export function chooseFocus(projects, config, previous = []) {
  const eligible = projects.filter((p) => p.isPublic && !p.archived && (!p.fork || p.allowFork));
  const byRepo = new Map(eligible.flatMap((p) => [[p.repo, p], [p.catalogRepo ?? p.repo, p]]));
  const anchors = config.anchors.map((repo) => byRepo.get(repo)).filter(Boolean);
  const active = config.active.map((repo) => byRepo.get(repo)).filter(Boolean);
  active.sort((a, b) => b.commits - a.commits || Number(b.pinned) - Number(a.pinned) || config.active.indexOf(a.catalogRepo ?? a.repo) - config.active.indexOf(b.catalogRepo ?? b.repo));
  let winner = active[0];
  const incumbent = active.find((p) => previous.some((old) => old.repo === p.repo || old.repo === p.catalogRepo));
  if (incumbent && winner && winner.repo !== incumbent.repo && (winner.commits < 5 || winner.commits < incumbent.commits * 1.5)) winner = incumbent;
  const focus = [...anchors, ...(winner ? [winner] : [])];
  for (const project of active) if (focus.length < 3 && !focus.some((p) => p.repo === project.repo)) focus.push(project);
  if (focus.length !== 3) throw new Error('Fewer than three valid focus projects; keeping previous files');
  return focus;
}

export function renderProfile(readme, focus, more) {
  const active = focus.map((p) => `- [${p.name}](${p.url}): ${p.description}`).join('\n');
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

export async function buildProfile({ original, config, nodes, pins, previous, readSource, calendar, now, sourceRevision }) {
  const resolved = resolveProjects(config, nodes);
  const catalog = Object.keys(config.projects);
  const projects = await loadProjectReadmes(resolved.projects.map(p => ({ ...p, pinned: pins.has(p.repo.toLowerCase()) })), readSource);
  const focus = chooseFocus(projects, config, previous);
  const more = projects.filter(p => !focus.some(f => f.repo === p.repo)).sort((a, b) => Object.keys(categories).indexOf(a.category) - Object.keys(categories).indexOf(b.category) || Number(b.pinned) - Number(a.pinned) || b.commits - a.commits || catalog.indexOf(a.catalogRepo) - catalog.indexOf(b.catalogRepo));
  const readme = renderProfile(original, focus, more);
  const projectOutput = p => ({ owner: p.owner, repo: p.repo, name: p.name, url: p.url, description: p.description, commits: p.commits, isPublic: true, category: p.category, status: p.status, ...(p.icon ? { icon: p.icon } : {}), ...(p.readme ? { readme: p.readme } : {}), pinned: p.pinned, stars: p.stars });
  const projection = { schemaVersion: 3, generatedAt: now.toISOString(), sourceReadme: 'https://github.com/gustavonline/gustavonline/blob/main/README.md', sourceRevision, readmeSha256: createHash('sha256').update(readme).digest('hex'), windowDays: 30,
    projects: focus.map(projectOutput), moreProjects: more.map(projectOutput), contributions: calendarProjection(calendar) };
  return { readme, projection, omitted: resolved.omitted };
}

export async function main(readmeOverrides = {}) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const readmePath = path.join(root, 'README.md');
  const original = await readFile(readmePath, 'utf8');
  const config = validateCatalog(JSON.parse(await readFile(path.join(root, 'data/projects.json'), 'utf8')));
  if (process.env.GITHUB_ACTIONS === 'true' && Object.keys(readmeOverrides).length) throw new Error('Local README overrides are not allowed in GitHub Actions');
  for (const [repo, file] of Object.entries(readmeOverrides)) {
    if (!config.projects[repo] || typeof file !== 'string' || !path.isAbsolute(file)) throw new Error(`Invalid local README override: ${repo}`);
  }
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 86400000).toISOString();
  const calendarFrom = new Date(now.getTime() - 364 * 86400000).toISOString().slice(0, 10) + 'T00:00:00Z';
  const { user } = await queryGitHub(`query($to:DateTime!,$calendarFrom:DateTime!){user(login:"gustavonline"){
    id pinnedItems(first:6,types:[REPOSITORY]){nodes{... on Repository{nameWithOwner}}}
    contributionsCollection(from:$calendarFrom,to:$to){contributionCalendar{totalContributions weeks{contributionDays{date weekday contributionCount contributionLevel}}}}
  }}`, { to: now.toISOString(), calendarFrom });
  if (!user) throw new Error('GitHub profile unavailable');
  const pins = new Set(user.pinnedItems.nodes.map(p => p.nameWithOwner.toLowerCase()));
  const { nodes } = await queryGitHub(`query($ids:[ID!]!,$from:GitTimestamp!,$to:GitTimestamp!,$author:ID!){nodes(ids:$ids){... on Repository{
    id nameWithOwner isPrivate isArchived isFork description stargazerCount defaultBranchRef{target{... on Commit{oid history(first:1,since:$from,until:$to,author:{id:$author}){totalCount}}}}
  }}}`, { ids: Object.values(config.projects).map(p => p.nodeId), from, to: now.toISOString(), author: user.id });
  // Validate visibility before requesting any README, then pin each read to that commit.
  const publicProjects = resolveProjects(config, nodes).projects;
  const sourceProjects = publicProjects.filter(p => !readmeOverrides[p.catalogRepo] && (!p.name || (!p.summary && p.textSource !== 'description')));
  const queries = sourceProjects.map((p, index) => `r${index}:node(id:${JSON.stringify(p.nodeId)}){... on Repository{isPrivate object(expression:${JSON.stringify(p.revision + ':README.md')}){... on Blob{text}}}}`);
  const sources = queries.length ? await queryGitHub(`query{${queries.join('\n')}}`, {}) : {};
  const published = new Map();
  sourceProjects.forEach((p, index) => {
    const source = sources[`r${index}`];
    if (!source || source.isPrivate) throw new Error(`Public README unavailable: ${p.catalogRepo}; keeping previous files`);
    published.set(p.catalogRepo, source.object?.text ?? null);
  });
  let previous = [];
  try { previous = JSON.parse(await readFile(path.join(root, 'data/github-profile.json'), 'utf8')).projects ?? []; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const sourceRevision = Object.keys(readmeOverrides).length ? 'local-preview' : (process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim());
  const result = await buildProfile({ original, config, nodes, pins, previous, calendar: user.contributionsCollection.contributionCalendar, now, sourceRevision,
    readSource: async project => {
      const localFile = readmeOverrides[project.catalogRepo];
      const revision = localFile ? 'local-preview' : project.revision;
      return { text: localFile ? await readFile(localFile, 'utf8') : published.get(project.catalogRepo), revision,
        url: `https://github.com/${project.repo}/blob/${localFile ? 'main' : revision}/README.md` };
    } });
  await mkdir(path.join(root, 'data'), { recursive: true });
  await writeFile(readmePath, result.readme);
  await writeFile(path.join(root, 'data/github-profile.json'), JSON.stringify(result.projection, null, 2) + '\n');
  console.log(result.projection.projects.map(p => `${p.repo}: ${p.commits} commits`).join('\n'));
  console.log(`${result.projection.moreProjects.length} supporting projects; ${result.projection.contributions.total} contributions across ${result.projection.contributions.weeks.length} weeks`);
  if (result.omitted.length) console.log(`Omitted ${result.omitted.length} archived, private or unapproved-fork selections; catalog retained.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = async () => {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--readme-overrides')) throw new Error('Usage: node scripts/update-profile.mjs [--readme-overrides /absolute/preview-sources.json]');
    const overrides = args.length ? JSON.parse(await readFile(args[1], 'utf8')) : {};
    if (!overrides || Array.isArray(overrides) || typeof overrides !== 'object') throw new Error('README overrides must map repository names to absolute paths');
    await main(overrides);
  };
  run().catch(error => { console.error(error.message); process.exitCode = 1; });
}
