import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import api, { errorMessage } from '../../services/api.js';
import Spinner from '../../components/Spinner.jsx';
import Alert from '../../components/Alert.jsx';

export default function Participants() {
  const [rows, setRows] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [primaryOS, setPrimaryOS] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(null);
    const t = setTimeout(() => {
      api
        .get('/participants', { params: { search: search || undefined, primaryOS: primaryOS || undefined, page, limit: 15 } })
        .then((r) => {
          setRows(r.data.data);
          setPagination(r.data.pagination);
          setError('');
        })
        .catch((e) => setError(errorMessage(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [search, primaryOS, page]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Participants</h1>
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Search name, email or ID" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="input w-auto" value={primaryOS} onChange={(e) => { setPrimaryOS(e.target.value); setPage(1); }}>
          <option value="">All primary OS</option>
          <option value="windows">Windows</option>
          <option value="macos">macOS</option>
          <option value="linux">Linux</option>
        </select>
      </div>
      <Alert>{error}</Alert>
      <div className="card overflow-x-auto">
        {!rows ? <Spinner /> : rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No participants found.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase text-slate-500">
              <tr>{['ID', 'Name', 'Email', 'Primary OS', 'Survey', 'Registered'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((u) => (
                <tr key={u._id}>
                  <td className="px-4 py-3 font-mono">{u.participantCode}</td>
                  <td className="px-4 py-3">{u.name}</td>
                  <td className="px-4 py-3">{u.email}</td>
                  <td className="px-4 py-3 capitalize">{u.profile?.primaryOS || '—'}</td>
                  <td className="px-4 py-3">{u.profile?.surveyCompleted ? 'Completed' : 'Pending'}</td>
                  <td className="px-4 py-3">{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{pagination.total} participants</span>
        <div className="flex gap-2">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <button className="btn-ghost" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
