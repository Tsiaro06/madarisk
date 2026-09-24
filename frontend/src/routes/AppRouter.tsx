import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RequireRole } from "@/components/auth/RequireRole";
import { AppShell } from "@/components/layout/AppShell";
import { ActiveEventProvider } from "@/stores/activeEvent";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { Spinner } from "@/components/ui/Spinner";

const CrisisRoomPage = lazy(() =>
  import("@/pages/CrisisRoomPage").then((m) => ({ default: m.CrisisRoomPage })),
);
const DashboardPage = lazy(() =>
  import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
);
const TerritoiresPage = lazy(() =>
  import("@/pages/TerritoiresPage").then((m) => ({
    default: m.TerritoiresPage,
  })),
);
const CommuneDetailPage = lazy(() =>
  import("@/pages/CommuneDetailPage").then((m) => ({
    default: m.CommuneDetailPage,
  })),
);
const DistrictDetailPage = lazy(() =>
  import("@/pages/DistrictDetailPage").then((m) => ({
    default: m.DistrictDetailPage,
  })),
);
const EvenementsPage = lazy(() =>
  import("@/pages/EvenementsPage").then((m) => ({ default: m.EvenementsPage })),
);
const EvenementDetailPage = lazy(() =>
  import("@/pages/EvenementDetailPage").then((m) => ({
    default: m.EvenementDetailPage,
  })),
);
const AlertesPage = lazy(() =>
  import("@/pages/AlertesPage").then((m) => ({ default: m.AlertesPage })),
);
const WeatherMapPage = lazy(() =>
  import("@/pages/WeatherMapPage").then((m) => ({ default: m.WeatherMapPage })),
);
const RisquesPage = lazy(() =>
  import("@/pages/RisquesPage").then((m) => ({ default: m.RisquesPage })),
);
const RiskConfigPage = lazy(() =>
  import("@/pages/RiskConfigPage").then((m) => ({ default: m.RiskConfigPage })),
);
const ImportsPage = lazy(() =>
  import("@/pages/ImportsPage").then((m) => ({ default: m.ImportsPage })),
);
const MatchingPage = lazy(() =>
  import("@/pages/MatchingPage").then((m) => ({ default: m.MatchingPage })),
);
const RapportsPage = lazy(() =>
  import("@/pages/RapportsPage").then((m) => ({ default: m.RapportsPage })),
);
const AdminUsersPage = lazy(() =>
  import("@/pages/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })),
);
const PasswordPage = lazy(() =>
  import("@/pages/PasswordPage").then((m) => ({ default: m.PasswordPage })),
);
const ProfilePage = lazy(() =>
  import("@/pages/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
const ForbiddenPage = lazy(() =>
  import("@/pages/ForbiddenPage").then((m) => ({ default: m.ForbiddenPage })),
);

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner label="Chargement…" />
    </div>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route index element={<CrisisRoomPage />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="territoires" element={<TerritoiresPage />} />
              <Route
                path="territoires/districts/:id"
                element={<DistrictDetailPage />}
              />
              <Route
                path="territoires/communes/:id"
                element={<CommuneDetailPage />}
              />
              <Route path="evenements" element={<EvenementsPage />} />
              <Route
                path="evenements/:id"
                element={
                  <ActiveEventProvider>
                    <EvenementDetailPage />
                  </ActiveEventProvider>
                }
              />
              <Route path="meteo" element={<WeatherMapPage />} />
              <Route path="risques" element={<RisquesPage />} />
              <Route path="alertes" element={<AlertesPage />} />
              <Route path="rapports" element={<RapportsPage />} />
              <Route
                path="assistant-ia"
                element={<Navigate to="/" replace />}
              />
              <Route path="profil" element={<ProfilePage />} />
              <Route path="mot-de-passe" element={<PasswordPage />} />
              <Route path="interdit" element={<ForbiddenPage />} />

              <Route
                element={
                  <RequireRole roles={["ANALYSTE_SIG", "SUPER_ADMIN"]} />
                }
              >
                <Route path="imports" element={<ImportsPage />} />
                <Route path="matching" element={<MatchingPage />} />
              </Route>

              <Route element={<RequireRole roles={["SUPER_ADMIN"]} />}>
                <Route path="administration" element={<AdminUsersPage />} />
                <Route
                  path="configurations-risque"
                  element={<RiskConfigPage />}
                />
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
