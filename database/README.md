# Base de Datos - Sistema de Ligas Pequeñas

Este directorio contiene todos los archivos SQL necesarios para crear la base de datos completa del sistema de gestión de ligas pequeñas en Supabase.

## 📁 Estructura del Directorio

```
database/
├── schemas/           # Archivos SQL con definiciones de tablas
├── migrations/        # Archivos de migración (para futuras versiones)
├── seeds/            # Datos iniciales y de prueba
└── README.md         # Este archivo
```

## 🗄️ Tablas Principales

### 1. **Categorías** (`categorias.sql`)
- Define las 5 categorías de edad: Biberones, Premoyote, Moyote, Peewee, Pequeña
- Incluye rangos de edad y descripciones

### 2. **Posiciones** (`posiciones.sql`)
- Posiciones de juego en el campo (9 y 10 jugadores)
- Incluye ShortFielder como posición opcional

### 3. **Equipos Internos** (`equipos_internos.sql`)
- Equipos internos dentro de cada categoría
- Información de entrenadores y contacto

### 4. **Jugadores** (`jugadores.sql`)
- Datos personales de jugadores
- Información de padres/tutores
- Hasta 4 posiciones por jugador
- Número de playera único por equipo

### 5. **Padres** (`padres.sql`)
- Datos personales y de contacto
- Documentos (INE, comprobante domicilio, etc.)
- Relación con jugadores

### 6. **Pagos** (`pagos.sql`)
- Sistema completo de pagos:
  - Registro
  - Semanal
  - Torneos
  - Partidos
  - Transmisión
  - Uniformes

### 7. **Equipos Contrarios** (`equipos_contrarios.sql`)
- Registro de equipos contrarios
- Estadísticas de enfrentamientos (W-L-D)

### 8. **Partidos** (`partidos.sql`)
- Registro completo de partidos
- Costos (umpire, transmisión)
- Alineaciones y estadísticas individuales

### 9. **Roles de Usuario** (`roles_usuarios.sql`)
- Sistema de roles jerárquico (SuperAdmin, Admin Liga, Admin Categoría, Admin Equipo, Padre)
- Gestión de usuarios y sesiones
- Sistema de permisos granular
- Auditoría de acciones

### 10. **Tablas Adicionales** (`tablas_adicionales.sql`)
- Temporadas
- Entrenamientos y asistencia
- Inventario de equipamiento
- Notificaciones
- Configuraciones del sistema

## 🚀 Instalación en Supabase

### Paso 1: Acceder a Supabase
1. Ve al [Dashboard de Supabase](https://supabase.com/dashboard)
2. Selecciona tu proyecto
3. Ve a la sección "SQL Editor"

### Paso 2: Ejecutar los Scripts
Ejecuta los archivos en el siguiente orden:

```sql
-- 1. Archivo principal
00_crear_base_datos_completa.sql

-- 2. Tablas en orden de dependencias
categorias.sql
posiciones.sql
equipos_internos.sql
jugadores.sql
padres.sql
pagos.sql
equipos_contrarios.sql
partidos.sql
roles_usuarios.sql
tablas_adicionales.sql
```

### Paso 3: Verificar Instalación
El archivo principal incluye una consulta de verificación que mostrará todas las tablas creadas.

## 🔧 Características Técnicas

### Funciones Automáticas
- **Triggers de timestamps**: Actualización automática de `updated_at`
- **Validaciones**: Restricciones de integridad de datos
- **Cálculos automáticos**: Promedios de bateo, estadísticas, etc.

### Índices Optimizados
- Índices en campos de búsqueda frecuente
- Índices compuestos para consultas complejas
- Índices únicos para evitar duplicados

### Relaciones
- Claves foráneas con restricciones apropiadas
- Cascadas de eliminación donde es apropiado
- Tablas intermedias para relaciones muchos-a-muchos

## 📊 Datos Iniciales

El sistema incluye:
- ✅ Categorías predefinidas
- ✅ Posiciones de béisbol
- ✅ Tipos de pago
- ✅ Configuraciones básicas
- ✅ Una temporada activa por defecto
- ✅ Uniformes básicos

## 👥 Sistema de Roles y Permisos

### Roles Disponibles
1. **SuperAdmin** (Nivel 1) - Acceso completo al sistema
2. **Administrador de Liga** (Nivel 2) - Gestión general de la liga
3. **Administrador de Categoría** (Nivel 3) - Gestión de una categoría específica
4. **Administrador de Equipo** (Nivel 4) - Gestión de un equipo específico
5. **Padre de Familia** (Nivel 5) - Acceso limitado a datos propios

### Funciones de Permisos
```sql
-- Verificar si un usuario tiene un permiso específico
SELECT verificar_permiso_usuario('usuario-uuid', 'gestionar_jugadores', categoria_id, equipo_id);

-- Obtener todos los roles de un usuario
SELECT * FROM obtener_roles_usuario('usuario-uuid');

-- Ver usuarios con sus roles
SELECT * FROM vista_usuarios_roles;
```

### Gestión de Sesiones
- Control automático de sesiones activas
- Limpieza automática de sesiones expiradas
- Auditoría completa de acciones de usuarios

## 🔒 Seguridad

### Row Level Security (RLS)
Después de crear las tablas, configura las políticas RLS según tus necesidades:

```sql
-- Ejemplo para tabla jugadores
ALTER TABLE jugadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los usuarios pueden ver sus propios datos" ON jugadores
    FOR SELECT USING (auth.uid() = user_id);
```

### Políticas Recomendadas
- **Lectura**: Usuarios autenticados pueden leer datos según su rol
- **Escritura**: Solo usuarios con permisos específicos pueden modificar datos
- **Eliminación**: Solo SuperAdmin y Administradores de Liga pueden eliminar registros

## 📈 Monitoreo y Mantenimiento

### Consultas Útiles
```sql
-- Verificar integridad de datos
SELECT COUNT(*) FROM jugadores WHERE equipo_interno_id IS NULL;

-- Estadísticas de pagos
SELECT tipo_pago_id, COUNT(*), SUM(monto) 
FROM pagos 
WHERE pagado = true 
GROUP BY tipo_pago_id;

-- Jugadores por categoría
SELECT c.nombre, COUNT(j.id) as total_jugadores
FROM categorias c
LEFT JOIN jugadores j ON c.id = j.categoria_id
GROUP BY c.id, c.nombre;
```

## 🆘 Solución de Problemas

### Errores Comunes
1. **Error de dependencias**: Ejecuta los archivos en el orden correcto
2. **Permisos**: Asegúrate de tener permisos de administrador en Supabase
3. **Sintaxis**: Verifica que estés usando PostgreSQL (Supabase)

### Soporte
Para problemas técnicos, revisa:
- Logs de Supabase en el dashboard
- Documentación oficial de Supabase
- Consultas de verificación incluidas en los scripts

---

**Nota**: Este sistema está diseñado específicamente para PostgreSQL y Supabase. Para otros motores de base de datos, se requerirán ajustes en la sintaxis.
