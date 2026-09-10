import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RequireRole } from "@/components/auth/RequireRole";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/pages/LoginPage";
import { CrisisRoomPage } from "@/pages/CrisisRoomPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { TerritoiresPage } from "@/pages/TerritoiresPage";
import { CommuneDetailPage } from "@/pages/CommuneDetailPage";
import { DistrictDetailPage } from "@/pages/DistrictDetailPage";
import { EvenementsPage } from "@/pages/EvenementsPage";
import { EvenementDetailPage } from "@/pages/EvenementDetailPage";
import { AlertesPage } from "@/pages/AlertesPage";
import { WeatherMapPage } from "@/pages/WeatherMapPage";
import { RisquesPage } from "@/pages/RisquesPage";
import { RiskConfigPage } from "@/pages/RiskConfigPage";
import { ImportsPage } from "@/pages/ImportsPage";
import { MatchingPage } from "@/pages/MatchingPage";
import { RapportsPage } from "@/pages/RapportsPage";
import { AdminUsersPage } from "@/pages/AdminUsersPage";
import { PasswordPage } from "@/pages/PasswordPage";
import { ForbiddenPage } from "@/pages/ForbiddenPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAuth />}>
          <Route index element={<CrisisRoomPage />} />
          <Route element={<AppShell />}>
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
            <Route path="evenements/:id" element={<EvenementDetailPage />} />
            <Route path="meteo" element={<WeatherMapPage />} />
            <Route path="risques" element={<RisquesPage />} />
            <Route path="alertes" element={<AlertesPage />} />
            <Route path="rapports" element={<RapportsPage />} />
            <Route path="assistant-ia" element={<Navigate to="/" replace />} />
            <Route path="mot-de-passe" element={<PasswordPage />} />
            <Route path="interdit" element={<ForbiddenPage />} />

            <Route
              element={<RequireRole roles={["ANALYSTE_SIG", "SUPER_ADMIN"]} />}
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
    </BrowserRouter>
  );
}
