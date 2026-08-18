# ADR-0004: Persistence boundary

- Date: 2026-08-18
- Status: Accepted

## Context

The two worst historical defects (empty-state KV overwrite, offline-boot
regression) were persistence logic reachable from anywhere.

## Decision

Only infrastructure/persistence/ may import SyncEngine. loadState and
saveState move inside the adapter. The data-safety rule (never save
default or empty state over loaded state) is enforced by adapter tests.

## Consequences

- Phase V3 gate: zero SyncEngine imports outside the adapter
  (grep-verified).
