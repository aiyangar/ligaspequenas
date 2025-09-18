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
      shadow: 'shadow-lg shadow-purple-200/50',
      hoverShadow: 'hover:shadow-xl hover:shadow-purple-300/60',
      ring: 'ring-purple-400',
      hoverRing: 'hover:ring-purple-300',
      avatar: 'from-purple-500 to-purple-600'
    },
    'admin_categoria': {
      border: 'border-2 border-blue-300',
      shadow: 'shadow-lg shadow-blue-200/50',
      hoverShadow: 'hover:shadow-xl hover:shadow-blue-300/60',
      ring: 'ring-blue-400',
      hoverRing: 'hover:ring-blue-300',
      avatar: 'from-blue-500 to-blue-600'
    },
    'admin_equipo': {
      border: 'border-2 border-green-300',
      shadow: 'shadow-lg shadow-green-200/50',
      hoverShadow: 'hover:shadow-xl hover:shadow-green-300/60',
      ring: 'ring-green-400',
      hoverRing: 'hover:ring-green-300',
      avatar: 'from-green-500 to-green-600'
    },
    'padre_tutor': {
      border: 'border-2 border-orange-300',
      shadow: 'shadow-lg shadow-orange-200/50',
      hoverShadow: 'hover:shadow-xl hover:shadow-orange-300/60',
      ring: 'ring-orange-400',
      hoverRing: 'hover:ring-orange-300',
      avatar: 'from-orange-500 to-orange-600'
    }
  }
  
  return styles[rol] || {
    border: 'border-2 border-gray-300',
    shadow: 'shadow-lg shadow-gray-200/50',
    hoverShadow: 'hover:shadow-xl hover:shadow-gray-300/60',
    ring: 'ring-gray-400',
    hoverRing: 'hover:ring-gray-300',
    avatar: 'from-gray-500 to-gray-600'
  }
}

/**
 * Obtiene las clases CSS base para la card
 * @param {object} cardStyles - Estilos específicos del rol
 * @param {boolean} isExpanded - Si la card está expandida
 * @returns {string} Clases CSS completas para la card
 */
export const getCardClasses = (cardStyles, isExpanded) => {
  const baseClasses = 'material-card p-6 cursor-pointer transition-all duration-300 ease-in-out'
  const dynamicClasses = `${cardStyles.border} ${cardStyles.shadow} ${cardStyles.hoverShadow}`
  const stateClasses = isExpanded 
    ? `ring-2 ${cardStyles.ring} transform scale-[1.02]` 
    : `hover:ring-1 ${cardStyles.hoverRing} hover:transform hover:scale-[1.01]`
  
  return `${baseClasses} ${dynamicClasses} ${stateClasses}`
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
