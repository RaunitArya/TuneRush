# 3. Refresh tokens: hashed, rotated on every use, revoked by family

Date: 2026-10-16
Status: Accepted

## Context

A refresh token lives for 30 days, so it is the most valuable secret in the system. Two
things can go wrong: the database leaks, or the token is stolen from a browser and used
quietly next to the real user.

## Decision

- The token is 32 random bytes. Only its SHA-256 hash is stored, so a database leak does not
  give attackers usable tokens. A fast hash is enough because the input has 256 bits of
  entropy; argon2 is for passwords, which are guessable.
- Every refresh revokes the presented token and issues a new one in the same family.
- Revocation is one atomic update (<code>revokeIfActive</code>: set <code>revokedAt</code> where it is still
  null). Whoever wins the race rotates; the loser is treated as a reuse.
- Presenting an already-revoked token revokes the whole family and returns 401. The real
  user is logged out and signs in again.
- The cookie is httpOnly, scoped to <code>/api/v1/auth</code>, and Secure in production. Refresh and
  logout also check the Origin header against <code>CORS_ORIGINS</code>.
- A TTL index on <code>expiresAt</code> lets MongoDB delete expired rows.

## Consequences

- Theft is detected when either party reuses an old token, but only then. A thief who
  never races the real user stays undetected until the token expires.
- Each refresh is a write, so there is more database traffic than with a long-lived JWT.
- Two tabs refreshing at the same moment can trigger a false reuse and log the user out.
  The client must serialize refresh calls (Phase 2).
- Access tokens already issued stay valid for up to 15 minutes after logout.
