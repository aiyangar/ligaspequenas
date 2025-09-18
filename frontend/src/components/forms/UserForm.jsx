import React from 'react'

export const UserForm = ({ 
  formData, 
  handleInputChange, 
  handleSubmit, 
  editingUser, 
  categorias, 
  equipos, 
  getFilteredEquipos,
  onCancel 
}) => {
  return (
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
                className="w-full pl-6 pr-3 py-2 h-10 border border-gray-300 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full h-10 pl-6 pr-3 border border-gray-300 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full h-10 pl-6 pr-3 border border-gray-300 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full h-10 pl-6 pr-3 border border-gray-300 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full h-10 pl-6 pr-3 border border-gray-300 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full h-10 pl-6 pr-3 border border-gray-300 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full h-10 pl-6 pr-3 border border-gray-300 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="w-full h-10 pl-6 pr-3 border border-gray-300 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="w-full h-10 pl-6 pr-3 border border-gray-300 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-full text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
  )
}
