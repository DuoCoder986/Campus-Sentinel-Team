-- Run against a disposable demonstration database. Changes below roll back.
-- JOIN + GROUP BY + HAVING + aggregate + ORDER BY
SELECT c.category_name,count(*) AS open_incidents FROM incident i JOIN incident_category c USING(category_id)
WHERE i.status NOT IN ('RESOLVED','CLOSED','REJECTED') GROUP BY c.category_name HAVING count(*)>=1 ORDER BY open_incidents DESC;
-- Correlated subquery: staff workload, including idle staff.
SELECT u.name,(SELECT count(*) FROM assignment a WHERE a.assigned_staff_id=u.user_id AND a.assignment_status IN ('PENDING','ACCEPTED')) AS active_jobs
FROM "user" u WHERE EXISTS(SELECT 1 FROM user_role ur JOIN role r USING(role_id) WHERE ur.user_id=u.user_id AND r.role_name='STAFF') ORDER BY active_jobs DESC;
-- View and aggregate: SLA performance.
SELECT sla_state,count(*),round(avg(live_priority),2) AS average_priority FROM incident_dashboard GROUP BY sla_state ORDER BY count(*) DESC;
-- Full-text search, uses GIN expression index.
SELECT incident_id,title FROM incident WHERE to_tsvector('english',title||' '||description) @@ plainto_tsquery('english','water leak');
-- B-tree ordering and query plan. Tiny demo tables may legitimately choose a sequential scan.
EXPLAIN ANALYZE SELECT incident_id FROM incident WHERE status='REPORTED' ORDER BY priority_score DESC;
-- DDL + DML: isolated temporary table; no operational records destroyed.
BEGIN;
CREATE TEMP TABLE demo_work_note(note_id int PRIMARY KEY, note text NOT NULL);
ALTER TABLE demo_work_note ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
INSERT INTO demo_work_note(note_id,note) VALUES(1,'Inspection scheduled');
UPDATE demo_work_note SET note='Inspection completed' WHERE note_id=1;
SELECT * FROM demo_work_note;
DELETE FROM demo_work_note WHERE note_id=1;
DROP TABLE demo_work_note;
ROLLBACK;
-- Real application INSERT: report+embedding transaction; UPDATE: accept/resolve;
-- DELETE: withdraw a non-last report or remove a draft SOP (see API / demo guide).
-- pgvector cosine retrieval without supplying an artificial constant query vector.
SELECT d.document_title,c.chunk_content,1-(c.embedding <=> q.embedding) AS similarity
FROM sop_chunk c JOIN sop_document d USING(document_id)
CROSS JOIN (SELECT embedding FROM sop_chunk ORDER BY chunk_id LIMIT 1) q
WHERE d.is_verified ORDER BY c.embedding <=> q.embedding LIMIT 5;
