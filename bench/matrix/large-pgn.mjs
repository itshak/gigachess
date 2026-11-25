// Streaming comparison on a SHA-256 pinned Lichess monthly archive.
// Each timed pass includes identical streaming decompression/I/O and parses
// one game at a time. No whole-month text or trees are retained in RAM.
import {spawn} from 'node:child_process';
import {createReadStream,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {parsePgn as gp} from '../../dist/pgn.js';
import {parsePgn as cp} from 'chessops/pgn';
const file=process.argv[2],limit=Number(process.argv[3]??1000000),runs=Number(process.argv[4]??5);
const hash=createHash('sha256');
for await(const c of createReadStream(file))hash.update(c);
const sha256=hash.digest('hex');
if(sha256!=='9061f9dc0ab0d8710886d1745b5ca83a27b61fe5e504f9dcd549218fa3598f57')throw Error('archive checksum mismatch');
function giga(g){const x=gp(g);if(!x.ok)throw Error('GigaChess PGN parse');return x.value.moves.map(m=>m.san)}
function ops(g){const x=cp(g);if(x.length!==1)throw Error('chessops PGN parse');const s=[];for(let n=x[0].moves;n.children.length;){n=n.children[0];s.push(n.data.san)}return s}
async function stream(work){
 const z=spawn('zstd',['-dc',file],{stdio:['ignore','pipe','inherit']});
 const done=new Promise((resolve,reject)=>{z.on('error',reject);z.on('close',resolve)});
 let games=0,plies=0,bytes=0,peakRss=0,buf='';
 const consume=g=>{const n=work(g);games++;plies+=n;bytes+=Buffer.byteLength(g);if(games%10000===0)peakRss=Math.max(peakRss,process.memoryUsage().rss);if(games%100000===0)console.log('processed',games)};
 try{
  z.stdout.setEncoding('utf8');
  for await(const chunk of z.stdout){
   buf+=chunk;let pos;
   while(games<limit&&(pos=buf.indexOf('\n\n[Event '))>=0){consume(buf.slice(0,pos));buf=buf.slice(pos+2)}
   if(games>=limit){z.kill();break}
  }
  if(games<limit&&buf.trim())consume(buf);
  const rc=await done;if(games!==limit||(rc!==0&&games<limit))throw Error('incomplete corpus: '+games);
 }finally{if(!z.killed)z.kill()}
 return {games,plies,bytes,peakRss};
}
const parity=await stream(g=>{const a=giga(g),b=ops(g);if(a.length!==b.length||a.some((s,i)=>s!==b[i]))throw Error('mainline mismatch: '+g.slice(0,160));return a.length});
const timings={gigachess:[],chessops:[]},engines=[['gigachess',giga],['chessops',ops]];
for(let i=-1;i<runs;i++)for(let j=0;j<2;j++){
 const [id,fn]=engines[(i+j+2)%2];global.gc?.();const c=process.cpuUsage(),t=performance.now();const x=await stream(g=>fn(g).length),ms=performance.now()-t,delta=process.cpuUsage(c);
 if(x.games!==parity.games||x.plies!==parity.plies||x.bytes!==parity.bytes)throw Error('timed checksum mismatch');
 if(i>=0)timings[id].push({...x,ms,cpuMs:(delta.user+delta.system)/1000,gamesPerSec:x.games*1000/ms});
 console.log(id,'round',i,x.games,ms);
}
writeFileSync('benchmark-results/large-pgn.json',JSON.stringify({sha256,limit,runs,parity,timings,scope:'stream + decompress + syntactic mainline parse; disk I/O included'},null,2));
