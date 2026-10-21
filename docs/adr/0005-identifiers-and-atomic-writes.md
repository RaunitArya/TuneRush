# 5. Domain identifiers instead of _id, and atomic single-document writes

Date: 2026-10-20
Status: Accepted

## Context

MongoDB gives every document an `_id` ObjectId. The API needs stable public identifiers:
a user id that also fits guests (`g_&lt;uuid&gt;`), and short room codes. Several rules must
hold under concurrent requests (unique email, at most 8 players, one winner of a token
rotation).

## Decision

- Keep the default `_id` in the database, but never expose it. Records returned by the
  repositories drop it, and the app uses `uid`, `code` and `tokenHash` as identifiers. Each
  is backed by a unique index.
- A duplicate key error (code 11000) is mapped to a 409 AppError in one helper.
- Rules that must survive concurrency are one atomic operation, not read-then-write:
  `$inc` for login failures, `revokeIfActive` for rotation, and a single `findOneAndUpdate`
  with `$ne` and `$expr`/`$size` for joining a room.
- When an atomic update matches nothing, read the document afterwards only to decide which
  error to return (not found, full, forbidden).

## Consequences

- Two identifiers per document (`_id` inside the database, `uid` outside) and a mapping step to maintain.
- A custom string `_id` would avoid the second index and the mapping; this can be revisited
  if it becomes a burden.
- The explaining read after a failed update is not atomic, so under heavy contention the
  reason given may be slightly stale. The state itself is never wrong.
