import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalog, resolveProjects, readmeIntro, buildProfile, chooseFocus, renderProfile, replaceBlock, calendarProjection, readmeParagraphs, loadProjectReadmes, main } from './update-profile.mjs';

// Synthetic projects and counts exercise the policy without publishing activity.
const make = (repo, commits, options = {}) => ({ repo, catalogRepo: repo, owner: repo.split('/')[0], url: `https://github.com/${repo}`, name: repo.split('/')[1], description: 'A useful project.', category: 'tools', status: 'Open source', commits, isPublic: true, pinned: false, ...options });
const fixture = [make('arcitai/agentic-systems', 0), make('onlinesourdough/OSM-plugin', 1), make('gustavonline/bridge', 10), make('gustavonline/canvas', 12), make('gustavonline/portfolio', 1000, { category: 'resources' }), make('gustavonline/community', 999, { category: 'community', stars: 10000 })];
const config = { schemaVersion: 1, anchors: fixture.slice(0, 2).map(p => p.repo), active: fixture.slice(2, 4).map(p => p.repo), projects: Object.fromEntries(fixture.map((p,i) => [p.repo, { nodeId: `R_fixture_${i}`, category: p.category, status: p.status }])) };
const template = () => 'Owner-edited introduction.\n\n## Working on right now\n\n<!-- active-projects:start -->\n<!-- active-projects:end -->\n\n## Useful repos\n<!-- useful-projects:start -->\n<!-- useful-projects:end -->\n\n**Open-source organisations**\n[Arc’IT AI](https://github.com/arcitai)\n';
const nodes = () => fixture.map((p,i) => ({ id: `R_fixture_${i}`, nameWithOwner:p.repo, isPrivate:false, isArchived:false, isFork:false, description:'Current GitHub description.', stargazerCount: p.stars ?? 0, defaultBranchRef:{target:{oid:'a'.repeat(40),history:{totalCount:p.commits}}} }));
const calendar = { totalContributions: 1, weeks: [{ contributionDays:[{date:'2026-11-06',weekday:5,contributionCount:1,contributionLevel:'FIRST_QUARTILE'}] }] };
const source = p => ({ text:`# ${p.repo.split('/')[1]}\n\nThe current project introduction.\n\n## Install\nDo not copy installation commands.`, revision:'a'.repeat(40),url:`https://github.com/${p.repo}/blob/${'a'.repeat(40)}/README.md` });
const build = overrides => buildProfile({ original:template(),config:structuredClone(config),nodes:nodes(),pins:new Set(),previous:[],readSource:async p=>source(p),calendar,now:new Date('2026-11-06T12:00:00Z'),sourceRevision:'b'.repeat(40),...overrides });

test('two selected anchors and activity determine focus; community, portfolio and stars do not', () => {
  assert.deepEqual(chooseFocus(fixture, config).map(p=>p.repo), ['arcitai/agentic-systems','onlinesourdough/OSM-plugin','gustavonline/canvas']);
  assert.equal(chooseFocus(fixture, config, [fixture[2]])[2].repo, 'gustavonline/bridge');
  const changed=fixture.map(p=>p.repo==='gustavonline/canvas'?{...p,commits:15}:p);
  assert.equal(chooseFocus(changed, config, [fixture[2]])[2].repo,'gustavonline/canvas');
  const quiet=fixture.map(p=>({...p,commits:p.repo==='gustavonline/canvas'?4:0}));
  assert.equal(chooseFocus(quiet,config,[fixture[2]])[2].repo,'gustavonline/bridge');
});

test('pins break activity ties; private/archive/unapproved forks stay out of focus', () => {
  const tied=fixture.map(p=>({...p,commits:10,pinned:p.repo==='gustavonline/canvas'}));
  assert.equal(chooseFocus(tied,config)[2].repo,'gustavonline/canvas');
  for(const patch of [{isPublic:false},{archived:true},{fork:true}]) {
    const changed=tied.map(p=>p.repo==='gustavonline/canvas'?{...p,...patch}:p);
    assert.equal(chooseFocus(changed,config)[2].repo,'gustavonline/bridge');
  }
  assert.throws(()=>chooseFocus(fixture.slice(0,2),config),/Fewer than three/);
});

test('selection no longer depends on generated bullets; owner prose is preserved', async () => {
  const result=await build();
  assert.ok(result.readme.startsWith('Owner-edited introduction.'));
  assert.ok(result.readme.includes('**Open-source organisations**\n[Arc’IT AI]'));
  const again=await build({original:result.readme});
  assert.equal(again.readme,result.readme);
  const block=result.readme.split('<!-- active-projects:start -->')[1].split('<!-- active-projects:end -->')[0];
  assert.equal(block.trim().split('\n').length,3);
  assert.doesNotMatch(block,/commits|30 days|Updated|stays in focus/);
  assert.throws(()=>replaceBlock('no markers','active-projects',''),/exactly one/);
});

test('an archived or newly private selection is omitted without losing the catalog or breaking the next refresh', async () => {
  const current=nodes();current[3].isArchived=true;current[5].isPrivate=true;current[5].nameWithOwner='foreign/PRIVATE_SECRET';
  const read=[];const readSource=async p=>{read.push(p.repo);return source(p)};
  const result=await build({nodes:current,readSource});
  assert.deepEqual(result.omitted,['gustavonline/canvas','gustavonline/community']);
  assert.equal(Object.keys(config.projects).length,6);
  assert.doesNotMatch(result.readme, /canvas|PRIVATE_SECRET/);
  assert.equal(JSON.stringify(result.projection).includes('PRIVATE_SECRET'),false);
  assert.ok(!read.includes('gustavonline/canvas')&&!read.includes('gustavonline/community'));
  const again=await build({original:result.readme,nodes:current,readSource});
  assert.equal(again.readme,result.readme);
});

test('a rename/transfer follows the same ID and remains eligible under the selected catalog key', async () => {
  const current=nodes();current[3].nameWithOwner='arcitai/new-canvas';
  const result=await build({nodes:current});
  assert.equal(result.projection.projects[2].repo,'arcitai/new-canvas');
  assert.equal(result.projection.projects[2].url,'https://github.com/arcitai/new-canvas');
  assert.match(result.readme,/https:\/\/github.com\/arcitai\/new-canvas/);
  assert.doesNotMatch(result.readme,/https:\/\/github.com\/gustavonline\/canvas/);
  assert.equal(config.active[1],'gustavonline/canvas');
});

test('missing nodes, identity substitution, invalid owners and incomplete activity abort the refresh', () => {
  for(const mutate of [n=>n[2]=null,n=>n[2].id='R_different_repo',n=>n[2].nameWithOwner='foreign/unselected',n=>n[2].defaultBranchRef=null,n=>n[2].stargazerCount=-1]) {
    const current=nodes();mutate(current);assert.throws(()=>resolveProjects(config,current));
  }
  assert.throws(()=>resolveProjects(config,nodes().slice(1)),/Incomplete/);
});

test('catalog validation catches duplicate identities, unsafe icons and invalid focus', () => {
  assert.equal(validateCatalog(config),config);
  for(const mutate of [c=>c.projects['gustavonline/bridge'].nodeId=c.projects['gustavonline/canvas'].nodeId,c=>c.projects['gustavonline/bridge'].icon='/assets/../bad.svg',c=>c.active.push(c.anchors[0]),c=>c.projects['gustavonline/bridge'].status='Invented',c=>c.projects['gustavonline/bridge'].summary='x'.repeat(301)]) {
    const current=structuredClone(config);mutate(current);assert.throws(()=>validateCatalog(current));
  }
});

test('a current README supplies names/summaries without maintaining duplicate profile copy', async () => {
  const p={...fixture[0],revision:'a'.repeat(40),githubDescription:'Older metadata.'};
  const [updated]=await loadProjectReadmes([p],async()=>({...source(p),text:'# Current name\n\nCurrent explanation with **plain emphasis** and a [link](https://example.com).\n\n## Install\nNever include this.'}));
  assert.equal(updated.name,fixture[0].name); // An explicit short name is kept.
  assert.equal(updated.description,'Current explanation with plain emphasis and a link.');
  const automatic={...p};delete automatic.name;
  assert.equal((await loadProjectReadmes([automatic],async()=>({...source(p),text:'# Renamed project\n\nCurrent explanation.'})))[0].name,'Renamed project');
});

test('README extraction ignores banners, fenced examples and installation content', () => {
  const text='<picture>\n<img src="logo.svg">\n</picture>\n\n```md\n# Example title\nExample body.\n```\n\n# Real title\n\n[![Build](https://example.com/badge)](https://example.com/build)\n\nThe useful introduction.\n\n## Install\nNever include this.';
  assert.deepEqual(readmeIntro(text),{title:'Real title',description:'The useful introduction.'});
  assert.equal(readmeIntro('# Tool\n\nRevision: 0.1.34 · Updated: 2026-11-06\n\nA useful framework.\n\n## Install\nCommands.').description,'A useful framework.');
  assert.equal(readmeIntro('# Tool\n\nMaintained by [Owner](https://github.com/arcitai).\n\nA useful BI system.').description,'A useful BI system.');
  assert.equal(readmeIntro('# Tool\n\n'+'x'.repeat(301)+'\n\nA later qualification.').description,null);
  assert.equal(readmeParagraphs('```md\n## Why I built this\nExample.\n```','Why I built this',false),null);
});

test('GitHub descriptions cover missing/complex intros; malformed motivation copy fails visibly', async () => {
  const p={...fixture[0],githubDescription:'Public GitHub description.'};
  for(const text of [null,'<h1>Complex header</h1>','# Tool\n\n'+'x'.repeat(301)]) {
    const [updated]=await loadProjectReadmes([p],async()=>({...source(p),text}));assert.equal(updated.description,'Public GitHub description.');
  }
  await assert.rejects(loadProjectReadmes([{...p,githubDescription:null}],async()=>({...source(p),text:null})),/No usable/);
  await assert.rejects(loadProjectReadmes([p],async()=>({...source(p),text:'## Why I built this\n\n- Invalid story.'})),/plain paragraphs/);
  assert.equal((await loadProjectReadmes([{...p,textSource:'description'}],async()=>source(p)))[0].description,'Public GitHub description.');
});

test('a deliberate community summary is retained and private README access is refused', async () => {
  const p={...fixture[0],summary:'Paused; community maintainers are welcome.'};
  const [updated]=await loadProjectReadmes([p],async()=>{throw new Error('An explicit name and summary need no README read')});assert.equal(updated.description,p.summary);
  await assert.rejects(loadProjectReadmes([{...p,isPublic:false}],async()=>{throw new Error('Must not read')}),/Refusing private/);
});

test('motivation sections retain pinned prose for the existing website schema', async () => {
  const item={...fixture[0]};const text='## Why I built this\n\nThe project motivation.\n\nThe technical approach.\n';
  const [updated]=await loadProjectReadmes([item],async()=>({...source(item),text}));
  assert.equal(updated.description,'The project motivation.');
  assert.deepEqual(updated.readme.paragraphs,['The project motivation.','The technical approach.']);
  assert.equal(updated.readme.url,source(item).url+'#why-i-built-this');
  assert.match(updated.readme.sha256,/^[a-f0-9]{64}$/);
  const rendered=renderProfile(template(),[updated,fixture[1],fixture[2]],fixture.slice(3));
  assert.match(rendered,/The project motivation/);assert.doesNotMatch(rendered,/The technical approach/);
});

test('a failed network request leaves both generated files intact', async () => {
  const root=new URL('../',import.meta.url);const files=['README.md','data/github-profile.json'];
  const before=await Promise.all(files.map(f=>readFile(new URL(f,root),'utf8')));
  const fetch=globalThis.fetch;const token=process.env.GH_TOKEN;
  try { globalThis.fetch=async()=>{throw new Error('Synthetic network outage')};process.env.GH_TOKEN='synthetic-test-token';await assert.rejects(main(),/Synthetic network outage/); }
  finally {globalThis.fetch=fetch;if(token===undefined)delete process.env.GH_TOKEN;else process.env.GH_TOKEN=token;}
  assert.deepEqual(await Promise.all(files.map(f=>readFile(new URL(f,root),'utf8'))),before);
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
