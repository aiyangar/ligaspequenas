# Sistema de Navegación

Este documento explica cómo funciona el sistema de navegación implementado en la aplicación.

## 🚀 Arquitectura del Sistema

### Componentes Principales

1. **Router.jsx** - Componente principal que maneja el estado de navegación
2. **Layout.jsx** - Contenedor que incluye Navbar y Footer
3. **Navbar.jsx** - Barra de navegación superior
4. **Menu.jsx** - Menú de navegación (desktop y mobile)
5. **Dashboard.jsx** - Página principal con botones de navegación
6. **UserManagement.jsx** - Página de gestión de usuarios

### Flujo de Navegación

```
App.jsx
├── Router.jsx (estado de navegación)
│   ├── Layout.jsx
│   │   ├── Navbar.jsx
│   │   │   └── Menu.jsx (botones de navegación)
│   │   └── Footer.jsx
│   └── Páginas (Dashboard, UserManagement, etc.)
```

## 🔧 Implementación

### 1. Estado de Navegación

El componente `Router` mantiene el estado de la página actual:

```javascript
const [currentPage, setCurrentPage] = useState('dashboard')

const navigateTo = (page) => {
  setCurrentPage(page)
}
```

### 2. Páginas Disponibles

```javascript
const renderCurrentPage = () => {
  switch (currentPage) {
    case 'dashboard':
      return <Dashboard onNavigate={navigateTo} />
    case 'usuarios':
      return <UserManagement onNavigate={navigateTo} />
    default:
      return <Dashboard onNavigate={navigateTo} />
  }
}
```

### 3. Navegación desde el Menú

Los elementos del menú son botones que llaman a `onNavigate`:

```javascript
const menuItems = [
  { name: 'Dashboard', page: 'dashboard', icon: '🏠' },
  { name: 'Gestión de Usuarios', page: 'usuarios', icon: '👥', isAdmin: true }
]

const handleClick = (e) => {
  e.preventDefault()
  if (onNavigate) {
    onNavigate(item.page)
  }
}
```

### 4. Navegación desde el Dashboard

Los botones del Dashboard también usan `onNavigate`:

```javascript
<button 
  onClick={() => onNavigate('usuarios')}
  className="material-button-primary"
>
  Gestionar Usuarios
</button>
```

## 📱 Navegación Responsive

### Desktop (1280px+)
- Menú horizontal en la navbar
- Botones de navegación visibles
- Navegación fluida entre páginas

### Tablet/Mobile (< 1280px)
- Menú hamburguesa
- Menú desplegable con botones de navegación
- Cierre automático del menú al navegar

## 🎯 Funcionalidades

### ✅ Implementadas

1. **Navegación entre páginas** - Cambio de estado sin recarga
2. **Menú responsive** - Funciona en todos los dispositivos
3. **Botones de navegación** - Desde Dashboard y menú
4. **Botón de regreso** - En páginas secundarias
5. **Cierre automático** - Menú mobile se cierra al navegar
6. **Estados de carga** - Indicadores durante navegación

### 🔄 En Desarrollo

1. **Historial de navegación** - Botón atrás/adelante
2. **Breadcrumbs** - Ruta de navegación
3. **URLs amigables** - Rutas en la barra de direcciones
4. **Navegación por teclado** - Accesibilidad mejorada

## 🎨 Estilos

### Clases CSS Utilizadas

```css
/* Botones de navegación */
.nav-button {
  background: none;
  border: none;
  color: #6b7280;
  cursor: pointer;
  transition: color 0.2s ease;
}

/* Elementos del menú */
.menu-item {
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: color 0.2s;
}
```

## 🔒 Seguridad

### Control de Acceso

- **Verificación de permisos** - Solo SuperAdmin puede acceder a gestión de usuarios
- **Validación de rutas** - Páginas verifican permisos antes de renderizar
- **Redirección automática** - Usuarios sin permisos son redirigidos

### Ejemplo de Implementación

```javascript
if (!isSuperAdmin) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-red-600 text-xl mb-4">Acceso Denegado</div>
        <p className="text-gray-600">Solo el SuperAdministrador puede acceder</p>
      </div>
    </div>
  )
}
```

## 📋 Agregar Nuevas Páginas

### 1. Crear la Página

```javascript
// src/pages/NewPage.jsx
export const NewPage = ({ onNavigate }) => {
  return (
    <div>
      <h1>Nueva Página</h1>
      <button onClick={() => onNavigate('dashboard')}>
        Volver al Dashboard
      </button>
    </div>
  )
}
```

### 2. Agregar al Router

```javascript
// src/components/Router.jsx
import { NewPage } from '../pages/NewPage'

const renderCurrentPage = () => {
  switch (currentPage) {
    case 'nueva-pagina':
      return <NewPage onNavigate={navigateTo} />
    // ... otros casos
  }
}
```

### 3. Agregar al Menú

```javascript
// src/components/Menu.jsx
const menuItems = [
  { name: 'Nueva Página', page: 'nueva-pagina', icon: '🆕' }
]
```

## 🚀 Mejoras Futuras

### React Router DOM
Para una navegación más avanzada, se puede implementar React Router DOM:

```bash
npm install react-router-dom
```

### Beneficios de React Router
- URLs amigables
- Historial de navegación
- Navegación programática
- Rutas anidadas
- Lazy loading de componentes

### Implementación con React Router

```javascript
import { BrowserRouter, Routes, Route } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/usuarios" element={<UserManagement />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
```

## 🎯 Mejores Prácticas

1. **Consistencia** - Usar el mismo patrón para todas las páginas
2. **Accesibilidad** - Incluir títulos y navegación por teclado
3. **Performance** - Lazy loading para páginas grandes
4. **UX** - Indicadores de carga y transiciones suaves
5. **Mantenibilidad** - Código limpio y bien documentado
