import { Loader2 } from 'lucide-react';

export default function Spinner({ full }) {
  return (
    <div className={`flex items-center justify-center ${full ? 'min-h-screen' : 'py-12'}`}>
      <Loader2 className="h-6 w-6 animate-spin text-blue-600" aria-label="Loading" />
    </div>
  );
}
