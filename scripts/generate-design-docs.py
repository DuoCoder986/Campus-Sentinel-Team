"""Generate schema docs/diagrams from the implemented SQL; stdlib + Graphviz."""
from pathlib import Path
import re, html, subprocess
root=Path(__file__).resolve().parents[1]
sql=(root/'db/001_schema.sql').read_text()
def split(s):
    out=[]; depth=0; quote=False; at=0
    for i,c in enumerate(s):
        if c=="'": quote=not quote
        if not quote:
            if c=='(': depth+=1
            elif c==')': depth-=1
            elif c==',' and depth==0: out.append(s[at:i].strip()); at=i+1
    out.append(s[at:].strip()); return out
entities=[]
for m in re.finditer(r'CREATE TABLE ("?\w+"?) \(',sql):
    start=m.end(); depth=1; quote=False; pos=start
    while depth:
        c=sql[pos]
        if c=="'":quote=not quote
        if not quote:
            if c=='(':depth+=1
            elif c==')':depth-=1
        pos+=1
    name=m.group(1).strip('"'); cols=[]; constraints=[]
    for part in split(sql[start:pos-1]):
        if re.match(r'^(CHECK|UNIQUE|PRIMARY|FOREIGN|CONSTRAINT)\b',part):constraints.append(part);continue
        cm=re.match(r'(\w+)\s+([a-z]+(?:\([^)]*\))?)(.*)',part,re.S)
        if not cm:raise ValueError(part)
        cn,ctype,rest=cm.groups(); fk=re.search(r'REFERENCES ("?\w+"?)(?:\((\w+)\))?',rest)
        composite=name=='user_role' and cn in ('user_id','role_id')
        pk='PRIMARY KEY' in rest or composite
        uk='UNIQUE' in rest
        nullable=not pk and 'NOT NULL' not in rest
        cols.append(dict(name=cn,type=ctype,rest=rest.strip(),pk=pk,uk=uk,nullable=nullable,fk=fk.group(1).strip('"') if fk else None,fkcol=fk.group(2) if fk else None))
    entities.append(dict(name=name,cols=cols,constraints=constraints))
assert len(entities)==15
lookup={t['name']:next((c['name'] for c in t['cols'] if c['pk']),None) for t in entities}
notes={
'user':'Account identity; lowercase unique email; bcrypt password hash; active flag.',
'role':'Configured application permission role. Only ADMIN, STAFF, REPORTER are allowed.',
'user_role':'Many-to-many membership. Composite key prevents duplicate memberships.',
'building':'Physical campus building catalogue.',
'location':'Physical space; stable application graph node ID, not a Neo4j internal ID.',
'incident_category':'Incident classification; skill is descriptive metadata (no staff skill matching).',
'sla_policy':'One policy per category/severity. Minutes must be positive and resolution >= response.',
'incident':'Underlying event. Severity, priority and lifecycle; live priority is derived in the view.',
'incident_report':'An individual observation linked to an event; geo coordinates are optional paired values.',
'report_embedding':'Optional one-per-report 384-D embedding and model metadata.',
'assignment':'Staff ownership history. A partial unique index allows only one PENDING/ACCEPTED row per incident.',
'incident_update':'Progress/evidence notes, not state changes.',
'status_history':'Trigger-written transition audit; actor/reason from transaction-local context.',
'sop_document':'Versioned response-procedure metadata. Verified flag gates retrieval.',
'sop_chunk':'Ordered overlapping passages with compatible 384-D sentence embeddings.'}
dictionary=['# Data dictionary','', 'Generated from `db/001_schema.sql`; SQL is authoritative. PK implies NOT NULL. All timestamps are timezone-aware. SQL table names are lower-case mappings of the supplied ER entities. The quoted `"user"` table avoids the PostgreSQL special identifier.','']
mermaid=['erDiagram']
dbml=['// Implemented relational schema; see SQL for all CHECK/trigger/index definitions.','Project CampusSentinel {','  database_type: \'PostgreSQL\'','}','','']
for t in entities:
    name=t['name'];dictionary += ['## '+name.upper(),'',notes[name],'','| Column | SQL type | Nullable | Key / constraints / default |','|---|---|---|---|']
    mermaid += ['    '+name.upper()+' {']; dbml+=['Table '+name.upper()+' {']
    for c in t['cols']:
        desc=c['rest'];
        if c['pk'] and 'PRIMARY KEY' not in desc:desc='Composite PK; '+desc
        dictionary.append('| '+c['name']+' | '+c['type']+' | '+('Yes' if c['nullable'] else 'No')+' | '+desc.replace('|','\\|')+' |')
        keys=[k for k,v in [('PK',c['pk']),('FK',bool(c['fk'])),('UK',c['uk'])] if v]
        ty=c['type'].split('(')[0];ty={'numeric':'decimal','timestamptz':'timestamp'}.get(ty,ty)
        mermaid+=['        '+ty+' '+c['name']+(' '+', '.join(keys) if keys else '')]
        flags=[]
        if c['pk'] and name!='user_role':flags.append('pk')
        if not c['nullable'] and not c['pk']:flags.append('not null')
        if c['uk']:flags.append('unique')
        if c['fk']:flags.append('ref: '+('-' if name=='report_embedding' else '>')+' '+c['fk'].upper()+'.'+(c['fkcol'] or lookup[c['fk']]))
        ctype='"'+c['type']+'"' if ',' in c['type'] else c['type']
        dbml+=['  '+c['name']+' '+ctype+(' ['+', '.join(flags)+']' if flags else '')]
    mermaid+=['    }'];
    ix=[]
    if name=='user_role':ix+=['    (user_id,role_id) [pk]']
    for con in t['constraints']:
        unique=re.match(r'UNIQUE\(([^)]+)\)',con)
        if unique:ix+=['    ('+unique.group(1)+') [unique]']
    if ix:dbml+=['  indexes {']+ix+['  }']
    dbml+=['}',''];dictionary+=['']
    if t['constraints']:dictionary+=['Table constraints: '+ '; '.join('`'+x+'`' for x in t['constraints'])+'.','']
rels=[('USER','USER_ROLE','has','o{'),('ROLE','USER_ROLE','grants','o{'),('BUILDING','LOCATION','contains','o{'),('INCIDENT_CATEGORY','SLA_POLICY','defines','o{'),('INCIDENT_CATEGORY','INCIDENT','classifies','o{'),('LOCATION','INCIDENT','contains','o{'),('INCIDENT','INCIDENT_REPORT','combines','|{'),('USER','INCIDENT_REPORT','submits','o{'),('INCIDENT_REPORT','REPORT_EMBEDDING','generates','o|'),('INCIDENT','ASSIGNMENT','receives','o{'),('USER','ASSIGNMENT','assigned_as_staff','o{'),('USER','ASSIGNMENT','assigned_by_admin','o{'),('INCIDENT','INCIDENT_UPDATE','has','o{'),('USER','INCIDENT_UPDATE','writes','o{'),('INCIDENT','STATUS_HISTORY','records','o{'),('USER','STATUS_HISTORY','changes','o{'),('INCIDENT_CATEGORY','SOP_DOCUMENT','provides','o{'),('SOP_DOCUMENT','SOP_CHUNK','contains','|{')]
for a,b,label,end in rels:mermaid+=['    '+a+' ||--'+end+' '+b+' : '+label]
(root/'docs/DATA_DICTIONARY.md').write_text('\n'.join(dictionary))
(root/'docs/er-diagram.mmd').write_text('\n'.join(mermaid)+'\n')
(root/'docs/relational-schema.dbml').write_text('\n'.join(dbml)+'\n')
dot=['digraph ER {','graph [rankdir=LR, bgcolor="white",pad="0.4",nodesep="0.45",ranksep="1.5",splines=polyline];','node [shape=plain,fontname="Arial"];','edge [fontname="Arial",fontsize=10,color="#8b9daf",fontcolor="#516477"];']
for t in entities:
    name=t['name'];rows=['<TR><TD COLSPAN="2" BGCOLOR="#185da5"><FONT COLOR="white"><B>'+name.upper()+'</B></FONT></TD></TR>']
    for c in t['cols']:
        keys='/'.join(k for k,v in [('PK',c['pk']),('FK',c['fk']),('UK',c['uk'])] if v)
        rows+=['<TR><TD ALIGN="LEFT">'+html.escape(c['name'])+(' <B>'+keys+'</B>' if keys else '')+'</TD><TD ALIGN="LEFT"><FONT COLOR="#576579">'+html.escape(c['type'])+'</FONT></TD></TR>']
    dot+=[name+' [label=<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="7" COLOR="#d6dfe9">'+''.join(rows)+'</TABLE>>];']
for a,b,label,end in rels:dot+=[a.lower()+' -> '+b.lower()+' [label="'+label+' (1 : '+('0..1' if end=='o|' else '1..*' if end=='|{' else '0..*')+')"];']
dot+=['}'];(root/'docs/er-diagram.dot').write_text('\n'.join(dot));subprocess.run(['dot','-Tsvg',str(root/'docs/er-diagram.dot'),'-o',str(root/'docs/er-diagram.svg')],check=True)
# Compact relationship overview for the PDF and overview evidence.
compact=['digraph Overview {','graph [rankdir=LR,bgcolor="white",pad=.25,nodesep=.35,ranksep=.6];','node [shape=box,style="rounded,filled",fillcolor="#edf3fa",color="#c4d4e5",fontname="Arial",fontsize=13,margin=".18,.12"];','edge [color="#8b9daf",arrowsize=.6];']
for t in entities:compact+=[t['name']+' [label="'+t['name'].upper()+'"];']
for a,b,lab,end in rels:compact+=[a.lower()+' -> '+b.lower()+';']
compact+=['}'];(root/'docs/architecture-overview.dot').write_text('\n'.join(compact));subprocess.run(['dot','-Tsvg',str(root/'docs/architecture-overview.dot'),'-o',str(root/'docs/relationship-overview.svg')],check=True)
subprocess.run(['dot','-Tpng','-Gdpi=140',str(root/'docs/architecture-overview.dot'),'-o',str(root/'docs/relationship-overview.png')],check=True)
(root/'docs/diagram-preview.html').write_text('<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px Arial;margin:32px;color:#243448}h1{font-size:28px}img{max-width:100%;height:auto}p{color:#586b80}</style></head><body><h1>Campus Sentinel · Relationship overview</h1><p>15 domain entities. Full attribute/key ER diagram: er-diagram.svg. Minimum child cardinalities are enforced by deferred triggers.</p><img src="relationship-overview.svg" alt="Campus Sentinel entity relationships"></body></html>')
print('Generated 15-table dictionary, Mermaid, DBML and rendered ER diagrams.')
