import React, { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { categoriasService, equiposInternosService, usuariosService } from '../lib/database'

export const UserManagement = ({ onNavigate }) => {
  const { isSuperAdmin } = useAuth()
  const [users, setUsers] = useState([])
  const [categorias, setCategorias] = useState([])
  const [equipos, setEquipos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingUser, setEditingUser] = useState(null)

  // Estados del formulario
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    nombre: '',
    apellido_paterno: '',
    apellido_materno: '',
    telefono: '',
    rol: '',
    categoria_id: '',
    equipo_interno_id: ''
  })

  useEffect(() => {
    if (isSuperAdmin) {
      loadData()
    }
  }, [isSuperAdmin])

  const loadData = async () => {
    try {
      setLoading(true)
      const [categoriasData, equiposData] = await Promise.all([
        categoriasService.getAll(),
        equiposInternosService.getAll()
      ])
      
      setCategorias(categoriasData)
      setEquipos(equiposData)
      
      // Cargar usuarios desde la base de datos
      const usuariosData = await usuariosService.getAll()
      setUsers(usuariosData)
    } catch (err) {
      setError(err.message || 'Error al cargar los datos')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingUser) {
        // Actualizar usuario existente
        await usuariosService.update(editingUser.id, formData)
      } else {
        // Crear nuevo usuario
        await usuariosService.create(formData)
      }
      
      // Limpiar formulario
      resetForm()
      setShowCreateForm(false)
      setEditingUser(null)
      
      // Recargar datos
      await loadData()
    } catch (err) {
      setError(err.message || 'Error al guardar el usuario')
    }
  }

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      nombre: '',
      apellido_paterno: '',
      apellido_materno: '',
      telefono: '',
      rol: '',
      categoria_id: '',
      equipo_interno_id: ''
    })
  }

  const handleEdit = (user) => {
    setEditingUser(user)
    setFormData({
      email: user.email,
      password: '',
      nombre: user.nombre,
      apellido_paterno: user.apellido_paterno,
      apellido_materno: user.apellido_materno || '',
      telefono: user.telefono || '',
      rol: user.rol || '',
      categoria_id: user.categoria_id || '',
      equipo_interno_id: user.equipo_interno_id || ''
    })
    setShowCreateForm(true)
  }

  const handleDelete = async (userId) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este usuario?')) {
      try {
        await usuariosService.delete(userId)
        await loadData()
      } catch (err) {
        setError(err.message || 'Error al eliminar el usuario')
      }
    }
  }

  const getRoleDisplayName = (rol) => {
    const roles = {
      'admin_liga': 'Administrador de Liga',
      'admin_categoria': 'Administrador de Categoría',
      'admin_equipo': 'Administrador de Equipo',
      'padre_tutor': 'Padre/Tutor'
    }
    return roles[rol] || rol
  }

  const getFilteredEquipos = () => {
    if (!formData.categoria_id) return equipos
    return equipos.filter(equipo => equipo.categoria_id === parseInt(formData.categoria_id))
  }

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-4">Acceso Denegado</div>
          <p className="text-gray-600">Solo el SuperAdministrador puede acceder a esta página</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando datos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="material-card p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center mb-2">
              {onNavigate && (
                <button
                  onClick={() => onNavigate('dashboard')}
                  className="nav-button mr-4"
                  title="Volver al Dashboard"
                >
                  ← Volver
                </button>
              )}
              <h1 className="text-3xl font-bold text-surface-900">
                Gestión de Usuarios
              </h1>
            </div>
            <p className="text-surface-600 mt-1">
              Administra los usuarios del sistema y sus roles
            </p>
          </div>
          <div className="mt-4 md:mt-0">
            <button
              onClick={() => {
                resetForm()
                setEditingUser(null)
                setShowCreateForm(true)
              }}
              className="material-button-primary"
            >
              + Nuevo Usuario
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="material-card p-4 bg-red-50 border border-red-200">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Create/Edit Form */}
      {showCreateForm && (
        <div className="material-card p-6">
          <h2 className="text-xl font-semibold text-surface-900 mb-6">
            {editingUser ? 'Editar Usuario' : 'Crear Nuevo Usuario'}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Información Personal */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-surface-900">Información Personal</h3>
                
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-surface-700 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="usuario@ejemplo.com"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-surface-700 mb-2">
                    Contraseña {!editingUser && '*'}
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    required={!editingUser}
                    value={formData.password}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>

                <div>
                  <label htmlFor="nombre" className="block text-sm font-medium text-surface-700 mb-2">
                    Nombre *
                  </label>
                  <input
                    type="text"
                    id="nombre"
                    name="nombre"
                    required
                    value={formData.nombre}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Nombre del usuario"
                  />
                </div>

                <div>
                  <label htmlFor="apellido_paterno" className="block text-sm font-medium text-surface-700 mb-2">
                    Apellido Paterno *
                  </label>
                  <input
                    type="text"
                    id="apellido_paterno"
                    name="apellido_paterno"
                    required
                    value={formData.apellido_paterno}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Apellido paterno"
                  />
                </div>

                <div>
                  <label htmlFor="apellido_materno" className="block text-sm font-medium text-surface-700 mb-2">
                    Apellido Materno
                  </label>
                  <input
                    type="text"
                    id="apellido_materno"
                    name="apellido_materno"
                    value={formData.apellido_materno}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Apellido materno (opcional)"
                  />
                </div>

                <div>
                  <label htmlFor="telefono" className="block text-sm font-medium text-surface-700 mb-2">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    id="telefono"
                    name="telefono"
                    value={formData.telefono}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Número de teléfono"
                  />
                </div>
              </div>

              {/* Rol y Permisos */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-surface-900">Rol y Permisos</h3>
                
                <div>
                  <label htmlFor="rol" className="block text-sm font-medium text-surface-700 mb-2">
                    Tipo de Usuario *
                  </label>
                  <select
                    id="rol"
                    name="rol"
                    required
                    value={formData.rol}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Selecciona un rol</option>
                    <option value="admin_liga">Administrador de Liga</option>
                    <option value="admin_categoria">Administrador de Categoría</option>
                    <option value="admin_equipo">Administrador de Equipo</option>
                    <option value="padre_tutor">Padre/Tutor</option>
                  </select>
                </div>

                {/* Categoría - Solo para Admin de Categoría */}
                {formData.rol === 'admin_categoria' && (
                  <div>
                    <label htmlFor="categoria_id" className="block text-sm font-medium text-surface-700 mb-2">
                      Categoría *
                    </label>
                    <select
                      id="categoria_id"
                      name="categoria_id"
                      required
                      value={formData.categoria_id}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Selecciona una categoría</option>
                      {categorias.map(categoria => (
                        <option key={categoria.id} value={categoria.id}>
                          {categoria.nombre} ({categoria.edad_minima}-{categoria.edad_maxima} años)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Equipo - Solo para Admin de Equipo */}
                {formData.rol === 'admin_equipo' && (
                  <div>
                    <label htmlFor="equipo_interno_id" className="block text-sm font-medium text-surface-700 mb-2">
                      Equipo *
                    </label>
                    <select
                      id="equipo_interno_id"
                      name="equipo_interno_id"
                      required
                      value={formData.equipo_interno_id}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Selecciona un equipo</option>
                      {getFilteredEquipos().map(equipo => (
                        <option key={equipo.id} value={equipo.id}>
                          {equipo.nombre} - {equipo.categorias?.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Botones del formulario */}
            <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false)
                  setEditingUser(null)
                  resetForm()
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="material-button-primary"
              >
                {editingUser ? 'Actualizar Usuario' : 'Crear Usuario'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users List */}
      <div className="material-card p-6">
        <h2 className="text-xl font-semibold text-surface-900 mb-6">
          Lista de Usuarios
        </h2>
        
        {users.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-200">
              <thead className="bg-surface-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                    Usuario
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                    Rol
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                    Asignación
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-surface-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-surface-50 transition-colors duration-200">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                          <span className="text-primary-600 font-medium">
                            {user.nombre?.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-surface-900">
                            {user.nombre} {user.apellido_paterno} {user.apellido_materno}
                          </div>
                          <div className="text-sm text-surface-500">
                            {user.telefono || 'Sin teléfono'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-surface-500">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {getRoleDisplayName(user.rol)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-surface-500">
                      {user.categoria_nombre || user.equipo_nombre || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        user.activo 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {user.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(user)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">👥</div>
            <h3 className="text-lg font-medium text-surface-900 mb-2">
              No hay usuarios registrados
            </h3>
            <p className="text-surface-500 mb-6">
              Comienza creando el primer usuario del sistema
            </p>
            <button
              onClick={() => {
                resetForm()
                setEditingUser(null)
                setShowCreateForm(true)
              }}
              className="material-button-primary"
            >
              Crear Primer Usuario
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
