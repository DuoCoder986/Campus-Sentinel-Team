'use client';
import { useEffect, useState, FormEvent } from 'react';
type Row = Record<string, any>;
const STATES = [
  'REPORTED',
  'VERIFIED',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'REJECTED',
];
async function api(path: string, method = 'GET', data?: unknown) {
  const r = await fetch('/api/' + path, {
    method,
    headers: data ? { 'Content-Type': 'application/json' } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  const v = await r.json();
  if (!r.ok) throw new Error(v.error || 'Request failed');
  return v;
}
function badge(s: string) {
  return <span className={'badge ' + s.toLowerCase()}>{s.replaceAll('_', ' ')}</span>;
}
function date(s: string | null) {
  return s
    ? new Date(s).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
}
function NavIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    Overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    Incidents: (
      <>
        <path d="M7 6h14M7 12h14M7 18h14" />
        <path d="M3 6h.1M3 12h.1M3 18h.1" />
      </>
    ),
    'New report': <path d="M12 4v16M4 12h16" />,
    Knowledge: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    Routes: (
      <>
        <path d="M4 20 20 4M9 4h11v11" />
      </>
    ),
  };
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export default function App() {
  const [user, setUser] = useState<Row | null>(null),
    [ready, setReady] = useState(false),
    [tab, setTab] = useState('Overview'),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [catalogue, setCatalogue] = useState<Row>({ locations: [], categories: [], staff: [] }),
    [incidents, setIncidents] = useState<Row[]>([]),
    [dash, setDash] = useState<Row>({ counts: {}, categories: [] }),
    [status, setStatus] = useState(''),
    [query, setQuery] = useState(''),
    [mine, setMine] = useState(false),
    [selected, setSelected] = useState<Row | null>(null),
    [sops, setSops] = useState<Row[]>([]),
    [searchResults, setSearchResults] = useState<Row[] | null>(null),
    [routeResult, setRouteResult] = useState<Row | null>(null);
  const admin = user?.roles.includes('ADMIN'),
    staff = user?.roles.includes('STAFF');
  useEffect(() => {
    api('auth/me')
      .then(setUser)
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!selected) return;
    const handle = (e: KeyboardEvent) => {
      const dialog = document.querySelector('[role=dialog]');
      if (e.key === 'Escape') {
        setSelected(null);
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,textarea'),
      ).filter((x) => x.offsetParent !== null);
      const first = controls[0],
        last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handle);
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handle);
      document.body.style.overflow = old;
    };
  }, [selected]);
  async function refresh() {
    const [c, i, d, s] = await Promise.all([
      api('catalogue'),
      api('incidents?' + new URLSearchParams({ status, q: query, mine: String(mine) })),
      api('dashboard'),
      api('sops'),
    ]);
    setCatalogue(c);
    setIncidents(i);
    setDash(d);
    setSops(s);
  }
  useEffect(() => {
    if (user) refresh().catch((e) => setError(e.message));
  }, [user, status, mine]); // search is explicitly submitted
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    await run(async () => setSelected(await api('incidents/' + id)));
  }
  async function mutate(path: string, method: string, data?: unknown) {
    await run(async () => {
      await api(path, method, data);
      setNotice('Saved successfully.');
      await refresh();
      if (selected) setSelected(await api('incidents/' + selected.incident_id));
    });
  }
  function vals(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    return Object.fromEntries(new FormData(e.currentTarget));
  }
  function field(label: string, name: string, type = 'text', required = true) {
    return (
      <label>
        {label}
        <input
          name={name}
          type={type}
          step={type === 'number' ? 'any' : undefined}
          required={required}
        />
      </label>
    );
  }
  if (!ready) return <main className="loading">Loading Campus Sentinel…</main>;
  if (!user)
    return (
      <main className="login-shell">
        <section className="login-intro">
          <div className="brand-mark">CS</div>
          <div className="eyebrow">CAMPUS SENTINEL</div>
          <h1>
            A safer campus.
            <br />A coordinated response.
          </h1>
          <p>
            Report once. Bring every team together.
            <br />
            Resolve incidents with context, not guesswork.
          </p>
          <div className="intro-line">
            Relational integrity · Semantic retrieval · Accessible routing
          </div>
        </section>
        <section className="login-card">
          <div className="eyebrow">OPERATIONS PORTAL</div>
          <h2>Welcome back</h2>
          <p className="muted">Sign in with your campus project account.</p>
          {error && (
            <div role="alert" className="alert">
              {error}
            </div>
          )}
          <form
            onSubmit={(e) => {
              const v = vals(e);
              run(async () => {
                await api('auth/login', 'POST', v);
                setUser(await api('auth/me'));
              });
            }}
          >
            {field('Email address', 'email', 'email')}
            {field('Password', 'password', 'password')}
            <button disabled={busy} className="primary">
              {busy ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>
          <p className="small muted">
            Accounts are provisioned by the seed script. Ask your project administrator for access.
          </p>
        </section>
      </main>
    );
  const heading: Row = {
    Overview: ['Operations overview', 'A shared picture. A faster response.'],
    Incidents: ['Incident register', 'Track reports from first signal to resolution.'],
    'New report': ['Report an incident', 'Make the issue visible. Add the context that matters.'],
    Knowledge: ['Knowledge & search', 'Find related incidents and verified response procedures.'],
    Routes: ['Accessible routes', 'Navigate campus using the location graph.'],
  };
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">CS</span>
          <div>
            Campus Sentinel<small>INCIDENT OPERATIONS</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {[
            ['Overview', '◫'],
            ['Incidents', '≡'],
            ['New report', '＋'],
            ['Knowledge', '⌕'],
            ['Routes', '↗'],
          ].map(([t, icon]) => (
            <button
              key={t}
              className={tab === t ? 'nav active' : 'nav'}
              onClick={() => {
                setTab(t);
                setSelected(null);
                setError('');
                setNotice('');
              }}
            >
              <span aria-hidden>
                <NavIcon name={t} />
              </span>
              {t}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="dot" /> CAMPUS RESPONSE
          <p>
            Every report adds context.
            <br />
            Every action leaves a record.
          </p>
        </div>
        <div className="profile">
          <strong>{user.name}</strong>
          <small>{user.roles.join(' · ')}</small>
          <button
            className="link"
            onClick={() =>
              run(async () => {
                await api('auth/logout', 'POST');
                setUser(null);
                setSelected(null);
              })
            }
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <span>
            Workspace <span className="muted">/ {tab}</span>
          </span>
          <span className="small">PostgreSQL · pgvector · Neo4j</span>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">CAMPUS SENTINEL / {tab.toUpperCase()}</div>
              <h1>{heading[tab][0]}</h1>
              <p className="muted">{heading[tab][1]}</p>
            </div>
            {tab !== 'New report' && (
              <button
                className="primary"
                onClick={() => {
                  setTab('New report');
                  setSelected(null);
                }}
              >
                ＋ New report
              </button>
            )}
          </div>
          {error && (
            <div role="alert" className="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                ×
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="success">
              {notice}
            </div>
          )}
          {tab === 'Overview' && (
            <>
              <div className="stats">
                {[
                  ['Open incidents', dash.counts.open_count, 'Awaiting action'],
                  ['Critical', dash.counts.critical_count, 'Highest severity'],
                  ['SLA breached', dash.counts.breached_count, 'Open incidents overdue'],
                  ['Resolved', dash.counts.resolved_count, 'Including closed'],
                ].map(([l, n, s], i) => (
                  <div className={'stat stat-' + i} key={l}>
                    <span>{l}</span>
                    <strong>{n ?? '—'}</strong>
                    <small>{s}</small>
                  </div>
                ))}
              </div>
              <section className="panel">
                <div className="section-head">
                  <div>
                    <h2>Response queue</h2>
                    <p className="small muted">
                      Live priority combines severity, report count and incident age.
                    </p>
                  </div>
                  <button className="link" onClick={() => setTab('Incidents')}>
                    View all incidents →
                  </button>
                </div>
                {incidentTable(
                  incidents
                    .filter((i) => !['CLOSED', 'RESOLVED', 'REJECTED'].includes(i.status))
                    .slice(0, 6),
                )}
              </section>
              <div className="two-col">
                <section className="panel">
                  <h2>Category summary</h2>
                  <p className="small muted">
                    Counts and mean resolution time across all incidents.
                  </p>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Category</th>
                          <th>Incidents</th>
                          <th>Avg. resolution</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dash.categories.map((c: Row) => (
                          <tr key={c.category_name}>
                            <td>{c.category_name}</td>
                            <td>{c.total}</td>
                            <td>
                              {c.average_resolution_hours
                                ? `${c.average_resolution_hours} h`
                                : 'Not yet resolved'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="panel response-guide">
                  <div className="eyebrow">THE RESPONSE WORKFLOW</div>
                  <h2>From signal to solution.</h2>
                  <ol>
                    <li>
                      <b>Report & verify</b>
                      <span>Collect evidence and confirm the issue.</span>
                    </li>
                    <li>
                      <b>Assign & respond</b>
                      <span>One active assignment. Clear ownership.</span>
                    </li>
                    <li>
                      <b>Resolve & close</b>
                      <span>Preserve an auditable status timeline.</span>
                    </li>
                  </ol>
                  <p className="small muted">
                    This is a coursework tool, not an emergency dispatch service.
                  </p>
                </section>
              </div>
            </>
          )}
          {tab === 'Incidents' && (
            <section className="panel">
              <form
                className="filters"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(refresh);
                }}
              >
                <label className="grow">
                  Keyword search
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search title or description…"
                  />
                </label>
                <label>
                  Status
                  <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="">All statuses</option>
                    {STATES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={mine}
                    onChange={(e) => setMine(e.target.checked)}
                  />
                  My reports / work
                </label>
                <button disabled={busy}>Search</button>
              </form>
              <p className="small muted">Showing up to 200 incidents, ordered by live priority.</p>
              {incidentTable(incidents)}
            </section>
          )}
          {tab === 'New report' && (
            <div className="two-col form-layout">
              <section className="panel">
                <form
                  onSubmit={(e) => {
                    const form = e.currentTarget,
                      v = vals(e);
                    const payload = {
                      ...v,
                      location_id: Number(v.location_id),
                      category_id: Number(v.category_id),
                      incident_id: v.incident_id || undefined,
                      latitude: v.latitude === '' ? null : Number(v.latitude),
                      longitude: v.longitude === '' ? null : Number(v.longitude),
                    };
                    run(async () => {
                      const r = await api('reports', 'POST', payload);
                      form.reset();
                      await refresh();
                      setTab('Incidents');
                      setSelected(await api('incidents/' + r.incident_id));
                      setNotice('Report submitted. Your evidence is linked to the incident.');
                    });
                  }}
                >
                  {field('Incident title', 'title')}
                  <div className="two-col">
                    <label>
                      Location
                      <select required name="location_id">
                        <option value="">Choose a location</option>
                        {catalogue.locations.map((l: Row) => (
                          <option key={l.location_id} value={l.location_id}>
                            {l.building_name} · {l.location_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Category
                      <select required name="category_id">
                        <option value="">Choose a category</option>
                        {catalogue.categories.map((c: Row) => (
                          <option key={c.category_id} value={c.category_id}>
                            {c.category_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Description
                    <textarea
                      required
                      name="description"
                      minLength={10}
                      maxLength={10000}
                      rows={5}
                      placeholder="What happened? Include landmarks, impact and any immediate hazards."
                    />
                  </label>
                  <div className="two-col">
                    <label>
                      Severity
                      <select name="severity">
                        {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    {field('Evidence URL (optional)', 'evidence_url', 'url', false)}
                  </div>
                  <label>
                    Attach to existing (optional)
                    <select name="incident_id">
                      <option value="">Create a new incident</option>
                      {incidents
                        .filter((i) => !['CLOSED', 'RESOLVED', 'REJECTED'].includes(i.status))
                        .map((i) => (
                          <option key={i.incident_id} value={i.incident_id}>
                            {i.title} · {i.location_name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="two-col">
                    {field('Latitude (optional)', 'latitude', 'number', false)}
                    {field('Longitude (optional)', 'longitude', 'number', false)}
                  </div>
                  <button className="primary" disabled={busy}>
                    {busy ? 'Embedding & saving…' : 'Submit incident report →'}
                  </button>
                </form>
              </section>
              <section className="panel report-help">
                <div className="eyebrow">BETTER CONTEXT, BETTER RESPONSE</div>
                <h2>Make your report useful.</h2>
                <p>
                  Describe the issue in plain language. The system checks similar reports at the
                  same location and category before creating an incident.
                </p>
                <p>
                  If a possible duplicate is found, review it in the incident register, then
                  explicitly attach your report to it. Reports are never silently merged.
                </p>
                <hr />
                <p className="small muted">
                  Do not upload personal, medical, or confidential information. Evidence is linked
                  by URL; files are not uploaded by this application.
                </p>
              </section>
            </div>
          )}
          {tab === 'Knowledge' && (
            <>
              <section className="panel">
                <form
                  className="filters"
                  onSubmit={(e) => {
                    const v = vals(e);
                    run(async () => setSearchResults(await api('search', 'POST', v)));
                  }}
                >
                  <label className="grow">
                    Search in natural language
                    <input
                      required
                      minLength={3}
                      name="query"
                      placeholder="e.g. water leaking near electrical equipment"
                    />
                  </label>
                  <label>
                    Search in
                    <select name="kind">
                      <option value="sops">Verified SOPs</option>
                      <option value="incidents">Incident reports</option>
                    </select>
                  </label>
                  <button className="primary" disabled={busy}>
                    Find matches
                  </button>
                </form>
                {searchResults !== null && (
                  <div className="results">
                    {!searchResults.length && (
                      <p className="muted">
                        No matching records. Import a verified SOP or add incident reports first.
                      </p>
                    )}
                    {searchResults.map((r) => (
                      <article className="search-result" key={r.chunk_id || r.incident_id}>
                        <div className="section-head">
                          <strong>{r.document_title || r.title}</strong>
                          <span className="small muted">
                            Cosine similarity: {Number(r.similarity).toFixed(3)}
                          </span>
                        </div>
                        {r.chunk_content && <p>{r.chunk_content}</p>}
                        {r.source_url ? (
                          <a href={r.source_url} target="_blank" rel="noreferrer">
                            View source ↗
                          </a>
                        ) : (
                          <button className="link" onClick={() => open(r.incident_id)}>
                            Open incident →
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
              <section className="panel">
                <h2>Response library</h2>
                <p className="small muted">
                  Only verified documents appear in semantic results. Similarity is not a confidence
                  score.
                </p>
                {sops.length ? (
                  sops.map((d) => (
                    <div className="library-row" key={d.document_id}>
                      <div>
                        <strong>{d.document_title}</strong>
                        <small>
                          {d.category_name} · v{d.document_version} · {d.chunks} chunks ·{' '}
                          {d.is_verified ? 'Verified' : 'Draft'}
                        </small>
                      </div>
                      <a href={d.source_url} target="_blank" rel="noreferrer">
                        Source ↗
                      </a>
                      {admin && !d.is_verified && (
                        <button
                          onClick={() => {
                            if (confirm('Delete this draft and its chunks?'))
                              mutate('sops/' + d.document_id, 'DELETE');
                          }}
                        >
                          Delete draft
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="empty">No documents in the library.</p>
                )}
              </section>
              {admin && (
                <section className="panel">
                  <h2>Import an SOP</h2>
                  <form
                    onSubmit={(e) => {
                      const form = e.currentTarget,
                        v = vals(e);
                      run(async () => {
                        await api('sops', 'POST', {
                          ...v,
                          category_id: Number(v.category_id),
                          version: Number(v.version),
                          is_verified: v.is_verified === 'on',
                        });
                        form.reset();
                        await refresh();
                        setNotice('SOP imported and embedded.');
                      });
                    }}
                  >
                    <div className="two-col">
                      {field('Document title', 'title')}
                      <label>
                        Category
                        <select required name="category_id">
                          {catalogue.categories.map((c: Row) => (
                            <option key={c.category_id} value={c.category_id}>
                              {c.category_name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="two-col">
                      {field('Source URL', 'source_url', 'url')}
                      {field('Version', 'version', 'number')}
                    </div>
                    <label>
                      Procedure text
                      <textarea required name="content" minLength={30} rows={5} />
                    </label>
                    <label className="check">
                      <input type="checkbox" name="is_verified" />
                      Reviewed and verified by administrator
                    </label>
                    <button className="primary" disabled={busy}>
                      Import & embed
                    </button>
                  </form>
                </section>
              )}
            </>
          )}
          {tab === 'Routes' && (
            <div className="two-col">
              <section className="panel">
                <h2>Find an accessible route</h2>
                <p className="muted">Routes exclude inaccessible locations and connections.</p>
                <form
                  onSubmit={(e) => {
                    const v = vals(e);
                    run(async () =>
                      setRouteResult(
                        await api('routes?' + new URLSearchParams(v as Record<string, string>)),
                      ),
                    );
                  }}
                >
                  {['from', 'to'].map((n) => (
                    <label key={n}>
                      {n === 'from' ? 'Starting point' : 'Destination'}
                      <select name={n}>
                        {catalogue.locations.map((l: Row) => (
                          <option value={l.neo4j_node_id} key={l.location_id}>
                            {l.building_name} · {l.location_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <button disabled={busy} className="primary">
                    Find route ↗
                  </button>
                </form>
              </section>
              <section className="panel">
                <div className="eyebrow">NEO4J LOCATION GRAPH</div>
                {routeResult ? (
                  <>
                    <h2>{Number(routeResult.meters).toFixed(0)} metres</h2>
                    <ol className="route-steps">
                      {routeResult.steps.map((s: Row, n: number) => (
                        <li key={n}>
                          {s.name}
                          <small>{s.node_id}</small>
                        </li>
                      ))}
                    </ol>
                    <p className="small muted">
                      Shortest distance among accessible paths of up to 12 segments. Demo paths are
                      not a live campus map.
                    </p>
                  </>
                ) : (
                  <>
                    <h2>A route that works for you.</h2>
                    <p className="muted">
                      Choose your start and destination to explore accessible connections on the
                      seeded campus graph.
                    </p>
                  </>
                )}
              </section>
            </div>
          )}
        </div>
      </main>
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section
            className="detail"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSelected(null);
            }}
          >
            <button
              autoFocus
              className="close"
              aria-label="Close incident"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
            <div className="eyebrow">INCIDENT DETAIL</div>
            <h2 id="detail-title">{selected.title}</h2>
            <div className="tags">
              {badge(selected.status)}
              {badge(selected.severity)}
              {badge(selected.sla_state)}
            </div>
            <p>{selected.description}</p>
            <div className="meta">
              <span>
                {selected.building_name} · {selected.location_name}
              </span>
              <span>{selected.category_name}</span>
              <span>Priority {Number(selected.live_priority).toFixed(1)}</span>
              <span>Reported {date(selected.created_at)}</span>
              <span>Response due {date(selected.response_due_at)}</span>
              <span>Resolution due {date(selected.resolution_due_at)}</span>
            </div>
            <h3>Actions</h3>
            {admin && (
              <>
                <div className="action-row">
                  {selected.status === 'REPORTED' && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() =>
                          mutate('incidents/' + selected.incident_id + '/status', 'PATCH', {
                            status: 'VERIFIED',
                            reason: 'Administrator verified report',
                          })
                        }
                      >
                        Verify incident
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          const reason = prompt('Reason for rejecting this incident');
                          if (reason)
                            mutate('incidents/' + selected.incident_id + '/status', 'PATCH', {
                              status: 'REJECTED',
                              reason,
                            });
                        }}
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {selected.status === 'RESOLVED' && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        mutate('incidents/' + selected.incident_id + '/status', 'PATCH', {
                          status: 'CLOSED',
                          reason: 'Administrator confirmed resolution',
                        })
                      }
                    >
                      Close incident
                    </button>
                  )}
                </div>
                {selected.status === 'VERIFIED' && (
                  <form
                    className="filters"
                    onSubmit={(e) => {
                      const v = vals(e);
                      mutate('incidents/' + selected.incident_id + '/assign', 'POST', v);
                    }}
                  >
                    <label className="grow">
                      Assign staff
                      <select name="staff_id" required>
                        {catalogue.staff.map((s: Row) => (
                          <option key={s.user_id} value={s.user_id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button disabled={busy}>Assign</button>
                  </form>
                )}
              </>
            )}
            {selected.assignments.map((x: Row) => (
              <div className="assignment" key={x.assignment_id}>
                <span>
                  {x.staff_name} · {x.assignment_status}
                </span>
                {staff &&
                  x.assigned_staff_id === user.user_id &&
                  ['PENDING', 'ACCEPTED'].includes(x.assignment_status) && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        mutate('assignments/' + x.assignment_id, 'PATCH', {
                          action: x.assignment_status === 'PENDING' ? 'accept' : 'complete',
                        })
                      }
                    >
                      {x.assignment_status === 'PENDING' ? 'Accept & start' : 'Mark resolved'}
                    </button>
                  )}
              </div>
            ))}
            {(admin ||
              (staff &&
                selected.assignments.some(
                  (x: Row) =>
                    x.assigned_staff_id === user.user_id &&
                    ['PENDING', 'ACCEPTED'].includes(x.assignment_status),
                ))) && (
              <form
                onSubmit={(e) => {
                  const v = vals(e);
                  mutate('incidents/' + selected.incident_id + '/updates', 'POST', v);
                }}
              >
                <label>
                  Add progress note
                  <textarea required name="message" minLength={3} rows={2} />
                </label>
                {field('Evidence URL (optional)', 'evidence_url', 'url', false)}
                <button disabled={busy}>Post update</button>
              </form>
            )}
            <h3>Status timeline</h3>
            <ol className="timeline">
              {selected.history.map((h: Row, n: number) => (
                <li key={n}>
                  <strong>{h.new_status.replaceAll('_', ' ')}</strong>
                  <small>
                    {date(h.changed_at)} · {h.change_reason}
                  </small>
                </li>
              ))}
            </ol>
            <h3>Progress updates</h3>
            {selected.updates.length ? (
              selected.updates.map((u: Row) => (
                <article key={u.update_id} className="note">
                  <small>
                    {u.author_name} · {date(u.created_at)}
                  </small>
                  <p>{u.update_message}</p>
                  {u.evidence_url && (
                    <a href={u.evidence_url} target="_blank" rel="noreferrer">
                      Evidence ↗
                    </a>
                  )}
                </article>
              ))
            ) : (
              <p className="small muted">No updates yet.</p>
            )}
            <h3>Reports visible to you</h3>
            {selected.reports.map((r: Row) => (
              <article className="note" key={r.report_id}>
                <small>{date(r.reported_at)}</small>
                <p>{r.report_text}</p>
                {r.evidence_url && (
                  <a href={r.evidence_url} target="_blank" rel="noreferrer">
                    Evidence ↗
                  </a>
                )}
                {(admin || r.reporter_id === user.user_id) && (
                  <button
                    disabled={busy}
                    className="link danger"
                    onClick={() => {
                      if (confirm('Withdraw this report? The last report cannot be deleted.'))
                        mutate('reports/' + r.report_id, 'DELETE');
                    }}
                  >
                    Withdraw report
                  </button>
                )}
              </article>
            ))}
            <p className="small muted">Incident ID: {selected.incident_id}</p>
            {error && (
              <div role="alert" className="alert">
                {error}
              </div>
            )}
            {notice && (
              <div role="status" className="success">
                {notice}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
  function incidentTable(rows: Row[]) {
    return rows.length ? (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Incident / location</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Priority</th>
              <th>SLA</th>
              <th>Reports</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.incident_id}>
                <td>
                  <button className="table-link" onClick={() => open(i.incident_id)}>
                    {i.title}
                  </button>
                  <small>
                    {i.building_name} · {i.location_name}
                  </small>
                </td>
                <td>{badge(i.severity)}</td>
                <td>{badge(i.status)}</td>
                <td className="numeric">{Number(i.live_priority).toFixed(1)}</td>
                <td>{badge(i.sla_state)}</td>
                <td>{i.report_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="empty">No incidents match this view. Submit a report to get started.</div>
    );
  }
}
