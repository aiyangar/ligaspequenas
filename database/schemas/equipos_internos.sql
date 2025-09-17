-- Tabla: Equipos Internos
-- Descripción: Equipos internos dentro de cada categoría, divididos según el número de niños inscritos

CREATE TABLE equipos_internos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
    color_uniforme VARCHAR(50),
    entrenador_principal VARCHAR(100),
    entrenador_asistente VARCHAR(100),
    telefono_contacto VARCHAR(20),
    email_contacto VARCHAR(100),
    activo BOOLEAN DEFAULT true,
    fecha_creacion DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear trigger para actualizar updated_at automáticamente
CREATE TRIGGER update_equipos_internos_updated_at 
    BEFORE UPDATE ON equipos_internos 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Índices para optimizar consultas
CREATE INDEX idx_equipos_internos_categoria ON equipos_internos(categoria_id);
CREATE INDEX idx_equipos_internos_activo ON equipos_internos(activo);
CREATE INDEX idx_equipos_internos_nombre ON equipos_internos(nombre);

-- Restricción para evitar nombres duplicados en la misma categoría
CREATE UNIQUE INDEX idx_equipos_internos_nombre_categoria 
ON equipos_internos(nombre, categoria_id) 
WHERE activo = true;
