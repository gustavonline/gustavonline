import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const owners = ['arcitai', 'onlinesourdough', 'gustavonline'];
const begin = '<!-- active-projects:start -->';
const end = '<!-- active-projects:end -->';
const catalog = {
  'arcitai/factory': ['Factory', 'A modular foundation for building and reviewing software with agents. Domain modules can turn it into a Power BI factory.'],
  'onlinesourdough/aios-plugin': ['AIOS', 'Context, practical methods and reusable skills for working with AI agents.'],
  'gustavonline/codex-claude-bridge': ['Codex Bridge', 'Use Codex as a main workspace across models, conversations, files and tools. The current bridge adds Claude.'],
  'gustavonline/gustavonline-website': ['Gustav Online', 'My personal website: selected projects, real GitHub activity and a place to connect.'],
};

const plain = (text) => String(text ?? '').replace(/[|\r\n]/g, ' ').replace(/[<>\[\]\\]/g, '').replace(/\s+/g, ' ').trim();

/** Rank only public, original, maintained repositories. Ties are deterministic. */
export function selectProjects(entries) {
  return owners.map((owner) => {
    const candidates = entries.filter(({ repository: r }) =>
      r.owner.login.toLowerCase() === owner && !r.isPrivate && !r.isFork && !r.isArchived &&
      !['.github', owner].includes(r.name.toLowerCase()));
    const ranked = candidates.map(({ repository: r, contributions }) => ({
      r, commits: contributions.nodes.reduce((sum, item) => sum + item.commitCount, 0),
    })).sort((a, b) => b.commits - a.commits || a.r.nameWithOwner.localeCompare(b.r.nameWithOwner));
    if (!ranked.length) throw new Error(`No eligible activity for ${owner}; preserving the previous published profile.`);
    const { r, commits } = ranked[0];
    if (!Number.isSafeInteger(commits) || commits < 0) throw new Error('Invalid GitHub commit count');
    const [name, description] = catalog[r.nameWithOwner.toLowerCase()] ??
      [r.name, r.description || 'An active public project. Explore the repository for details.'];
    return { owner, repo: r.nameWithOwner, name: plain(name), url: r.url, description: plain(description).slice(0, 300), commits, isPublic: true };
  });
}

export function renderActive(projects, date) {
  return `${begin}\nOne active project from each home, ranked by my public commits over the last 30 days. Updated ${date}.\n\n` +
    '| Project | What I’m working on | Commits |\n| --- | --- | ---: |\n' +
    projects.map((p) => `| [${p.name}](${p.url}) | ${p.description} | ${p.commits} |`).join('\n') + `\n${end}`;
}

export function replaceActive(readme, block) {
  const start = readme.indexOf(begin);
  const finish = readme.indexOf(end);
  if (start < 0 || finish < start || readme.indexOf(begin, start + 1) >= 0 || readme.indexOf(end, finish + 1) >= 0) {
    throw new Error('README must contain exactly one active-projects block');
  }
  return readme.slice(0, start) + block + readme.slice(finish + end.length);
}

/** The website projection comes from the readable README, not a second selection. */
export function projectsFromReadme(readme) {
  const block = readme.slice(readme.indexOf(begin) + begin.length, readme.indexOf(end));
  const pattern = /^\| \[([^\]]+)\]\((https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+))\) \| ([^|]+) \| (\d+) \|$/gm;
  const projects = [...block.matchAll(pattern)].map((m) => ({
    owner: m[3].toLowerCase(), repo: `${m[3]}/${m[4]}`, name: m[1], url: m[2], description: m[5].trim(), commits: Number(m[6]), isPublic: true,
  }));
  if (projects.length !== 3 || owners.some((owner, i) => projects[i].owner !== owner)) {
    throw new Error('README active projects must contain exactly one valid GitHub project per owner, in owner order');
  }
  return projects;
}

export function calendarProjection(calendar) {
  const levels = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
  const weeks = calendar.weeks.map((week) => ({ days: week.contributionDays.map((d) => {
    const stamp = Date.parse(`${d.date}T00:00:00Z`);
    if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== d.date ||
      new Date(stamp).getUTCDay() !== d.weekday || !Number.isSafeInteger(d.contributionCount) || d.contributionCount < 0 ||
      !(d.contributionLevel in levels)) throw new Error('Invalid contribution calendar from GitHub');
    return { date: d.date, weekday: d.weekday, count: d.contributionCount, level: levels[d.contributionLevel] };
  }) }));
  const days = weeks.flatMap((week) => week.days);
  if (!days.length) throw new Error('Empty contribution calendar');
  for (let i = 1; i < days.length; i++) {
    if (Date.parse(days[i].date) - Date.parse(days[i - 1].date) !== 86400000) throw new Error('Non-contiguous contribution calendar');
  }
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
  if (payload.errors?.length || !payload.data?.user) throw new Error('GitHub returned an incomplete profile; no files changed');
  return payload.data.user;
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const readmePath = path.join(root, 'README.md');
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 86400000).toISOString();
  const calendarFrom = new Date(now.getTime() - 364 * 86400000).toISOString().slice(0, 10) + 'T00:00:00Z';
  const user = await queryGitHub(`query($from:DateTime!,$to:DateTime!,$calendarFrom:DateTime!){
    user(login:"gustavonline"){
      recent:contributionsCollection(from:$from,to:$to){
        commitContributionsByRepository(maxRepositories:100){
          repository{name nameWithOwner url description isPrivate isFork isArchived owner{login}}
          contributions(first:100){nodes{commitCount}}
        }
      }
      calendar:contributionsCollection(from:$calendarFrom,to:$to){
        contributionCalendar{totalContributions weeks{contributionDays{date weekday contributionCount contributionLevel}}}
      }
    }
  }`, { from, to: now.toISOString(), calendarFrom });
  const projects = selectProjects(user.recent.commitContributionsByRepository);
  const readme = replaceActive(await readFile(readmePath, 'utf8'), renderActive(projects, now.toISOString().slice(0, 10)));
  const projection = {
    schemaVersion: 1, generatedAt: now.toISOString(),
    sourceReadme: 'https://github.com/gustavonline/gustavonline/blob/main/README.md',
    sourceRevision: process.env.GITHUB_SHA || 'local-preview',
    readmeSha256: createHash('sha256').update(readme).digest('hex'), windowDays: 30,
    projects: projectsFromReadme(readme), contributions: calendarProjection(user.calendar.contributionCalendar),
  };
  // All remote data and the projection are validated before either output changes.
  await mkdir(path.join(root, 'data'), { recursive: true });
  await writeFile(readmePath, readme);
  await writeFile(path.join(root, 'data/github-profile.json'), JSON.stringify(projection, null, 2) + '\n');
  console.log(projects.map((p) => `${p.repo}: ${p.commits} commits`).join('\n'));
  console.log(`${projection.contributions.total} contributions across ${projection.contributions.weeks.length} real weeks`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
