-- Tablas Adicionales para el Sistema de Ligas Pequeñas
-- Estas tablas complementan el sistema con funcionalidades importantes

-- Tabla: Temporadas
-- Descripción: Para organizar las actividades por temporadas
CREATE TABLE temporadas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    activa BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla: Entrenamientos
-- Descripción: Para programar y registrar entrenamientos
CREATE TABLE entrenamientos (
    id SERIAL PRIMARY KEY,
    equipo_interno_id INTEGER NOT NULL REFERENCES equipos_internos(id) ON DELETE CASCADE,
    fecha_entrenamiento DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    lugar VARCHAR(200) NOT NULL,
    tipo_entrenamiento VARCHAR(50), -- 'Técnico', 'Físico', 'Estratégico', 'Mixto'
    objetivo TEXT,
    asistencia_registrada BOOLEAN DEFAULT false,
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla: Asistencia a Entrenamientos
CREATE TABLE asistencia_entrenamientos (
    id SERIAL PRIMARY KEY,
    entrenamiento_id INTEGER NOT NULL REFERENCES entrenamientos(id) ON DELETE CASCADE,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    asistio BOOLEAN DEFAULT false,
    justificacion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(entrenamiento_id, jugador_id)
);

-- Tabla: Inventario de Equipamiento
-- Descripción: Para controlar el inventario de equipos y materiales
CREATE TABLE inventario_equipamiento (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    categoria VARCHAR(50) NOT NULL, -- 'Bate', 'Guante', 'Pelota', 'Uniforme', 'Protección', 'Otro'
    cantidad_total INTEGER NOT NULL DEFAULT 0,
    cantidad_disponible INTEGER NOT NULL DEFAULT 0,
    cantidad_prestada INTEGER DEFAULT 0,
    precio_unitario DECIMAL(10,2),
    proveedor VARCHAR(100),
    fecha_compra DATE,
    estado VARCHAR(20) DEFAULT 'Bueno', -- 'Excelente', 'Bueno', 'Regular', 'Malo', 'Fuera de Servicio'
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla: Préstamos de Equipamiento
CREATE TABLE prestamos_equipamiento (
    id SERIAL PRIMARY KEY,
    equipamiento_id INTEGER NOT NULL REFERENCES inventario_equipamiento(id) ON DELETE CASCADE,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    fecha_prestamo DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_devolucion_esperada DATE,
    fecha_devolucion_real DATE,
    estado_prestamo VARCHAR(20) DEFAULT 'Activo', -- 'Activo', 'Devuelto', 'Perdido', 'Dañado'
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla: Notificaciones
-- Descripción: Para enviar notificaciones a padres y jugadores
CREATE TABLE notificaciones (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(200) NOT NULL,
    mensaje TEXT NOT NULL,
    tipo_notificacion VARCHAR(50) NOT NULL, -- 'General', 'Partido', 'Entrenamiento', 'Pago', 'Urgente'
    fecha_envio TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fecha_vencimiento TIMESTAMP WITH TIME ZONE,
    enviada BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla: Destinatarios de Notificaciones
CREATE TABLE destinatarios_notificaciones (
    id SERIAL PRIMARY KEY,
    notificacion_id INTEGER NOT NULL REFERENCES notificaciones(id) ON DELETE CASCADE,
    padre_id INTEGER REFERENCES padres(id) ON DELETE CASCADE,
    jugador_id INTEGER REFERENCES jugadores(id) ON DELETE CASCADE,
    leida BOOLEAN DEFAULT false,
    fecha_lectura TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(notificacion_id, padre_id, jugador_id)
);

-- Tabla: Configuraciones del Sistema
-- Descripción: Para configuraciones generales del sistema
CREATE TABLE configuraciones (
    id SERIAL PRIMARY KEY,
    clave VARCHAR(100) NOT NULL UNIQUE,
    valor TEXT NOT NULL,
    descripcion TEXT,
    tipo_dato VARCHAR(20) DEFAULT 'texto', -- 'texto', 'numero', 'booleano', 'fecha'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar configuraciones iniciales
INSERT INTO configuraciones (clave, valor, descripcion, tipo_dato) VALUES
('nombre_liga', 'Liga Pequeña', 'Nombre de la liga', 'texto'),
('telefono_contacto', '', 'Teléfono de contacto principal', 'texto'),
('email_contacto', '', 'Email de contacto principal', 'texto'),
('direccion_principal', '', 'Dirección principal de la liga', 'texto'),
('costo_registro_default', '500.00', 'Costo por defecto de registro', 'numero'),
('costo_semanal_default', '100.00', 'Costo por defecto semanal', 'numero'),
('dias_vencimiento_pago', '7', 'Días de gracia para pagos vencidos', 'numero'),
('notificaciones_activas', 'true', 'Activar sistema de notificaciones', 'booleano');

-- Crear triggers para actualizar updated_at automáticamente
CREATE TRIGGER update_temporadas_updated_at 
    BEFORE UPDATE ON temporadas 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_entrenamientos_updated_at 
    BEFORE UPDATE ON entrenamientos 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventario_equipamiento_updated_at 
    BEFORE UPDATE ON inventario_equipamiento 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_configuraciones_updated_at 
    BEFORE UPDATE ON configuraciones 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Índices para optimizar consultas
CREATE INDEX idx_temporadas_activa ON temporadas(activa);
CREATE INDEX idx_entrenamientos_equipo ON entrenamientos(equipo_interno_id);
CREATE INDEX idx_entrenamientos_fecha ON entrenamientos(fecha_entrenamiento);
CREATE INDEX idx_asistencia_entrenamiento ON asistencia_entrenamientos(entrenamiento_id);
CREATE INDEX idx_asistencia_jugador ON asistencia_entrenamientos(jugador_id);
CREATE INDEX idx_inventario_categoria ON inventario_equipamiento(categoria);
CREATE INDEX idx_inventario_estado ON inventario_equipamiento(estado);
CREATE INDEX idx_prestamos_equipamiento ON prestamos_equipamiento(equipamiento_id);
CREATE INDEX idx_prestamos_jugador ON prestamos_equipamiento(jugador_id);
CREATE INDEX idx_prestamos_estado ON prestamos_equipamiento(estado_prestamo);
CREATE INDEX idx_notificaciones_tipo ON notificaciones(tipo_notificacion);
CREATE INDEX idx_notificaciones_fecha ON notificaciones(fecha_envio);
CREATE INDEX idx_destinatarios_notificacion ON destinatarios_notificaciones(notificacion_id);
CREATE INDEX idx_destinatarios_padre ON destinatarios_notificaciones(padre_id);
CREATE INDEX idx_destinatarios_jugador ON destinatarios_notificaciones(jugador_id);

-- Función para actualizar cantidad disponible en inventario
CREATE OR REPLACE FUNCTION actualizar_cantidad_disponible()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Nuevo préstamo
        UPDATE inventario_equipamiento 
        SET cantidad_disponible = cantidad_disponible - 1,
            cantidad_prestada = cantidad_prestada + 1
        WHERE id = NEW.equipamiento_id;
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Cambio de estado del préstamo
        IF OLD.estado_prestamo = 'Activo' AND NEW.estado_prestamo != 'Activo' THEN
            UPDATE inventario_equipamiento 
            SET cantidad_disponible = cantidad_disponible + 1,
                cantidad_prestada = cantidad_prestada - 1
            WHERE id = NEW.equipamiento_id;
        ELSIF OLD.estado_prestamo != 'Activo' AND NEW.estado_prestamo = 'Activo' THEN
            UPDATE inventario_equipamiento 
            SET cantidad_disponible = cantidad_disponible - 1,
                cantidad_prestada = cantidad_prestada + 1
            WHERE id = NEW.equipamiento_id;
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        -- Eliminación de préstamo
        UPDATE inventario_equipamiento 
        SET cantidad_disponible = cantidad_disponible + 1,
            cantidad_prestada = cantidad_prestada - 1
        WHERE id = OLD.equipamiento_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER actualizar_cantidad_disponible_trigger
    AFTER INSERT OR UPDATE OR DELETE ON prestamos_equipamiento
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_cantidad_disponible();
