# API contract
Base `/api`. All responses are JSON and no-store. All mutations require an `Origin` header equal to APP_ORIGIN. Authenticated calls use the campus_session cookie. Normal errors: 400 validation/integrity; 401 unauthenticated; 403 forbidden/origin; 404 missing; 409 workflow/duplicate conflict; 413 body too large; 429 login throttle; 503 dependent service unavailable. Unknown paths/method combinations return 404.

| Method / path | Roles | Payload / behavior |
|---|---|---|
| POST auth/login | Public | email, password; HttpOnly cookie |
| POST auth/logout | Public same-origin | expire cookie |
| GET auth/me | Any authenticated | current name/email/roles |
| GET catalogue | Any | locations, active categories; active staff list only for ADMIN |
| GET dashboard | Any | SQL aggregate counts/category resolution means |
| GET incidents | Any | q keyword, status exact, mine=true; max 200, priority order |
| GET incidents/:id | Any | summary/history/updates/assignments; report bodies restricted to own reports unless STAFF/ADMIN |
| POST reports | Any | title, description, location_id, category_id, severity, optional evidence_url, coordinates and incident_id |
| DELETE reports/:id | Owner or ADMIN | removes report+embedding only if another report remains |
| PATCH incidents/:id/status | ADMIN | status VERIFIED / REJECTED / CLOSED; reason (3+ characters) |
| POST incidents/:id/assign | ADMIN | staff_id; only VERIFIED incidents; one active assignment |
| PATCH assignments/:id | Assigned STAFF | action accept / complete; updates incident and assignment atomically |
| POST incidents/:id/updates | ADMIN or assigned active STAFF | message, optional evidence_url |
| POST search | Any | query, kind incidents/sops; optional numeric location_id/category_id |
| GET sops | Any | metadata; non-admin sees verified only |
| POST sops | ADMIN | category_id,title,source_url,version,content,is_verified |
| DELETE sops/:id | ADMIN | draft-only deletion with chunk cascade |
| GET routes | Any | from/to stable neo4j_node_id; bounded accessible shortest-distance route |

POST reports example:
```json
{"title":"Leaking water pipe","description":"Water is pooling near the ground floor lab entrance.","location_id":2,"category_id":1,"severity":"HIGH","evidence_url":"https://example.com/photo","latitude":12.934,"longitude":77.535}
```
If embedding generation fails, no report is saved. Existing incident_id must be open and match the selected location/category. The duplicate threshold is a review heuristic; no automatic merge is performed. Search never discloses reporter emails or report bodies to other reporter accounts.

Response example: `{"incident_id":"...","report_id":"..."}` with HTTP 201. Route response: steps[{node_id,name}], meters. Search results contain cosine similarity, not confidence percentages. No external AI completion API is used.
