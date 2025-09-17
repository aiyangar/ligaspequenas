-- Tabla: Categorías
-- Descripción: Define las diferentes categorías de edad para los equipos de ligas pequeñas

CREATE TABLE categorias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    edad_minima INTEGER NOT NULL,
    edad_maxima INTEGER NOT NULL,
    descripcion TEXT,
    activa BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar las categorías predefinidas
INSERT INTO categorias (nombre, edad_minima, edad_maxima, descripcion) VALUES
('Biberones', 3, 4, 'Categoría para niños de 3 a 4 años'),
('Premoyote', 5, 6, 'Categoría para niños de 5 a 6 años'),
('Moyote', 7, 8, 'Categoría para niños de 7 a 8 años'),
('Peewee', 9, 10, 'Categoría para niños de 9 a 10 años'),
('Pequeña', 11, 12, 'Categoría para niños de 11 a 12 años');

-- Crear trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_categorias_updated_at 
    BEFORE UPDATE ON categorias 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Índices para optimizar consultas
CREATE INDEX idx_categorias_activa ON categorias(activa);
CREATE INDEX idx_categorias_edad ON categorias(edad_minima, edad_maxima);
