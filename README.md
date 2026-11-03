# Campus Sentinel
### Campus incident coordination with semantic report retrieval and accessible routing

A DBMS Level 3 project implementation based on the supplied 15-table ER diagram and relational schema. This package is original AI-assisted project code, not an existing tutorial/repository. Team members must understand, review, adapt and disclose assistance according to instructor rules; uniqueness within your section is not verified.

**Stack:** Next.js 16 App Router + React 19 + TypeScript; Next.js Route Handlers; PostgreSQL 16 + pgvector; Neo4j 5; a local Python sentence-transformers embedding API; Git and a GitHub Actions workflow. No paid API key is required.

## What it does
- Three backend-enforced roles: ADMIN, STAFF, REPORTER.
- Report incidents; check likely duplicates by cosine similarity; explicitly add reports to open incidents at the same location/category.
- Verify → assign → accept/start → resolve → close, with trigger-written audit history.
- Calculate live priority; track response/resolution SLA deadlines; search/filter incidents.
- Search verified SOP passages with a real 384-dimensional sentence embedding model.
- Import SOP text as an administrator; delete draft SOPs; withdraw non-last reports.
- Find the shortest accessible graph path among routes up to 12 connections.
- Demonstrate SQL joins, aggregation, HAVING, subqueries, transactions, functions, triggers, views, constraints, indexes and full-text search.

## Quick start (local demo)
Prerequisites: Node **22.13+** or 24, npm, Docker Engine/Desktop with Compose v2, Git, about 6 GB free disk and sufficient RAM for PostgreSQL, Neo4j and the model. The first embedding image build/model download needs internet and can take several minutes. Model weights cache in a Docker volume. Commands below assume a POSIX shell; on Windows use WSL2 or equivalent PowerShell environment syntax.

```bash
cp .env.example .env
# Edit .env BEFORE continuing; use distinct random values.
# Match POSTGRES_* with DATABASE_URL, and set all 3 SEED_*_PASSWORD values (12+ chars).
# Keep APP_ORIGIN=http://localhost:3000 for these commands.
npm ci
docker compose up -d --build --wait --wait-timeout 1200
npm run db:migrate
npm run db:seed
npm run graph:sync
npm run dev
```
Open http://localhost:3000. Sign in as `admin@campus.test`, `staff@campus.test`, or `reporter@campus.test` using the corresponding **password you put in .env**. No real credentials ship with this package. The example DB and Neo4j passwords are placeholders, not safe defaults. URL-encode reserved characters in the PostgreSQL connection-string password.

Generate a session signing key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` and put it in SESSION_SECRET. Use a different key from database passwords. Local HTTP uses COOKIE_SECURE=false; public HTTPS must use COOKIE_SECURE=true and an exact HTTPS APP_ORIGIN.

### Production-style run
```bash
npm run check
npm run build
npm start
```
Database services still need to be running. APP_ORIGIN must match the actual browser origin exactly (localhost and 127.0.0.1 are different). Set up HTTPS, a non-owner application DB role and secret management before external exposure. Read docs/SECURITY.md; this is a coursework implementation, not an emergency or production dispatch system.

### Database commands
```bash
npm run db:migrate          # transactional, checksum-tracked, repeatable migration runner
npm run db:seed             # demo-only; resets the three seed account password hashes
npm run graph:sync          # idempotent graph seed/projection; SQL identities remain authoritative
npm run embeddings:backfill # repair reports imported without embeddings
# Optional SQL demonstration:
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/demo_queries.sql
```
Migrations run once; do not edit applied SQL. Add a new numbered migration for later changes. Seed scripts use reserved demo UUIDs and names. Do not seed a real production database.

Stop services: `docker compose stop`. Resume: `docker compose up -d`. **Destructive reset:** `docker compose down -v` deletes the SQL database, graph and model cache. Back up first. These commands have not been executed on your machine.

## Tests and evidence
```bash
npm run check              # TypeScript + validation + embedded PostgreSQL/pgvector tests
RUN_LIVE_TESTS=1 npm run test:integration  # disposable seeded running stack; loads .env
# UI smoke/capture; set CHROMIUM_PATH if Chromium is elsewhere:
CHROMIUM_PATH=/usr/bin/chromium npm run test:ui
```
`tests/fixture-server.ts` is an isolated sandbox-only harness. It uses PGlite (PostgreSQL WASM) and deterministic **non-semantic fixture vectors**. It is never used by the production startup, and does not validate real sentence-transformer quality or Neo4j. See docs/TEST_RESULTS.md for exactly what was executed, what passed, and what remains unverified. Real stack tests need Docker locally.

## Project map
```
app/                         responsive Next.js UI + catch-all Route Handler
lib/                         SQL pool/transactions, auth, validation, embeddings, graph
 db/001_schema.sql           all 15 domain tables, constraints, indexes, view, functions, triggers
 db/demo_queries.sql         executable SQL feature demonstrations
scripts/                     migrate, seed, graph sync, embedding repair
embedding-service/           local MiniLM embedding API and Docker image
graph/                       meaningful campus graph connections fixture
 tests/                      unit, DB, opt-in live API, UI capture, isolated harness
 docs/PROJECT_REPORT.md      objectives, requirements, architecture, database rationale, conclusion
 docs/DATA_DICTIONARY.md     every field / SQL type / constraints
 docs/er-diagram.mmd/.svg    ER diagram sources + rendered visual
 docs/relational-schema.dbml relational schema source
 docs/API.md                routes and authorization
 docs/REQUIREMENTS_MATRIX.md PDF requirements → code/evidence/gaps
 docs/DEMO_GUIDE.md          evaluation walkthrough and important queries
 docs/TEAM_CONTRIBUTIONS.md  two-member responsibility + real evidence template
 docs/SCREENSHOTS.md         embedded screenshot gallery and evidence scope
 docs/screenshots/           captured application evidence, test fixtures explicitly disclosed
 .github/workflows/ci.yml    reproducible checks on GitHub
```

## Git / GitHub hand-off
No GitHub repository was created or pushed, and no human contributions were fabricated.
```bash
git init
git add .
git commit -m "Initial AI-assisted implementation for review"
# Create an empty repository in your own GitHub account, then:
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
git branch -M main
git push -u origin main
```
Each teammate must configure their own author identity and make genuine, meaningful commits covering database AND application work. Do not use a shared identity, backdate commits, or present the template as completed contributions. Replace placeholders in TEAM_CONTRIBUTIONS.md and the report title page. Title uniqueness and instructor/team approval require your confirmation.

## Troubleshooting
- **503 / database:** inspect `docker compose logs postgres`, .env, DB port and migration state.
- **503 / embeddings:** inspect `docker compose logs embeddings`; wait for model download; verify `curl http://localhost:8000/health`. Requests time out after 120 seconds. No fake semantic fallback is used by the actual app.
- **503 / routes:** inspect Neo4j logs, credentials and `npm run graph:sync`.
- **403 / origin:** APP_ORIGIN must equal the browser origin; send Origin on direct mutating API calls.
- **409 / report duplicate:** review the candidate then explicitly select it in “Attach to existing”; both location and category must match.
- **409 / withdrawal:** the last incident report cannot be deleted, preserving the ER minimum cardinality.
- **Constraint failures:** use the supported workflow, not direct status edits bypassing the actor/reason transaction context.
- **Port conflicts:** stop conflicting services or update Compose, .env and APP_ORIGIN consistently.
