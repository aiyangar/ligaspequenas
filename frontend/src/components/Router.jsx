import React, { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Dashboard } from './Dashboard'
import { UserManagement } from '../pages/UserManagement'
import { Layout } from './Layout'

export const Router = () => {
  const { user, isSuperAdmin } = useAuth()
  const [currentPage, setCurrentPage] = useState('dashboard')

  // Función para cambiar de página
  const navigateTo = (page) => {
    setCurrentPage(page)
  }

  // Función para renderizar la página actual
  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={navigateTo} />
      case 'usuarios':
        return <UserManagement onNavigate={navigateTo} />
      default:
        return <Dashboard onNavigate={navigateTo} />
    }
  }

  return (
    <Layout onNavigate={navigateTo}>
      {renderCurrentPage()}
    </Layout>
  )
}
