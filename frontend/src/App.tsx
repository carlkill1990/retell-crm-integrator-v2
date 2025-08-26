import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import Layout from '@/components/Layout'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import DashboardPage from '@/pages/DashboardPage'
import IntegrationsPage from '@/pages/IntegrationsPage'
import AccountsPage from '@/pages/AccountsPage'
import ActivityPage from '@/pages/ActivityPage'
import SettingsPage from '@/pages/SettingsPage'
import IntegrationWizardPage from '@/pages/IntegrationWizardPage'
import TestPage from '@/pages/TestPage'
import { useEffect } from 'react'

function App() {
  const { isAuthenticated, initialize, isLoading } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [initialize])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/integrations/new" element={<IntegrationWizardPage />} />
        <Route path="/integrations/:id/continue" element={<IntegrationWizardPage />} />
        <Route path="/integrations/:id/edit" element={<IntegrationWizardPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/test" element={<TestPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default App