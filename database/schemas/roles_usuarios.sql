-- Tabla: Roles de Usuario
-- Descripción: Sistema de roles y permisos para diferentes tipos de usuarios

CREATE TABLE roles_usuario (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT,
    nivel_permisos INTEGER NOT NULL, -- 1=SuperAdmin, 2=Admin Liga, 3=Admin Categoria, 4=Admin Equipo, 5=Padre
    permisos JSONB, -- Permisos específicos en formato JSON
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar los roles predefinidos
INSERT INTO roles_usuario (nombre, descripcion, nivel_permisos, permisos) VALUES
('SuperAdmin', 'Administrador del sistema con acceso completo', 1, '{
    "gestionar_usuarios": true,
    "gestionar_ligas": true,
    "gestionar_categorias": true,
    "gestionar_equipos": true,
    "gestionar_jugadores": true,
    "gestionar_padres": true,
    "gestionar_pagos": true,
    "gestionar_partidos": true,
    "gestionar_torneos": true,
    "gestionar_inventario": true,
    "gestionar_configuraciones": true,
    "ver_reportes": true,
    "exportar_datos": true
}'),

('Administrador de Liga', 'Administrador general de la liga', 2, '{
    "gestionar_categorias": true,
    "gestionar_equipos": true,
    "gestionar_jugadores": true,
    "gestionar_padres": true,
    "gestionar_pagos": true,
    "gestionar_partidos": true,
    "gestionar_torneos": true,
    "gestionar_inventario": true,
    "ver_reportes": true,
    "exportar_datos": true
}'),

('Administrador de Categoría', 'Administrador de una categoría específica', 3, '{
    "gestionar_equipos": true,
    "gestionar_jugadores": true,
    "gestionar_padres": true,
    "gestionar_pagos": true,
    "gestionar_partidos": true,
    "ver_reportes": true
}'),

('Administrador de Equipo', 'Administrador de un equipo específico', 4, '{
    "gestionar_jugadores": true,
    "gestionar_padres": true,
    "gestionar_pagos": true,
    "gestionar_partidos": true,
    "ver_reportes": true
}'),

('Padre de Familia', 'Padre o tutor de jugador(es)', 5, '{
    "ver_jugadores_propios": true,
    "ver_pagos_propios": true,
    "ver_partidos_propios": true,
    "actualizar_datos_propios": true,
    "recibir_notificaciones": true
}');

-- Tabla de usuarios del sistema
CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido_paterno VARCHAR(100) NOT NULL,
    apellido_materno VARCHAR(100),
    telefono VARCHAR(20),
    activo BOOLEAN DEFAULT true,
    email_verificado BOOLEAN DEFAULT false,
    ultimo_acceso TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla intermedia para asignar roles a usuarios
CREATE TABLE usuario_roles (
    id SERIAL PRIMARY KEY,
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    rol_id INTEGER NOT NULL REFERENCES roles_usuario(id) ON DELETE CASCADE,
    categoria_id INTEGER REFERENCES categorias(id) ON DELETE CASCADE, -- Para Admin de Categoría
    equipo_interno_id INTEGER REFERENCES equipos_internos(id) ON DELETE CASCADE, -- Para Admin de Equipo
    padre_id INTEGER REFERENCES padres(id) ON DELETE CASCADE, -- Para Padre de Familia
    activo BOOLEAN DEFAULT true,
    fecha_asignacion DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(usuario_id, rol_id, categoria_id, equipo_interno_id, padre_id)
);

-- Tabla para sesiones de usuario
CREATE TABLE sesiones_usuario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_sesion VARCHAR(500) NOT NULL,
    fecha_inicio TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fecha_expiracion TIMESTAMP WITH TIME ZONE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    activa BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla para auditoría de acciones de usuarios
CREATE TABLE auditoria_usuarios (
    id SERIAL PRIMARY KEY,
    usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    accion VARCHAR(100) NOT NULL,
    tabla_afectada VARCHAR(100),
    registro_id INTEGER,
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear trigger para actualizar updated_at automáticamente
CREATE TRIGGER update_roles_usuario_updated_at 
    BEFORE UPDATE ON roles_usuario 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_usuarios_updated_at 
    BEFORE UPDATE ON usuarios 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Índices para optimizar consultas
CREATE INDEX idx_roles_usuario_nivel ON roles_usuario(nivel_permisos);
CREATE INDEX idx_roles_usuario_activo ON roles_usuario(activo);
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_activo ON usuarios(activo);
CREATE INDEX idx_usuario_roles_usuario ON usuario_roles(usuario_id);
CREATE INDEX idx_usuario_roles_rol ON usuario_roles(rol_id);
CREATE INDEX idx_usuario_roles_categoria ON usuario_roles(categoria_id);
CREATE INDEX idx_usuario_roles_equipo ON usuario_roles(equipo_interno_id);
CREATE INDEX idx_usuario_roles_padre ON usuario_roles(padre_id);
CREATE INDEX idx_sesiones_usuario ON sesiones_usuario(usuario_id);
CREATE INDEX idx_sesiones_token ON sesiones_usuario(token_sesion);
CREATE INDEX idx_sesiones_activa ON sesiones_usuario(activa);
CREATE INDEX idx_auditoria_usuario ON auditoria_usuarios(usuario_id);
CREATE INDEX idx_auditoria_fecha ON auditoria_usuarios(created_at);
CREATE INDEX idx_auditoria_accion ON auditoria_usuarios(accion);

-- Función para verificar permisos de usuario
CREATE OR REPLACE FUNCTION verificar_permiso_usuario(
    p_usuario_id UUID,
    p_permiso VARCHAR(100),
    p_categoria_id INTEGER DEFAULT NULL,
    p_equipo_id INTEGER DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    tiene_permiso BOOLEAN := false;
    rol_record RECORD;
BEGIN
    -- Buscar roles del usuario
    FOR rol_record IN
        SELECT r.permisos, r.nivel_permisos, ur.categoria_id, ur.equipo_interno_id
        FROM usuario_roles ur
        JOIN roles_usuario r ON ur.rol_id = r.id
        WHERE ur.usuario_id = p_usuario_id 
            AND ur.activo = true
            AND r.activo = true
            AND (ur.categoria_id = p_categoria_id OR ur.categoria_id IS NULL OR p_categoria_id IS NULL)
            AND (ur.equipo_interno_id = p_equipo_id OR ur.equipo_interno_id IS NULL OR p_equipo_id IS NULL)
    LOOP
        -- Verificar si el permiso existe en el JSON
        IF rol_record.permisos ? p_permiso THEN
            IF (rol_record.permisos ->> p_permiso)::boolean = true THEN
                tiene_permiso := true;
                EXIT;
            END IF;
        END IF;
    END LOOP;
    
    RETURN tiene_permiso;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener roles de un usuario
CREATE OR REPLACE FUNCTION obtener_roles_usuario(p_usuario_id UUID)
RETURNS TABLE(
    rol_nombre VARCHAR(50),
    nivel_permisos INTEGER,
    categoria_nombre VARCHAR(50),
    equipo_nombre VARCHAR(100)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.nombre,
        r.nivel_permisos,
        c.nombre,
        ei.nombre
    FROM usuario_roles ur
    JOIN roles_usuario r ON ur.rol_id = r.id
    LEFT JOIN categorias c ON ur.categoria_id = c.id
    LEFT JOIN equipos_internos ei ON ur.equipo_interno_id = ei.id
    WHERE ur.usuario_id = p_usuario_id 
        AND ur.activo = true
        AND r.activo = true
    ORDER BY r.nivel_permisos;
END;
$$ LANGUAGE plpgsql;

-- Función para limpiar sesiones expiradas
CREATE OR REPLACE FUNCTION limpiar_sesiones_expiradas()
RETURNS INTEGER AS $$
DECLARE
    sesiones_eliminadas INTEGER;
BEGIN
    UPDATE sesiones_usuario 
    SET activa = false 
    WHERE fecha_expiracion < NOW() AND activa = true;
    
    GET DIAGNOSTICS sesiones_eliminadas = ROW_COUNT;
    RETURN sesiones_eliminadas;
END;
$$ LANGUAGE plpgsql;

-- Vista para usuarios con sus roles
CREATE VIEW vista_usuarios_roles AS
SELECT 
    u.id,
    u.email,
    u.nombre,
    u.apellido_paterno,
    u.apellido_materno,
    u.telefono,
    u.activo,
    u.email_verificado,
    u.ultimo_acceso,
    r.nombre as rol_nombre,
    r.nivel_permisos,
    c.nombre as categoria_nombre,
    ei.nombre as equipo_nombre,
    p.nombre as padre_nombre,
    ur.fecha_asignacion
FROM usuarios u
JOIN usuario_roles ur ON u.id = ur.usuario_id
JOIN roles_usuario r ON ur.rol_id = r.id
LEFT JOIN categorias c ON ur.categoria_id = c.id
LEFT JOIN equipos_internos ei ON ur.equipo_interno_id = ei.id
LEFT JOIN padres p ON ur.padre_id = p.id
WHERE ur.activo = true AND r.activo = true;

-- Restricciones de validación
CREATE OR REPLACE FUNCTION validar_asignacion_rol()
RETURNS TRIGGER AS $$
BEGIN
    -- Validar que Admin de Categoría tenga categoria_id
    IF NEW.rol_id = (SELECT id FROM roles_usuario WHERE nombre = 'Administrador de Categoría') THEN
        IF NEW.categoria_id IS NULL THEN
            RAISE EXCEPTION 'El Administrador de Categoría debe tener una categoría asignada';
        END IF;
    END IF;
    
    -- Validar que Admin de Equipo tenga equipo_interno_id
    IF NEW.rol_id = (SELECT id FROM roles_usuario WHERE nombre = 'Administrador de Equipo') THEN
        IF NEW.equipo_interno_id IS NULL THEN
            RAISE EXCEPTION 'El Administrador de Equipo debe tener un equipo asignado';
        END IF;
    END IF;
    
    -- Validar que Padre de Familia tenga padre_id
    IF NEW.rol_id = (SELECT id FROM roles_usuario WHERE nombre = 'Padre de Familia') THEN
        IF NEW.padre_id IS NULL THEN
            RAISE EXCEPTION 'El Padre de Familia debe tener un padre asignado';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validar_asignacion_rol_trigger
    BEFORE INSERT OR UPDATE ON usuario_roles
    FOR EACH ROW
    EXECUTE FUNCTION validar_asignacion_rol();
