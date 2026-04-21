-- Archivo de instalación inicial de la Base de Datos.
-- Puedes ejecutar este contenido en tu cliente de PostgreSQL (ej. pgAdmin).

CREATE DATABASE sistema_formularios;

\c sistema_formularios;

-- 1. Tabla de Roles
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL, -- MASTER, EMPRESA, ADICIONAL
    descripcion TEXT
);

-- 2. Tabla de Usuarios (Autoreferenciada para id_empresa)
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nombres_completos VARCHAR(150) NOT NULL,
    identificacion VARCHAR(50) UNIQUE NOT NULL,
    direccion TEXT,
    telefono VARCHAR(20),
    tipo_formulario VARCHAR(100), -- 'SFA', 'PTLC', 'PTLF', 'PTLKYCI', 'PTLKYCE'
    codigo_unico VARCHAR(50) UNIQUE,
    id_rol INTEGER REFERENCES roles(id) ON DELETE RESTRICT,
    id_empresa INTEGER REFERENCES usuarios(id) ON DELETE SET NULL, -- Si es adicional, a que empresa pertenece
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    aprobado BOOLEAN DEFAULT FALSE,
    password_hash VARCHAR(255)
);

-- 3. Tabla de la Bitácora (Logs)
CREATE TABLE bitacora (
    id SERIAL PRIMARY KEY,
    id_usuario INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    id_empresa_contexto INTEGER REFERENCES usuarios(id) ON DELETE CASCADE, -- Para filtrar fácilmente
    accion VARCHAR(255) NOT NULL,
    detalle TEXT,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla Opciones de Menú
CREATE TABLE opciones_menu (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(100) NOT NULL,
    ruta VARCHAR(255) NOT NULL,
    es_operativo BOOLEAN DEFAULT FALSE -- Para distinguir opciones del rol Adicional (EJ: Digitalizacion formularios)
);

-- 5. Tabla de Permisos
CREATE TABLE permisos_menu (
    id SERIAL PRIMARY KEY,
    id_usuario INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    id_opcion_menu INTEGER REFERENCES opciones_menu(id) ON DELETE CASCADE,
    UNIQUE(id_usuario, id_opcion_menu)
);

-- 6. Tabla Formularios (Las plantillas subidas por MASTER)
CREATE TABLE formularios (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(100) UNIQUE NOT NULL, -- 'SFA', 'PTLC', 'PTLF', 'PTLKYCI', 'PTLKYCE'
    nombre_archivo VARCHAR(255),
    ruta_archivo VARCHAR(500),
    fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Tabla Formularios Llenados (Digitalización)
CREATE TABLE formularios_llenos (
    id SERIAL PRIMARY KEY,
    id_usuario INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    codigo_unico VARCHAR(50) NOT NULL,
    id_formulario INTEGER REFERENCES formularios(id) ON DELETE RESTRICT,
    datos_completados JSONB, -- Aqui se guarda toda la informacion digitada
    ruta_pdf_generado VARCHAR(500),
    fecha_guardado TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Tabla Documentos Adjuntos Adicionales
CREATE TABLE documentos_adjuntos (
    id SERIAL PRIMARY KEY,
    id_usuario INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    id_formulario_lleno INTEGER REFERENCES formularios_llenos(id) ON DELETE CASCADE,
    nombre_archivo VARCHAR(255) NOT NULL,
    ruta_archivo VARCHAR(500) NOT NULL,
    fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- INSERCIÓN DE DATOS INICIALES (SEMILLAS)
INSERT INTO roles (nombre, descripcion) VALUES
('MASTER', 'Administrador master con acceso total'),
('EMPRESA', 'Administrador empresa, puede crear adicionales'),
('ADICIONAL', 'Usuario operativo para llenar formularios');

-- Insertar opciones de menú
INSERT INTO opciones_menu (titulo, ruta, es_operativo) VALUES
('Gestión de Usuarios', '/usuarios', FALSE),
('Gestión de Formularios Master', '/formularios-master', FALSE),
('Digitalización Formularios', '/digitalizacion', TRUE),
('Bitácora', '/bitacora', FALSE);

-- Crear el usuario MASTER por defecto (Contraseña generica que se debe cambiar)
-- Suponiendo rol MASTER es id=1. Como la password va encriptada por bcrypt se la generar desde Node. En este ejemplo lo dejamos pendiente a Node.
-- INSERT INTO usuarios (...)
