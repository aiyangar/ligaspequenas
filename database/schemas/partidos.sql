-- Tabla: Partidos
-- Descripción: Registro completo de partidos con todos los detalles (torneo, umpire, transmisión, marcador, etc.)

CREATE TABLE partidos (
    id SERIAL PRIMARY KEY,
    equipo_local_id INTEGER, -- Puede ser equipo interno o contrario
    equipo_visitante_id INTEGER, -- Puede ser equipo interno o contrario
    es_equipo_local_interno BOOLEAN NOT NULL, -- true si equipo_local_id es interno
    es_equipo_visitante_interno BOOLEAN NOT NULL, -- true si equipo_visitante_id es interno
    torneo_id INTEGER REFERENCES torneos(id) ON DELETE SET NULL,
    fecha_partido DATE NOT NULL,
    hora_partido TIME NOT NULL,
    lugar_partido VARCHAR(200) NOT NULL,
    direccion_lugar TEXT,
    carreras_local INTEGER DEFAULT 0,
    carreras_visitante INTEGER DEFAULT 0,
    resultado VARCHAR(20), -- 'Victoria Local', 'Victoria Visitante', 'Empate', 'Suspendido', 'Cancelado'
    estado VARCHAR(20) DEFAULT 'Programado', -- 'Programado', 'En Curso', 'Finalizado', 'Suspendido', 'Cancelado'
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla para costos adicionales del partido
CREATE TABLE costos_partido (
    id SERIAL PRIMARY KEY,
    partido_id INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
    tipo_costo VARCHAR(50) NOT NULL, -- 'Umpire', 'Transmisión', 'Cancha', 'Otro'
    monto DECIMAL(10,2) NOT NULL,
    descripcion TEXT,
    pagado BOOLEAN DEFAULT false,
    fecha_pago DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla para transmisiones de partidos
CREATE TABLE transmisiones (
    id SERIAL PRIMARY KEY,
    partido_id INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
    plataforma VARCHAR(50) NOT NULL, -- 'YouTube', 'Facebook', 'Twitch', 'Otro'
    url_transmision TEXT,
    calidad VARCHAR(20), -- 'HD', 'SD', '4K'
    costo_transmision DECIMAL(10,2),
    pagado BOOLEAN DEFAULT false,
    fecha_pago DATE,
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla para alineaciones de partidos
CREATE TABLE alineaciones_partido (
    id SERIAL PRIMARY KEY,
    partido_id INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    posicion_id INTEGER NOT NULL REFERENCES posiciones(id) ON DELETE RESTRICT,
    orden_bateo INTEGER NOT NULL,
    es_titular BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(partido_id, jugador_id),
    UNIQUE(partido_id, posicion_id, es_titular) -- Una posición por equipo en la alineación
);

-- Tabla para estadísticas individuales del partido
CREATE TABLE estadisticas_jugador_partido (
    id SERIAL PRIMARY KEY,
    partido_id INTEGER NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    turnos_al_bate INTEGER DEFAULT 0,
    hits INTEGER DEFAULT 0,
    carreras_anotadas INTEGER DEFAULT 0,
    carreras_impulsadas INTEGER DEFAULT 0,
    bases_por_bola INTEGER DEFAULT 0,
    ponches INTEGER DEFAULT 0,
    errores INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(partido_id, jugador_id)
);

-- Crear trigger para actualizar updated_at automáticamente
CREATE TRIGGER update_partidos_updated_at 
    BEFORE UPDATE ON partidos 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Índices para optimizar consultas
CREATE INDEX idx_partidos_fecha ON partidos(fecha_partido);
CREATE INDEX idx_partidos_equipo_local ON partidos(equipo_local_id);
CREATE INDEX idx_partidos_equipo_visitante ON partidos(equipo_visitante_id);
CREATE INDEX idx_partidos_torneo ON partidos(torneo_id);
CREATE INDEX idx_partidos_estado ON partidos(estado);
CREATE INDEX idx_costos_partido_partido ON costos_partido(partido_id);
CREATE INDEX idx_transmisiones_partido ON transmisiones(partido_id);
CREATE INDEX idx_alineaciones_partido_partido ON alineaciones_partido(partido_id);
CREATE INDEX idx_alineaciones_partido_jugador ON alineaciones_partido(jugador_id);
CREATE INDEX idx_estadisticas_jugador_partido_partido ON estadisticas_jugador_partido(partido_id);
CREATE INDEX idx_estadisticas_jugador_partido_jugador ON estadisticas_jugador_partido(jugador_id);

-- Función para validar que al menos un equipo sea interno
CREATE OR REPLACE FUNCTION validate_internal_team()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT NEW.es_equipo_local_interno AND NOT NEW.es_equipo_visitante_interno THEN
        RAISE EXCEPTION 'Al menos uno de los equipos debe ser interno';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_internal_team_trigger
    BEFORE INSERT OR UPDATE ON partidos
    FOR EACH ROW
    EXECUTE FUNCTION validate_internal_team();

-- Función para calcular promedio de bateo
CREATE OR REPLACE FUNCTION calcular_promedio_bateo(turnos_al_bate INTEGER, hits INTEGER)
RETURNS DECIMAL(4,3) AS $$
BEGIN
    IF turnos_al_bate = 0 THEN
        RETURN 0.000;
    END IF;
    RETURN ROUND((hits::DECIMAL / turnos_al_bate), 3);
END;
$$ LANGUAGE plpgsql;

-- Vista para estadísticas de jugadores por partido
CREATE VIEW vista_estadisticas_jugadores AS
SELECT 
    ejp.partido_id,
    ejp.jugador_id,
    j.nombre || ' ' || j.apellido_paterno as nombre_jugador,
    ejp.turnos_al_bate,
    ejp.hits,
    ejp.carreras_anotadas,
    ejp.carreras_impulsadas,
    ejp.bases_por_bola,
    ejp.ponches,
    ejp.errores,
    calcular_promedio_bateo(ejp.turnos_al_bate, ejp.hits) as promedio_bateo
FROM estadisticas_jugador_partido ejp
JOIN jugadores j ON ejp.jugador_id = j.id;
