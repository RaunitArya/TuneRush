# 1. Monorepo with npm workspaces

Date: 2026-10-11
Status: Accepted

## Context

The client and server share request and event types and Zod schemas. Keeping them in separate
repositories means copying types by hand and they drift apart.

## Decision

One repository with npm workspaces: apps/server, apps/client and packages/shared.
No extra build tool (Turborepo, Nx) for now.

## Consequences

- One install, one lint and test pipeline, one pull request can change both sides.
- packages/shared must be built before the server and client can import it.
- If builds get slow, revisit with a task runner. Not needed at this size.
