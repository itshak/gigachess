import {engines} from './engines.mjs';
const norm=f=>{const [board,turn,castle,ep,half,full]=f.trim().split(/\s+/);return [board,turn,castle,half,full].join(' ')};
const start='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const reference=[
 ['start-d5',start,5,4865609],['kiwipete-d4','r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',4,4085603],
 ['endgame-d5','8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',5,674624],['promotion-d4','rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',4,2103487],
 ['start-d6',start,6,119060324],['kiwipete-d5','r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',5,193690690]
];
export async function runMatrix(data,options={}){
 const refs=options.smoke?reference.slice(0,4).map(([id,f],i)=>[id.replace(/d[45]/,'d3'),f,3,[8902,97862,2812,62379][i]]):reference;
 const all=await engines(),runs=options.runs??21,warmups=options.warmups??12,deepRuns=options.deepRuns??7;
 const fens=data.fens.slice(0,options.positions??data.fens.length),games=data.replays.slice(0,options.games??data.replays.length);
 const result={metadata:options.metadata??{},corpus:{source:data.source,positions:fens.length,games:games.length,plies:games.reduce((n,g)=>n+g.moves.length,0)},complete:false,engines:all.map(({name,group})=>({name,group,nativeMoveFormat:name==='chess.js'?'verbose objects including SAN/FEN':name==='chessops'?'Move objects':'packed integers'})),correctness:{},lanes:{},failures:[]};
 const checkpoint=options.checkpoint??(()=>{}),log=options.log??(()=>{}),gc=options.gc??(()=>{}),cpu=options.cpu??(()=>null);
 const oracle=all.find(e=>e.name==='chess.js');
 const expected=fens.map(f=>{const p=oracle.create(f);return {moves:oracle.moves(p,f),san:oracle.san(p).sort(),fen:norm(oracle.fen(p))}});
 const valid={moves:[],san:[],fen:[],replay:[],perft:[]},fenChars={};
 for(const e of all){
  const r={moveErrors:0,sanErrors:0,fenErrors:0,replayErrors:0,perftErrors:0,examples:[]};fenChars[e.name]=0;
  const error=(key,detail)=>{r[key+'Errors']++;if(r.examples.length<8)r.examples.push({key,...detail})};
  for(let i=0;i<fens.length;i++){
   let p;try{p=e.create(fens[i]);const m=e.moves(p,fens[i]);if(JSON.stringify(m)!==JSON.stringify(expected[i].moves))error('move',{fen:fens[i],expected:expected[i].moves,actual:m});if(e.fen){const f=e.fen(p);fenChars[e.name]+=f.length;if(norm(f)!==expected[i].fen)error('fen',{fen:fens[i],actual:f,expected:expected[i].fen})}if(e.san&&JSON.stringify(e.san(p).sort())!==JSON.stringify(expected[i].san))error('san',{fen:fens[i]});}
   catch(err){error('move',{fen:fens[i],error:String(err)});if(e.fen)error('fen',{fen:fens[i],error:String(err)});if(e.san)error('san',{fen:fens[i],error:String(err)});}
   finally{if(p)e.dispose(p)}
  }
  if(e.play&&e.fen)for(const g of games){let p;try{p=e.create(start);for(const u of g.moves)e.play(p,u);if(norm(e.fen(p))!==norm(g.final))error('replay',{expected:g.final,actual:e.fen(p)})}catch(err){error('replay',{error:String(err),moves:g.moves.slice(0,10)})}finally{if(p)e.dispose(p)}}
  for(const [id,f,d,n] of refs.slice(0,4)){let p;try{p=e.create(f);const actual=e.perft(p,d);if(actual!==n)error('perft',{id,actual,n})}catch(err){error('perft',{id,error:String(err)})}finally{if(p)e.dispose(p)}}
  r.unsupported=[...(!e.fen?['fen']:[]),...(!e.play?['replay']:[]),...(!e.san?['SAN']:[])];result.correctness[e.name]=r;
  if(!r.moveErrors)valid.moves.push(e);if(e.san&&!r.sanErrors)valid.san.push(e);if(e.fen&&!r.fenErrors)valid.fen.push(e);if(e.play&&e.fen&&!r.replayErrors)valid.replay.push(e);if(!r.perftErrors)valid.perft.push(e);
  if(r.moveErrors+r.sanErrors+r.fenErrors+r.replayErrors+r.perftErrors)result.failures.push(e.name);
  log('parity '+e.name+' '+JSON.stringify(r));checkpoint(result);
 }
 const med=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
 function lane(name,eligible,units,setup,work,dispose,expectedValue,n=runs,w=warmups){
  if(!eligible.length){result.failures.push('no valid engines for '+name);checkpoint(result);return;}
  const rec=Object.fromEntries(eligible.map(e=>[e.name,{wallMs:[],cpuMs:[]}]));
  function one(e,record){const state=setup(e);try{gc();const c=cpu(),t=performance.now();const got=work(e,state);const ms=performance.now()-t,after=cpu();const expected=typeof expectedValue==='function'?expectedValue(e):expectedValue;if(got!==expected)throw Error(name+' '+e.name+' checksum '+got+' expected '+expected);if(record){rec[e.name].wallMs.push(ms);if(c!==null&&after!==null)rec[e.name].cpuMs.push(after-c)}}finally{dispose(e,state)}}
  for(let i=0;i<w+n;i++){for(let j=0;j<eligible.length;j++)one(eligible[(i+j)%eligible.length],i>=w);if(i>=w&&(i-w)%5===0)log(name+' round '+(i-w+1)+'/'+n)}
  result.lanes[name]={units,runs:n,warmups:w,results:Object.fromEntries(Object.entries(rec).map(([k,v])=>[k,{...v,rate:units*1000/med(v.wallMs),cpuRate:v.cpuMs.length?units*1000/med(v.cpuMs):null}]))};
  log(name+' '+JSON.stringify(Object.fromEntries(Object.entries(result.lanes[name].results).map(([k,v])=>[k,Math.round(v.rate)]))));checkpoint(result);
 }
 const no=()=>{},release=(e,ps)=>ps.forEach(p=>e.dispose(p));
 // Fresh objects outside clock, one call per position. Result formats recorded:
 // chess.js verbose, chessops Move objects, other engines packed words.
 lane('fresh-native-move-list',valid.moves,fens.length,e=>fens.map(f=>e.create(f)),(e,ps)=>ps.reduce((n,p)=>n+e.list(p).length,0),release,expected.reduce((n,x)=>n+x.moves.length,0));
 const chars=expected.reduce((n,x)=>n+x.moves.reduce((s,u)=>s+u.length,0),0);
 lane('fresh-normalized-uci-list',valid.moves,fens.length,e=>fens.map(f=>e.create(f)),(e,ps)=>ps.reduce((n,p,i)=>n+e.moves(p,fens[i]).reduce((s,u)=>s+u.length,0),0),release,chars);
 lane('fresh-SAN-list',valid.san,fens.length,e=>fens.map(f=>e.create(f)),(e,ps)=>ps.reduce((n,p)=>n+e.san(p).reduce((s,u)=>s+u.length,0),0),release,expected.reduce((n,x)=>n+x.san.reduce((s,u)=>s+u.length,0),0));
 lane('fen-parse-write',valid.fen,fens.length,()=>null,e=>{let n=0;for(const f of fens){const p=e.create(f);try{n+=e.fen(p).length}finally{e.dispose(p)}}return n},no,e=>fenChars[e.name]);
 const plies=games.reduce((n,g)=>n+g.moves.length,0);
 lane('validated-uci-replay',valid.replay,plies,()=>null,e=>{let n=0;for(const g of games){const p=e.create(start);try{for(const u of g.moves){e.play(p,u);n++}}finally{e.dispose(p)}}return n},no,plies);
 for(const [id,f,d,n] of refs.slice(0,options.deep===false?4:6)){
  const eligible=valid.perft.filter(e=>{const p=e.create(f);try{const x=e.perft(p,d);if(x===n)return true;result.failures.push(e.name+':'+id);log(id+' mismatch '+e.name+' '+x);return false}catch(err){result.failures.push(e.name+':'+id);log(id+' '+String(err));return false}finally{e.dispose(p)}});
  lane(id,eligible,n,e=>e.create(f),(e,p)=>e.perft(p,d),(e,p)=>e.dispose(p),n,d>=6||id==='kiwipete-d5'?deepRuns:runs,options.smoke?0:d>=6||id==='kiwipete-d5'?2:3);
 }
 const mixedDepth=options.smoke?2:3;
 const perft=(options.smoke?data.perft.slice(0,8):data.perft).map(f=>{const p=oracle.create(f);return {f,n:oracle.perft(p,mixedDepth)}});
 const eligible=valid.perft.filter(e=>{for(const {f,n}of perft){const p=e.create(f);try{if(e.perft(p,mixedDepth)!==n){result.failures.push(e.name+':mixed-perft');return false}}finally{e.dispose(p)}}return true});
 const nodes=perft.reduce((n,x)=>n+x.n,0);
 lane('mixed-perft-d'+mixedDepth,eligible,nodes,e=>perft.map(({f})=>e.create(f)),(e,ps)=>ps.reduce((n,p)=>n+e.perft(p,mixedDepth),0),release,nodes,runs,options.smoke?0:3);
 result.complete=true;checkpoint(result);return result;
}
