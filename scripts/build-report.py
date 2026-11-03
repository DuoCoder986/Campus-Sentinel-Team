"""Build a readable 8-page report companion. Full technical report is PROJECT_REPORT.md."""
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import re
root=Path(__file__).resolve().parents[1]
# Liberation Sans is bundled in the build environment; fall back to ReportLab built-ins.
font=Path('/usr/share/fonts/liberation-sans/LiberationSans-Regular.ttf')
if not font.exists():
    matches=list(Path('/usr/share/fonts').rglob('LiberationSans-Regular.ttf'));font=matches[0] if matches else None
base='Helvetica';bold='Helvetica-Bold'
if font and font.exists():
    pdfmetrics.registerFont(TTFont('ReportSans',str(font)));pdfmetrics.registerFont(TTFont('ReportSansBold',str(font.with_name('LiberationSans-Bold.ttf'))));base='ReportSans';bold='ReportSansBold'
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='BodyR',fontName=base,fontSize=11,leading=16,textColor=HexColor('#293544'),spaceAfter=11))
styles.add(ParagraphStyle(name='SmallR',fontName=base,fontSize=9.5,leading=13,textColor=HexColor('#5d6c7c'),spaceAfter=8))
styles.add(ParagraphStyle(name='TitleR',fontName=bold,fontSize=34,leading=39,textColor=HexColor('#153e69'),spaceAfter=20))
styles.add(ParagraphStyle(name='HeadR',fontName=bold,fontSize=22,leading=28,textColor=HexColor('#153e69'),spaceAfter=18))
styles.add(ParagraphStyle(name='SubR',fontName=bold,fontSize=13,leading=18,textColor=HexColor('#293544'),spaceBefore=10,spaceAfter=7))
styles.add(ParagraphStyle(name='CodeR',fontName='Courier',fontSize=9,leading=13,textColor=HexColor('#293544'),backColor=HexColor('#f2f5f9'),borderPadding=9,spaceAfter=16))
styles.add(ParagraphStyle(name='CellR',fontName=base,fontSize=10,leading=14,textColor=HexColor('#293544')))
story=[]
def p(t,style='BodyR'):story.append(Paragraph(t,styles[style]))
def h(t):p(t,'SubR')
def page(n,title):
    if n>1:story.append(PageBreak())
    p('CAMPUS SENTINEL / DBMS LEVEL 3','SmallR');p(title,'HeadR')
def bullet(t):p('• '+t)
def table(rows,widths=None):
    data=[[Paragraph(escape(str(c)),styles['CellR']) for c in row] for row in rows]
    tab=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
    tab.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),HexColor('#eaf2fb')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9),('LINEBELOW',(0,0),(-1,-1),.4,HexColor('#dce4ec'))]));story.append(tab);story.append(Spacer(1,14))
# 1
p('DBMS EXPERIENTIAL LEARNING · LEVEL 3','SmallR');story.append(Spacer(1,56));p('Campus<br/>Sentinel','TitleR');p('Campus incident coordination with semantic retrieval and accessible routing','HeadR');p('Project report companion','SubR');p('Department of Computer Science and Engineering');story.append(Spacer(1,28));table([['Submission details','To be completed by the team'],['Member 1','[Name / SRN]'],['Member 2','[Name / SRN]'],['Section / instructor','[Section] / [Instructor]'],['Submission date','[Date]']],[160,330]);h('Implementation hand-off');p('The package includes a Next.js application, 15-table PostgreSQL schema, pgvector search, Neo4j routing integration, setup scripts, tests, screenshots and detailed technical appendices.');p('Sandbox checks passed. Real Docker/model/Neo4j acceptance, genuine teammate contributions, GitHub publication and instructor approvals remain pending. This is educational software, not an emergency response system.','SmallR');p('Read docs/PROJECT_REPORT.md for the full narrative; use DATA_DICTIONARY.md, the ER/DBML files, TEST_RESULTS.md and SCREENSHOTS.md as technical appendices.','SmallR')
#2
page(2,'01 · Problem, objectives & stack')
p('Campus issues often arrive as repeated, disconnected messages. Campus Sentinel separates the underlying incident from individual observations, gives staff clear ownership, preserves an audit trail and retrieves related procedures.')
h('Objectives and functional requirements')
for t in ['Authenticate users and enforce ADMIN, STAFF and REPORTER permissions in the backend.','Submit reports atomically with their embeddings; suggest likely duplicates without silently merging them.','Verify, assign, accept, resolve and close incidents using a valid audited lifecycle.','Show live priority, response/resolution deadlines, keyword/status filters and work ownership.','Retrieve verified SOP passages and accessible routes using data-appropriate database paradigms.']:bullet(t)
h('Minimum stack and justified additions')
table([['Component','Choice / purpose'],['Web + API','Next.js 16, React 19, TypeScript; Route Handlers'],['SQL + vector','PostgreSQL 16 + pgvector; integrity and text retrieval'],['Graph','Neo4j 5; meaningful campus connectivity queries'],['Embedding runtime','Local Python MiniLM CPU service; no paid AI key'],['Source control','Git; GitHub Actions checks supplied; push is pending']],[130,360])
#3
page(3,'02 · Relational design & integrity')
p('The supplied 15 entities are retained. SQL uses lower_snake_case names; the table "user" is quoted to avoid PostgreSQL special-identifier behavior. The ER diagram is provided as Mermaid source and a zoomable SVG; DBML contains the relational schema.')
table([['Domain','Tables'],['Identity','USER, ROLE, USER_ROLE'],['Campus catalogue','BUILDING, LOCATION'],['Classification / SLA','INCIDENT_CATEGORY, SLA_POLICY'],['Incidents / evidence','INCIDENT, INCIDENT_REPORT, REPORT_EMBEDDING'],['Coordination / audit','ASSIGNMENT, INCIDENT_UPDATE, STATUS_HISTORY'],['Knowledge','SOP_DOCUMENT, SOP_CHUNK']],[145,345])
h('Key relationships')
p('USER_ROLE resolves the many-to-many role relationship. Each incident has one or more reports; each report has zero or one embedding. Each SOP document has one or more chunks. Buildings contain locations; categories classify incidents and define severity-specific SLA policies.')
h('Integrity refinements')
for t in ['PK/FK/UNIQUE/NOT NULL and CHECK constraints validate identifiers, ranges, enum values, URL schemes, paired coordinates and timestamp consistency.','Deferred constraint triggers enforce at least one report per incident and one chunk per SOP at commit. Parent and child inserts remain atomic.','A partial unique index allows only one active assignment per incident. Assignment triggers require an active STAFF assignee and ADMIN assigner.','Email is lowercase and unique. Model vectors are fixed at 384 dimensions. Cascading deletes remove report vectors or draft-document chunks.']:bullet(t)
#4
page(4,'03 · SQL operations & advanced features')
p('The application performs meaningful DML: reports/assignments/notes/SOP imports insert data, lifecycle actions update it, controlled report/draft deletion removes it, and dashboards/search retrieve it. db/demo_queries.sql includes rollback-safe CREATE, ALTER and DROP demonstrations.')
table([['Advanced concept','Implemented application use'],['Transactions + locks','Incident/report/vector, assignment/status, accept/resolve; rollback on failure'],['View','incident_dashboard: joins, report count, live priority and SLA state'],['Stored functions','calculate_priority, validation/audit/cardinality guards'],['Triggers','Valid transitions, actor/reason history, roles and minimum participation'],['Indexing','FK lookups, active-assignment uniqueness, GIN full text, HNSW cosine'],['Full-text search','English to_tsvector + plainto_tsquery keyword search']],[130,360])
h('Representative aggregation')
p('SELECT c.category_name, count(*) AS open_incidents<br/>FROM incident i JOIN incident_category c USING(category_id)<br/>WHERE i.status NOT IN (\'RESOLVED\',\'CLOSED\',\'REJECTED\')<br/>GROUP BY c.category_name HAVING count(*) &gt;= 1<br/>ORDER BY open_incidents DESC;','CodeR')
p('Other demonstrations cover subqueries, aggregate functions, EXPLAIN and vector ordering. Tiny tables may correctly choose sequential scans instead of indexes. See the executable SQL file and database tests, not just screenshots.','SmallR')
#5
page(5,'04 · Vector retrieval & campus graph')
h('Text embedding model')
p('sentence-transformers/all-MiniLM-L6-v2 generates normalized 384-dimensional vectors for report descriptions and SOP passages. The local Python service loads the model once. SOP text uses 900-character chunks with 120-character overlap; token truncation is a documented limitation.')
h('Storage, metadata and retrieval')
p('Report embeddings store report_id, model name, pipeline version and generated time. SOP chunks store document identity, sequence number and model name. PostgreSQL pgvector uses cosine distance (&lt;=&gt;), with similarity = 1 − distance and HNSW cosine indexes. Search returns the nearest eight compatible verified SOP passages or best incident matches.')
p('A duplicate candidate must be an open incident at the same location/category and exceed 0.85 similarity. The user must explicitly attach their observation. The threshold is a demo heuristic, not validated accuracy; a score is not a probability. The real app never substitutes hash vectors when its model service fails.')
h('Neo4j data model')
p('Building nodes use stable codes. Location nodes contain stable node_id, name, floor and accessibility. CONTAINS links buildings to locations; CONNECTS_TO edges carry distance_m, accessibility and the fixture source marker. SQL remains the location-identity source of truth; graph sync is manual and idempotent.')
p('Routing enumerates accessible bidirectional paths up to 12 connections, sums distance and selects the minimum. This is appropriate for the small example graph, not a city-scale algorithm. The inaccessible stair shortcut illustrates why accessibility changes the path.')
h('Scope and consistency')
p('There is no distributed SQL/Neo4j transaction. Graph service failure does not block incident operations. Real graph/model execution remains local acceptance work; bounded path enumeration, manual sync and model revision pinning are documented limitations.')
#6
page(6,'05 · Application, workflow & security')
h('Role-enforced workflow')
p('REPORTED → VERIFIED → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED. REPORTED or VERIFIED can become REJECTED. Administrators verify and assign; assigned staff accept, post notes and complete; administrators confirm closure. Triggers reject invalid jumps and write history using transaction-local actor/reason.')
h('Priority and SLA')
p('Priority = severity weight (20/40/60/80) + report bonus capped at 15 + age bonus capped at 5. The dashboard derives live_priority; priority_score is a cache. SLA response ends at first accepted assignment, resolution at resolved_at; missing endpoints use the current time. Missing policies and rejected incidents have explicit states.')
h('Interface')
p('The responsive application includes sign-in, overview, incident register, reporting, knowledge/SOP import and route forms. The detail drawer shows assignment actions, deadlines, progress updates, audit history and evidence visible to the current user. Evidence is linked by URL; file upload is not implemented. Desktop/mobile screenshots are in SCREENSHOTS.md.')
h('Authentication and authorization')
p('bcrypt cost-12 hashes, eight-hour signed HttpOnly cookies, SameSite=Strict, exact-origin mutation checks, current SQL roles/account activity, and parameterized SQL/Cypher form the backend boundary. Validation is implemented both in the API and database. Secrets are environment-based and excluded from the source archive.')
h('Production limitations')
p('Use HTTPS, Secure cookies, a non-owner runtime DB role, shared rate limiting, private service networks, backups and session revocation before public deployment. No MFA/password recovery, campus approval, live emergency dispatch or tamper-proof audit ledger is claimed. Read SECURITY.md.')
#7
page(7,'06 · Executed tests & screenshot evidence')
table([['Check','Observed result / boundary'],['TypeScript + unit/SQL','19 passes; 1 opt-in live-suite entry skipped by default'],['Production build','Next.js optimized build passes'],['Live API scenarios','11 scenarios pass; 12 reported tests including parent'],['UI smoke','Desktop + 390px mobile; 10 screenshots; no checked overflow/page exceptions'],['Production npm audit','0 known vulnerabilities reported at run time'],['Real model / Neo4j','NOT executed in sandbox; local Docker acceptance required']],[145,345])
h('What the tests actually prove')
p('Embedded PostgreSQL/pgvector tests cover all 15 tables, constraints, transactions, deferred participation, lifecycle/audit, assignment guards, vector operators, full text, views/functions and executable DDL/DML examples. API tests cover authentication, RBAC, origin checks, reporting/deletion, all three roles and SOP draft lifecycle.')
p('The sandbox used PGlite (real PostgreSQL compiled to WASM) and deterministic non-semantic fixture vectors. API/UI results prove integration mechanics, not MiniLM accuracy, Neo4j routing or standard PostgreSQL concurrency. The actual application includes the real MiniLM service and has no fixture fallback.')
h('Evidence supplied')
p('docs/evidence/ contains final build, check, API, UI and audit summaries. SCREENSHOTS.md embeds the sign-in, dashboard, register, report, knowledge, routes form, detail, mobile and retrieved-passage screenshots. The route form screenshot is not a successful routing claim.')
h('Remaining acceptance')
p('Build/run all Compose services, verify real embeddings and graph paths, run the full stack twice, check persistence and genuine teammate GitHub CI/contributions. Record those results rather than converting pending checks into unverified passes.')
#8
page(8,'07 · Demonstration, team & conclusion')
h('Two-member responsibility plan — not completed contribution evidence')
table([['Member','Database + application responsibilities'],['Member 1 [Name/SRN]','Constraints, migrations and lifecycle/audit SQL; authentication and incident API/interface; integrity and role tests.'],['Member 2 [Name/SRN]','Vector/graph model, SLA/priority verification; reporting, knowledge, dashboard and routes interface; semantic/graph and mobile checks.']],[140,350])
p('Both members must make genuine database AND application contributions, record actual commits/PRs and follow the course AI-assistance policy. Names, commit history, title uniqueness and instructor approvals were not invented.')
h('Suggested final demonstration')
for t in ['Explain the ER/relational schema, dictionary, DB choices and integrity refinements.','Execute important SQL queries and show at least four advanced SQL features plus vector/graph retrieval.','Demonstrate reporter → administrator → staff → administrator coordination and audit history.','Show real-model SOP retrieval, an accessible route, denied operations, tests and individual contributions.']:bullet(t)
h('Conclusion')
p('Campus Sentinel goes beyond CRUD by joining relational integrity, coordinated ownership, audited transitions, deadlines, duplicate suggestions, SOP retrieval and graph routing. Database paradigms serve distinct needs rather than existing only for a technology checklist.')
p('Start with README.md. Use REQUIREMENTS_MATRIX.md and DEMO_GUIDE.md for the PDF checklist and evaluation. Fill team details, customize/review the AI-assisted work, run genuine-stack acceptance and publish your own repository before submission.','SmallR')
def footer(c,doc):
    c.saveState();w,h=A4;c.setStrokeColor(HexColor('#dce4ec'));c.line(48,42,w-48,42);c.setFillColor(HexColor('#657486'));c.setFont(base,9);c.drawString(48,28,'CAMPUS SENTINEL  /  REPORT COMPANION');c.drawRightString(w-48,28,str(doc.page));c.restoreState()
path=root/'docs/PROJECT_REPORT.pdf';doc=SimpleDocTemplate(str(path),pagesize=A4,rightMargin=48,leftMargin=48,topMargin=42,bottomMargin=58,title='Campus Sentinel — Project Report',author='Project team — fill names before submission');doc.build(story,onFirstPage=footer,onLaterPages=footer)
print('Report written:',path)
