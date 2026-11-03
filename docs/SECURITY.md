# Security and operational boundaries

## Implemented
- bcrypt password hashing, signed expiring session cookies, HttpOnly and SameSite=Strict.
- Secure-cookie flag configurable for HTTPS; strict same-origin checks on mutations.
- Backend roles reloaded from SQL on each request, including is_active.
- Parameterized SQL and Cypher; enum/range/length checks in API plus database constraints.
- No passwords or real signing keys in the delivered source; .env and build artefacts excluded.
- External URL fields allow http/https only. URLs are linked, not fetched by the server (no evidence-fetch SSRF path).
- Non-last-report and draft-only-document deletion; preserved referential history.
- Model/SQL/Neo4j Compose ports bind to loopback, not all host interfaces.

## Before public deployment
1. Use HTTPS, exact APP_ORIGIN, COOKIE_SECURE=true and independent random secrets.
2. Provision a **non-owner** PostgreSQL app role with minimum SELECT/INSERT/UPDATE/DELETE and needed functions only. Use separate migration credentials. The local Docker owner credentials are deliberately a demo convenience.
3. Consider RLS or narrow SECURITY DEFINER functions for a hostile environment. API RBAC is the current authorization boundary; someone with direct DB-owner access can change data.
4. Replace process-local email-attempt throttling with a shared store and trusted-ingress IP policy; add account recovery/MFA and session revocation. Current throttle resets on process restart and can grow with unique email attempts.
5. Add input/body limits at the ingress too; the API's 64KB limit does not replace web-server streaming limits.
6. Review CSP and auth dependencies for the target release; remove development allowances where practical.
7. Protect Neo4j and the embedding service on a private network; the embedding endpoint intentionally has no standalone authentication for loopback-only local use.
8. Replace all example SOPs and URLs with approved procedures; verify physical routes. Do not use the demo as emergency guidance.
9. Add backups, restoration tests, production monitoring, DB pool sizing and calibrated model evaluation.
10. Freeze an upstream embedding revision and dependency/image digests for archival reproducibility. Do not mix vectors from different representations under the same model name.

## Deliberate limitations
Logout clears only the current browser cookie; copied JWTs remain valid until expiry unless the signing key is rotated or the account is deactivated. There is no self-registration/password reset. STAFF/ADMIN can view campus report evidence; reporter users see only their own report bodies, but all authenticated users can browse campus incident summaries and progress updates. Do not enter sensitive personal information. Status_history is not an immutable cryptographic ledger, and DB-owner credentials can alter it. No production certification is implied by the test suite.
