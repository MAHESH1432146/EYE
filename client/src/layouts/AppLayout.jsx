import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Activity, BarChart3, ChevronsLeft, Lightbulb, ChevronsRight, ClipboardCheck, FileText, Settings, Sigma, Eye, FlaskConical, Flame, Route, ScanEye, LayoutDashboard, LogOut, Moon, Sun, Users, ClipboardList } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const NAV = {
  researcher: [
    { to: '/researcher', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/researcher/participants', label: 'Participants', icon: Users },
    { to: '/researcher/experiments', label: 'Experiments & Tasks', icon: FlaskConical },
    { to: '/researcher/eye-tracking', label: 'Eye Tracking', icon: ScanEye },
    { to: '/researcher/live', label: 'Live Monitor', icon: Activity },
    { to: '/researcher/insights', label: 'OS Suggestions', icon: Lightbulb },
    { to: '/researcher/heatmaps', label: 'Heatmaps', icon: Flame },
    { to: '/researcher/scan-paths', label: 'Scan Paths', icon: Route },
    { to: '/researcher/sus', label: 'SUS Analysis', icon: ClipboardCheck },
    { to: '/researcher/os-comparison', label: 'OS Comparison', icon: BarChart3 },
    { to: '/researcher/task-report', label: 'Task Reports', icon: ClipboardList },
    { to: '/researcher/statistics', label: 'Statistical Analysis', icon: Sigma },
    { to: '/researcher/reports', label: 'Reports', icon: FileText },
    { to: '/researcher/settings', label: 'Settings', icon: Settings },
  ],
  participant: [
    { to: '/participant', label: 'My dashboard', icon: LayoutDashboard, end: true },
    { to: '/participant/survey', label: 'Profile survey', icon: ClipboardList },
  ],
};

function Breadcrumbs() {
  const parts = useLocation().pathname.split('/').filter(Boolean);
  return (
    <nav className="text-sm text-slate-500" aria-label="Breadcrumb">
      {parts.map((p, i) => (
        <span key={i} className={i === parts.length - 1 ? 'font-medium text-slate-800 dark:text-slate-100' : ''}>
          {i > 0 && ' / '}
          {p.charAt(0).toUpperCase() + p.slice(1)}
        </span>
      ))}
    </nav>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('foh_dark') === '1');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('foh_dark', dark ? '1' : '0');
  }, [dark]);

  return (
    <div className="flex min-h-screen">
      <aside className={`${collapsed ? 'w-16' : 'w-60'} flex shrink-0 flex-col bg-navy-900 text-slate-200 transition-all`}>
        <div className="flex h-14 items-center gap-2 px-4 font-semibold text-white">
          <Eye className="h-5 w-5 shrink-0 text-violet-300" />
          {!collapsed && 'Force of Habit'}
        </div>
        <nav className="flex-1 space-y-1 px-2 py-3">
          {NAV[user.role].map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-navy-700'}`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && label}
            </NavLink>
          ))}
        </nav>
        <button onClick={() => setCollapsed((c) => !c)} className="m-2 flex items-center justify-center rounded-lg p-2 hover:bg-navy-700" aria-label="Toggle sidebar">
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
          <Breadcrumbs />
          <div className="flex items-center gap-2">
            <button className="btn-ghost p-2" onClick={() => setDark((d) => !d)} aria-label="Toggle dark mode">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="hidden text-right text-xs sm:block">
              <div className="font-medium">{user.name}</div>
              <div className="capitalize text-slate-500">{user.role}{user.participantCode ? ` · ${user.participantCode}` : ''}</div>
            </div>
            <button className="btn-ghost p-2" onClick={logout} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
