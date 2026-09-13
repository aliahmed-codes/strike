import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ComingSoonPage } from '@/components/layout/ComingSoonPage'
import { RequireAuth } from '@/features/auth/components/RequireAuth'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/pricing-requests" element={<ComingSoonPage title="Pricing Requests" />} />
        <Route path="/approvals" element={<ComingSoonPage title="Approvals" />} />
      </Route>
    </Routes>
  )
}

export default App
