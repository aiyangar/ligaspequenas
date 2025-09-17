import React, { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export const Auth = ({ onAuthSuccess }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { signIn } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn(email, password)
      if (result.success) {
        onAuthSuccess?.()
      } else {
        setError(result.error || 'Error al iniciar sesión')
      }
    } catch (err) {
      setError('Error inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-blue-700 rounded-full flex items-center justify-center shadow-2xl transform hover:scale-105 transition-transform duration-200">
              <span className="text-white font-bold text-4xl">⚾</span>
            </div>
          </div>
          <h1 className="text-5xl font-bold text-gray-900 mb-2 tracking-tight">
            Ligas Pequeñas
          </h1>
          <h2 className="text-2xl font-semibold text-gray-700 mb-2">
            Iniciar Sesión
          </h2>
          <p className="text-gray-600 text-lg">
            Sistema de Gestión de Ligas de Béisbol
          </p>
        </div>
        
        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
            <div className="text-center">
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                Email *
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-4/5 mx-auto px-4 h-10 border border-gray-300 rounded-full shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-center"
                placeholder="Ingresa tu email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="text-center">
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                Contraseña *
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-4/5 mx-auto px-4 h-10 border border-gray-300 rounded-full shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-center"
                placeholder="Ingresa tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            </div>

            {error && (
              <div className={`w-4/5 mx-auto px-4 py-3 rounded-full text-sm font-medium ${
                error.includes('✅') 
                  ? 'bg-green-50 border border-green-200 text-green-700' 
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                {error}
              </div>
            )}

            <div className="text-center">
              <button
                type="submit"
                disabled={loading}
                className="w-4/5 mx-auto bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold py-8 px-6 rounded-full shadow-lg hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transform hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Cargando...
                  </div>
                ) : (
                  'Iniciar Sesión'
                )}
              </button>
            </div>

            <div className="text-center pt-6 border-t border-gray-200">
              <p className="text-gray-600 text-sm mb-4">
                Solo usuarios autorizados pueden acceder
              </p>
              <p className="text-gray-500 text-xs">
                Para crear una cuenta, contacta al administrador del sistema
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}