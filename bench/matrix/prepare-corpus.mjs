// Reproducible mixed corpus from real games, not just repeat copies of a few FENs.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {loadLichessGames,assertCorpus,CORPORA} from '../suites/lib/common.mjs';
import {Chess} from 'chessops/chess';
import {parsePgn} from 'chessops/pgn';
import {parseSan} from 'chessops/san';
import {makeFen} from 'chessops/fen';
import {makeUci} from 'chessops/util';
const target=Number(process.argv[2]||20000), gameTarget=Number(process.argv[3]||1000);
const {games,source}=await loadLichessGames({quick:false});
const fens=new Set(),replays=[];
let rejected=0;
const epd=readFileSync(assertCorpus(CORPORA.perftsuite),'utf8').trim().split(/\r?\n/).map(l=>l.split(';')[0].trim());
const wac=readFileSync(assertCorpus(CORPORA.wac150),'utf8').trim().split(/\r?\n/).map(l=>l.split(';')[0].trim().replace(/\s+bm\s+.*$/,'')+' 0 1');
const fix=f=>f.trim().split(/\s+/).length===4?f+' 0 1':f;
for(const f of [...epd,...wac])fens.add(fix(f));
let seed=0x71b8329f;
const rng=n=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%n};
const order=Array.from({length:games.length},(_,i)=>i);
for(let i=order.length-1;i>0;i--){const j=rng(i+1);[order[i],order[j]]=[order[j],order[i]]}
for(const i of order){
 if(fens.size>=target&&replays.length>=gameTarget)break;
 const g=parsePgn(games[i])[0];
 if(!g||g.headers.has('FEN')){rejected++;continue}
 const p=Chess.default(), moves=[], positions=[];let invalid=false;
 for(let n=g.moves;n.children.length;){
  n=n.children[0];const m=parseSan(p,n.data.san);
  if(!m){invalid=true;break}
  let u=makeUci(m);
  // chessops uses king-to-rook for castling; standard UCI uses g/c.
  if(p.board.king.has(m.from)&&p.board[p.turn].has(m.to)){
   u=u.slice(0,2)+(m.to>m.from?'g':'c')+u[1];
  }
  moves.push(u);p.play(m);
  if(moves.length%3===0)positions.push(makeFen(p.toSetup()));
 }
 if(invalid||!moves.length){rejected++;continue}
 if(replays.length<gameTarget)replays.push({moves,final:makeFen(p.toSetup())});
 for(const f of positions){if(fens.size>=target)break;fens.add(f)}
}
if(fens.size<target||replays.length<gameTarget)throw Error('insufficient real corpus');
const data={source,seed:'0x71b8329f',rejected,fens:[...fens],replays,perft:[...epd,...wac].map(fix)};
mkdirSync('ci-benchmark',{recursive:true});const raw=JSON.stringify(data);
writeFileSync('ci-benchmark/corpus.json',raw);
writeFileSync('ci-benchmark/corpus.sha256',createHash('sha256').update(raw).digest('hex')+'\n');
console.log(JSON.stringify({positions:fens.size,games:replays.length,plies:replays.reduce((n,g)=>n+g.moves.length,0),rejected,sha256:createHash('sha256').update(raw).digest('hex'),source}));
