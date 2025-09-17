-- =====================================================
-- SCRIPT PRINCIPAL PARA CREAR LA BASE DE DATOS COMPLETA
-- Sistema de Gestión de Ligas Pequeñas
-- =====================================================

-- Este archivo contiene todas las instrucciones para crear la base de datos completa
-- Ejecutar en el siguiente orden:

-- 1. Crear función de actualización de timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 2. Ejecutar los siguientes archivos en orden:
--    - categorias.sql
--    - posiciones.sql
--    - equipos_internos.sql
--    - jugadores.sql
--    - padres.sql
--    - pagos.sql
--    - equipos_contrarios.sql
--    - partidos.sql
--    - roles_usuarios.sql
--    - tablas_adicionales.sql

-- =====================================================
-- INSTRUCCIONES DE INSTALACIÓN EN SUPABASE
-- =====================================================

/*
PASOS PARA IMPLEMENTAR EN SUPABASE:

1. Acceder al Dashboard de Supabase
2. Ir a la sección "SQL Editor"
3. Ejecutar este archivo completo o cada archivo individual en orden
4. Verificar que todas las tablas se crearon correctamente
5. Configurar las políticas de seguridad (RLS) según sea necesario

ORDEN DE EJECUCIÓN RECOMENDADO:
1. 00_crear_base_datos_completa.sql (este archivo)
2. categorias.sql
3. posiciones.sql
4. equipos_internos.sql
5. jugadores.sql
6. padres.sql
7. pagos.sql
8. equipos_contrarios.sql
9. partidos.sql
10. roles_usuarios.sql
11. tablas_adicionales.sql

NOTAS IMPORTANTES:
- Asegúrate de que Row Level Security (RLS) esté configurado según tus necesidades
- Los archivos están diseñados para PostgreSQL (Supabase)
- Todas las tablas incluyen timestamps automáticos
- Se incluyen índices para optimizar el rendimiento
- Se incluyen triggers para mantener la integridad de los datos
*/

-- =====================================================
-- VERIFICACIÓN DE INSTALACIÓN
-- =====================================================

-- Consulta para verificar que todas las tablas se crearon correctamente
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN (
        'categorias',
        'posiciones', 
        'equipos_internos',
        'jugadores',
        'jugador_posiciones',
        'padres',
        'documentos_padres',
        'padre_jugadores',
        'tipos_pago',
        'pagos',
        'torneos',
        'pagos_torneos',
        'uniformes',
        'pagos_uniformes',
        'equipos_contrarios',
        'estadisticas_enfrentamientos',
        'partidos',
        'costos_partido',
        'transmisiones',
        'alineaciones_partido',
        'estadisticas_jugador_partido',
        'roles_usuario',
        'usuarios',
        'usuario_roles',
        'sesiones_usuario',
        'auditoria_usuarios',
        'temporadas',
        'entrenamientos',
        'asistencia_entrenamientos',
        'inventario_equipamiento',
        'prestamos_equipamiento',
        'notificaciones',
        'destinatarios_notificaciones',
        'configuraciones'
    )
ORDER BY tablename;

-- =====================================================
-- CONFIGURACIÓN INICIAL RECOMENDADA
-- =====================================================

-- Activar una temporada por defecto
INSERT INTO temporadas (nombre, descripcion, fecha_inicio, activa) 
VALUES ('Temporada 2024', 'Temporada principal 2024', CURRENT_DATE, true);

-- Configurar algunos uniformes básicos
INSERT INTO uniformes (nombre, descripcion, precio, tallas_disponibles) VALUES
('Uniforme Principal', 'Uniforme principal de la liga', 250.00, ARRAY['XS', 'S', 'M', 'L', 'XL']),
('Uniforme Alternativo', 'Uniforme alternativo', 200.00, ARRAY['XS', 'S', 'M', 'L', 'XL']);

-- =====================================================
-- FIN DEL SCRIPT PRINCIPAL
-- =====================================================
