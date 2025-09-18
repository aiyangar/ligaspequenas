import React from 'react'
import { useAuth } from '../hooks/useAuth'

export const Menu = ({ isMobile = false, isOpen = false, onClose }) => {
  const { user, isSuperAdmin, signOut } = useAuth()

  const handleSignOut = async () => {
    await signOut()
    if (onClose) onClose()
  }

  const menuItems = [
    { name: 'Dashboard', href: '#', icon: '🏠' },
    { name: 'Categorías', href: '#', icon: '📋' },
    { name: 'Equipos', href: '#', icon: '⚾' },
    { name: 'Jugadores', href: '#', icon: '👥' },
    { name: 'Partidos', href: '#', icon: '🏟️' }
  ]

  const adminItems = [
    { name: 'Administración', href: '#', icon: '⚙️', isAdmin: true }
  ]

  const renderMenuItem = (item, index) => {
    const className = item.isAdmin ? "menu-item admin" : "menu-item"

    return (
      <a
        key={index}
        href={item.href}
        className={className}
        onClick={isMobile ? onClose : undefined}
      >
        {isMobile && <span className="menu-item-icon">{item.icon}</span>}
        {item.name}
      </a>
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
