import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

export const Menu = ({ isMobile = false, isOpen = false, onClose, onNavigate }) => {
  const { user, isSuperAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    if (onClose) onClose()
  }

  const menuItems = [
    { name: 'Dashboard', page: 'dashboard', icon: '🏠' },
    { name: 'Categorías', page: 'categorias', icon: '📋' },
    { name: 'Equipos', page: 'equipos', icon: '⚾' },
    { name: 'Jugadores', page: 'jugadores', icon: '👥' },
    { name: 'Partidos', page: 'partidos', icon: '🏟️' }
  ]

  const adminItems = [
    { name: 'Gestión de Usuarios', page: 'usuarios', icon: '👥', isAdmin: true },
    { name: 'Configuración', page: 'configuracion', icon: '⚙️', isAdmin: true }
  ]

  const renderMenuItem = (item, index) => {
    const className = item.isAdmin ? "menu-item admin" : "menu-item"

    const handleClick = (e) => {
      e.preventDefault()
      // Usar React Router para navegación
      const routeMap = {
        'dashboard': '/dashboard',
        'usuarios': '/usuarios',
        'categorias': '/categorias',
        'equipos': '/equipos',
        'jugadores': '/jugadores',
        'partidos': '/partidos',
        'configuracion': '/configuracion'
      }
      
      const route = routeMap[item.page] || '/dashboard'
      navigate(route)
      
      if (isMobile && onClose) {
        onClose()
      }
    }

    return (
      <button
        key={index}
        onClick={handleClick}
        className={className}
      >
        {isMobile && <span className="menu-item-icon">{item.icon}</span>}
        {item.name}
      </button>
    )
  }

  if (!user) {
    return (
      <div className="no-user-message">
        <span>
          {isMobile ? "Inicia sesión para acceder al menú" : "Inicia sesión para ver el menú"}
        </span>
      </div>
    )
  }

  const allItems = [...menuItems, ...(isSuperAdmin ? adminItems : [])]

  const renderUserMenu = () => {
    if (!user) return null

    if (isMobile) {
      return (
        <div className="user-menu mobile">
          <div className="user-info">
            <div className="user-avatar">
              <span>
                {user.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="user-details">
              <div className="user-email">
                {user.email}
                {isSuperAdmin && (
                  <span className="superadmin-badge">
                    SuperAdmin
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="signout-button"
          >
            Cerrar Sesión
          </button>
        </div>
      )
    }

    return (
      <div className="user-menu">
        <div className="user-info">
          <div className="user-avatar">
            <span>
              {user.email?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="user-details">
            <div className="user-email">
              {user.email}
              {isSuperAdmin && (
                <span className="superadmin-badge">
                  SuperAdmin
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="signout-button"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>
    )
  }

  if (isMobile) {
    return (
      <div className="menu mobile">
        <div className="menu-items">
          {allItems.map((item, index) => renderMenuItem(item, index))}
        </div>
        {renderUserMenu()}
      </div>
    )
  }

  return (
    <div className="menu">
      <div className="menu-items">
        {allItems.map((item, index) => renderMenuItem(item, index))}
      </div>
      {renderUserMenu()}
    </div>
  )
}
