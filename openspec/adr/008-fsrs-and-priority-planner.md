# ADR-008: FSRS Memory Model and Value-of-Information Repertoire Planner

**Status:** Accepted (August 2026)

## Context

Repertoire training previously used SM-2 (ease factor + interval, Wozniak 1987) for lines, width-training positions, and endgame drills. SM-2 cannot express *how likely* a lapse is today — it produces intervals, not probabilities. Without calibrated recall probability it is impossible to prioritize reviews by expected loss ("what does forgetting *this* move cost me × how likely am I to forget it"), which is the core of the POT/picot planning algorithm we are adopting.

The POT prototype (picot) demonstrated a value-of-information planner over a repertoire tree: engine evaluations give each branch a chess value; master-database statistics give opponent replies likelihoods; a budgeted knapsack DP allocates scarce review time where expected centipawn-loss avoided is maximal. Its weakness was an ad-hoc per-move "belief" counter with no time dimension — no forgetting curve at all.

## Decision

### 1. FSRS as the single memory model

All spaced repetition (repertoire lines, width positions, endgame drills) uses **FSRS** (Free Spaced Repetition Scheduler, open-spaced-repetition; Ye et al., KDD 2022) via the official `fsrs` Rust crate.

- FSRS models memory as **D**ifficulty / **S**tability / **R**etrievability with `R(t) = exp(−t/S)`-family decay, producing exactly the recall probability the planner consumes.
- Evidence: the open srs-benchmark (≈350–700M anonymized Anki reviews, Expertium) shows FSRS predicting recall with roughly one-third of SM-2's error (log-loss ≈0.29 vs ≈0.35; retention RMSE ≈5% vs ≈16%) and needing ~20–30% fewer reviews at equal retention, better than SM-2 for ≈99% of collections.
- Chess precedent: Modern digital chess trainers increasingly adopt FSRS for opening training over legacy SM-2 derivatives. We are aligned with the current chess-trainer state of the art.
- Grades: Again/Hard/Good/Easy where the UI can express them; binary correct/incorrect flows map to Good/Again.
- Default population weights are used initially; per-user weight fitting is a follow-up once review logs accumulate (Anki requires ~1,000 reviews for stable fits).

Alternatives considered:
- *Keep SM-2, approximate p from interval/ease* — rejected: calibration quality drives planner quality more than any other input; SM-2 has no principled p.
- *Half-Life Regression (Settles & Meeder, ACL 2016)* — trainable feature-rich alternative (`p = 2^(−Δ/h)`); kept as a future option if we ever want context features (time-of-day, rating); FSRS is simpler, benchmarked better on general data, and has a maintained Rust implementation.
- *Deep knowledge tracing (BKT/DKT/attention models), MDP schedulers beyond SSP-MMC* — research-grade complexity; revisit only if FSRS calibration proves inadequate in our telemetry.

### 2. Review ordering by value of information

Within-session ordering is a separate problem from when items come due. We adopt POT's planner:

- Per position, opponent-reply priors blend engine evaluations (softmax temperature) with master-game W-D-B counts (masters pack / GigaBase).
- Backward passes compute optimal-play score, expected score under current knowledge, and the "leave-the-repertoire" alternative score.
- A knapsack-style DP distributes a session budget across branches maximizing expected centipawn-loss avoided, sharing prefix credit correctly.
- FSRS retrievability supplies the failure probability per item, replacing POT's belief counter.

No mainstream chess trainer currently orders practice this way (standard trainers order merely by due date within a card type); this planner is BlindBase's differentiator. Closest general techniques are maximum-marginal-relevance and bandit item selection in educational systems.

### 3. Storage

Derived planner quantities (priors, gains, allocations) are **not persisted** — recomputation from source columns is milliseconds even for tens of thousands of nodes. Source-of-truth additions are limited to:

- FSRS state columns inline on existing rows (`repertoire_lines`, `repertoire_width_progress`, drills attempt rows): stability, difficulty, last review timestamp, last grade.
- A `review_log` table (scope, item id, repertoire/drill reference, grade, timestamp, **predicted recall at ask time**, session ordering mode) enabling calibration measurement (predicted vs actual recall, log-loss/RMSE-bins as in the srs-benchmark), future weight fitting, and planner-vs-due-date effectiveness experiments.
- Planner configuration as a JSON settings blob (weights, temperature, retention target), changeable without schema changes.

Hot paths keep existing indexes; new queries filter by `(repertoire_id, next_review_date)` and walk `parent_hash` edges, both indexed.

## Consequences

- One scheduler implementation shared by all domains replaces three SM-2 copies (Rust drills mirror, TS line policy, width policy) — single mental model, single bug surface.
- The app gains honest numbers: predicted recall can be checked against reality; scheduling claims become falsifiable (see shadow-mode/crossover experiments in the planner change design).
- FSRS parameters evolve upstream; pinning the crate version keeps behavior deterministic while allowing deliberate upgrades.
- Pre-release cutover deletes SM-2 columns outright; no migration tooling exists or is needed.
