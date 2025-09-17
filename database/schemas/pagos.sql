-- Tabla: Pagos
-- Descripción: Sistema de pagos con diferentes categorías (registro, semanal, torneos, partidos, transmisión, uniformes)

CREATE TABLE tipos_pago (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT,
    es_recurrente BOOLEAN DEFAULT false, -- Para pagos semanales
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar tipos de pago predefinidos
INSERT INTO tipos_pago (nombre, descripcion, es_recurrente) VALUES
('Registro', 'Pago de inscripción inicial', false),
('Semanal', 'Pago semanal de entrenamientos', true),
('Torneo', 'Pago por participación en torneo', false),
('Partido', 'Pago por partido individual', false),
('Transmisión', 'Pago por transmisión de partido', false),
('Uniforme', 'Pago por uniforme', false);

-- Tabla principal de pagos
CREATE TABLE pagos (
    id SERIAL PRIMARY KEY,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    tipo_pago_id INTEGER NOT NULL REFERENCES tipos_pago(id) ON DELETE RESTRICT,
    monto DECIMAL(10,2) NOT NULL,
    fecha_pago DATE NOT NULL,
    fecha_vencimiento DATE,
    metodo_pago VARCHAR(50), -- Efectivo, Transferencia, Tarjeta, etc.
    referencia_pago VARCHAR(100), -- Número de referencia o comprobante
    observaciones TEXT,
    pagado BOOLEAN DEFAULT false,
    fecha_pago_real DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla para torneos (relacionada con pagos de torneos)
CREATE TABLE torneos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    descripcion TEXT,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    lugar VARCHAR(200),
    costo_participacion DECIMAL(10,2) NOT NULL,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla para relacionar pagos con torneos específicos
CREATE TABLE pagos_torneos (
    id SERIAL PRIMARY KEY,
    pago_id INTEGER NOT NULL REFERENCES pagos(id) ON DELETE CASCADE,
    torneo_id INTEGER NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(pago_id, torneo_id)
);

-- Tabla para uniformes (relacionada con pagos de uniformes)
CREATE TABLE uniformes (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    precio DECIMAL(10,2) NOT NULL,
    tallas_disponibles TEXT[], -- Array de tallas disponibles
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla para relacionar pagos con uniformes específicos
CREATE TABLE pagos_uniformes (
    id SERIAL PRIMARY KEY,
    pago_id INTEGER NOT NULL REFERENCES pagos(id) ON DELETE CASCADE,
    uniforme_id INTEGER NOT NULL REFERENCES uniformes(id) ON DELETE CASCADE,
    talla VARCHAR(10) NOT NULL,
    cantidad INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(pago_id, uniforme_id, talla)
);

-- Crear trigger para actualizar updated_at automáticamente
CREATE TRIGGER update_pagos_updated_at 
    BEFORE UPDATE ON pagos 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Índices para optimizar consultas
CREATE INDEX idx_pagos_jugador ON pagos(jugador_id);
CREATE INDEX idx_pagos_tipo ON pagos(tipo_pago_id);
CREATE INDEX idx_pagos_fecha ON pagos(fecha_pago);
CREATE INDEX idx_pagos_pagado ON pagos(pagado);
CREATE INDEX idx_pagos_vencimiento ON pagos(fecha_vencimiento);
CREATE INDEX idx_torneos_fecha ON torneos(fecha_inicio);
CREATE INDEX idx_torneos_activo ON torneos(activo);
CREATE INDEX idx_uniformes_activo ON uniformes(activo);

-- Función para generar pagos semanales automáticamente
CREATE OR REPLACE FUNCTION generar_pagos_semanales()
RETURNS TRIGGER AS $$
DECLARE
    jugador_record RECORD;
    fecha_actual DATE := CURRENT_DATE;
    fecha_vencimiento DATE;
BEGIN
    -- Solo para pagos semanales
    IF NEW.tipo_pago_id = (SELECT id FROM tipos_pago WHERE nombre = 'Semanal') THEN
        -- Generar el siguiente pago semanal
        fecha_vencimiento := fecha_actual + INTERVAL '7 days';
        
        INSERT INTO pagos (jugador_id, tipo_pago_id, monto, fecha_pago, fecha_vencimiento, pagado)
        VALUES (NEW.jugador_id, NEW.tipo_pago_id, NEW.monto, fecha_vencimiento, fecha_vencimiento + INTERVAL '7 days', false);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para generar pagos semanales automáticamente
CREATE TRIGGER generar_pagos_semanales_trigger
    AFTER INSERT ON pagos
    FOR EACH ROW
    EXECUTE FUNCTION generar_pagos_semanales();
