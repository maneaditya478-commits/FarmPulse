import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Leaf } from 'lucide-react';
import AppShell from './components/AppShell';
import { useAuth, roleHome } from './lib/auth';
import type { Role } from './lib/types';
import { LoginPage, RegisterPage } from './pages/auth';
import {
  AnimalDetailPage,
  FarmerAnimals,
  FarmerDashboard,
  FarmerHealth,
  HealthCaseDetailPage,
} from './pages/farmer';
import { EnvironmentPage, NutritionPage, VaccinationsPage } from './pages/farmer-care';
import { AssistantPage, FinancePage, MarketPage, ProfilePage } from './pages/farmer-tools';
import { VetAnimals, VetAppointments, VetCases, VetDashboard, VetVaccinations } from './pages/vet';
import { CoopAnimals, CoopDashboard, CoopHealth, CoopMembers } from './pages/coop';
import {
  AdminAgents,
  AdminAudit,
  AdminDashboard,
  AdminFarms,
  AdminSystem,
  AdminUsers,
  AdminVets,
} from './pages/admin';

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#f6faf4]">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 animate-pulse place-items-center rounded-2xl bg-leaf-700 text-white">
          <Leaf className="h-6 w-6" />
        </span>
        <div>
          <p className="font-display text-base font-bold text-slate-900">AI Livestock Guardian</p>
          <p className="text-xs text-slate-500">Restoring your session…</p>
        </div>
      </div>
    </div>
  );
}

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell />;
}

function RoleGate({ allow }: { allow: Role[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!allow.includes(user.role)) return <Navigate to={roleHome[user.role]} replace />;
  return <Outlet />;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  return <Navigate to={user ? roleHome[user.role] : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/farmer" element={<RoleGate allow={['farmer']} />}>
          <Route index element={<FarmerDashboard />} />
          <Route path="animals" element={<FarmerAnimals />} />
          <Route path="animals/:animalId" element={<AnimalDetailPage />} />
          <Route path="health" element={<FarmerHealth />} />
          <Route path="health/:caseId" element={<HealthCaseDetailPage />} />
          <Route path="vaccinations" element={<VaccinationsPage />} />
          <Route path="nutrition" element={<NutritionPage />} />
          <Route path="environment" element={<EnvironmentPage />} />
          <Route path="market" element={<MarketPage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="assistant" element={<AssistantPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        <Route path="/vet" element={<RoleGate allow={['veterinarian', 'paravet']} />}>
          <Route index element={<VetDashboard />} />
          <Route path="cases" element={<VetCases />} />
          <Route path="cases/:caseId" element={<HealthCaseDetailPage />} />
          <Route path="appointments" element={<VetAppointments />} />
          <Route path="animals" element={<VetAnimals />} />
          <Route path="animals/:animalId" element={<AnimalDetailPage />} />
          <Route path="vaccinations" element={<VetVaccinations />} />
          <Route path="assistant" element={<AssistantPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        <Route path="/coop" element={<RoleGate allow={['cooperative']} />}>
          <Route index element={<CoopDashboard />} />
          <Route path="members" element={<CoopMembers />} />
          <Route path="animals" element={<CoopAnimals />} />
          <Route path="animals/:animalId" element={<AnimalDetailPage />} />
          <Route path="health" element={<CoopHealth />} />
          <Route path="health/:caseId" element={<HealthCaseDetailPage />} />
          <Route path="market" element={<MarketPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        <Route path="/admin" element={<RoleGate allow={['admin']} />}>
          <Route index element={<AdminDashboard />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="farms" element={<AdminFarms />} />
          <Route path="animals" element={<AdminFarms />} />
          <Route path="animals/:animalId" element={<AnimalDetailPage />} />
          <Route path="vets" element={<AdminVets />} />
          <Route path="agents" element={<AdminAgents />} />
          <Route path="audit" element={<AdminAudit />} />
          <Route path="system" element={<AdminSystem />} />
        </Route>
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
