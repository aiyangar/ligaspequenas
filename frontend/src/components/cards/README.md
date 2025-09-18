# Cards del Sistema

Este directorio contiene todas las cards reutilizables del sistema de gestión de ligas pequeñas.

## 📁 Estructura

```
cards/
├── UserCard.jsx      # Card de usuario con menú de acciones
├── index.js         # Exportaciones de cards
└── README.md        # Este archivo
```

## 🚀 Cards Disponibles

### 1. **UserCard.jsx**
**Card para mostrar información de usuarios con funcionalidades interactivas**

#### Características:
- ✅ **Diseño moderno** - Card con avatar, información básica y rol
- ✅ **Funcionalidad clickable** - Se expande al hacer click para mostrar detalles
- ✅ **Menú de acciones** - Botón de tres puntos con opciones Editar/Eliminar
- ✅ **Estados visuales** - Indicadores de estado activo/inactivo
- ✅ **Responsive** - Se adapta a diferentes tamaños de pantalla
- ✅ **Animaciones suaves** - Transiciones elegantes en todas las interacciones

#### Props:
- `user` - Objeto con información del usuario
- `onEdit` - Función callback para editar usuario
- `onDelete` - Función callback para eliminar usuario
- `onCardClick` - Función callback para expandir/contraer card
- `isExpanded` - Boolean que indica si la card está expandida

#### Uso:
```jsx
import { UserCard } from '../components/cards'

<UserCard
  user={user}
  onEdit={handleEdit}
  onDelete={handleDelete}
  onCardClick={handleCardClick}
  isExpanded={expandedUserId === user.id}
/>
```

#### Información Mostrada:

**Vista Compacta:**
- Avatar con inicial del nombre
- Nombre completo y email
- Rol con color distintivo
- Estado (Activo/Inactivo)
- Menú de acciones (tres puntos)

**Vista Expandida:**
- Teléfono
- Asignación (categoría/equipo)
- Email completo
- Información adicional

#### Colores por Rol:
- 🟣 **Administrador de Liga** - Púrpura
- 🔵 **Administrador de Categoría** - Azul
- 🟢 **Administrador de Equipo** - Verde
- 🟠 **Padre/Tutor** - Naranja

## 🎨 Estilos

Las cards utilizan las siguientes clases CSS:

### Clases Globales:
- `material-card` - Tarjeta con sombra Material Design
- `text-surface-900` - Texto principal
- `text-surface-700` - Texto secundario
- `text-surface-600` - Texto terciario

### Clases de Card:
- `rounded-full` - Bordes completamente redondeados
- `shadow-lg` - Sombra pronunciada
- `transition-all` - Transiciones suaves
- `hover:shadow-xl` - Efecto hover con sombra

## 🔧 Mejores Prácticas

### 1. **Reutilización**
- Las cards están diseñadas para ser reutilizables
- Reciben toda la lógica a través de props
- No contienen lógica de negocio interna

### 2. **Interactividad**
- Feedback visual inmediato en todas las interacciones
- Animaciones suaves y elegantes
- Estados claros y consistentes

### 3. **Accesibilidad**
- Tamaños de click apropiados
- Contraste de colores adecuado
- Navegación por teclado funcional
- Iconos descriptivos

### 4. **Responsive Design**
- Diseño adaptativo para móviles y desktop
- Grid system para organizar cards
- Elementos optimizados para touch

## 📋 Próximas Cards

### En desarrollo:
- **CategoryCard.jsx** - Card para mostrar categorías
- **TeamCard.jsx** - Card para mostrar equipos
- **PlayerCard.jsx** - Card para mostrar jugadores
- **MatchCard.jsx** - Card para mostrar partidos
- **PaymentCard.jsx** - Card para mostrar pagos

### Planificadas:
- **StatsCard.jsx** - Card para mostrar estadísticas
- **NotificationCard.jsx** - Card para notificaciones
- **ReportCard.jsx** - Card para reportes

## 🛠️ Desarrollo

### Crear una nueva card:

1. **Crear el archivo** en `cards/`
2. **Exportar el componente** en `index.js`
3. **Documentar** en este README
4. **Probar** en la página correspondiente

### Estructura recomendada:
```jsx
import React, { useState } from 'react'

export const MiCard = ({ 
  // Props de la card
  data,
  onAction,
  // Props específicas
  ...otherProps
}) => {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="material-card p-6 cursor-pointer transition-all duration-200 hover:shadow-lg">
      {/* Contenido de la card */}
      
      {/* Información expandida */}
      {isExpanded && (
        <div className="border-t border-gray-200 pt-4">
          {/* Detalles adicionales */}
        </div>
      )}
    </div>
  )
}
```

## 🔒 Seguridad

- **Validación de datos** - Todas las props son validadas
- **Sanitización** - Datos limpiados antes de mostrar
- **Autenticación** - Cards requieren usuario autenticado
- **Autorización** - Acceso basado en roles de usuario

## 📱 Responsive Design

Todas las cards están diseñadas para funcionar en:
- ✅ **Desktop** - Experiencia completa
- ✅ **Tablet** - Interfaz adaptada
- ✅ **Mobile** - Diseño optimizado para móviles
