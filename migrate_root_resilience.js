const db = require('./db');

async function migrate_root_resilience() {
    console.log('[MIGRATION] Iniciando blindaje de persistencia de raíz...');
    try {
        // 1. Tablas de Formularios Firmados
        await db.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='formularios_firmados' AND column_name='archivo_base64') THEN
                    ALTER TABLE formularios_firmados ADD COLUMN archivo_base64 TEXT;
                END IF;
            END $$;
        `);
        
        // 2. Tablas de Documentación Personal
        await db.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='documentos_personales' AND column_name='archivo_base64') THEN
                    ALTER TABLE documentos_personales ADD COLUMN archivo_base64 TEXT;
                END IF;
            END $$;
        `);

        console.log('✓ blindaje de base de datos COMPLETADO.');
        process.exit(0);
    } catch (err) {
        console.error('❌ FALLO CRÍTICO EN MIGRACIÓN:', err.message);
        process.exit(1);
    }
}

migrate_root_resilience();
