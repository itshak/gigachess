// tests/san-ambiguity.mjs — reporting an ambiguous SAN instead of dropping it.
//
// `parseSan` refuses a SAN that several legal moves answer to, and returns
// `san/ambiguous`. Before this suite's addition of `parseSanCandidates`, that
// refusal also discarded the matches: a caller could tell the user the input
// was ambiguous but not which moves it meant, so it had to either guess one
// (BlindBase field report #11: `bxc5` always played the b-pawn beside a
// `Bxc5` bishop) or re-derive the candidate set itself.
//
// `parseSanResult` is the same fix for the reason: `Board.parseSan` mapped
// `san/ambiguous`, `san/noLegalMove` and `san/invalidSan` onto one `null`, so a
// UI could not distinguish "no such move" from "several, pick one".
//
// The promotion half pins the 5-character UCI identity (`h1q`/`h1r`/`h1b` are
// three different moves, not one move with three spellings), which is the
// library-side half of BlindBase ADR-042 §4.
//
// Run from repo root after `npm run build`.
import {
  parseSan,
  parseSanCandidates,
  parseSanDetailed,
  parseUci,
  makeUci,
  Board,
  ensureZobristLoaded,
} from "../dist/index.js";

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS ${name} ${extra}`); }
  else { fail++; console.error(`  FAIL ${name} ${extra}`); }
}

await ensureZobristLoaded();

console.log("== 1. A genuinely ambiguous SAN reports its candidates ==");
{
  // Knights on b1 and e2; both reach c3. Bare `Nc3` is ambiguous and the
  // file/rank disambiguations each pick one.
  const pos = Board.fromFen("4k3/8/8/8/8/8/4N3/1N2K3 w - - 0 1").toPosition();

  const bare = parseSan("Nc3", pos);
  check("bare Nc3 is san/ambiguous", !bare.ok && bare.error.code === "san/ambiguous",
    bare.ok ? "resolved" : bare.error.code);

  const cands = parseSanCandidates("Nc3", pos);
  check("candidates returns ok with both knights", cands.ok && cands.value.length === 2,
    cands.ok ? `${cands.value.length}` : cands.error.code);
  if (cands.ok) {
    const pairs = cands.value.map((m) => `${m.from}->${m.to}`).sort();
    // from b1 = 1, from e2 = 12, to c3 = 18
    check("candidates are b1->c3 and e2->c3", pairs.join(" ") === "1->18 12->18", pairs.join(" "));
  }

  check("file disambiguation picks the b1 knight",
    parseSan("Nbc3", pos).ok && parseSan("Nbc3", pos).value.from === 1);
  check("file disambiguation picks the e2 knight",
    parseSan("Nec3", pos).ok && parseSan("Nec3", pos).value.from === 12);
  check("rank disambiguation picks the b1 knight",
    parseSan("N1c3", pos).ok && parseSan("N1c3", pos).value.from === 1);
  // Rank 3 holds neither knight, so this must NOT resolve to one of them.
  check("rank 3 disambiguation names no knight", parseSan("N3c3", pos).error.code === "san/noLegalMove");
}

console.log("== 2. Bishop and pawn can both answer `bxc5` ==");
{
  // White bishop on b6, black pawn on c5, white pawn on b4. Lowercase `bxc5` is
  // the pawn's capture and uppercase `Bxc5` is the bishop's — a caller that
  // lowercases its input before parsing silently gets the pawn. Field report
  // #11.
  const b = Board.fromFen("rnbqkbnr/pppppppp/1B6/2p5/1P6/8/PPPPPPPP/R1BQKBNR w KQkq - 0 1");
  const pos = b.toPosition();

  const pawn = parseSan("bxc5", pos);
  const bishop = parseSan("Bxc5", pos);
  check("lowercase bxc5 is the b4 pawn", pawn.ok && pawn.value.from === 25,
    pawn.ok ? `from=${pawn.value.from}` : pawn.error.code);
  check("uppercase Bxc5 is the b6 bishop", bishop.ok && bishop.value.from === 41,
    bishop.ok ? `from=${bishop.value.from}` : bishop.error.code);

  // Each spelling is individually unambiguous, so each yields exactly itself —
  // which is what lets a case-insensitive caller union the two and detect the
  // ambiguity rather than inheriting one arbitrarily.
  check("bxc5 candidates are the pawn alone",
    parseSanCandidates("bxc5", pos).ok &&
      parseSanCandidates("bxc5", pos).value.every((m) => m.from === 25));
  check("Bxc5 candidates are the bishop alone",
    parseSanCandidates("Bxc5", pos).ok &&
      parseSanCandidates("Bxc5", pos).value.every((m) => m.from === 41));

  // With only the bishop able to take on c5, the pawn spelling names nothing.
  const noPawn = Board.fromFen("rnbqkbnr/pppppppp/1B6/2p5/8/8/PPPPPPPP/R1BQKBNR w KQkq - 0 1").toPosition();
  check("bxc5 with no b4 pawn is not a legal move",
    parseSan("bxc5", noPawn).error.code === "san/noLegalMove");
  check("Bxc5 still resolves without the pawn",
    parseSan("Bxc5", noPawn).ok && parseSan("Bxc5", noPawn).value.from === 41);
}

console.log("== 3. `parseSanDetailed` agrees with `parseSan` ==");
{
  const pos = Board.startpos().toPosition();
  // Agreement is the point: `parseSanDetailed` must not become a second parse
  // path that answers differently, or callers that migrate to it inherit a new
  // bug. The inputs span every outcome — resolved, illegal destination, illegal
  // move, castling refused, malformed.
  for (const san of ["e4", "Qxg9", "Nc3", "e8=Q", "O-O", "!!", "0-0"]) {
    const direct = parseSan(san, pos);
    const traced = parseSanDetailed(san, pos);
    check(
      `parseSanDetailed('${san}') matches parseSan`,
      direct.ok === traced.result.ok &&
        (direct.ok ? true : direct.error.code === traced.result.error.code),
      direct.ok ? "ok" : direct.error.code,
    );
  }

  // A refusal raised before any move could match carries no candidates, which is
  // how "not a SAN" stays distinguishable from "an ambiguous SAN".
  const bogus = parseSanDetailed("!!", pos);
  check("a malformed SAN has no candidates", bogus.candidates === null,
    JSON.stringify(bogus.candidates));
  check("a malformed SAN still reports its code", !bogus.result.ok && bogus.result.error.code !== "",
    JSON.stringify(bogus.result));

  // And an ambiguous one does carry them, so the caller can name the moves.
  const amb = parseSanDetailed("Nc3", Board.fromFen("4k3/8/8/8/8/8/4N3/1N2K3 w - - 0 1").toPosition());
  check("an ambiguous SAN keeps its candidates",
    !amb.result.ok && amb.result.error.code === "san/ambiguous" && amb.candidates.length === 2,
    JSON.stringify(amb.candidates?.length));
}

console.log("== 4. Board keeps the reason, not just null ==");
{
  const b = Board.fromFen("4k3/8/8/8/8/8/4N3/1N2K3 w - - 0 1");

  check("parseSan collapses ambiguity to null", b.parseSan("Nc3") === null);
  check("parseSanResult names the ambiguity",
    b.parseSanResult("Nc3").ok === false && b.parseSanResult("Nc3").code === "san/ambiguous",
    JSON.stringify(b.parseSanResult("Nc3")));

  // The distinction that motivated parseSanResult: two different refusals, two
  // different codes, one `null` from `parseSan` for both.
  const noSuch = b.parseSanResult("Nd9");
  check("parseSanResult separates a refusal that is not ambiguity",
    noSuch.ok === false && noSuch.code !== "san/ambiguous", JSON.stringify(noSuch));

  const cands = b.parseSanCandidates("Nc3");
  check("parseSanCandidates returns both packed words",
    cands.ok && cands.moveWords.length === 2, JSON.stringify(cands));
  if (cands.ok) {
    const sans = cands.moveWords.map((w) => b.toSan(w)).sort();
    // The library renders each candidate with the disambiguation that separates
    // it — which is exactly what a caller needs to tell the user.
    check("each candidate carries its own disambiguated SAN",
      sans.join(" ") === "Nbc3 Nec3", sans.join(" "));
    check("candidate words are distinct moves", new Set(cands.moveWords).size === 2);
    // …and each one, played on its own, resolves to exactly itself.
    check("each candidate is itself legal",
      sans.every((san) => {
        const w = b.parseSan(san);
        return w !== null && cands.moveWords.includes(w);
      }), sans.join(" "));
  }

  const resolved = Board.startpos().parseSanCandidates("e4");
  check("a resolved SAN is a one-element candidate list",
    resolved.ok && resolved.moveWords.length === 1, JSON.stringify(resolved));
  check("a resolved candidate equals what parseSan returns",
    resolved.ok && resolved.moveWords[0] === Board.startpos().parseSan("e4"));

  const refused = b.parseSanCandidates("Nd9");
  check("an unparseable SAN yields the code, not candidates",
    refused.ok === false && typeof refused.code === "string", JSON.stringify(refused));
}

console.log("== 5. Promotion UCI identity ==");
{
  // ADR-042 §4 names `h1q`/`h1r`/`h1b` as the promotion-identity regression.
  // The 5-character UCI is the only thing distinguishing four moves that share
  // from and to squares, so a caller that keeps bare `a7a8` cannot tell them
  // apart — and the bare form is correctly refused.
  const fen = "7k/P7/8/8/8/8/8/K7 w - - 0 1";
  const b = Board.fromFen(fen);

  const words = {};
  for (const piece of ["q", "r", "b", "n"]) {
    const w = b.parseUci(`a7a8${piece}`);
    check(`parseUci('a7a8${piece}') resolves`, w !== null);
    if (w !== null) words[piece] = w;
  }
  check("the four promotions are four different move words",
    Object.keys(words).length === 4 && new Set(Object.values(words)).size === 4,
    JSON.stringify(words));

  const sans = Object.entries(words).map(([p, w]) => `${p}:${b.toSan(w)}`);
  check("each promotion renders its own SAN",
    new Set(sans.map((s) => s.split(":")[1].replace("+", ""))).size === 4, sans.join(" "));
  check("every promotion UCI round-trips to itself",
    Object.entries(words).every(([p, w]) => b.toUci(w) === `a7a8${p}`),
    Object.entries(words).map(([p, w]) => b.toUci(w)).join(" "));

  check("the bare 4-character form is refused, not guessed", b.parseUci("a7a8") === null);
  check("parseSan needs the promotion piece too", b.parseSan("a8") === null);
  for (const piece of ["Q", "R", "B", "N"]) {
    check(`parseSan('a8=${piece}') resolves`, b.parseSan(`a8=${piece}`) !== null);
  }

  // And the candidates API agrees on the count: one move per promotion piece,
  // never a single collapsed answer.
  const q = b.parseSanCandidates("a8=Q");
  check("a promotion SAN has exactly one candidate", q.ok && q.moveWords.length === 1,
    JSON.stringify(q));
  check("the candidate is the queen promotion", q.ok && q.moveWords[0] === words.q);
}

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
process.exit(fail > 0 ? 1 : 0);