# Layout Components

Esta carpeta contiene componentes de layout reutilizables para la aplicación.

## PageHeader

Componente header reutilizable para todas las páginas excepto el Dashboard.

### Props

- `title` (string, requerido): Título principal de la página
- `subtitle` (string, opcional): Subtítulo o descripción de la página
- `onNavigate` (function, opcional): Función para navegar de vuelta al dashboard
- `actions` (React.ReactNode, opcional): Elementos de acción (botones, etc.) a mostrar en el lado derecho
- `className` (string, opcional): Clases CSS adicionales para el contenedor

### Uso

```jsx
import { PageHeader } from '../components/layout'

<PageHeader
  title="Gestión de Usuarios"
  subtitle="Administra los usuarios del sistema y sus roles"
  onNavigate={onNavigate}
  actions={
    <button className="material-button-primary">
      + Nuevo Usuario
    </button>
  }
/>
```

### Características

- **Separación clara**: El botón "Volver" está completamente separado en su propio contenedor
- **Responsive**: Se adapta a diferentes tamaños de pantalla
- **Reutilizable**: Puede ser usado en todas las páginas que no sean el Dashboard
- **Flexible**: Acepta cualquier contenido en la sección de acciones
- **Consistente**: Mantiene el mismo estilo visual en toda la aplicación

### Estructura

```
┌─────────────────────────────────────────┐
│ Título de la Página              [Acciones] │
│ Subtítulo de la página                   │
├─────────────────────────────────────────┤
│ ← Volver al Dashboard                    │
└─────────────────────────────────────────┘
```
