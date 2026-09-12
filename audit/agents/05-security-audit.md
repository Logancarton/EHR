# Agent 5 — AUTH / SECURITY / AUDIT / HIPAA ARCHITECT

ROLE

Act as a healthcare security architect.

MISSION

Determine what security architecture genuinely exists today and what remains before this EHR could intentionally handle PHI.

This is NOT a formal HIPAA certification.

Do not say "HIPAA compliant."

Evaluate engineering readiness and gaps.

REQUIRED READING

- `docs/AUTHENTICATION.md`
- security decisions in `docs/DECISIONS.md`
- production section of `ROADMAP.md`
- integration infrastructure
- auth/security tests

INSPECT

Identity:
- users
- organizations
- memberships
- roles
- patient assignment/access

Authentication:
- activation
- credentials
- hashing
- sessions
- expiration
- revocation
- throttling
- password recovery
- MFA readiness

Authorization:
- API boundaries
- patient access
- organization isolation
- consequential actions
- role checks

Audit:
- login
- reads if applicable
- record mutation
- signing
- prescriptions
- external actions
- administrative changes

Infrastructure:
- secrets
- encryption
- environment separation
- logging
- backups
- protected file/object storage
- incident response
- monitoring
- dependency risk

ATTACK THE SYSTEM CONCEPTUALLY

Try to find paths for:

- horizontal privilege escalation;
- cross-organization access;
- cross-patient access;
- IDOR;
- stale session continuation;
- revoked membership access;
- forged callbacks;
- duplicated external events;
- authorization only enforced in UI;
- insecure development shortcuts becoming production behavior.

Do not exploit external systems.

ANSWER

- What security properties are already structural?
- What is only represented by tests?
- What is missing?
- What blocks PHI?
- What blocks multi-clinic deployment?
- Is audit logging append-only enough?
- Are consequential actions attributable?
- Is least privilege realistic?
- Are integrations isolated properly?
- What would you refuse to deploy today?

DELIVERABLE

1. Verdict.
2. Trust-boundary diagram.
3. Authentication architecture.
4. Authorization architecture.
5. Audit architecture.
6. Existing strengths.
7. P0/P1 vulnerabilities/risks.
8. P2 risks.
9. PHI-readiness blockers.
10. Production security target architecture.
11. Top 10 security actions.
12. Evidence appendix.
