import { AlertCircle, CheckCircle2 } from 'lucide-react';

export default function Alert({ type = 'error', children }) {
  if (!children) return null;
  const ok = type === 'success';
  const Icon = ok ? CheckCircle2 : AlertCircle;
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
        ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'
      }`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
