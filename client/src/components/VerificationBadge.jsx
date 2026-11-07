// Automatic verification and the participant's own report are shown side by side, never merged.
const LABEL = {
  verified: ['bg-green-100 text-green-700', 'Verified'],
  not_detected: ['bg-amber-100 text-amber-800', 'App not detected'],
  unavailable: ['bg-slate-100 text-slate-500', 'No desktop data'],
  not_verifiable: ['bg-slate-100 text-slate-500', 'Self-report only'],
};

export default function VerificationBadge({ status, selfReported }) {
  const [cls, text] = LABEL[status || 'not_verifiable'];
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`rounded-full px-2 py-0.5 ${cls}`}>{text}</span>
      {selfReported !== null && selfReported !== undefined && (
        <span className="text-slate-500">{selfReported ? 'reported complete' : 'reported not complete'}</span>
      )}
    </span>
  );
}
