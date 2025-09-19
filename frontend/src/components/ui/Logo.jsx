import React from 'react'

export const Logo = ({ size = 'default', showText = true, className = '' }) => {
  const getSizeClasses = () => {
    switch (size) {
      case 'small':
        return {
          container: 'w-6 h-6',
          icon: 'text-sm',
          text: 'text-lg'
        }
      case 'large':
        return {
          container: 'w-12 h-12',
          icon: 'text-2xl',
          text: 'text-3xl'
        }
      case 'xlarge':
        return {
          container: 'w-16 h-16',
          icon: 'text-3xl',
          text: 'text-4xl'
        }
      default:
        return {
          container: 'w-8 h-8',
          icon: 'text-lg',
          text: 'text-xl'
        }
    }
  }

  const sizeClasses = getSizeClasses()

  return (
    <div className={`flex items-center ${className}`}>
      <div className={`flex-shrink-0 flex items-center`}>
        <div className={`${sizeClasses.container} bg-blue-600 rounded-lg flex items-center justify-center mr-3`}>
          <span className={`text-white font-bold ${sizeClasses.icon}`}>⚾</span>
        </div>
        {showText && (
          <span className={`font-bold text-gray-900 ${sizeClasses.text}`}>
            Ligas Pequeñas
          </span>
        )}
      </div>
    </div>
  )
}
