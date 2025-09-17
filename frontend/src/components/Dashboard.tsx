import React, { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { categoriasService, equiposInternosService, jugadoresService } from '../lib/database'
import type { Categoria, EquipoInterno, Jugador } from '../lib/supabase'

export const Dashboard: React.FC = () => {
  const { user, signOut } = useAuth()
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [equipos, setEquipos] = useState<EquipoInterno[]>([])
  const [jugadores, setJugadores] = useState<Jugador[]>([])
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
      } catch (err: any) {
        setError(err.message || 'Error al cargar los datos')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const handleSignOut = async () => {
    await signOut()
  }

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Sistema de Ligas Pequeñas
              </h1>
              <p className="text-gray-600">
                Bienvenido, {user?.email}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-indigo-500 rounded-md flex items-center justify-center">
                      <span className="text-white font-bold">C</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Categorías
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {categorias.length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                      <span className="text-white font-bold">E</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Equipos
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {equipos.length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-yellow-500 rounded-md flex items-center justify-center">
                      <span className="text-white font-bold">J</span>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        Jugadores
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {jugadores.length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Categorías */}
          <div className="bg-white shadow rounded-lg mb-8">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Categorías Registradas
              </h3>
              {categorias.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categorias.map((categoria) => (
                    <div key={categoria.id} className="border rounded-lg p-4">
                      <h4 className="font-medium text-gray-900">{categoria.nombre}</h4>
                      <p className="text-sm text-gray-600">
                        {categoria.edad_minima} - {categoria.edad_maxima} años
                      </p>
                      {categoria.descripcion && (
                        <p className="text-sm text-gray-500 mt-2">
                          {categoria.descripcion}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No hay categorías registradas</p>
              )}
            </div>
          </div>

          {/* Equipos */}
          <div className="bg-white shadow rounded-lg mb-8">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Equipos Registrados
              </h3>
              {equipos.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {equipos.map((equipo) => (
                    <div key={equipo.id} className="border rounded-lg p-4">
                      <h4 className="font-medium text-gray-900">{equipo.nombre}</h4>
                      <p className="text-sm text-gray-600">
                        Categoría: {equipo.categorias?.nombre}
                      </p>
                      {equipo.entrenador_principal && (
                        <p className="text-sm text-gray-500">
                          Entrenador: {equipo.entrenador_principal}
                        </p>
                      )}
                      {equipo.color_uniforme && (
                        <p className="text-sm text-gray-500">
                          Color: {equipo.color_uniforme}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">No hay equipos registrados</p>
              )}
            </div>
          </div>

          {/* Jugadores */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Jugadores Registrados
              </h3>
              {jugadores.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Nombre
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Edad
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Equipo
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Categoría
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Playera
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {jugadores.map((jugador) => (
                        <tr key={jugador.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {jugador.nombre} {jugador.apellido_paterno} {jugador.apellido_materno}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {jugador.edad} años
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {jugador.equipos_internos?.nombre}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {jugador.categorias?.nombre}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            #{jugador.numero_playera}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500">No hay jugadores registrados</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
