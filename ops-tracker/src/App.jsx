import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AppProvider } from "./state/AppProvider.jsx";
import { AppShell } from "./components/layout/AppShell.jsx";
import DashboardPage from "./pages/dashboard/DashboardPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import { Spinner } from "./components/ui/core.jsx";

// Dashboard ships in the main bundle (first screen); other pages load on demand.
const IssuesPage = lazy(() => import("./pages/issues/IssuesPage.jsx"));
const StoresPage = lazy(() => import("./pages/stores/StoresPage.jsx"));
const StoreProfilePage = lazy(() => import("./pages/stores/StoreProfilePage.jsx"));
const PlatformSettingsPage = lazy(() => import("./pages/settings/PlatformSettingsPage.jsx"));
const UsersPage = lazy(() => import("./pages/settings/UsersPage.jsx"));
const TermsPage = lazy(() => import("./pages/TermsPage.jsx"));

const page = (el) => <Suspense fallback={<div className="py-20 text-center"><Spinner label="Loading page" /></div>}>{el}</Suspense>;

export default function App() {
  return (
    <AppProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="issues" element={page(<IssuesPage />)} />
          <Route path="issues/:issueId" element={page(<IssuesPage />)} />
          <Route path="stores" element={page(<StoresPage />)} />
          <Route path="stores/:storeId" element={page(<StoreProfilePage />)} />
          <Route path="settings/platforms" element={page(<PlatformSettingsPage />)} />
          <Route path="settings/users" element={page(<UsersPage />)} />
          <Route path="terms" element={page(<TermsPage />)} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AppProvider>
  );
}
