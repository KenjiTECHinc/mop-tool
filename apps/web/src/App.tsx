import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/templates/AppShell.tsx";
import { useSession } from "./context/SessionContext.tsx";
import { AdminPage } from "./pages/AdminPage.tsx";
import { AssistantPage } from "./pages/AssistantPage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { TicketsPage } from "./pages/TicketsPage.tsx";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={<Private />} />
    </Routes>
  );
}

function Private() {
  const { me, setUiLanguage } = useSession();
  if (!me || me.user.mustChangePassword) return <Navigate to="/login" replace />;
  return (
    <AppShell name={me.user.name} jobTitle={me.user.jobTitle} tier={me.tier} onLanguage={(language) => void setUiLanguage(language)}>
      <Routes>
        <Route path="/" element={<AssistantPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/admin" element={me.tier === "T1" ? <AdminPage /> : <Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
