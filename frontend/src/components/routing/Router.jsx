import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { Dashboard } from '../../pages'
import { UserManagement } from '../../pages/UserManagement'
import { Layout } from '../Layout'

export const AppRouter = () => {
  const { user, isSuperAdmin } = useAuth()

  // Función para navegar (compatible con el sistema actual)
  const navigateTo = (page) => {
    // Esta función se mantiene para compatibilidad con componentes existentes
    // React Router manejará la navegación real
  }

  return (
    <Router>
      <Layout onNavigate={navigateTo}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard onNavigate={navigateTo} />} />
          <Route path="/usuarios" element={<UserManagement onNavigate={navigateTo} />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Layout>
    </Router>
  )
}
