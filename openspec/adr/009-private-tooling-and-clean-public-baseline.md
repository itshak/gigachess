# ADR-009: Separation of Public Workstation and Private Admin Suite

**Status:** Accepted (August 2026)

## Context

BlindBase is an open-source, local-first chess workstation distributed under AGPL-3.0-or-later. Internal dataset compilation pipelines, content scraping tools, release publishing scripts (`blindbase_admin`), private monetization strategies, and internal data review records must not be exposed in the public repository or its Git history.

## Decision

1. **Repository Boundary:**
   - **Public Repository (`itshak/blindbase`):** Contains exclusively the AGPL-3.0 desktop application source code, UI components, runtime SQLite/SRS logic, verified public-domain starter datasets, open documentation, and core OpenSpec specifications.
   - **Private Repository (`itshak/blindbase-private`):** Houses the standalone `blindbase_admin` Rust crate, dataset preparation scripts, historical ingestion archives, private review documentation, and business strategy.
2. **Shared Modules Architecture:**
   - `blindbase_admin` references shared Rust core modules (`gigabase_moves.rs`, `position_index/`, `opening_tree.rs`, `masters_pack.rs`) from `blindbase` via relative symlinks, eliminating code duplication while maintaining strict runtime isolation.
3. **Public Release Baseline History:**
   - The public repository history is initialized as a fresh, pristine baseline release commit for `v0.3.7`. Internal commit logs, scrapers, and deprecated files are purged from the public Git tree, preserving full historical development records in the private repository.

## Consequences

### Positive
- Public codebase is 100% clean, professional, and compliant with open-source and intellectual property standards.
- Contributors interact with a clean Git commit history without internal development artifacts.
- Shared Rust modules update in real-time across both repositories with zero drift.

### Negative
- Local development requires maintaining the `private -> ../blindbase-private` symlink for access to administrative scripts.
