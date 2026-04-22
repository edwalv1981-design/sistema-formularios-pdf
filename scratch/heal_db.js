
const db = require('../db');

async function healDatabase() {
    try {
        console.log('--- STARTING DATABASE HEALING (MIGRATION) ---');
        
        // 1. Map old/broken strings to current valid types
        const mappings = {
            'ssffaa_usuaeroi nuewvos': 'PTL_KYC - Compliance Form - Individuals', // Fallback
            'PTLKYVI': 'PTL_KYC - Compliance Form - Individuals',
            'PTLKYCE': 'PTL_KYC- Compliance Form - Entities',
            'ptl_kyc_compliance-individual': 'PTL_KYC - Compliance Form - Individuals'
        };

        for (const [oldType, newType] of Object.entries(mappings)) {
            const res = await db.query('UPDATE usuarios SET tipo_formulario = $1 WHERE LOWER(tipo_formulario) = LOWER($2)', [newType, oldType]);
            console.log(`Updated ${res.rowCount} users from "${oldType}" to "${newType}"`);
        }

        // 2. Add an "All Access" permission to existing Empresas if they are currently seeing 0
        const empresas = await db.query("SELECT u.id FROM usuarios u JOIN roles r ON u.id_rol = r.id WHERE r.nombre = 'EMPRESA'");
        for (const emp of empresas.rows) {
            // Check if they see at least 1 form with current logic
            const usrQ = await db.query(`SELECT tipo_formulario FROM usuarios WHERE id = $1`, [emp.id]);
            const baseType = usrQ.rows[0].tipo_formulario;
            
            const matches = await db.query('SELECT id FROM formularios WHERE LOWER(tipo) = LOWER($1) AND is_deleted = FALSE', [baseType]);
            if (matches.rows.length === 0) {
                console.log(`Empresa ${emp.id} ("${baseType}") is currently BLIND. Auto-assigning all current forms to fix critical access.`);
                
                const allForms = await db.query('SELECT tipo FROM formularios WHERE is_deleted = FALSE');
                for (const form of allForms.rows) {
                    await db.query('INSERT INTO usuario_permisos_formulario (id_usuario, tipo_formulario) VALUES ($1, $2) ON CONFLICT DO NOTHING', [emp.id, form.tipo]);
                }
            }
        }

        console.log('--- HEALING COMPLETE ---');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

healDatabase();
