# ADR-018: Ambiguous SAN Reports Its Candidates

**Date:** 2026-10-06
**Status:** Accepted
**Change:** `report-ambiguous-san`

---

## 1. Context

`parseSan` correctly refuses a SAN string that more than one legal move answers
to, returning the error code `san/ambiguous`. Two gaps made that refusal
unusable to a UI:

1. **The candidates were discarded.** `parseSan` collapsed the match set to a
   single `Err({code: "san/ambiguous"})`, so a caller could tell the user the
   input was ambiguous but never *which* moves it meant. Presenting the
   disambiguated spellings requires knowing the matches, which the only public
   parse path threw away.

2. **`Board.parseSan` collapsed every error to `null`.** The board's
   reason-returning sibling did not exist, so `san/ambiguous`,
   `san/noLegalMove` and `san/invalidSan` all arrived as the same `null`. For a
   screen-reader user those are different messages — "several moves answer to
   this, which one?" versus "no such move" — and the API could not express the
   difference.

BlindBase hit this as a P0 wrong-move bug (owner field report #11): a caller
accepting case-insensitive input parsed `Bxc5` (bishop) through a lowercasing
step into `bxc5` (the b-pawn's capture), because the only way to learn that two
pieces matched was to re-derive the legal move set outside the library. That
workaround fixes one call site and rots on the next library bump.

The related promotion-identity concern raised by BlindBase ADR-042 §4
(`h1q`/`h1r`/`h1b`) was investigated and found **already correct** upstream: the
four promotion pieces produce four distinct 16-bit move words, `makeUci` round-
trips each, and the bare 4-character form is refused rather than defaulting to
a queen. `tests/san-ambiguity.mjs` now pins that behaviour so a future change
cannot quietly collapse it.

## 2. Decisions

### A. Add reason- and candidate-preserving parse entry points

Module level:

- `parseSanDetailed(san, pos)` returns `{ result, candidates }`. `result` is
  byte-for-byte what `parseSan` returns for the same input; `candidates` is the
  collected match list, or `null` when the string was refused before any move
  could match.
- `parseSanCandidates(san, pos)` returns `Ok(moves)` for any SAN that matched at
  least one legal move (a resolved SAN yields a one-element list), and the error
  otherwise.

On `Board`:

- `board.parseSanResult(san)` returns `{ok: true, moveWord} | {ok: false, code}`.
- `board.parseSanCandidates(san)` returns `{ok: true, moveWords} | {ok: false, code}`.

### B. `parseSan` keeps its signature and its behaviour

`parseSan` remains `Result<Move, SanError>` and `board.parseSan` remains
`number | null`. The new entry points are additive: no existing caller changes
behaviour, and the hot paths keep returning a bare number.

### C. One parse body, not two

The parse rules live in a single internal function (`parseSanTraced`) whose
result both `parseSan` and `parseSanDetailed` project. A second parse path would
be free to answer differently from the first, and a caller migrating to it would
inherit a new bug — so `tests/san-ambiguity.mjs` asserts the two agree across
resolved, ambiguous, illegal, castling-refused and malformed inputs.

### D. `null` candidates mean "not a SAN", distinct from "ambiguous"

A refusal raised before candidate collection returns `candidates: null`. That is
what separates "this string is not a SAN at all" from "this SAN is ambiguous",
and it is the distinction `parseSanResult` exists to preserve.

## 3. Alternatives considered

- **Have callers re-derive the candidate set themselves** (enumerate legal moves
  and re-implement SAN matching): rejected — this is exactly BlindBase's
  workaround. It duplicates the parse rules, fixes one call site, and silently
  drifts from the library's actual behaviour.
- **Return the candidates in the `SanError`** (`Err({code, candidates})`): rejected
  — it puts a successful-parse shape inside a failure channel and widens the
  error type every existing `if (res.error.code === ...)` reads.
- **Change `parseSan` to return candidates and break the signature**: rejected —
  the zero-allocation `Board.parseSan` is used on hot replay paths, and a
  pre-1.0 break here would buy nothing the additive entry points do not.
- **Emit the ambiguity only as a boolean**: rejected — the whole point is naming
  the moves, so the caller can say *which* disambiguation to type.

## 4. Consequences

- A caller that accepts case-insensitive input can union the candidates of the
  case variants and detect ambiguity exactly, instead of guessing — the fix for
  BlindBase field report #11 becomes a library call rather than a workaround.
- `null` candidates are a third state on the result object; callers that only
  want the reason read `result` and never look at them.
- No performance change on existing paths: `parseSan` and `board.parseSan` are
  unchanged, and `parseSanDetailed` collects the same candidates the old code
  already built before discarding them.

## 5. Verification

- `npm test` — all 12 suites pass, including the new `tests/san-ambiguity.mjs`
  (48 assertions) and the 1,000-game differential against `chess.js`
  (118,380 plies, 0 mismatches).
- `tests/san-ambiguity.mjs` pins: ambiguity yields candidates; disambiguated SAN
  selects one; rank/file disambiguation resolves to the right knight;
  `parseSanDetailed` agrees with `parseSan` on every outcome class; promotion
  identity keeps four distinct move words and refuses the bare form.