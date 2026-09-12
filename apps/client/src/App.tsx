import { Route, Routes } from 'react-router-dom'
import { RequireAuth } from '@/features/auth/components/RequireAuth'
import { HomePage } from '@/features/auth/pages/HomePage'
import { LoginPage } from '@/features/auth/pages/LoginPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
    </Routes>
  )
}

export default App
