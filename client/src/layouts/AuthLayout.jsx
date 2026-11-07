import { Link } from 'react-router-dom';
import { Eye } from 'lucide-react';

// Decorative gaze-trace graphic: fixation circles joined by a scan path.
function GazeArt() {
  const pts = [[60, 220], [150, 120], [260, 180], [340, 70], [420, 150]];
  return (
    <svg viewBox="0 0 480 280" className="w-full max-w-md" aria-hidden="true">
      <defs>
        <radialGradient id="heat">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
        </radialGradient>
      </defs>
      {pts.map(([x, y], i) => (
        <circle key={`h${i}`} cx={x} cy={y} r={50 - i * 4} fill="url(#heat)" />
      ))}
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#c4b5fd" strokeWidth="2" strokeDasharray="5 5" />
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={11 + i * 1.5} fill="#7c3aed" stroke="#fff" strokeWidth="2" />
          <text x={x} y={y + 4} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="600">{i + 1}</text>
        </g>
      ))}
    </svg>
  );
}

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 p-12 text-white lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Eye className="h-6 w-6 text-violet-300" /> Force of Habit
        </div>
        <div>
          <GazeArt />
          <h2 className="mt-8 text-3xl font-semibold leading-tight">
            Comparing the GUIs of Windows 11, macOS and Linux with eye-tracking.
          </h2>
          <p className="mt-3 max-w-md text-sm text-slate-300">
            A research platform for visual-search experiments, webcam gaze analysis and SUS usability scoring. Webcam
            gaze is an approximation of dedicated eye-tracking hardware.
          </p>
        </div>
        <p className="text-xs text-slate-400">Inspired by "The Force of Habit" (IEEE).</p>
      </aside>
      <main className="flex items-center justify-center p-6">
        <div className="card w-full max-w-md p-8">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export const AuthLink = ({ to, children }) => (
  <Link to={to} className="font-medium text-blue-600 hover:underline">
    {children}
  </Link>
);
