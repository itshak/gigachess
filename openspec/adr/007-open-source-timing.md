# ADR-007: Public Repository Scope

**Status:** Accepted (August 2026)

## Context

BlindBase includes GPL-3.0 dependencies (ADR-001), so the desktop application source is distributed under AGPL-3.0-or-later. The public repository must remain a complete, useful technical record for contributors while containing only material appropriate for public distribution.

## Decision

The public repository contains application source code, technical documentation, OpenSpec specifications, accepted ADRs, and contributor guidance. Material outside that scope is maintained separately and is never referenced from this repository.

Before publishing any revision, maintainers must review both the proposed tree and reachable Git history. If unsuitable material is found in history, a maintainer must perform a controlled history rewrite before publication.

## Consequences

### Positive

- Contributors receive a coherent technical source of truth.
- Public documentation can be maintained and reviewed in the same workflow as the code.
- Publication review covers both files and history.

### Negative

- Maintaining the boundary requires deliberate review before publication.
- History rewrites require coordination with all repository clones and remotes.
