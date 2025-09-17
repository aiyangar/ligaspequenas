-- Tabla: Jugadores
-- Descripción: Datos personales de los jugadores con información de padres/tutores y posiciones

-- Función inmutable para calcular la edad
CREATE OR REPLACE FUNCTION calcular_edad(fecha_nacimiento DATE)
RETURNS INTEGER AS $$
BEGIN
    RETURN EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM fecha_nacimiento) - 
        CASE 
            WHEN EXTRACT(MONTH FROM CURRENT_DATE) < EXTRACT(MONTH FROM fecha_nacimiento) 
                OR (EXTRACT(MONTH FROM CURRENT_DATE) = EXTRACT(MONTH FROM fecha_nacimiento) 
                    AND EXTRACT(DAY FROM CURRENT_DATE) < EXTRACT(DAY FROM fecha_nacimiento))
            THEN 1 
            ELSE 0 
        END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE TABLE jugadores (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    apellido_paterno VARCHAR(100) NOT NULL,
    apellido_materno VARCHAR(100),
    fecha_nacimiento DATE NOT NULL,
    edad INTEGER GENERATED ALWAYS AS (calcular_edad(fecha_nacimiento)) STORED,
    numero_playera INTEGER NOT NULL,
    equipo_interno_id INTEGER NOT NULL REFERENCES equipos_internos(id) ON DELETE CASCADE,
    categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
    nombre_padre_tutor VARCHAR(200),
    nombre_madre_tutora VARCHAR(200),
    telefono_emergencia VARCHAR(20),
    alergias TEXT,
    medicamentos TEXT,
    condiciones_medicas TEXT,
    fotografia_url TEXT,
    activo BOOLEAN DEFAULT true,
    fecha_registro DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla intermedia para las posiciones de cada jugador (hasta 4 posiciones)
CREATE TABLE jugador_posiciones (
    id SERIAL PRIMARY KEY,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    posicion_id INTEGER NOT NULL REFERENCES posiciones(id) ON DELETE CASCADE,
    es_posicion_principal BOOLEAN DEFAULT false,
    orden_preferencia INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(jugador_id, posicion_id)
);

-- Crear trigger para actualizar updated_at automáticamente
CREATE TRIGGER update_jugadores_updated_at 
    BEFORE UPDATE ON jugadores 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Índices para optimizar consultas
CREATE INDEX idx_jugadores_equipo ON jugadores(equipo_interno_id);
CREATE INDEX idx_jugadores_categoria ON jugadores(categoria_id);
CREATE INDEX idx_jugadores_activo ON jugadores(activo);
CREATE INDEX idx_jugadores_edad ON jugadores(edad);
CREATE INDEX idx_jugador_posiciones_jugador ON jugador_posiciones(jugador_id);
CREATE INDEX idx_jugador_posiciones_posicion ON jugador_posiciones(posicion_id);

-- Restricción para evitar números de playera duplicados en el mismo equipo
CREATE UNIQUE INDEX idx_jugadores_numero_equipo 
ON jugadores(numero_playera, equipo_interno_id) 
WHERE activo = true;

-- Restricción para limitar a 4 posiciones por jugador
CREATE OR REPLACE FUNCTION check_max_positions_per_player()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM jugador_posiciones WHERE jugador_id = NEW.jugador_id) >= 4 THEN
        RAISE EXCEPTION 'Un jugador no puede tener más de 4 posiciones';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_max_positions_trigger
    BEFORE INSERT ON jugador_posiciones
    FOR EACH ROW
    EXECUTE FUNCTION check_max_positions_per_player();
