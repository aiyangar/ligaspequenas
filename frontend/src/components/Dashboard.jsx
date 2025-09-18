import React, { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { categoriasService, equiposInternosService, jugadoresService } from '../lib/database'

export const Dashboard = ({ onNavigate }) => {
  const { isSuperAdmin } = useAuth()
  const [categorias, setCategorias] = useState([])
  const [equipos, setEquipos] = useState([])
  const [jugadores, setJugadores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const [categoriasData, equiposData, jugadoresData] = await Promise.all([
          categoriasService.getAll(),
          equiposInternosService.getAll(),
          jugadoresService.getAll()
        ])
        
        setCategorias(categoriasData)
        setEquipos(equiposData)
        setJugadores(jugadoresData)
      } catch (err) {
        setError(err.message || 'Error al cargar los datos')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando datos...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-4">Error</div>
          <p className="text-gray-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="material-card p-6">
        <h1 className="text-3xl font-bold text-surface-900">
          Dashboard
        </h1>
      </div>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="material-card p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-primary-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">C</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-surface-600">
                Categorías
              </p>
              <p className="text-2xl font-bold text-surface-900">
                {categorias.length}
              </p>
            </div>
          </div>
        </div>

        <div className="material-card p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-green-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">E</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-surface-600">
                Equipos
              </p>
              <p className="text-2xl font-bold text-surface-900">
                {equipos.length}
              </p>
            </div>
          </div>
        </div>

        <div className="material-card p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-yellow-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">J</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-surface-600">
                Jugadores
              </p>
              <p className="text-2xl font-bold text-surface-900">
                {jugadores.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Categorías */}
      <div className="material-card p-6">
        <h3 className="text-xl font-semibold text-surface-900 mb-6">
          Categorías Registradas
        </h3>
        {categorias.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categorias.map((categoria) => (
              <div key={categoria.id} className="border border-surface-200 rounded-lg p-4 hover:border-primary-300 transition-colors duration-200">
                <h4 className="font-semibold text-surface-900 mb-2">{categoria.nombre}</h4>
                <p className="text-sm text-surface-600 mb-2">
                  {categoria.edad_minima} - {categoria.edad_maxima} años
                </p>
                {categoria.descripcion && (
                  <p className="text-sm text-surface-500">
                    {categoria.descripcion}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-surface-500 text-center py-8">No hay categorías registradas</p>
        )}
      </div>

      {/* Equipos */}
      <div className="material-card p-6">
        <h3 className="text-xl font-semibold text-surface-900 mb-6">
          Equipos Registrados
        </h3>
        {equipos.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {equipos.map((equipo) => (
              <div key={equipo.id} className="border border-surface-200 rounded-lg p-4 hover:border-primary-300 transition-colors duration-200">
                <h4 className="font-semibold text-surface-900 mb-2">{equipo.nombre}</h4>
                <p className="text-sm text-surface-600 mb-2">
                  Categoría: {equipo.categorias?.nombre}
                </p>
                {equipo.entrenador_principal && (
                  <p className="text-sm text-surface-500 mb-1">
                    Entrenador: {equipo.entrenador_principal}
                  </p>
                )}
                {equipo.color_uniforme && (
                  <p className="text-sm text-surface-500">
                    Color: {equipo.color_uniforme}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-surface-500 text-center py-8">No hay equipos registrados</p>
        )}
      </div>

      {/* Jugadores */}
      <div className="material-card p-6">
        <h3 className="text-xl font-semibold text-surface-900 mb-6">
          Jugadores Registrados
        </h3>
        {jugadores.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-200">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                    Nombre
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                    Edad
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                    Equipo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                    Categoría
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                    Playera
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-surface-200">
                {jugadores.map((jugador) => (
                  <tr key={jugador.id} className="hover:bg-surface-50 transition-colors duration-200">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-surface-900">
                      {jugador.nombre} {jugador.apellido_paterno} {jugador.apellido_materno}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-surface-500">
                      {jugador.edad} años
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-surface-500">
                      {jugador.equipos_internos?.nombre}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-surface-500">
                      {jugador.categorias?.nombre}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-surface-500">
                      #{jugador.numero_playera}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-surface-500 text-center py-8">No hay jugadores registrados</p>
        )}
      </div>

      {/* Sección de Administración - Solo para SuperAdmin */}
      {isSuperAdmin && (
        <div className="material-card p-6">
          <h3 className="text-xl font-semibold text-surface-900 mb-6">
            Administración del Sistema
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-surface-200 rounded-lg p-4 hover:border-primary-300 transition-colors duration-200">
              <h4 className="font-semibold text-surface-900 mb-2">Gestión de Usuarios</h4>
              <p className="text-sm text-surface-600 mb-4">
                Crear y administrar usuarios del sistema
              </p>
              <button 
                onClick={() => onNavigate('usuarios')}
                className="material-button-primary text-sm"
              >
                Gestionar Usuarios
              </button>
            </div>
            <div className="border border-surface-200 rounded-lg p-4 hover:border-primary-300 transition-colors duration-200">
              <h4 className="font-semibold text-surface-900 mb-2">Configuración del Sistema</h4>
              <p className="text-sm text-surface-600 mb-4">
                Configurar parámetros generales del sistema
              </p>
              <button className="material-button-primary text-sm">
                Configuración
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}