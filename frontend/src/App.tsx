import { useState, type ReactNode } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { ROLE_LABEL } from './format';
import type { Role } from './types';
import { Loading } from './ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Centers from './pages/Centers';
import Users from './pages/Users';
import Groups from './pages/Groups';
import GroupDetailPage from './pages/GroupDetail';
import Schedule from './pages/Schedule';
import Attendance from './pages/Attendance';
import Payments from './pages/Payments';
import StudentProfile from './pages/StudentProfile';
import MyProfile from './pages/MyProfile';
import Account from './pages/Account';

const NAV: Record<Role, Array<{ to: string; label: string }>> = {
  super_admin: [
    { to: '/', label: 'Bosh sahifa' },
    { to: '/centers', label: "O'quv markazlar" },
  ],
  admin: [
    { to: '/', label: 'Bosh sahifa' },
    { to: '/students', label: "O'quvchilar" },
    { to: '/parents', label: 'Ota-onalar' },
    { to: '/staff', label: "O'qituvchilar" },
    { to: '/groups', label: 'Guruhlar' },
    { to: '/schedule', label: 'Dars jadvali' },
    { to: '/attendance', label: 'Davomat' },
    { to: '/payments', label: "To'lovlar" },
  ],
  teacher: [
    { to: '/', label: 'Bosh sahifa' },
    { to: '/groups', label: 'Guruhlarim' },
    { to: '/schedule', label: 'Dars jadvali' },
    { to: '/attendance', label: 'Davomat' },
  ],
  support_teacher: [
    { to: '/', label: 'Bosh sahifa' },
    { to: '/groups', label: 'Guruhlarim' },
    { to: '/schedule', label: 'Dars jadvali' },
    { to: '/attendance', label: 'Davomat' },
  ],
  student: [
    { to: '/', label: 'Bosh sahifa' },
    { to: '/my', label: 'Mening profilim' },
    { to: '/schedule', label: 'Dars jadvali' },
  ],
  parent: [
    { to: '/', label: 'Bosh sahifa' },
    { to: '/my', label: 'Farzandlarim' },
    { to: '/schedule', label: 'Dars jadvali' },
  ],
};

function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const [lastPath, setLastPath] = useState(loc.pathname);
  if (lastPath !== loc.pathname) {
    setLastPath(loc.pathname);
    setOpen(false);
  }
  if (!user) return null;

  const links = (
    <nav className="flex flex-col gap-1 p-3">
      {NAV[user.role].map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === '/'}
          className={({ isActive }) => {
            const on = n.to === '/my' ? loc.pathname === '/my' || loc.pathname.startsWith('/students/') : isActive;
            return `rounded-lg px-3 py-2.5 text-sm font-medium ${on ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`;
          }}
        >
          {n.label}
        </NavLink>
      ))}
    </nav>
  );

  const userBox = (
    <div className="border-t border-slate-200 p-3">
      <NavLink to="/account" className="block rounded-lg px-3 py-2 hover:bg-slate-100">
        <div className="truncate text-sm font-semibold text-slate-900">{user.fullName}</div>
        <div className="truncate text-xs text-slate-500">
          {ROLE_LABEL[user.role]}
          {user.centerName ? ` · ${user.centerName}` : ''}
        </div>
      </NavLink>
      <button onClick={logout} className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50">
        Chiqish
      </button>
    </div>
  );

  return (
    <div className="min-h-full lg:flex">
      {/* Desktop yon panel */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:flex">
        <div className="px-5 py-4 text-xl font-bold text-indigo-700">LC CRM</div>
        <div className="flex-1 overflow-y-auto">{links}</div>
        {userBox}
      </aside>

      {/* Mobil yuqori panel */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="text-lg font-bold text-indigo-700">LC CRM</div>
        <button onClick={() => setOpen(true)} aria-label="Menyu" className="rounded-md p-2 text-slate-700 hover:bg-slate-100">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/50" />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 text-xl font-bold text-indigo-700">LC CRM</div>
            <div className="flex-1 overflow-y-auto">{links}</div>
            {userBox}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 lg:ml-60">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

function Only({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const STAFF: Role[] = ['teacher', 'support_teacher'];

export default function App() {
  const { user, loading } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={loading ? <Loading /> : user ? <Navigate to="/" replace /> : <Login />} />
      <Route element={<RequireAuth />}>
        <Route index element={<Dashboard />} />
        <Route path="centers" element={<Only roles={['super_admin']}><Centers /></Only>} />
        <Route path="students" element={<Only roles={['admin']}><Users kind="students" /></Only>} />
        <Route path="parents" element={<Only roles={['admin']}><Users kind="parents" /></Only>} />
        <Route path="staff" element={<Only roles={['admin']}><Users kind="staff" /></Only>} />
        <Route path="students/:id" element={<Only roles={['admin', 'student', 'parent', ...STAFF]}><StudentProfile /></Only>} />
        <Route path="my" element={<Only roles={['student', 'parent']}><MyProfile /></Only>} />
        <Route path="groups" element={<Only roles={['admin', ...STAFF]}><Groups /></Only>} />
        <Route path="groups/:id" element={<Only roles={['admin', 'student', 'parent', ...STAFF]}><GroupDetailPage /></Only>} />
        <Route path="schedule" element={<Only roles={['admin', 'student', 'parent', ...STAFF]}><Schedule /></Only>} />
        <Route path="attendance" element={<Only roles={['admin', ...STAFF]}><Attendance /></Only>} />
        <Route path="payments" element={<Only roles={['admin']}><Payments /></Only>} />
        <Route path="account" element={<Account />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
