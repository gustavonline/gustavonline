// Deterministic editable icon family. No bitmap background extraction.
import fs from 'node:fs';
import path from 'node:path';
import {homedir} from 'node:os';
import {execFileSync} from 'node:child_process';
const root = path.resolve(import.meta.dirname, '../..');
const dir = path.join(root, 'assets/notion-icons/agentic');
const blue = '#4265A0', cream = '#FFFAF0';
const stroke = `fill="none" stroke="${cream}" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"`;
const glyphs = {
  definition: `<path d="M350 245H590L720 375V720Q720 765 675 765H350Q305 765 305 720V290Q305 245 350 245Z" fill="${cream}"/><path d="M590 245V375H720" fill="${blue}"/><g stroke="${blue}" stroke-width="38" stroke-linecap="round"><path d="M390 465H632M390 555H632M390 645H570"/></g>`,
  skills: `<path d="M480 240H655L550 450H690L455 790L495 565H345Z" fill="${cream}" stroke="${cream}" stroke-width="24" stroke-linejoin="round"/>`,
  'setup-tools': `<path d="M602 238C536 214 467 231 426 282C379 340 378 413 418 466L265 619Q236 648 265 677L315 727Q344 756 373 727L527 573C588 609 664 597 707 543C752 486 751 416 722 373L625 470L554 447L531 376L628 279Z" fill="${cream}"/>`,
  'context-access': `<rect x="235" y="355" width="275" height="275" rx="70" fill="${cream}"/><rect x="310" y="430" width="125" height="125" rx="25" fill="${blue}"/><path d="M475 490H785M655 490V600M745 490V600" ${stroke}/>`,
  'work-evaluation': `<path d="M365 370L470 475L675 270" ${stroke}/><rect x="310" y="585" width="160" height="175" rx="32" fill="${cream}"/><rect x="555" y="505" width="160" height="255" rx="32" fill="${cream}"/>`,
  'automation-upkeep': `<g fill="${cream}"><rect x="462" y="240" width="100" height="544" rx="22"/><rect x="240" y="462" width="544" height="100" rx="22"/><rect x="462" y="240" width="100" height="544" rx="22" transform="rotate(45 512 512)"/><rect x="462" y="240" width="100" height="544" rx="22" transform="rotate(-45 512 512)"/><circle cx="512" cy="512" r="232"/></g><circle cx="512" cy="512" r="162" fill="${blue}"/><path d="M512 405V512L591 564" stroke="${cream}" stroke-width="38" fill="none" stroke-linecap="round"/>`,
  'reference-library': `<path d="M255 300Q375 270 487 340V745Q375 675 255 705Z M537 340Q649 270 769 300V705Q649 675 537 745Z" fill="${cream}"/>`,
  'releases-documentation': `<path d="M285 455H739V704Q739 750 693 750H331Q285 750 285 704Z" fill="${cream}"/><path d="M300 455L250 365L377 280L512 330L647 280L774 365L724 455" ${stroke}/><path d="M440 580H584" stroke="${blue}" stroke-width="38" stroke-linecap="round"/>`,
  architecture: `<g fill="none" stroke="${cream}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"><path d="M360 370H664M360 390V650H664V390"/></g><g fill="${cream}"><rect x="265" y="265" width="190" height="190" rx="30"/><rect x="569" y="265" width="190" height="190" rx="30"/><rect x="417" y="570" width="190" height="190" rx="30"/></g>`
};
fs.mkdirSync(dir, {recursive:true});
const cli = path.join(process.env.CODEX_HOME ?? path.join(homedir(), '.codex'), 'skills/playwright/scripts/playwright_cli.sh');
function run(args){return execFileSync(cli, ['-s=agentic-icon-export', ...args], {encoding:'utf8',maxBuffer:1024*1024});}
run(['open', 'about:blank']);
for(const [key,glyph] of Object.entries(glyphs)){
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><rect x="32" y="32" width="960" height="960" rx="230" fill="${blue}"/>${glyph}</svg>`;
  fs.writeFileSync(path.join(dir,key+'.svg'),svg+'\n');
  const html=`<!doctype html><html><body style="margin:0;width:1024px;height:1024px;background:transparent">${svg}</body></html>`;
  run(['run-code', `async page => { await page.setViewportSize({width:1024,height:1024}); await page.setContent(${JSON.stringify(html)}); await page.screenshot({path:${JSON.stringify(path.join(dir,key+'.png'))},omitBackground:true}); }`]);
}
run(['close']);
console.log('Exported',Object.keys(glyphs).length,'deterministic SVG/PNG pairs');
