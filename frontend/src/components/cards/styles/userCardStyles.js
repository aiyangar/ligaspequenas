// Estilos para UserCard
// Funciones para obtener colores y estilos según el rol del usuario

/**
 * Obtiene el color del badge de rol
 * @param {string} rol - Rol del usuario
 * @returns {string} Clases CSS para el badge
 */
export const getRoleColor = (rol) => {
  const colors = {
    'admin_liga': 'bg-purple-100 text-purple-800',
    'admin_categoria': 'bg-blue-100 text-blue-800',
    'admin_equipo': 'bg-green-100 text-green-800',
    'padre_tutor': 'bg-orange-100 text-orange-800'
  }
  return colors[rol] || 'bg-gray-100 text-gray-800'
}

/**
 * Obtiene el nombre legible del rol
 * @param {string} rol - Rol del usuario
 * @returns {string} Nombre legible del rol
 */
export const getRoleDisplayName = (rol) => {
  const roles = {
    'admin_liga': 'Administrador de Liga',
    'admin_categoria': 'Administrador de Categoría',
    'admin_equipo': 'Administrador de Equipo',
    'padre_tutor': 'Padre/Tutor'
  }
  return roles[rol] || rol
}

/**
 * Obtiene los estilos de la card según el rol
 * @param {string} rol - Rol del usuario
 * @returns {object} Objeto con clases CSS para diferentes elementos
 */
export const getRoleCardStyles = (rol) => {
  const styles = {
    'admin_liga': {
      border: 'border-2 border-purple-300',
      shadow: 'shadow-lg shadow-purple-300/50',
      hoverShadow: 'hover:shadow-xl hover:shadow-purple-400/60',
      ring: 'ring-purple-400',
      hoverRing: 'hover:ring-purple-300',
      avatar: 'from-purple-500 to-purple-600'
    },
    'admin_categoria': {
      border: 'border-2 border-blue-300',
      shadow: 'shadow-lg shadow-blue-300/50',
      hoverShadow: 'hover:shadow-xl hover:shadow-blue-400/60',
      ring: 'ring-blue-400',
      hoverRing: 'hover:ring-blue-300',
      avatar: 'from-blue-500 to-blue-600'
    },
    'admin_equipo': {
      border: 'border-2 border-green-300',
      shadow: 'shadow-lg shadow-green-300/50',
      hoverShadow: 'hover:shadow-xl hover:shadow-green-400/60',
      ring: 'ring-green-400',
      hoverRing: 'hover:ring-green-300',
      avatar: 'from-green-500 to-green-600'
    },
    'padre_tutor': {
      border: 'border-2 border-orange-300',
      shadow: 'shadow-lg shadow-orange-300/50',
      hoverShadow: 'hover:shadow-xl hover:shadow-orange-400/60',
      ring: 'ring-orange-400',
      hoverRing: 'hover:ring-orange-300',
      avatar: 'from-orange-500 to-orange-600'
    }
  }
  
  return styles[rol] || {
    border: 'border-2 border-gray-300',
    shadow: 'shadow-lg shadow-gray-300/50',
    hoverShadow: 'hover:shadow-xl hover:shadow-gray-400/60',
    ring: 'ring-gray-400',
    hoverRing: 'hover:ring-gray-300',
    avatar: 'from-gray-500 to-gray-600'
  }
}

/**
 * Obtiene las clases CSS base para la card
 * @param {object} cardStyles - Estilos específicos del rol
 * @param {boolean} isExpanded - Si la card está expandida
 * @returns {object} Objeto con clases CSS y estilos inline
 */
export const getCardClasses = (cardStyles, isExpanded) => {
  const baseClasses = 'material-card user-card-custom p-6 cursor-pointer'
  const stateClasses = isExpanded 
    ? 'transform scale-[1.02]' 
    : ''
  
  // Obtener colores según el rol
  const colors = getRoleColors(cardStyles)
  
  return {
    className: `${baseClasses} ${stateClasses}`,
    style: {
      border: `2px solid ${colors.border}`,
      // Sobrescribir la sombra normal de material-card con color del rol
      boxShadow: `0 2px 4px -1px ${colors.shadow}, 0 4px 5px 0 ${colors.shadow}, 0 1px 10px 0 ${colors.shadow}`,
      // Agregar CSS personalizado para hover
      '--hover-shadow': `0 5px 5px -3px ${colors.shadow}, 0 8px 10px 1px ${colors.shadow}, 0 3px 14px 2px ${colors.shadow}`
    }
  }
}


/**
 * Obtiene todos los colores según el rol
 * @param {object} cardStyles - Estilos específicos del rol
 * @returns {object} Objeto con todos los colores del rol
 */
const getRoleColors = (cardStyles) => {
  // Extraer el color del avatar para determinar el rol
  if (cardStyles.avatar && cardStyles.avatar.includes('purple')) {
    return {
      border: '#c084fc', // purple-300
      shadow: 'rgba(147, 51, 234, 0.3)', // purple-500 con 30% opacidad
      ring: '#a855f7' // purple-400
    }
  } else if (cardStyles.avatar && cardStyles.avatar.includes('blue')) {
    return {
      border: '#93c5fd', // blue-300
      shadow: 'rgba(59, 130, 246, 0.3)', // blue-500 con 30% opacidad
      ring: '#60a5fa' // blue-400
    }
  } else if (cardStyles.avatar && cardStyles.avatar.includes('green')) {
    return {
      border: '#86efac', // green-300
      shadow: 'rgba(34, 197, 94, 0.3)', // green-500 con 30% opacidad
      ring: '#4ade80' // green-400
    }
  } else if (cardStyles.avatar && cardStyles.avatar.includes('orange')) {
    return {
      border: '#fdba74', // orange-300
      shadow: 'rgba(249, 115, 22, 0.3)', // orange-500 con 30% opacidad
      ring: '#fb923c' // orange-400
    }
  } else {
    // Por defecto, usar colores más vibrantes en lugar de gris
    return {
      border: '#3b82f6', // blue-500 - más vibrante
      shadow: 'rgba(59, 130, 246, 0.3)', // blue-500 con 30% opacidad
      ring: '#2563eb' // blue-600
    }
  }
}

/**
 * Obtiene las clases CSS para el avatar
 * @param {object} cardStyles - Estilos específicos del rol
 * @returns {string} Clases CSS para el avatar
 */
export const getAvatarClasses = (cardStyles) => {
  return `w-12 h-12 bg-gradient-to-br ${cardStyles.avatar} rounded-full flex items-center justify-center shadow-md`
}

/**
 * Obtiene las clases CSS para el menú de acciones
 * @param {boolean} showMenu - Si el menú está visible
 * @returns {string} Clases CSS para el botón del menú
 */
export const getMenuButtonClasses = (showMenu) => {
  const baseClasses = 'w-8 h-8 rounded-full transition-all duration-200 border-none outline-none focus:outline-none focus:ring-0 flex items-center justify-center'
  const stateClasses = showMenu 
    ? 'bg-blue-100 text-blue-600 shadow-sm' 
    : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
  
  return `${baseClasses} ${stateClasses}`
}

/**
 * Obtiene las clases CSS para el icono del menú de tres puntos
 * @param {boolean} showMenu - Si el menú está visible
 * @returns {string} Clases CSS para el icono
 */
export const getMenuIconClasses = (showMenu) => {
  const baseClasses = 'w-4 h-4 transition-all duration-200'
  const stateClasses = showMenu ? 'scale-110' : ''
  
  return `${baseClasses} ${stateClasses}`
}
