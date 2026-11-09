import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity,
  BadgeCheck,
  BarChart3,
  Bell,
  Bot,
  Bug,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  Coins,
  FileClock,
  Globe2,
  HeartPulse,
  LayoutDashboard,
  Leaf,
  LogOut,
  Menu,
  Milk,
  PawPrint,
  Settings,
  ShieldCheck,
  ShoppingBasket,
  Sprout,
  Stethoscope,
  Sun,
  Syringe,
  UserCircle,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { api, apiError, fdatetime } from '../lib/api';
import { roleHome, useAuth } from '../lib/auth';
import { languageNames, useLanguage, type Lang } from '../lib/i18n';
import type { NotificationItem, Page, Role } from '../lib/types';
import { Badge, Spinner } from './ui';

type NavItem = { to: string; labelKey: string; icon: typeof LayoutDashboard };

const navByRole: Record<Role, NavItem[]> = {
  farmer: [
    { to: '/farmer', labelKey: 'nav.dashboard', icon: LayoutDashboard },
    { to: '/farmer/animals', labelKey: 'nav.animals', icon: PawPrint },
    { to: '/farmer/health', labelKey: 'nav.health', icon: HeartPulse },
    { to: '/farmer/vaccinations', labelKey: 'nav.vaccinations', icon: Syringe },
    { to: '/farmer/nutrition', labelKey: 'nav.nutrition', icon: Sprout },
    { to: '/farmer/environment', labelKey: 'nav.environment', icon: Sun },
    { to: '/farmer/market', labelKey: 'nav.market', icon: ShoppingBasket },
    { to: '/farmer/finance', labelKey: 'nav.finance', icon: Coins },
    { to: '/farmer/assistant', labelKey: 'nav.assistant', icon: Bot },
    { to: '/farmer/profile', labelKey: 'nav.profile', icon: UserCircle },
  ],
  veterinarian: [
    { to: '/vet', labelKey: 'nav.dashboard', icon: LayoutDashboard },
    { to: '/vet/cases', labelKey: 'nav.cases', icon: ClipboardList },
    { to: '/vet/appointments', labelKey: 'nav.appointments', icon: CalendarClock },
    { to: '/vet/animals', labelKey: 'nav.animals', icon: PawPrint },
    { to: '/vet/vaccinations', labelKey: 'nav.vaccinations', icon: Syringe },
    { to: '/vet/assistant', labelKey: 'nav.assistant', icon: Bot },
    { to: '/vet/profile', labelKey: 'nav.profile', icon: Stethoscope },
  ],
  paravet: [
    { to: '/vet', labelKey: 'nav.dashboard', icon: LayoutDashboard },
    { to: '/vet/cases', labelKey: 'nav.cases', icon: ClipboardList },
    { to: '/vet/appointments', labelKey: 'nav.appointments', icon: CalendarClock },
    { to: '/vet/animals', labelKey: 'nav.animals', icon: PawPrint },
    { to: '/vet/vaccinations', labelKey: 'nav.vaccinations', icon: Syringe },
    { to: '/vet/assistant', labelKey: 'nav.assistant', icon: Bot },
    { to: '/vet/profile', labelKey: 'nav.profile', icon: Stethoscope },
  ],
  cooperative: [
    { to: '/coop', labelKey: 'nav.dashboard', icon: LayoutDashboard },
    { to: '/coop/members', labelKey: 'nav.members', icon: Users },
    { to: '/coop/animals', labelKey: 'nav.animals', icon: PawPrint },
    { to: '/coop/health', labelKey: 'nav.health', icon: HeartPulse },
    { to: '/coop/market', labelKey: 'nav.market', icon: ShoppingBasket },
    { to: '/coop/profile', labelKey: 'nav.profile', icon: UserCircle },
  ],
  admin: [
    { to: '/admin', labelKey: 'nav.overview', icon: LayoutDashboard },
    { to: '/admin/users', labelKey: 'nav.users', icon: Users },
    { to: '/admin/farms', labelKey: 'nav.animals', icon: Warehouse },
    { to: '/admin/vets', labelKey: 'nav.vets', icon: BadgeCheck },
    { to: '/admin/agents', labelKey: 'nav.agent_monitor', icon: Activity },
    { to: '/admin/audit', labelKey: 'nav.audit', icon: FileClock },
    { to: '/admin/system', labelKey: 'nav.system', icon: Settings },
  ],
};

const roleLabels: Record<Role, string> = {
  farmer: 'Farmer',
  veterinarian: 'Veterinarian',
  paravet: 'Paravet',
  cooperative: 'Cooperative',
  admin: 'Administrator',
};

export default function AppShell() {
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [bell, setBell] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const nav = user ? navByRole[user.role] || navByRole.farmer : [];

  const loadUnread = () => {
    api
      .get<{ unread: number }>('/notifications/unread-count')
      .then(({ data }) => setUnread(data.unread))
      .catch(() => setUnread(0));
  };

  useEffect(() => {
    loadUnread();
  }, []);

  useEffect(() => {
    if (!bell) return;
    setNotifLoading(true);
    setNotifError(null);
    api
      .get<Page<NotificationItem>>('/notifications', { params: { page_size: 8 } })
      .then(({ data }) => setNotifications(data.items))
      .catch((error) => setNotifError(apiError(error)))
      .finally(() => setNotifLoading(false));
  }, [bell]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setBell(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const markRead = async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications((rows) => rows.map((row) => (row.id === id ? { ...row, status: 'read' } : row)));
      loadUnread();
    } catch {
      loadUnread();
    }
  };

  const markAll = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications((rows) => rows.map((row) => ({ ...row, status: 'read' })));
      setUnread(0);
    } catch {
      loadUnread();
    }
  };

  const signOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  if (!user) return null;

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link to={roleHome[user.role]} className="flex items-center gap-3 px-5 py-5" onClick={() => setDrawer(false)}>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-leaf-700 text-white shadow-sm">
          <Leaf className="h-5 w-5" />
        </span>
        <span>
          <span className="block font-display text-sm font-bold leading-tight text-slate-900">{t('app.name')}</span>
          <span className="block text-[11px] text-slate-500">{t('app.tagline')}</span>
        </span>
      </Link>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === roleHome[user.role]}
              onClick={() => setDrawer(false)}
              className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
            >
              <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
              {t(item.labelKey)}
            </NavLink>
          );
        })}
      </nav>
      <div className="border-t border-slate-100 p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-leaf-100 text-sm font-bold text-leaf-800">
            {user.full_name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">{user.full_name}</p>
            <p className="truncate text-xs text-slate-500">{roleLabels[user.role]}</p>
          </div>
          <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={signOut} title={t('common.logout')}>
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        {user.is_sample && (
          <p className="mt-3 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
            Demonstration account — sample data
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f6faf4]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-100 bg-white lg:block">{sidebar}</aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <button className="absolute right-3 top-4 rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setDrawer(false)}>
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-100 bg-white/90 px-4 backdrop-blur lg:px-8">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setDrawer(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <span className="hidden items-center gap-1.5 rounded-full bg-leaf-50 px-3 py-1.5 text-xs font-semibold text-leaf-800 sm:flex">
            <ShieldCheck className="h-3.5 w-3.5" />
            {roleLabels[user.role]}
          </span>
          <label className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600">
            <Globe2 className="h-3.5 w-3.5" />
            <select
              aria-label={t('common.language')}
              className="bg-transparent text-xs font-semibold focus:outline-none"
              value={lang}
              onChange={(event) => setLang(event.target.value as Lang)}
            >
              {(Object.keys(languageNames) as Lang[]).map((code) => (
                <option key={code} value={code}>
                  {languageNames[code]}
                </option>
              ))}
            </select>
          </label>

          <div className="relative" ref={panelRef}>
            <button
              className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              onClick={() => setBell((open) => !open)}
              aria-label={t('common.notifications')}
            >
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            {bell && (
              <div className="absolute right-0 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-bold text-slate-800">{t('common.notifications')}</p>
                  {unread > 0 && (
                    <button className="text-xs font-semibold text-leaf-700 hover:underline" onClick={markAll}>
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifLoading && <Spinner label="Loading notifications…" />}
                  {notifError && <p className="px-4 py-3 text-xs text-red-600">{notifError}</p>}
                  {!notifLoading && !notifError && notifications.length === 0 && (
                    <p className="px-4 py-8 text-center text-sm text-slate-500">No notifications yet.</p>
                  )}
                  {notifications.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => markRead(item.id)}
                      className={`block w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${
                        item.status !== 'read' ? 'bg-leaf-50/40' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                        <Badge value={item.status} />
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{item.body}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{fdatetime(item.created_at)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-100" onClick={() => navigate(roleHome[user.role])}>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-leaf-100 text-xs font-bold text-leaf-800">
              {user.full_name.slice(0, 1).toUpperCase()}
            </span>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
          </button>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
          <Outlet />
          <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-4 text-[11px] text-slate-500">
            <span>{t('footer.disclaimer')}</span>
            <span className="inline-flex items-center gap-1">
              <Milk className="h-3.5 w-3.5" /> Built for the GAVS Hackathon
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
