# Frontend - Sistema de Ligas Pequeñas

Este es el frontend del sistema de gestión de ligas pequeñas, construido con React, TypeScript y Supabase.

## 🚀 Configuración Inicial

### 1. Instalar Dependencias
```bash
npm install
```

### 2. Configurar Variables de Entorno
1. Copia el archivo `env.example` como `.env.local`
2. Obtén las credenciales de tu proyecto de Supabase:
   - Ve a [Supabase Dashboard](https://supabase.com/dashboard)
   - Selecciona tu proyecto
   - Ve a Settings > API
   - Copia la URL del proyecto y la clave anónima
3. Actualiza el archivo `.env.local` con tus credenciales:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_clave_anonima_aqui
```

### 3. Ejecutar el Proyecto
```bash
npm run dev
```

## 📁 Estructura del Proyecto

```
src/
├── components/          # Componentes React
│   ├── Auth.tsx        # Componente de autenticación
│   └── Dashboard.tsx   # Panel principal
├── hooks/              # Hooks personalizados
│   └── useAuth.ts      # Hook de autenticación
├── lib/                # Configuración y servicios
│   ├── supabase.ts     # Configuración de Supabase
│   └── database.ts     # Servicios de base de datos
└── App.tsx             # Componente principal
```

## 🔧 Características

### ✅ Implementado
- **Autenticación completa** con Supabase Auth
- **Conexión a base de datos** con todas las tablas
- **Dashboard principal** con estadísticas
- **Gestión de categorías, equipos y jugadores**
- **Interfaz responsive** con Tailwind CSS
- **Tipos TypeScript** para todas las entidades

### 🔄 En Desarrollo
- Gestión de pagos
- Sistema de partidos
- Gestión de padres/tutores
- Sistema de roles y permisos
- Notificaciones

## 🗄️ Servicios de Base de Datos

### Categorías
```typescript
import { categoriasService } from './lib/database'

// Obtener todas las categorías
const categorias = await categoriasService.getAll()

// Crear nueva categoría
const nuevaCategoria = await categoriasService.create({
  nombre: 'Nueva Categoría',
  edad_minima: 5,
  edad_maxima: 6,
  descripcion: 'Descripción de la categoría'
})
```

### Equipos Internos
```typescript
import { equiposInternosService } from './lib/database'

// Obtener equipos por categoría
const equipos = await equiposInternosService.getByCategoria(categoriaId)

// Crear nuevo equipo
const nuevoEquipo = await equiposInternosService.create({
  nombre: 'Equipo A',
  categoria_id: 1,
  color_uniforme: 'Azul',
  entrenador_principal: 'Juan Pérez'
})
```

### Jugadores
```typescript
import { jugadoresService } from './lib/database'

// Obtener jugadores por equipo
const jugadores = await jugadoresService.getByEquipo(equipoId)

// Crear nuevo jugador
const nuevoJugador = await jugadoresService.create({
  nombre: 'Carlos',
  apellido_paterno: 'García',
  fecha_nacimiento: '2015-03-15',
  numero_playera: 10,
  equipo_interno_id: 1,
  categoria_id: 1
})
```

## 🔐 Autenticación

### Hook useAuth
```typescript
import { useAuth } from './hooks/useAuth'

function MiComponente() {
  const { user, loading, signIn, signOut, isAuthenticated } = useAuth()

  if (loading) return <div>Cargando...</div>
  
  if (!isAuthenticated) {
    return <Auth />
  }

  return <Dashboard />
}
```

### Métodos de Autenticación
- `signIn(email, password)` - Iniciar sesión
- `signUp(email, password, userData)` - Registrar usuario
- `signOut()` - Cerrar sesión
- `getCurrentUser()` - Obtener usuario actual

## 🎨 Estilos

El proyecto usa **Tailwind CSS** para los estilos. Los componentes están diseñados con:
- Diseño responsive
- Colores consistentes
- Componentes reutilizables
- Animaciones suaves

## 📱 Responsive Design

- **Mobile First**: Diseño optimizado para móviles
- **Breakpoints**: sm, md, lg, xl
- **Grid System**: CSS Grid y Flexbox
- **Componentes adaptativos**: Se ajustan a diferentes tamaños de pantalla

## 🚀 Despliegue

### Vercel (Recomendado)
1. Conecta tu repositorio a Vercel
2. Configura las variables de entorno en Vercel
3. Despliega automáticamente

### Netlify
1. Conecta tu repositorio a Netlify
2. Configura las variables de entorno
3. Despliega

### Build Local
```bash
npm run build
npm run preview
```

## 🔧 Scripts Disponibles

- `npm run dev` - Servidor de desarrollo
- `npm run build` - Build de producción
- `npm run preview` - Preview del build
- `npm run lint` - Linter de código

## 📚 Próximos Pasos

1. **Configurar Supabase**: Ejecutar los scripts SQL en tu proyecto
2. **Configurar variables de entorno**: Actualizar `.env.local`
3. **Probar la conexión**: Verificar que los datos se cargan correctamente
4. **Personalizar**: Adaptar los componentes a tus necesidades

## 🆘 Solución de Problemas

### Error de conexión a Supabase
- Verifica que las variables de entorno estén configuradas correctamente
- Asegúrate de que tu proyecto de Supabase esté activo
- Revisa que las tablas existan en la base de datos

### Error de autenticación
- Verifica que Supabase Auth esté habilitado
- Revisa las políticas de RLS en Supabase
- Asegúrate de que el email esté confirmado

### Error de tipos TypeScript
- Ejecuta `npm run build` para ver errores de tipos
- Verifica que los tipos en `supabase.ts` coincidan con tu base de datos
- Actualiza los tipos si has modificado la estructura de la base de datos