// Preserve approved artwork; render only a rounded outer SVG clip.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {homedir} from 'node:os';
import {execFile, execFileSync} from 'node:child_process';
import {promisify} from 'node:util';

const root = path.resolve(import.meta.dirname, '../..');
const input = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'rounded-sources.json')));
const sources = [];
for (const item of input.sources) {
  const source = item.source;
  const data = source.git_ref
    ? execFileSync('git', ['show', `${source.git_ref}:${source.path}`], {cwd:root, maxBuffer:5_000_000})
    : Buffer.from(await (await fetch(source.url)).arrayBuffer());
  if (crypto.createHash('sha256').update(data).digest('hex') !== source.sha256) throw new Error('Source hash mismatch: '+item.output);
  sources.push({...item, data});
}
const {x, y, size, radius} = input.tile;
const svg = href => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><clipPath id="tile"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}"/></clipPath></defs><image href="${href}" x="${x}" y="${y}" width="${size}" height="${size}" clip-path="url(#tile)" preserveAspectRatio="xMidYMid meet"/></svg>`;
const server = http.createServer((req,res) => {
  const match = /^\/(source|icon)\/(\d+)$/.exec(req.url);
  if (!match || !sources[Number(match[2])]) { res.writeHead(404).end(); return; }
  const item = sources[Number(match[2])];
  if (match[1]==='source') { res.writeHead(200,{'Content-Type':'image/png'}).end(item.data); return; }
  res.writeHead(200,{'Content-Type':'text/html'}).end(`<!doctype html><body style="margin:0;background:transparent">${svg('/source/'+match[2])}</body>`);
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const cli = path.join(process.env.CODEX_HOME ?? path.join(homedir(),'.codex'),'skills/playwright/scripts/playwright_cli.sh');
const run = async args => (await promisify(execFile)(cli,['-s=rounded-icon-export',...args],{maxBuffer:1_000_000})).stdout;
try {
  await run(['open','about:blank']);
  for (const [i,item] of sources.entries()) {
    const out = path.join(root,item.output);
    await run(['run-code',`async page => { await page.setViewportSize({width:1024,height:1024}); await page.goto(${JSON.stringify(origin+'/icon/'+i)},{waitUntil:'networkidle'}); await page.screenshot({path:${JSON.stringify(out)},omitBackground:true}); }`]);
    console.log(item.output);
  }
} finally {
  await run(['close']).catch(()=>{});
  await new Promise(resolve=>server.close(resolve));
}
const manifest = JSON.parse(fs.readFileSync(path.join(root,'assets/notion-icons/manifest.json')));
const dir = path.join(root,'assets/notion-icons');
manifest.shape = {canvas:1024,x,y,size,radius,exterior:'transparent',interior:'original artwork, opaque'};
manifest.assets = ['agentic','osm','gustavonline'].flatMap(family => fs.readdirSync(path.join(dir,family)).filter(p=>p.endsWith('.png')).map(p=> {
  const name=`assets/notion-icons/${family}/${p}`, data=fs.readFileSync(path.join(root,name));
  return {path:name,sha256:crypto.createHash('sha256').update(data).digest('hex'),bytes:data.length};
}));
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
