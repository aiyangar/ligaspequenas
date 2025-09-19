import React from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Componente PageHeader - Header reutilizable para todas las páginas excepto Dashboard
 * 
 * @param {Object} props - Propiedades del componente
 * @param {string} props.title - Título principal de la página
 * @param {string} props.subtitle - Subtítulo o descripción de la página
 * @param {Function} props.onNavigate - Función para navegar de vuelta al dashboard
 * @param {React.ReactNode} props.actions - Elementos de acción (botones, etc.) a mostrar en el lado derecho
 * @param {string} props.className - Clases CSS adicionales para el contenedor
 */
const PageHeader = ({ 
  title, 
  subtitle, 
  onNavigate, 
  actions, 
  className = '' 
}) => {
  const navigate = useNavigate()
  return (
    <div className={`material-card p-6 ${className}`}>
      {/* Header principal con título y acciones */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between p-2">
        {/* Sección izquierda - Título y subtítulo */}
        <div className="flex-1 p-2">
          <h1 className="text-3xl font-bold text-surface-900 mb-2">
            {title}
          </h1>
          {subtitle && (
            <p className="text-surface-600">
              {subtitle}
            </p>
          )}

          {/* Botón Volver */}
          {onNavigate && (
             <div className="mt-4 pt-4 border-t border-gray-200">
              <button
                onClick={() => navigate('/dashboard')}
                className="nav-button"
                title="Volver al Dashboard"
              >
                ← Volver al Dashboard
              </button>
            </div>
          )}
        </div>

        {/* Sección derecha - Acciones */}
        {actions && (
          <div className="mt-4 md:mt-0 flex items-center">
            {actions}
          </div>
        )}
      </div>

      
    </div>
  )
}

export default PageHeader
