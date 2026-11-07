import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute, { homeFor } from './components/ProtectedRoute.jsx';
import { useAuth } from './context/AuthContext.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import Login from './pages/auth/Login.jsx';
import Register from './pages/auth/Register.jsx';
import ForgotPassword from './pages/auth/ForgotPassword.jsx';
import ResetPassword from './pages/auth/ResetPassword.jsx';
import ParticipantDashboard from './pages/participant/ParticipantDashboard.jsx';
import Survey from './pages/participant/Survey.jsx';
import ExperimentRun from './pages/participant/ExperimentRun.jsx';
import ResearcherDashboard from './pages/researcher/ResearcherDashboard.jsx';
import Participants from './pages/researcher/Participants.jsx';
import Experiments from './pages/experiments/Experiments.jsx';
import ExperimentDetail from './pages/experiments/ExperimentDetail.jsx';
import EyeTracking from './pages/analytics/EyeTracking.jsx';
import Heatmaps from './pages/analytics/Heatmaps.jsx';
import ScanPaths from './pages/analytics/ScanPaths.jsx';
import SusAnalysis from './pages/analytics/SusAnalysis.jsx';
import OSComparison from './pages/analytics/OSComparison.jsx';
import TaskReports from './pages/analytics/TaskReports.jsx';
import Statistics from './pages/analytics/Statistics.jsx';
import Insights from './pages/analytics/Insights.jsx';
import LiveMonitor from './pages/analytics/LiveMonitor.jsx';
import Reports from './pages/reports/Reports.jsx';
import Admin from './pages/researcher/Admin.jsx';
import Spinner from './components/Spinner.jsx';

function Root() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner full />;
  return <Navigate to={user ? homeFor(user) : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Root />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<ProtectedRoute role="participant" />}>
        <Route element={<AppLayout />}>
          <Route path="/participant" element={<ParticipantDashboard />} />
          <Route path="/participant/survey" element={<Survey />} />
          <Route path="/participant/experiments/:id" element={<ExperimentRun />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute role="researcher" />}>
        <Route element={<AppLayout />}>
          <Route path="/researcher" element={<ResearcherDashboard />} />
          <Route path="/researcher/participants" element={<Participants />} />
          <Route path="/researcher/experiments" element={<Experiments />} />
          <Route path="/researcher/experiments/:id" element={<ExperimentDetail />} />
          <Route path="/researcher/eye-tracking" element={<EyeTracking />} />
          <Route path="/researcher/heatmaps" element={<Heatmaps />} />
          <Route path="/researcher/scan-paths" element={<ScanPaths />} />
          <Route path="/researcher/sus" element={<SusAnalysis />} />
          <Route path="/researcher/os-comparison" element={<OSComparison />} />
          <Route path="/researcher/task-report" element={<TaskReports />} />
          <Route path="/researcher/statistics" element={<Statistics />} />
          <Route path="/researcher/insights" element={<Insights />} />
          <Route path="/researcher/live" element={<LiveMonitor />} />
          <Route path="/researcher/reports" element={<Reports />} />
          <Route path="/researcher/settings" element={<Admin />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
