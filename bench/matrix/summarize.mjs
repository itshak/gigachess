import {readdirSync,readFileSync,writeFileSync,appendFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
const lines=['# GigaChess independent benchmark matrix','','Each row uses only same-machine timing ratios. Native lists differ in representation; browser timings are separately bundled. WASM is not part of the pure-JS ranking. Missing/failed lanes are not wins.','','| Job | CPU / runtime | Native-list vs published | UCI-list vs published | Perft start d5 vs published | Failures |','|---|---|---:|---:|---:|---|'];
const ratio=(lane)=>{const a=lane?.results?.['gigachess-phase8']?.rate,b=lane?.results?.['drumevp-published']?.rate;return a&&b?(a/b).toFixed(2)+'×':'N/A'};
for(const d of readdirSync('all-results',{withFileTypes:true})){
 if(!d.isDirectory())continue;
 const path=join('all-results',d.name);
 const f=readdirSync(path).find(x=>x==='matrix.json'||/^browser-.*\.json$/.test(x));
 if(!f){if(d.name.startsWith('competitive-')||d.name.startsWith('browser-'))lines.push('| '+d.name+' | no result | N/A | N/A | N/A | missing or setup failure |');continue;}
 try{const x=JSON.parse(readFileSync(join(path,f),'utf8')),m=x.metadata;
 lines.push('| '+d.name+' | '+[m.cpu,m.runtime,m.bun,m.deno,m.engine,m.browserVersion].filter(Boolean).join(' / ')+' | '+ratio(x.lanes['fresh-native-move-list'])+' | '+ratio(x.lanes['fresh-normalized-uci-list'])+' | '+ratio(x.lanes['start-d5'])+' | '+((x.complete?'':'INCOMPLETE; ')+(x.failures.join(', ')||'none'))+' |')}catch(e){lines.push('| '+d.name+' | failed to read | N/A | N/A | N/A | '+String(e).slice(0,100)+' |')}
}
lines.push('','## Official full-corpus gate summaries','');
for(const d of readdirSync('all-results',{withFileTypes:true})){
 if(!d.isDirectory()||!d.name.startsWith('official-'))continue;
 const p=join('all-results',d.name,'full.log');if(!existsSync(p)){lines.push('- '+d.name+': no log');continue}
 const text=readFileSync(p,'utf8');lines.push('- '+d.name+': '+(text.match(/\d+\/\d+ gates passed[^\n]*/g)?.at(-1)||'no final summary; inspect log'));
}
lines.push('','## Million-game streaming results','');
for(const d of readdirSync('all-results',{withFileTypes:true})){
 if(!d.isDirectory()||!d.name.startsWith('large-pgn-'))continue;
 const p=join('all-results',d.name,'large-pgn.json');
 if(!existsSync(p)){lines.push('- '+d.name+': incomplete; inspect raw log');continue}
 const x=JSON.parse(readFileSync(p,'utf8')),med=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
 const a=med(x.timings.gigachess.map(t=>t.gamesPerSec)),b=med(x.timings.chessops.map(t=>t.gamesPerSec));
 lines.push('- '+d.name+': '+x.parity.games+' games per pass; '+Math.round(a)+' vs '+Math.round(b)+' games/s; '+(a/b).toFixed(2)+'×');
}
const out=lines.join('\n')+'\n';writeFileSync('summary.md',out);if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,out);console.log(out);
