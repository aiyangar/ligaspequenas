# Páginas del Sistema

Este directorio contiene todas las páginas principales del sistema de gestión de ligas pequeñas.

## 📁 Estructura

```
pages/
├── UserManagement.jsx    # Gestión de usuarios y roles
├── index.js             # Exportaciones de páginas
└── README.md           # Este archivo
```

## 🚀 Páginas Disponibles

### 1. **UserManagement.jsx**
**Gestión completa de usuarios del sistema**

#### Características:
- ✅ **CRUD completo** - Crear, leer, actualizar y eliminar usuarios
- ✅ **Gestión de roles** - Asignar roles específicos a usuarios
- ✅ **Validación de permisos** - Solo SuperAdmin puede acceder
- ✅ **Formulario dinámico** - Campos que cambian según el rol seleccionado
- ✅ **Interfaz responsive** - Funciona en todos los dispositivos

#### Roles Disponibles:
1. **Administrador de Liga** - Acceso completo al sistema
2. **Administrador de Categoría** - Gestión de una categoría específica
3. **Administrador de Equipo** - Gestión de un equipo específico
4. **Padre/Tutor** - Acceso limitado a datos propios

#### Funcionalidades:
- **Crear usuario** - Formulario completo con validaciones
- **Editar usuario** - Modificar información y roles
- **Eliminar usuario** - Desactivar (no eliminar físicamente)
- **Lista de usuarios** - Tabla con información completa
- **Filtros dinámicos** - Equipos filtrados por categoría

## 🎨 Estilos

Las páginas utilizan el archivo `styles/pages.css` que incluye:

- **Formularios** - Estilos para inputs, selects, botones
- **Tablas** - Diseño responsive para listas de datos
- **Badges** - Indicadores de estado y roles
- **Alertas** - Mensajes de éxito, error, advertencia
- **Estados vacíos** - Diseño para cuando no hay datos
- **Animaciones** - Transiciones suaves

## 🔧 Uso

### Importar una página:
```javascript
import { UserManagement } from '../pages'
```

### Acceso a páginas:
```javascript
// Solo SuperAdmin puede acceder a UserManagement
if (isSuperAdmin) {
  return <UserManagement />
}
```

## 📋 Próximas Páginas

### En desarrollo:
- **CategoryManagement.jsx** - Gestión de categorías
- **TeamManagement.jsx** - Gestión de equipos
- **PlayerManagement.jsx** - Gestión de jugadores
- **MatchManagement.jsx** - Gestión de partidos
- **PaymentManagement.jsx** - Gestión de pagos

### Planificadas:
- **Reports.jsx** - Reportes y estadísticas
- **Settings.jsx** - Configuración del sistema
- **Notifications.jsx** - Centro de notificaciones

## 🛠️ Servicios de Base de Datos

Cada página utiliza servicios específicos del archivo `lib/database.js`:

```javascript
// Ejemplo de uso
import { usuariosService, categoriasService } from '../lib/database'

// Obtener todos los usuarios
const users = await usuariosService.getAll()

// Crear nuevo usuario
const newUser = await usuariosService.create(userData)

// Actualizar usuario
const updatedUser = await usuariosService.update(id, updates)

// Eliminar usuario
await usuariosService.delete(id)
```

## 🔒 Seguridad

- **Autenticación requerida** - Todas las páginas verifican autenticación
- **Autorización por roles** - Acceso basado en permisos de usuario
- **Validación de datos** - Formularios con validaciones del lado cliente y servidor
- **Sanitización** - Datos limpiados antes de enviar a la base de datos

## 📱 Responsive Design

Todas las páginas están diseñadas para funcionar en:
- ✅ **Desktop** - Experiencia completa
- ✅ **Tablet** - Interfaz adaptada
- ✅ **Mobile** - Diseño optimizado para móviles

## 🎯 Mejores Prácticas

1. **Componentes reutilizables** - Usar componentes comunes
2. **Estados de carga** - Mostrar indicadores de progreso
3. **Manejo de errores** - Mensajes claros para el usuario
4. **Validaciones** - Verificar datos antes de enviar
5. **Accesibilidad** - Etiquetas y navegación por teclado
6. **Performance** - Cargar datos de forma eficiente
