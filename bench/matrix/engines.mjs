// Node exact package entry. Browser build redirects only the published import
// to its actual browser export via esbuild's onResolve plugin.
import * as Giga from '../../dist/fast/index.js';
import * as Base from '../../ci-benchmark/baseline/dist/fast/index.js';
import * as Release from '../../ci-benchmark/gigachess-npm/package/dist/index.js';
import * as D from '../../ci-benchmark/package/dist/index.js';
import * as Source from '../../ci-benchmark/drumevp-core.mjs';
import {Chess as Js} from 'chess.js';
import {Chess as Ops} from 'chessops/chess';
import {parseFen,makeFen} from 'chessops/fen';
import {makeUci,parseUci} from 'chessops/util';
import {makeSan} from 'chessops/san';
import {perft as opsPerft} from 'chessops/debug';
import * as Ultra from 'ultrachess/inline';
const start='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const sq=s=>String.fromCharCode(97+(s&7))+String(1+(s>>3));
function normalUci(fen,u){
 if(!['e1a1','e1h1','e8a8','e8h8'].includes(u))return u;
 // Only normalize king-to-rook notation if origin is a king.
 const rank=fen.split(' ')[0].split('/')[u[1]==='1'?7:0];
 const row=rank.replace(/[1-8]/g,x=>'.'.repeat(Number(x)));
 return row[4]?.toLowerCase()==='k'?u.slice(0,2)+(u[2]==='a'?'c':'g')+u[1]:u;
}
function opsMoves(p){
 const moves=[];
 for(const [from,dests] of p.allDests()){
  for(const to of dests){
   if(p.board.pawn.has(from)&&(to<8||to>=56)){for(const promotion of ['queen','rook','bishop','knight'])moves.push({from,to,promotion})}
   else moves.push({from,to});
  }
 }
 return moves;
}
function opsCreate(f=start){return Ops.fromSetup(parseFen(f).unwrap()).unwrap()}
function gAdapter(name,M){return {name,group:'pure-js',create:f=>new M.Board(f),list:p=>p.legalMoves(),san:p=>Array.from(p.legalMoves(),m=>p.toSan(m)),uci:(p,m)=>p.toUci(m),fen:p=>p.toFen(),play:(p,u)=>{const m=p.parseUci(u);if(m==null)throw Error(u);p.makeMove(m)},perft:(p,d)=>p.perft(d)}}
const promotion=['r','n','b','q','k','p'];
const dUci=m=>sq(D.moveDecodeFrom(m))+sq(D.moveDecodeTo(m))+(D.moveDecodePromotionPiece(m)==null?'':promotion[D.moveDecodePromotionPiece(m)]??'?');
export async function engines(){
 await Promise.all([Giga.ensureMagicTablesLoaded(),Base.ensureMagicTablesLoaded(),Giga.ensureZobristLoaded(),Base.ensureZobristLoaded(),Release.ensureMagicTablesLoaded(),Release.ensureZobristLoaded()]);
 return [
  gAdapter('gigachess-phase8',Giga),gAdapter('gigachess-phase7',Base),gAdapter('gigachess-npm-0.5.0',Release),
  {name:'drumevp-published',group:'pure-js',create:f=>new D.ChessEngine(f),list:p=>p.generateLegalMoves(),uci:(_,m)=>dUci(m),fen:p=>p.exportFen(),play:(p,u)=>p.makeUciMove(u),perft:(p,d)=>p.perft(d)},
  {name:'drumevp-source',group:'pure-js',create:f=>Source.parse(f),list:p=>Source.generate(p),uci:(_,m)=>dUci(m),perft:(p,d)=>Source.perft(p,d)},
  {name:'chessops',group:'pure-js',create:opsCreate,list:opsMoves,san:p=>opsMoves(p).map(m=>makeSan(p,m)),uci:(_,m)=>makeUci(m),fen:p=>makeFen(p.toSetup()),play:(p,u)=>{const m=parseUci(u);if(!m||!p.isLegal(m))throw Error(u);p.play(m)},perft:(p,d)=>Number(opsPerft(p.clone(),d))},
  {name:'chess.js',group:'pure-js',create:f=>new Js(f),list:p=>p.moves({verbose:true}),san:p=>p.moves(),uci:(_,m)=>m.lan,fen:p=>p.fen(),play:(p,u)=>p.move(u),perft:(p,d)=>p.perft(d)},
  {name:'ultrachess',group:'rust-wasm',create:f=>Ultra.Chess.createSync(f),list:p=>p.legalMoves(),san:p=>p.moves(),uci:(_,m)=>Ultra.moveToUci(m),fen:p=>p.fen(),play:(p,u)=>p.move({from:u.slice(0,2),to:u.slice(2,4),...(u.length>4?{promotion:{n:1,b:2,r:3,q:4}[u[4]]}:{})}),perft:(p,d)=>Number(p.perft(d)),dispose:p=>p.dispose()}
 ].map(e=>({...e,dispose:e.dispose??(()=>{}),moves:(p,f)=>Array.from(e.list(p),m=>normalUci(f,e.uci(p,m))).sort()}));
}
