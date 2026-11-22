import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Layout from './components/Layout';
import { Spinner, Empty } from './components/ui';
import { ShieldOff } from 'lucide-react';
import Login from './pages/Login';
import { ForgotPassword, ResetPassword } from './pages/PasswordReset';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const Employees = lazy(() => import('./pages/Employees'));
const EmployeeProfile = lazy(() => import('./pages/EmployeeProfile'));
const HR = lazy(() => import('./pages/HR'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Finance = lazy(() => import('./pages/Finance'));
const Purchasing = lazy(() => import('./pages/Purchasing'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Reports = lazy(() => import('./pages/Reports'));
const Documents = lazy(() => import('./pages/Documents'));
const Meetings = lazy(() => import('./pages/Meetings'));
const Messages = lazy(() => import('./pages/Messages'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Audit = lazy(() => import('./pages/Audit'));
const Settings = lazy(() => import('./pages/Settings'));
const Account = lazy(() => import('./pages/Account'));

function Guard({ perm, children }) {
  const { can } = useAuth();
  if (perm && !can(...perm)) return <div className="card" style={{ marginTop: 40 }}><Empty icon={ShieldOff}>ليست لديك صلاحية الوصول إلى هذه الصفحة</Empty></div>;
  return children;
}

export default function App() {
  const { loading, user } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!user) {
    return (
      <Routes>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<Login next={loc.pathname} />} />
      </Routes>
    );
  }
  if (user.must_change_password && loc.pathname !== '/account') return <Navigate to="/account?force=1" replace />;
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Guard perm={['dashboard.view']}><Dashboard /></Guard>} />
          <Route path="projects" element={<Guard perm={['projects.view', 'projects.view_all']}><Projects /></Guard>} />
          <Route path="projects/:id" element={<Guard perm={['projects.view', 'projects.view_all']}><ProjectDetail /></Guard>} />
          <Route path="employees" element={<Guard perm={['employees.view']}><Employees /></Guard>} />
          <Route path="employees/:id" element={<Guard perm={['employees.view']}><EmployeeProfile /></Guard>} />
          <Route path="profile" element={<EmployeeProfile self />} />
          <Route path="hr" element={<Guard perm={['hr.view', 'leaves.approve']}><HR /></Guard>} />
          <Route path="attendance" element={<Guard perm={['attendance.self', 'attendance.view_all']}><Attendance /></Guard>} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="finance" element={<Guard perm={['finance.view', 'finance.request']}><Finance /></Guard>} />
          <Route path="purchasing" element={<Guard perm={['purchasing.view']}><Purchasing /></Guard>} />
          <Route path="inventory" element={<Guard perm={['inventory.view']}><Inventory /></Guard>} />
          <Route path="reports" element={<Guard perm={['reports.view']}><Reports /></Guard>} />
          <Route path="documents" element={<Guard perm={['documents.view']}><Documents /></Guard>} />
          <Route path="meetings" element={<Guard perm={['meetings.view']}><Meetings /></Guard>} />
          <Route path="messages" element={<Guard perm={['messages.use']}><Messages /></Guard>} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="audit" element={<Guard perm={['audit.view']}><Audit /></Guard>} />
          <Route path="settings" element={<Guard perm={['settings.manage', 'users.manage', 'roles.manage']}><Settings /></Guard>} />
          <Route path="account" element={<Account />} />
          <Route path="*" element={<Empty>الصفحة غير موجودة</Empty>} />
        </Route>
      </Routes>
    </Suspense>
  );
}
