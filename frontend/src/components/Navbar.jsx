import React, { useState } from 'react'
import { Menu } from './Menu'
import { Logo } from './Logo'
import { useAuth } from '../hooks/useAuth'

export const Navbar = ({ onNavigate }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const { user, isSuperAdmin } = useAuth()

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  const closeMenu = () => {
    setIsMenuOpen(false)
  }

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-content">
          {/* Logo */}
          <Logo size="default" showText={true} />

          {/* Sección derecha: Bienvenida + Menú */}
          <div className="navbar-right-section">
            {/* User Info - Bienvenida */}
            {user && (
              <div className="navbar-user-info">
                <p className="text-surface-600 text-sm">
                  Bienvenido, {user.email}
                  {isSuperAdmin && (
                    <span className="ml-1 px-1 py-0.5 bg-red-100 text-red-800 text-xs font-semibold rounded">
                      SuperAdmin
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* Menú hamburguesa para todos los tamaños */}
            <div className="navbar-hamburger-menu">
              <button
                onClick={toggleMenu}
                className="navbar-hamburger"
              >
                <span className="sr-only">Abrir menú principal</span>
                {!isMenuOpen ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>

        </div>

        {/* Menú desplegable para todos los tamaños */}
        <div className={`navbar-dropdown-menu ${isMenuOpen ? 'open' : ''}`}>
          <div className="navbar-dropdown-content">
            <Menu isMobile={true} isOpen={isMenuOpen} onClose={closeMenu} onNavigate={onNavigate} />
          </div>
        </div>
      </div>
    </nav>
  )
}