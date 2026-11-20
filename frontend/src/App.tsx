import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { theme } from './theme/theme'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { CollectionsPage } from './pages/CollectionsPage'
import { AuthBootstrap, ProtectedRoute, PublicRoute } from './auth/AuthRoutes'

function App() {
  return (
    <ThemeProvider theme={theme} defaultMode="light" modeStorageKey="docmind-color-mode" noSsr>
      <CssBaseline />
      <BrowserRouter>
        <AuthBootstrap>
          <Routes>
            <Route element={<PublicRoute />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Navigate to="/collections" replace />} />
              <Route path="/collections" element={<CollectionsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/collections" replace />} />
          </Routes>
        </AuthBootstrap>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
