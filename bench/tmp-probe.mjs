import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { parsePgn as pcParsePgn, makePgn as pcMakePgn } from "../dist/pgn.js";
import { parsePgn as coParsePgn, makePgn as coMakePgn, emptyHeaders } from "chessops/pgn";
import { parseFen as pcParseFen, makeFen as pcMakeFen } from "../dist/fen.js";
import { parseFen as coParseFen, makeFen as coMakeFen } from "chessops/fen";
import { parseSan as pcParseSan, makeSan as pcMakeSan, makeUci as pcMakeUci } from "../dist/san.js";
import { parseSan as coParseSan, makeSan as coMakeSan } from "chessops/san";
import { makeUci as coMakeUci } from "chessops/util";
import { Chess as coChess } from "chessops/chess";
import { Chess as pcChess } from "../dist/chess.js";

// stream first N games
async function* readGames(path, maxGames) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let cur = null, n = 0;
  for await (const line of rl) {
    if (line.startsWith("[Event ")) { if (cur) yield cur; if (++n > maxGames) return; cur = line + "\n"; }
    else if (cur !== null) cur += line + "\n";
  }
  if (cur) yield cur;
}

function toPos(v) { return { ...v, halfmove: v.halfmoves ?? 0, fullmove: v.fullmoves ?? 1 }; }

let games = 0, rtSame = 0, rtDiff = 0, pcFail = 0, coFail = 0;
let fenTotal = 0, fenSame = 0, fenDiff = 0;
let sanTotal = 0, sanSame = 0, sanDiff = 0;
let uciTotal = 0, uciSame = 0, uciDiff = 0;
let posCount = 0;
for await (const g of readGames("/tmp/lichess100k.pgn", 150)) {
  games++;
  const pc = pcParsePgn(g);
  const co = coParsePgn(g, emptyHeaders);
  if (!pc.ok) { pcFail++; continue; }
  if (!co || co.length !== 1) { coFail++; continue; }
  const pcOut = pcMakePgn(pc.value);
  const coOut = coMakePgn(co[0]).replace(/\n$/, "");
  if (pcOut === coOut) rtSame++; else if (++rtDiff <= 2) { console.log("RT DIFF"); console.log("PC:", JSON.stringify(pcOut.slice(0, 200))); console.log("CO:", JSON.stringify(coOut.slice(0, 200))); }
  // replay game collecting FENs + SAN/UCI parity via Chess class
  let pcCh = pcChess.default();
  const coPos = coChess.default();
  // use move lists from parsed SAN: walk moves
  const sans = pc.value.moves.map(m => m.san);
  // chessops Game walk below
  // chessops Game walk: co[0].moves is Node with children
  const coMoveList = [];
  let node = co[0].moves;
  while (node.children.length) { const child = node.children[0]; coMoveList.push(child.data.san); node = child; }
  if (coMoveList.length !== sans.length) { console.log("move count mismatch game", games, sans.length, coMoveList.length); continue; }
  let fenSampled = 0;
  for (let i = 0; i < sans.length; i++) {
    // sample FENs at each position (before move i, limit)
    if (fenSampled < 70) {
      const pcFen = pcMakeFen(pcCh.pos);
      const coFen = coMakeFen(coPos.toSetup());
      fenTotal++;
      if (pcFen === coFen) fenSame++; else if (++fenDiff <= 3) console.log("FEN DIFF:", pcFen, "|", coFen);
      fenSampled++;
    }
    const san = sans[i];
    const pcParsed = pcParseSan(san, pcCh.pos);
    const coParsed = coParseSan(coPos, san);
    sanTotal++;
    if (pcParsed.ok && coParsed) {
      const pcUci = pcMakeUci(pcParsed.value);
      let coUci = coMakeUci(coParsed);
      // normalize castling: chessops e1h1 -> e1g1
      if (/^[a-h]1[ha]$|^[a-h]8[ha]$/.test(coUci)) coUci = coUci[0] + coUci[1] + (coUci[3] === "h" ? "g" : "c");
      uciTotal++;
      if (pcUci === coUci) uciSame++; else if (++uciDiff <= 3) console.log("UCI DIFF:", san, pcUci, coUci);
    } else if (++uciDiff <= 3) console.log("SAN PARSE FAIL:", san, pcParsed.ok ? "pc ok" : JSON.stringify(pcParsed.error), coParsed ? "co ok" : "co fail");
    // make move on both
    if (!pcParsed.ok || !coParsed) break;
    const pcSan = pcMakeSan(pcParsed.value, pcCh.pos);
    const coSan = coMakeSan(coPos, coParsed);
    sanTotal++;
    if (pcSan === coSan) sanSame++; else if (++sanDiff <= 3) console.log("SAN MAKE DIFF:", san, "pc", pcSan, "co", coSan);
    pcCh = pcCh.play(pcParsed.value);
    coPos.play(coParsed);
  }
  posCount++;
}
console.log({ games, rtSame, rtDiff, pcFail, coFail });
console.log({ fenTotal, fenSame, fenDiff });
console.log({ sanTotal, sanSame, sanDiff });
console.log({ uciTotal, uciSame, uciDiff });
