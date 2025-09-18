import React, { useState, useEffect, useRef } from 'react'
import {
  getRoleColor,
  getRoleDisplayName,
  getRoleCardStyles,
  getCardClasses,
  getAvatarClasses,
  getMenuButtonClasses,
  getMenuIconClasses
} from './styles'

export const UserCard = ({ user, onEdit, onDelete, onCardClick, isExpanded }) => {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef(null)

  // Cerrar menú al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])


  const handleMenuClick = (e) => {
    e.stopPropagation()
    setShowMenu(!showMenu)
  }

  const handleEditClick = (e) => {
    e.stopPropagation()
    setShowMenu(false)
    onEdit(user)
  }

  const handleDeleteClick = (e) => {
    e.stopPropagation()
    setShowMenu(false)
    onDelete(user.id)
  }

  const cardStyles = getRoleCardStyles(user.rol)

  return (
    <div 
      className={getCardClasses(cardStyles, isExpanded)}
      onClick={() => onCardClick(user)}
    >
      {/* Header de la Card */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-4">
          {/* Avatar */}
          <div className={getAvatarClasses(cardStyles)}>
            <span className="text-white font-bold text-lg">
              {user.nombre?.charAt(0).toUpperCase()}
            </span>
          </div>
          
          {/* Información básica */}
          <div>
            <h3 className="text-lg font-semibold text-surface-900">
              {user.nombre} {user.apellido_paterno} {user.apellido_materno}
            </h3>
            <p className="text-sm text-surface-600">{user.email}</p>
          </div>
        </div>

        {/* Menú de acciones */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={handleMenuClick}
            className={getMenuButtonClasses(showMenu)}
          >
            <svg 
              className={getMenuIconClasses(showMenu)} 
              fill="currentColor" 
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="6" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="18" r="2" />
            </svg>
          </button>

          {/* Menú mejorado */}
          {showMenu && (
            <div className="absolute right-0 mt-3 w-52 bg-white rounded-xl shadow-xl border border-gray-200 z-20 overflow-hidden transform transition-all duration-200 ease-out">
              {/* Opciones del menú */}
              <div className="py-2">
                <button
                  onClick={handleEditClick}
                  className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center space-x-3 transition-all duration-200 group"
                >
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors duration-200">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Editar</p>
                  </div>
                </button>
                
                <div className="mx-4 my-1 h-px bg-gray-100"></div>
                
                <button
                  onClick={handleDeleteClick}
                  className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-red-50 hover:text-red-700 flex items-center space-x-3 transition-all duration-200 group"
                >
                  <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center group-hover:bg-red-200 transition-colors duration-200">
                    <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Eliminar</p>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Información del rol */}
      <div className="flex items-center justify-between mb-4">
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleColor(user.rol)}`}>
          {getRoleDisplayName(user.rol)}
        </span>
        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
          user.activo 
            ? 'bg-green-100 text-green-800' 
            : 'bg-red-100 text-red-800'
        }`}>
          {user.activo ? 'Activo' : 'Inactivo'}
        </span>
      </div>

      {/* Información expandida */}
      {isExpanded && (
        <div className="border-t border-gray-200 pt-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Teléfono</label>
              <p className="text-sm text-gray-900">{user.telefono || 'No especificado'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Asignación</label>
              <p className="text-sm text-gray-900">
                {user.categoria_nombre || user.equipo_nombre || 'N/A'}
              </p>
            </div>
          </div>
          
          <div>
            <label className="text-sm font-medium text-gray-500">Email</label>
            <p className="text-sm text-gray-900">{user.email}</p>
          </div>
        </div>
      )}
    </div>
  )
}
