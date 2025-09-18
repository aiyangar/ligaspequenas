# Formularios del Sistema

Este directorio contiene todos los formularios reutilizables del sistema de gestión de ligas pequeñas.

## 📁 Estructura

```
forms/
├── LoginForm.jsx      # Formulario de autenticación
├── UserForm.jsx       # Formulario de gestión de usuarios
├── index.js          # Exportaciones de formularios
└── README.md         # Este archivo
```

## 🚀 Formularios Disponibles

### 1. **LoginForm.jsx**
**Formulario de autenticación de usuarios**

#### Características:
- ✅ **Diseño atractivo** - Interfaz moderna con gradientes y animaciones
- ✅ **Validación de campos** - Email y contraseña requeridos
- ✅ **Estados de carga** - Indicador visual durante el proceso de login
- ✅ **Manejo de errores** - Mensajes claros para el usuario
- ✅ **Responsive** - Funciona en todos los dispositivos

#### Props:
- `onAuthSuccess` - Función callback cuando el login es exitoso
- `signIn` - Función de autenticación del hook useAuth

#### Uso:
```jsx
import { LoginForm } from '../components/forms'

<LoginForm 
  onAuthSuccess={handleAuthSuccess}
  signIn={signIn}
/>
```

### 2. **UserForm.jsx**
**Formulario de creación y edición de usuarios**

#### Características:
- ✅ **Formulario dinámico** - Campos que cambian según el rol seleccionado
- ✅ **Validaciones** - Campos requeridos y validación de tipos
- ✅ **Dos columnas** - Información personal y roles/permisos
- ✅ **Filtros inteligentes** - Equipos filtrados por categoría
- ✅ **Modo edición** - Reutilizable para crear y editar usuarios

#### Props:
- `formData` - Estado del formulario con todos los campos
- `handleInputChange` - Función para manejar cambios en los inputs
- `handleSubmit` - Función para enviar el formulario
- `editingUser` - Usuario en edición (null para crear nuevo)
- `categorias` - Lista de categorías disponibles
- `equipos` - Lista de equipos disponibles
- `getFilteredEquipos` - Función para filtrar equipos por categoría
- `onCancel` - Función para cancelar el formulario

#### Uso:
```jsx
import { UserForm } from '../components/forms'

<UserForm
  formData={formData}
  handleInputChange={handleInputChange}
  handleSubmit={handleSubmit}
  editingUser={editingUser}
  categorias={categorias}
  equipos={equipos}
  getFilteredEquipos={getFilteredEquipos}
  onCancel={handleCancel}
/>
```

## 🎨 Estilos

Los formularios utilizan las siguientes clases CSS:

### Clases Globales:
- `material-card` - Tarjeta con sombra Material Design
- `material-button-primary` - Botón primario del sistema
- `text-surface-900` - Texto principal
- `text-surface-700` - Texto secundario
- `text-surface-600` - Texto terciario

### Clases de Formulario:
- `form-container` - Contenedor principal del formulario
- `form-section` - Sección del formulario
- `form-group` - Grupo de campos
- `form-label` - Etiquetas de campos
- `form-input` - Campos de entrada
- `form-select` - Campos de selección

## 🔧 Mejores Prácticas

### 1. **Reutilización**
- Los formularios están diseñados para ser reutilizables
- Reciben toda la lógica a través de props
- No contienen lógica de negocio interna

### 2. **Validación**
- Validaciones del lado cliente con HTML5
- Mensajes de error claros y específicos
- Campos requeridos marcados con asterisco (*)

### 3. **Accesibilidad**
- Etiquetas asociadas correctamente a los campos
- Navegación por teclado funcional
- Contraste de colores adecuado

### 4. **Responsive Design**
- Diseño adaptativo para móviles y desktop
- Grid system para organizar campos
- Botones y campos optimizados para touch

## 📋 Próximos Formularios

### En desarrollo:
- **CategoryForm.jsx** - Formulario de gestión de categorías
- **TeamForm.jsx** - Formulario de gestión de equipos
- **PlayerForm.jsx** - Formulario de gestión de jugadores
- **MatchForm.jsx** - Formulario de gestión de partidos
- **PaymentForm.jsx** - Formulario de gestión de pagos

### Planificados:
- **SearchForm.jsx** - Formulario de búsqueda avanzada
- **FilterForm.jsx** - Formulario de filtros
- **ReportForm.jsx** - Formulario de generación de reportes

## 🛠️ Desarrollo

### Crear un nuevo formulario:

1. **Crear el archivo** en `forms/`
2. **Exportar el componente** en `index.js`
3. **Documentar** en este README
4. **Probar** en la página correspondiente

### Estructura recomendada:
```jsx
import React from 'react'

export const MiFormulario = ({ 
  // Props del formulario
  formData,
  handleInputChange,
  handleSubmit,
  onCancel,
  // Props específicas
  ...otherProps
}) => {
  return (
    <div className="material-card p-6">
      <h2 className="text-xl font-semibold text-surface-900 mb-6">
        Título del Formulario
      </h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Campos del formulario */}
        
        {/* Botones */}
        <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
          <button type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="material-button-primary">
            Guardar
          </button>
        </div>
      </form>
    </div>
  )
}
```

## 🔒 Seguridad

- **Validación de datos** - Todos los campos son validados
- **Sanitización** - Datos limpiados antes de enviar
- **Autenticación** - Formularios requieren usuario autenticado
- **Autorización** - Acceso basado en roles de usuario
