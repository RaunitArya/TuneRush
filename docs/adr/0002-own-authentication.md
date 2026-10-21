# 2. Own authentication with rotating refresh tokens

Date: 2026-10-16
Status: Accepted

## Context

The project needs accounts and guests. Managed services (Firebase Auth, Auth0) hide the
mechanics, add vendor lock-in and do not fit server-issued guest identities well.

## Decision

Email and password with argon2id. A 15 minute access JWT (HS256, pinned algorithm, issuer
checked) in the Authorization header. A 30 day refresh token, 32 random bytes in an httpOnly
cookie, stored only as a SHA-256 hash, rotated on every use with reuse detection by token family.
Guests get a signed short-lived JWT and no database record. Social sign-in is added later
with Better Auth in link-only mode.

## Consequences

- We own the security-critical code and must test every failure path.
- Access tokens cannot be revoked before they expire (15 minutes).
- Registration reveals whether an email is taken (409).
- No email verification or password reset yet.
- The refresh endpoint needs CSRF care, so it checks the Origin header.
