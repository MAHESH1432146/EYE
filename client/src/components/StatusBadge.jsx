const STYLES = {
  draft: 'bg-slate-100 text-slate-700',
  active: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-800',
  completed: 'bg-green-100 text-green-700',
  archived: 'bg-slate-200 text-slate-500',
  assigned: 'bg-slate-100 text-slate-700',
  reopened: 'bg-amber-100 text-amber-800',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STYLES[status] || STYLES.draft}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
