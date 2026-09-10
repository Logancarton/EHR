# Authentication and User Identity

## Current model

The existing `team_members` table is the authoritative first-party EHR user/team-member directory. A user record owns the human identity used throughout the application:

- stable user id
- display name
- professional credentials when applicable
- role (`provider`, `staff`, `clinical_assistant`)
- active/inactive status
- created/updated timestamps

Authentication data is intentionally separated from that person/team record.

`auth_identities` stores first-party login identifiers and salted password hashes. `auth_sessions` stores revocable server-side sessions. Plaintext passwords are never stored.

## Session trust model

The browser cookie is HTTP-only and contains only a signed opaque session reference plus issuance/expiration timestamps. It does **not** contain a trusted provider role, display name, or other authority-bearing user metadata.

For every authenticated request:

1. verify the HMAC-signed session token;
2. verify token expiration;
3. load the matching server-side session;
4. reject revoked/expired sessions;
5. load the active authoritative `team_members` record;
6. derive the current role and provider context from that record.

This means changing a user's role or making a user inactive takes effect without waiting for an old role-bearing token to expire.

Client headers or request payloads that claim a user id or role are not authentication sources.

## Login/logout APIs

- `POST /api/auth/login` establishes a session.
- `POST /api/auth/logout` revokes the server-side session and clears the cookie.
- `GET /api/auth/me` returns the currently authenticated authoritative user.

Production password login requires a provisioned first-party auth identity and `EHR_SESSION_SECRET` of at least 32 characters.

During local development only, the login endpoint may explicitly select an active synthetic team-member `userId`. That path still creates the same revocable server-side session and still derives permissions from the authoritative user record. It is disabled by the production runtime boundary.

If `EHR_SESSION_SECRET` is omitted in local development, the process creates an ephemeral signing secret so prototype work remains usable without committing secrets. Those sessions intentionally become invalid after a server restart. Production has no such fallback.

## Patient access boundary

Authentication and roles do not decide which patients a user may reach. That is a
third, independent authority described in D-033:

- `organizations` — a practice.
- `organization_memberships` — a user's `active` / `suspended` / `revoked` standing in
  one organization, plus a `patient_access_scope` of `organization` (the whole practice
  population) or `assigned` (only patients linked through `team_member_patients`).
- `patient_organizations` — the single organization that owns a patient record.

Every patient-bound request resolves this before touching clinical data, and
cross-patient surfaces (roster, practice queues, cross-chart search) narrow to the
reachable population. The rule fails closed: a patient owned by no organization is
reachable by nobody, and a non-active membership grants nothing. Revoking membership
takes effect on the existing session, without waiting for the cookie to expire and
without changing the user's clinical role.

Production user provisioning into organizations, organization administration, and
cross-organization coverage remain open Phase 2 / Phase 6 work.

## Clinical boundary

Production requests without a valid EHR session must not become `prototype-provider`. The prototype provider remains only a non-production compatibility convenience for existing local clinical flows that have not yet been wired through login UI.

If a request presents an invalid, tampered, expired, or revoked session cookie, the system rejects it rather than silently falling back to prototype identity even in development.

Backend permissions remain the security boundary. UI role-aware hiding is a usability layer only.

## Provisioning boundary

`GET/POST/PATCH /api/organization/members` administers the users and memberships of **one** organization, behind the `manage_organization` permission and confined to an organization the acting administrator actively belongs to (D-038). It can create a user with a membership, change a member's status or patient-access scope, and activate or deactivate an account. Revoking a membership or deactivating a user also revokes that user's live sessions, and an administrator cannot revoke or deactivate themselves. Every operation is audited to the acting administrator.

A provisioned user has **no password** until `AuthService.configurePasswordCredential` is called; that remains a server-side primitive. This phase intentionally does not add public self-registration or hard-coded production users/passwords.

OAuth/SSO and stronger device/session controls remain future production work behind this first-party identity boundary.
