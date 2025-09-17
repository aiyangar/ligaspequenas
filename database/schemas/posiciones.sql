-- Tabla: Posiciones
-- Descripción: Define las posiciones de juego en el campo, considerando alineación de 9 y 10 jugadores

CREATE TABLE posiciones (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    codigo VARCHAR(10) NOT NULL UNIQUE,
    descripcion TEXT,
    es_obligatoria BOOLEAN DEFAULT true, -- ShortFielder no siempre se agrega
    orden_campo INTEGER, -- Orden lógico en el campo
    activa BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar las posiciones de béisbol
INSERT INTO posiciones (nombre, codigo, descripcion, es_obligatoria, orden_campo) VALUES
('Pitcher', 'P', 'Lanzador principal', true, 1),
('Catcher', 'C', 'Receptor', true, 2),
('Primera Base', '1B', 'Primera base', true, 3),
('Segunda Base', '2B', 'Segunda base', true, 4),
('Tercera Base', '3B', 'Tercera base', true, 5),
('Shortstop', 'SS', 'Campocorto', true, 6),
('Jardinero Izquierdo', 'LF', 'Jardinero izquierdo', true, 7),
('Jardinero Central', 'CF', 'Jardinero central', true, 8),
('Jardinero Derecho', 'RF', 'Jardinero derecho', true, 9),
('ShortFielder', 'SF', 'Campocorto adicional (10 jugadores)', false, 10);

-- Crear trigger para actualizar updated_at automáticamente
CREATE TRIGGER update_posiciones_updated_at 
    BEFORE UPDATE ON posiciones 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Índices para optimizar consultas
CREATE INDEX idx_posiciones_activa ON posiciones(activa);
CREATE INDEX idx_posiciones_obligatoria ON posiciones(es_obligatoria);
CREATE INDEX idx_posiciones_orden ON posiciones(orden_campo);
