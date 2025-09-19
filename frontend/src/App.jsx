import React from 'react'
import { useAuth } from './hooks/useAuth'
import { Auth } from './components/ui'
import { AppRouter } from './components/routing'
import { Layout } from './components/Layout'

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="App">
      {user ? (
        <AppRouter />
      ) : (
        <Layout>
          <Auth />
        </Layout>
      )}
    </div>
  )
}

export default App