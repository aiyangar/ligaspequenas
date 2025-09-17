-- Tabla: Equipos Contrarios
-- Descripción: Registro de equipos contrarios y estadísticas de enfrentamientos

CREATE TABLE equipos_contrarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
    ciudad VARCHAR(100),
    estado VARCHAR(50),
    entrenador_principal VARCHAR(100),
    telefono_contacto VARCHAR(20),
    email_contacto VARCHAR(100),
    sitio_web VARCHAR(200),
    colores_uniforme VARCHAR(100),
    observaciones TEXT,
    activo BOOLEAN DEFAULT true,
    fecha_registro DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla para estadísticas de enfrentamientos contra equipos contrarios
CREATE TABLE estadisticas_enfrentamientos (
    id SERIAL PRIMARY KEY,
    equipo_interno_id INTEGER NOT NULL REFERENCES equipos_internos(id) ON DELETE CASCADE,
    equipo_contrario_id INTEGER NOT NULL REFERENCES equipos_contrarios(id) ON DELETE CASCADE,
    partidos_ganados INTEGER DEFAULT 0,
    partidos_perdidos INTEGER DEFAULT 0,
    partidos_empatados INTEGER DEFAULT 0,
    carreras_a_favor INTEGER DEFAULT 0,
    carreras_en_contra INTEGER DEFAULT 0,
    ultimo_enfrentamiento DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(equipo_interno_id, equipo_contrario_id)
);

-- Crear trigger para actualizar updated_at automáticamente
CREATE TRIGGER update_equipos_contrarios_updated_at 
    BEFORE UPDATE ON equipos_contrarios 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_estadisticas_enfrentamientos_updated_at 
    BEFORE UPDATE ON estadisticas_enfrentamientos 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Índices para optimizar consultas
CREATE INDEX idx_equipos_contrarios_categoria ON equipos_contrarios(categoria_id);
CREATE INDEX idx_equipos_contrarios_activo ON equipos_contrarios(activo);
CREATE INDEX idx_equipos_contrarios_ciudad ON equipos_contrarios(ciudad);
CREATE INDEX idx_estadisticas_equipo_interno ON estadisticas_enfrentamientos(equipo_interno_id);
CREATE INDEX idx_estadisticas_equipo_contrario ON estadisticas_enfrentamientos(equipo_contrario_id);

-- Función para actualizar estadísticas después de un partido
CREATE OR REPLACE FUNCTION actualizar_estadisticas_partido()
RETURNS TRIGGER AS $$
DECLARE
    equipo_local_id INTEGER;
    equipo_visitante_id INTEGER;
    es_equipo_interno BOOLEAN;
BEGIN
    -- Determinar si el equipo local es interno o contrario
    SELECT id INTO equipo_local_id FROM equipos_internos WHERE id = NEW.equipo_local_id;
    
    IF equipo_local_id IS NOT NULL THEN
        -- El equipo local es interno
        equipo_visitante_id := NEW.equipo_visitante_id;
        es_equipo_interno := true;
    ELSE
        -- El equipo local es contrario
        equipo_local_id := NEW.equipo_visitante_id;
        equipo_visitante_id := NEW.equipo_local_id;
        es_equipo_interno := false;
    END IF;
    
    -- Actualizar estadísticas según el resultado
    IF NEW.resultado = 'Victoria Local' THEN
        IF es_equipo_interno THEN
            -- Victoria del equipo interno
            INSERT INTO estadisticas_enfrentamientos (equipo_interno_id, equipo_contrario_id, partidos_ganados, carreras_a_favor, carreras_en_contra, ultimo_enfrentamiento)
            VALUES (equipo_local_id, equipo_visitante_id, 1, NEW.carreras_local, NEW.carreras_visitante, NEW.fecha_partido)
            ON CONFLICT (equipo_interno_id, equipo_contrario_id)
            DO UPDATE SET 
                partidos_ganados = estadisticas_enfrentamientos.partidos_ganados + 1,
                carreras_a_favor = estadisticas_enfrentamientos.carreras_a_favor + NEW.carreras_local,
                carreras_en_contra = estadisticas_enfrentamientos.carreras_en_contra + NEW.carreras_visitante,
                ultimo_enfrentamiento = NEW.fecha_partido,
                updated_at = NOW();
        ELSE
            -- Derrota del equipo interno
            INSERT INTO estadisticas_enfrentamientos (equipo_interno_id, equipo_contrario_id, partidos_perdidos, carreras_a_favor, carreras_en_contra, ultimo_enfrentamiento)
            VALUES (equipo_visitante_id, equipo_local_id, 1, NEW.carreras_visitante, NEW.carreras_local, NEW.fecha_partido)
            ON CONFLICT (equipo_interno_id, equipo_contrario_id)
            DO UPDATE SET 
                partidos_perdidos = estadisticas_enfrentamientos.partidos_perdidos + 1,
                carreras_a_favor = estadisticas_enfrentamientos.carreras_a_favor + NEW.carreras_visitante,
                carreras_en_contra = estadisticas_enfrentamientos.carreras_en_contra + NEW.carreras_local,
                ultimo_enfrentamiento = NEW.fecha_partido,
                updated_at = NOW();
        END IF;
    ELSIF NEW.resultado = 'Victoria Visitante' THEN
        IF es_equipo_interno THEN
            -- Derrota del equipo interno
            INSERT INTO estadisticas_enfrentamientos (equipo_interno_id, equipo_contrario_id, partidos_perdidos, carreras_a_favor, carreras_en_contra, ultimo_enfrentamiento)
            VALUES (equipo_local_id, equipo_visitante_id, 1, NEW.carreras_local, NEW.carreras_visitante, NEW.fecha_partido)
            ON CONFLICT (equipo_interno_id, equipo_contrario_id)
            DO UPDATE SET 
                partidos_perdidos = estadisticas_enfrentamientos.partidos_perdidos + 1,
                carreras_a_favor = estadisticas_enfrentamientos.carreras_a_favor + NEW.carreras_local,
                carreras_en_contra = estadisticas_enfrentamientos.carreras_en_contra + NEW.carreras_visitante,
                ultimo_enfrentamiento = NEW.fecha_partido,
                updated_at = NOW();
        ELSE
            -- Victoria del equipo interno
            INSERT INTO estadisticas_enfrentamientos (equipo_interno_id, equipo_contrario_id, partidos_ganados, carreras_a_favor, carreras_en_contra, ultimo_enfrentamiento)
            VALUES (equipo_visitante_id, equipo_local_id, 1, NEW.carreras_visitante, NEW.carreras_local, NEW.fecha_partido)
            ON CONFLICT (equipo_interno_id, equipo_contrario_id)
            DO UPDATE SET 
                partidos_ganados = estadisticas_enfrentamientos.partidos_ganados + 1,
                carreras_a_favor = estadisticas_enfrentamientos.carreras_a_favor + NEW.carreras_visitante,
                carreras_en_contra = estadisticas_enfrentamientos.carreras_en_contra + NEW.carreras_local,
                ultimo_enfrentamiento = NEW.fecha_partido,
                updated_at = NOW();
        END IF;
    ELSIF NEW.resultado = 'Empate' THEN
        -- Empate
        IF es_equipo_interno THEN
            INSERT INTO estadisticas_enfrentamientos (equipo_interno_id, equipo_contrario_id, partidos_empatados, carreras_a_favor, carreras_en_contra, ultimo_enfrentamiento)
            VALUES (equipo_local_id, equipo_visitante_id, 1, NEW.carreras_local, NEW.carreras_visitante, NEW.fecha_partido)
            ON CONFLICT (equipo_interno_id, equipo_contrario_id)
            DO UPDATE SET 
                partidos_empatados = estadisticas_enfrentamientos.partidos_empatados + 1,
                carreras_a_favor = estadisticas_enfrentamientos.carreras_a_favor + NEW.carreras_local,
                carreras_en_contra = estadisticas_enfrentamientos.carreras_en_contra + NEW.carreras_visitante,
                ultimo_enfrentamiento = NEW.fecha_partido,
                updated_at = NOW();
        ELSE
            INSERT INTO estadisticas_enfrentamientos (equipo_interno_id, equipo_contrario_id, partidos_empatados, carreras_a_favor, carreras_en_contra, ultimo_enfrentamiento)
            VALUES (equipo_visitante_id, equipo_local_id, 1, NEW.carreras_visitante, NEW.carreras_local, NEW.fecha_partido)
            ON CONFLICT (equipo_interno_id, equipo_contrario_id)
            DO UPDATE SET 
                partidos_empatados = estadisticas_enfrentamientos.partidos_empatados + 1,
                carreras_a_favor = estadisticas_enfrentamientos.carreras_a_favor + NEW.carreras_visitante,
                carreras_en_contra = estadisticas_enfrentamientos.carreras_en_contra + NEW.carreras_local,
                ultimo_enfrentamiento = NEW.fecha_partido,
                updated_at = NOW();
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
