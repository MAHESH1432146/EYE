import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../../services/api.js';
import Spinner from '../../components/Spinner.jsx';
import Alert from '../../components/Alert.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';

const TABS = [['users', 'Users & privacy'], ['incomplete', 'Incomplete sessions'], ['audit', 'Audit log']];

function Pager({ p, setPage }) {
  return (
    <div className="flex items-center justify-between text-sm text-slate-500">
      <span>{p.total} records</span>
      <div className="flex gap-2">
        <button className="btn-ghost" disabled={p.page <= 1} onClick={() => setPage(p.page - 1)}>Previous</button>
        <button className="btn-ghost" disabled={p.page >= p.pages} onClick={() => setPage(p.page + 1)}>Next</button>
      </div>
    </div>
  );
}

function Users({ setError, setNotice }) {
  const [rows, setRows] = useState(null);
  const [pg, setPg] = useState({ page: 1, pages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    api.get('/admin/users', { params: { search: search || undefined, role: role || undefined, page, limit: 15 } })
      .then((r) => { setRows(r.data.data); setPg(r.data.pagination); })
      .catch((e) => setError(errorMessage(e)));
  }, [search, role, page, setError]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const act = async (fn, msg) => {
    setError(''); setNotice('');
    try { await fn(); setNotice(msg); load(); } catch (e) { setError(errorMessage(e)); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <input className="input w-64" placeholder="Search name, email or ID" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select className="input w-auto" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
          <option value="">All roles</option><option value="participant">Participants</option><option value="researcher">Researchers</option>
        </select>
      </div>
      <div className="card overflow-x-auto">
        {!rows ? <Spinner /> : (
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase text-slate-500">
              <tr>{['Name', 'Email', 'Role', 'ID', 'Status', ''].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((u) => (
                <tr key={u._id}>
                  <td className="px-4 py-3">{u.name}</td>
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3 capitalize">{u.role}</td>
                  <td className="px-4 py-3 font-mono text-xs">{u.participantCode || '–'}</td>
                  <td className="px-4 py-3">{u.anonymizedAt ? 'Anonymized' : u.active ? 'Active' : 'Deactivated'}</td>
                  <td className="space-x-1 px-4 py-3 text-right">
                    {!u.anonymizedAt && (
                      <button className="btn-ghost py-1" onClick={() => act(() => api.patch(`/admin/users/${u._id}`, { active: !u.active }), u.active ? 'User deactivated' : 'User activated')}>
                        {u.active ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                    {u.role === 'participant' && !u.anonymizedAt && (
                      <button className="btn-ghost py-1 text-amber-700" onClick={() => window.confirm('Remove name, email, age, gender and education? Results stay linked by ID. This cannot be undone.') && act(() => api.post(`/admin/participants/${u._id}/anonymize`, { confirm: 'ANONYMIZE' }), 'Participant anonymized')}>
                        Anonymize
                      </button>
                    )}
                    {u.role === 'participant' && (
                      <button className="btn-ghost py-1 text-red-600" onClick={() => {
                        const c = window.prompt(`Permanently delete ALL data for ${u.participantCode}? Type the participant ID to confirm.`);
                        if (c) act(() => api.delete(`/admin/participants/${u._id}`, { data: { confirm: c } }), 'Participant data deleted');
                      }}>Delete data</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pager p={pg} setPage={setPage} />
    </div>
  );
}

function Incomplete({ setError }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get('/admin/incomplete').then((r) => setRows(r.data.data)).catch((e) => setError(errorMessage(e))); }, [setError]);
  if (!rows) return <Spinner />;
  return (
    <div className="card overflow-x-auto">
      {rows.length === 0 ? <p className="p-6 text-sm text-slate-500">No incomplete sessions.</p> : (
        <table className="w-full text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500"><tr>{['Experiment', 'Participant', 'Status', 'Progress', 'Last activity'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
          <tbody className="divide-y">
            {rows.map((a) => (
              <tr key={a._id}>
                <td className="px-4 py-3">{a.experimentTitle}</td>
                <td className="px-4 py-3">{a.participantId?.name} <span className="font-mono text-xs text-slate-400">{a.participantId?.participantCode}</span></td>
                <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                <td className="px-4 py-3 text-xs">{Object.keys(a.progress || {}).filter((k) => a.progress[k]).join(', ') || 'not started'}</td>
                <td className="px-4 py-3">{new Date(a.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Audit({ setError }) {
  const [rows, setRows] = useState(null);
  const [pg, setPg] = useState({ page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  useEffect(() => {
    api.get('/admin/audit-logs', { params: { page, action: action || undefined } })
      .then((r) => { setRows(r.data.data); setPg(r.data.pagination); })
      .catch((e) => setError(errorMessage(e)));
  }, [page, action, setError]);
  return (
    <div className="space-y-3">
      <input className="input w-64" placeholder="Filter by action prefix, e.g. experiment." value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
      <div className="card overflow-x-auto">
        {!rows ? <Spinner /> : (
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase text-slate-500"><tr>{['Time', 'Actor', 'Action', 'Target', 'IP'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
            <tbody className="divide-y">
              {rows.map((l) => (
                <tr key={l._id}>
                  <td className="whitespace-nowrap px-4 py-2">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2">{l.actorId?.name || '–'}</td>
                  <td className="px-4 py-2 font-mono text-xs">{l.action}</td>
                  <td className="px-4 py-2 text-xs">{l.targetType} {l.targetId}</td>
                  <td className="px-4 py-2 text-xs">{l.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pager p={pg} setPage={setPage} />
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState('users');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Administration</h1>
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setError(''); setNotice(''); }}
            className={`px-4 py-2 text-sm font-medium ${tab === k ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500'}`}>{l}</button>
        ))}
      </div>
      <Alert>{error}</Alert>
      <Alert type="success">{notice}</Alert>
      {tab === 'users' && <Users setError={setError} setNotice={setNotice} />}
      {tab === 'incomplete' && <Incomplete setError={setError} />}
      {tab === 'audit' && <Audit setError={setError} />}
    </div>
  );
}
