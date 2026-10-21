# 4. Repository interfaces with in-memory fakes and a contract test

Date: 2026-10-18
Status: Accepted

## Context

Services contain the rules (lockout, rotation, host-only actions). Tests of those rules
should be fast and not need a database server, but fakes can drift from the real thing.

## Decision

- Services depend on small interfaces (<code>UserRepo</code>, <code>RefreshTokenRepo</code>, later <code>RoomRepo</code>)
  passed in as arguments. There is no DI framework.
- Each interface has two implementations: Mongoose for production, plain Maps for tests.
- One shared contract test suite runs against both. If the fake and MongoDB disagree, the
  contract test fails.
- Time is injected as a <code>now()</code> function so tests control the clock.

## Consequences

- API tests run in milliseconds and need no Docker.
- Every repository method is written twice and every new one must be added to the
  contract suite.
- The contract test needs a real MongoDB (mongodb-memory-server downloads a binary), which
  can be slow or blocked in CI.
- Mongoose-specific behaviour (validation, hooks) is not exercised by the fast tests.
