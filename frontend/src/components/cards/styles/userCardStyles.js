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
      border: 'border-purple-200',
      shadow: 'shadow-purple-100',
      hoverShadow: 'hover:shadow-purple-200',
      ring: 'ring-purple-300',
      hoverRing: 'hover:ring-purple-200',
      avatar: 'from-purple-500 to-purple-600'
    },
    'admin_categoria': {
      border: 'border-blue-200',
      shadow: 'shadow-blue-100',
      hoverShadow: 'hover:shadow-blue-200',
      ring: 'ring-blue-300',
      hoverRing: 'hover:ring-blue-200',
      avatar: 'from-blue-500 to-blue-600'
    },
    'admin_equipo': {
      border: 'border-green-200',
      shadow: 'shadow-green-100',
      hoverShadow: 'hover:shadow-green-200',
      ring: 'ring-green-300',
      hoverRing: 'hover:ring-green-200',
      avatar: 'from-green-500 to-green-600'
    },
    'padre_tutor': {
      border: 'border-orange-200',
      shadow: 'shadow-orange-100',
      hoverShadow: 'hover:shadow-orange-200',
      ring: 'ring-orange-300',
      hoverRing: 'hover:ring-orange-200',
      avatar: 'from-orange-500 to-orange-600'
    }
  }
  
  return styles[rol] || {
    border: 'border-gray-200',
    shadow: 'shadow-gray-100',
    hoverShadow: 'hover:shadow-gray-200',
    ring: 'ring-gray-300',
    hoverRing: 'hover:ring-gray-200',
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
  const baseClasses = 'material-card p-6 cursor-pointer transition-all duration-200 border'
  const dynamicClasses = `${cardStyles.border} ${cardStyles.shadow} ${cardStyles.hoverShadow}`
  const stateClasses = isExpanded 
    ? `ring-2 ${cardStyles.ring}` 
    : `hover:ring-1 ${cardStyles.hoverRing}`
  
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
  const baseClasses = 'p-2 rounded-full transition-all duration-200 border-none outline-none focus:outline-none focus:ring-0'
  const stateClasses = showMenu 
    ? 'bg-blue-100 text-blue-600 shadow-sm' 
    : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
  
  return `${baseClasses} ${stateClasses}`
}

/**
 * Obtiene las clases CSS para el icono del menú hamburguesa
 * @param {boolean} showMenu - Si el menú está visible
 * @returns {string} Clases CSS para el icono
 */
export const getMenuIconClasses = (showMenu) => {
  const baseClasses = 'w-5 h-5 transition-all duration-200'
  const stateClasses = showMenu ? 'rotate-180' : ''
  
  return `${baseClasses} ${stateClasses}`
}
