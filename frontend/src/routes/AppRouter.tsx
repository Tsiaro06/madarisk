import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RequireRole } from "@/components/auth/RequireRole";
import { AppShell } from "@/components/layout/AppShell";
import { ActiveEventProvider } from "@/stores/activeEvent";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";

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
    <SkeletonGroup
      label="Chargement de la page…"
      className="flex min-h-screen items-center justify-center p-6"
    >
      <div className="w-full max-w-5xl space-y-5">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-3 w-96 max-w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </SkeletonGroup>
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
              <Route
                path="assistant-ia"
                element={<Navigate to="/" replace />}
              />
              <Route path="profil" element={<ProfilePage />} />
              <Route path="mot-de-passe" element={<PasswordPage />} />
              <Route path="interdit" element={<ForbiddenPage />} />

              <Route element={<RequireRole roles={["SUPER_ADMIN"]} />}>
                <Route path="administration" element={<AdminUsersPage />} />
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
