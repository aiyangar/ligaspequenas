-- Tabla: Padres
-- Descripción: Datos personales y de contacto de padres/tutores con documentos

CREATE TABLE padres (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    apellido_paterno VARCHAR(100) NOT NULL,
    apellido_materno VARCHAR(100),
    fecha_nacimiento DATE,
    telefono_principal VARCHAR(20) NOT NULL,
    telefono_secundario VARCHAR(20),
    email VARCHAR(100),
    direccion TEXT,
    colonia VARCHAR(100),
    ciudad VARCHAR(100),
    estado VARCHAR(50),
    codigo_postal VARCHAR(10),
    parentesco VARCHAR(50) NOT NULL, -- Padre, Madre, Tutor, etc.
    ocupacion VARCHAR(100),
    lugar_trabajo VARCHAR(200),
    telefono_trabajo VARCHAR(20),
    activo BOOLEAN DEFAULT true,
    fecha_registro DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla para almacenar documentos de los padres
CREATE TABLE documentos_padres (
    id SERIAL PRIMARY KEY,
    padre_id INTEGER NOT NULL REFERENCES padres(id) ON DELETE CASCADE,
    tipo_documento VARCHAR(50) NOT NULL, -- INE, Comprobante Domicilio, CURP, etc.
    nombre_archivo VARCHAR(255) NOT NULL,
    url_documento TEXT NOT NULL,
    fecha_subida DATE DEFAULT CURRENT_DATE,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla intermedia para relacionar padres con jugadores
CREATE TABLE padre_jugadores (
    id SERIAL PRIMARY KEY,
    padre_id INTEGER NOT NULL REFERENCES padres(id) ON DELETE CASCADE,
    jugador_id INTEGER NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
    es_responsable_principal BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(padre_id, jugador_id)
);

-- Crear trigger para actualizar updated_at automáticamente
CREATE TRIGGER update_padres_updated_at 
    BEFORE UPDATE ON padres 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Índices para optimizar consultas
CREATE INDEX idx_padres_activo ON padres(activo);
CREATE INDEX idx_padres_telefono ON padres(telefono_principal);
CREATE INDEX idx_padres_email ON padres(email);
CREATE INDEX idx_documentos_padres_padre ON documentos_padres(padre_id);
CREATE INDEX idx_documentos_padres_tipo ON documentos_padres(tipo_documento);
CREATE INDEX idx_padre_jugadores_padre ON padre_jugadores(padre_id);
CREATE INDEX idx_padre_jugadores_jugador ON padre_jugadores(jugador_id);

-- Restricción para validar tipos de documentos permitidos
CREATE OR REPLACE FUNCTION check_document_type()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tipo_documento NOT IN ('INE', 'Comprobante Domicilio', 'CURP', 'Acta Nacimiento', 'Pasaporte', 'Licencia', 'Otro') THEN
        RAISE EXCEPTION 'Tipo de documento no válido: %', NEW.tipo_documento;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_document_type_trigger
    BEFORE INSERT OR UPDATE ON documentos_padres
    FOR EACH ROW
    EXECUTE FUNCTION check_document_type();
