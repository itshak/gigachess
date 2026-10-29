# ADR-019: The Chesstree Facade Keeps Glyphs and Lead Comments

**Date:** 2026-10-29
**Status:** Accepted
**Change:** `chesstree-glyphs-and-lead-comments`

---

## 1. Context

The chesstree facade (`gigachess/chesstree`) matches the GPL-3.0
`@itshak/chesstree@2.0.0` baseline output for output. The baseline makes two choices
that cost an annotator data:

1. **NAGs are dropped on import.** `1. e4! $14` comes in as a bare `e4`. The
   facade copied this, and the compat spec said so ("NAGs SHALL be dropped at
   import"). gigachess already wrote move glyphs (`!` to `?!`) back on export,
   so a glyph set in the editor saved correctly, but it was lost the next
   time the game was opened. Position glyphs (`=`, `∞`, `±`, …) were never
   written at all.
2. **Lead comments were misplaced, and here the baseline was right.** The
   baseline keeps a comment before the game's first move on the root node and
   a comment before a variation's first move as that move's
   `startingComments`, and writes both back before the move. The parser merged
   them into the move's after-move comments instead, so `({lead} 2. f4)` came
   back as `(2. f4 {lead})`. This was a parity bug that the corpus did not
   cover.

BlindBase's analysis screen annotates games: move and position glyphs from a
context menu, and comments before or after a move. Both must survive a save and
a reopen.

## 2. Decision

1. **Import keeps every NAG as a glyph** `{ id, symbol, name }`, from the
   standard table `NAG_GLYPHS` (move assessments 1–7, position assessments
   10–19, and 22, 32, 36, 40, 132, 138, 140, 146; symbols and names as in the
   lichess tree). A NAG with no standard glyph is kept as the symbol `$n`.
   This is a deliberate divergence from the baseline, which has no glyphs at
   all after import.
2. **Export writes every glyph as its NAG** (its `id`, or its symbol through
   the table, or `$n`), after the move, in the stored order.
3. **Lead comments follow the baseline:** `root.comments` for the game's own
   section, `startingComments` (ids `pgn-starting-comment-<path>-<i>`) for a
   variation's first move, both written before the move. `parsePgn` records
   them as `PgnMove.startingComments`, and `makePgn` writes them before the
   move number.

## 3. Consequences

- `export → import → export` is stable for glyphs and lead comments
  (`tests/chesstree-glyphs.mjs`, new parity cases `lead-comments` and
  `lead-comment-black`).
- Consumers that read `node.glyphs` now see glyphs on imported games. A consumer
  that expected glyphs only on edited nodes must not treat their presence as
  "edited".
- `PgnMove.comments` no longer contains the comments before a section's first
  move. Those are in `startingComments`.
- The parity suite still compares glyphs. Its corpus has no NAGs, because the
  baseline cannot produce them, so glyphs are tested on their own.
