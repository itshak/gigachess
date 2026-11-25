import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as G from '../../dist/fast/index.js';
import * as D from '../../ci-benchmark/package/dist/index.js';
await Promise.all([G.ensureMagicTablesLoaded(),G.ensureZobristLoaded()]);
const {fens}=JSON.parse(readFileSync('ci-benchmark/corpus.json','utf8'));
const sq=s=>String.fromCharCode(97+(s&7))+String(1+(s>>3));
const prom=['r','n','b','q','k','p'];
const duci=m=>sq(D.moveDecodeFrom(m))+sq(D.moveDecodeTo(m))+(D.moveDecodePromotionPiece(m)==null?'':prom[D.moveDecodePromotionPiece(m)]??'?');
function norm(f,u){
 if(!['e1a1','e1h1','e8a8','e8h8'].includes(u))return u;
 const r=f.split(' ')[0].split('/')[u[1]==='1'?7:0].replace(/[1-8]/g,x=>'.'.repeat(Number(x)));
 return r[4]?.toLowerCase()==='k'?u.slice(0,2)+(u[2]==='a'?'c':'g')+u[1]:u;
}
let moves=0;
const hash=createHash('sha256');
for(const f of fens){
 const g=new G.Board(f),d=new D.ChessEngine(f);
 const a=Array.from(g.legalMoves(),m=>norm(f,g.toUci(m))).sort();
 const b=Array.from(d.generateLegalMoves(),m=>norm(f,duci(m))).sort();
 if(a.join(',')!==b.join(','))throw Error('move-set mismatch '+f+' '+a+' != '+b);
 moves+=a.length;hash.update(a.join(',')+'\n');
}
console.log(JSON.stringify({positions:fens.length,moves,sha256:hash.digest('hex')}));
