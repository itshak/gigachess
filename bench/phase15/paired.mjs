import {readFileSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const all=process.argv.slice(2);const names=all.length?all:['baseline','fen','hash','attack','write','movegen','combined'];
const engines=await Promise.all(names.map(n=>import(pathToFileURL(resolve(n,'dist/fast/index.js')).href)));
if(process.env.BENCH_COLD!=='1')for(const e of engines){await e.ensureMagicTablesLoaded();await e.ensureZobristLoaded()}
const {fens:fullFens,replays}=JSON.parse(readFileSync('corpus/corpus.json','utf8'));
const fens=fullFens.slice(0,Number(process.env.BENCH_POSITIONS||4000)),games=replays.slice(0,Number(process.env.BENCH_GAMES||100)),boards=engines.map(e=>fens.map(f=>new e.Board(f)));
for(let k=0;k<fens.length;k++){
 const a=boards[0][k],moves=Array.from(a.legalMoves()).join(','),fen=a.toFen(),z=a.zobristHex();
 for(let j=1;j<engines.length;j++){
  const b=boards[j][k];
  if(b.toFen()!==fen||Array.from(b.legalMoves()).join(',')!==moves||b.zobristHex()!==z)throw Error('parity '+names[j]+' '+fens[k]);
 }
}
const parsers=await Promise.all(names.map(n=>import(pathToFileURL(resolve(n,'dist/fen.js')).href)));
const invalid=[
 '','8/8/8/8/8/8/8/8 w - - 0 1','4k3/8/8/8/8/8/8/3KK3 w - - 0 1',
 '8/8/8/8/8/8/4k3/4K3 w - - 0 1','P3k3/8/8/8/8/8/8/4K3 w - - 0 1',
 '4k3/8/8/8/8/8/4R3/4K3 w - - 0 1','4k3/8/8/8/8/8/8/4K3 x - - 0 1',
 '4k3/8/8/8/8/8/8/4K3 w X - 0 1','4k3/8/8/8/8/8/8/4K3 w - e3 0 1',
 '4k3/8/8/8/8/8/8/4K3 w - - -1 1','4k3/8/8/8/8/8/8/4K3 w - - 0 0',
 '4k3/8/8/8/8/8/8/4K3 w - - 0 1 extra'];
for(const f of invalid) {
 const outcomes=parsers.map(e=>{const x=e.parseFen(f);return x.ok?'ok':x.error.code});
 if(outcomes.some(x=>x!==outcomes[0]))throw Error('invalid FEN parity '+f+' '+outcomes);
}
let checkedPlies=0;
for(const game of games){
 const bs=engines.map(e=>new e.Board());
 for(const u of game.moves){
  const ms=bs.map(b=>b.parseUci(u));
  if(ms[0]===null||ms.some(m=>m!==ms[0]))throw Error('validated move parity '+u);
  bs.forEach((b,i)=>b.makeMove(ms[i]));
  const f=bs[0].toFen(),z=bs[0].zobristHex();
  for(const b of bs)if(b.toFen()!==f||b.zobristHex()!==z)throw Error('replay state parity '+u);
  checkedPlies++;
 }
}
for(let k=0;k<Math.min(fens.length,276);k++){
 const counts=boards.map(bs=>bs[k].perft(3));
 if(counts.some(n=>n!==counts[0]))throw Error('perft parity '+fens[k]);
}
console.log('parity',fens.length,'positions',checkedPlies,'replayed plies',invalid.length,'invalid FEN cases',names);
const no=()=>{},lanes=[
 ['fen-parse',fens.length,()=>null,j=>{let n=0;for(const f of fens)n+=new engines[j].Board(f).occupied.lo>>>0;return n},no],
 ['fen-write',fens.length,j=>boards[j],(j,bs)=>{let n=0;for(const b of bs)n+=b.toFen().length;return n},no],
 ['fen-roundtrip',fens.length,()=>null,j=>{let n=0;for(const f of fens)n+=new engines[j].Board(f).toFen().length;return n},no],
 ['movegen-fresh',fens.length,j=>fens.map(f=>new engines[j].Board(f)),(j,bs)=>{let n=0;for(const b of bs)n+=b.legalMoves().length;return n},no],
 ['validated-replay',games.reduce((n,g)=>n+g.moves.length,0),()=>null,j=>{let n=0;for(const g of games){const b=new engines[j].Board();for(const u of g.moves){const m=b.parseUci(u);if(m===null)throw Error('illegal '+u);b.makeMove(m);n++}if(b.toFen().split(' ').slice(0,3).join(' ')!==g.final.split(' ').slice(0,3).join(' '))throw Error('final mismatch '+names[j]);}return n},no],
 ['perft-mixed',0,j=>boards[j].slice(0,Number(process.env.BENCH_PERFT_POSITIONS||276)),(j,bs)=>bs.reduce((n,b)=>n+b.perft(3),0),no],
 ['perft-start-d6',119060324,j=>new engines[j].Board(),(j,b)=>{const n=b.perft(6);if(n!==119060324)throw Error('start d6');return n},no],
 ['perft-kiwi-d5',193690690,j=>new engines[j].Board('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'),(j,b)=>{const n=b.perft(5);if(n!==193690690)throw Error('kiwi d5');return n},no]
];
const med=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];const results={};
for(const [name,units,setup,work,dispose] of lanes){
 if(process.env.BENCH_LANES&&!process.env.BENCH_LANES.split(',').includes(name))continue;
 const times=names.map(()=>[]),cpu=names.map(()=>[]);let expected;
 for(let i=-Number(name.includes('-d')?2:process.env.BENCH_WARMUPS||4);i<Number(name.includes('-d')?7:process.env.BENCH_RUNS||9);i++)for(let k=0;k<names.length;k++){
  const j=(i+k+names.length*10)%names.length,st=setup(j);if(globalThis.Bun)Bun.gc(true);else global.gc?.();
  const c=process.cpuUsage(),t=performance.now(),n=work(j,st),dt=performance.now()-t,d=process.cpuUsage(c);
  dispose(j,st);if(expected===undefined)expected=n;if(n!==expected)throw Error(name+' checksum '+names[j]);
  if(i>=0){times[j].push(dt);cpu[j].push((d.user+d.system)/1000)}
 }
 results[name]=Object.fromEntries(names.map((n,j)=>[n,{rate:(units||expected)*1000/med(times[j]),ratio:med(times[0])/med(times[j]),cpuRatio:med(cpu[0])/med(cpu[j]),ms:times[j],cpu:cpu[j]}]));
 console.log(name,JSON.stringify(Object.fromEntries(names.map(n=>[n,[+results[name][n].ratio.toFixed(3),+results[name][n].cpuRatio.toFixed(3)]]))));
 writeFileSync((process.env.BENCH_OUT||'results-'+names.join('-'))+'.json',JSON.stringify({names,node:process.version,arch:process.arch,platform:process.platform,bun:globalThis.Bun?.version??null,results},null,2));
}
