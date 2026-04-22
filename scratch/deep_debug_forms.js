
const db = require('../db');

async function debugFiltering() {
    try {
        console.log('--- DEBUGGING FORM FILTERING ---');
        
        // 1. Get ALL active forms
        const allForms = await db.query('SELECT id, tipo FROM formularios WHERE is_deleted = FALSE');
        console.log('ACTIVE FORMS IN DB:', allForms.rows);

        // 2. Sample ADICIONAL User
        const adicRes = await db.query(`
            SELECT u.id, u.nombres_completos, u.id_empresa, r.nombre as rol 
            FROM usuarios u 
            JOIN roles r ON u.id_rol = r.id 
            WHERE r.nombre = 'ADICIONAL' 
            LIMIT 1
        `);
        
        if (adicRes.rows.length > 0) {
            const user = adicRes.rows[0];
            console.log('SAMPLE ADICIONAL:', user);

            const parentId = user.id_empresa;
            console.log('PARENT ID:', parentId);

            const parentQuery = await db.query(`SELECT id, nombres_completos, tipo_formulario FROM usuarios WHERE id = $1`, [parentId]);
            if (parentQuery.rows.length === 0) {
                console.log('ERROR: Parent Empresa not found!');
            } else {
                const parent = parentQuery.rows[0];
                console.log('PARENT EMPRESA:', parent);

                const parentExtendedPerms = await db.query(`SELECT tipo_formulario FROM usuario_permisos_formulario WHERE id_usuario = $1`, [parentId]);
                const parentPermittedTypes = parentExtendedPerms.rows.map(r => r.tipo_formulario.toLowerCase().trim());
                console.log('PARENT PERMITTED TYPES (Extended):', parentPermittedTypes);

                const selfExtendedPerms = await db.query(`SELECT tipo_formulario FROM usuario_permisos_formulario WHERE id_usuario = $1`, [user.id]);
                const selfPermittedTypes = selfExtendedPerms.rows.map(r => r.tipo_formulario.toLowerCase().trim());
                console.log('SELF PERMITTED TYPES:', selfPermittedTypes);

                const normParentBase = parent.tipo_formulario ? parent.tipo_formulario.toLowerCase().trim() : null;
                console.log('NORMALIZED PARENT BASE TYPE:', normParentBase);

                const filtered = allForms.rows.filter(f => {
                    const normForm = f.tipo.toLowerCase().trim();
                    const isBase = normForm === normParentBase;
                    const inParentPerms = parentPermittedTypes.includes(normForm);
                    const inSelfPerms = selfPermittedTypes.includes(normForm);
                    console.log(`Checking Form ${f.id} (${f.tipo}): isBase=${isBase}, inParent=${inParentPerms}, inSelf=${inSelfPerms}`);
                    return isBase || inParentPerms || inSelfPerms;
                });

                console.log('FILTERED RESULTS FOR ADICIONAL:', filtered);
            }
        }

        // 3. Sample EMPRESA User
        const empRes = await db.query(`
            SELECT u.id, u.nombres_completos, u.tipo_formulario, r.nombre as rol 
            FROM usuarios u 
            JOIN roles r ON u.id_rol = r.id 
            WHERE r.nombre = 'EMPRESA' 
            LIMIT 1
        `);

        if (empRes.rows.length > 0) {
            const user = empRes.rows[0];
            console.log('SAMPLE EMPRESA:', user);

            const extendedPerms = await db.query(`SELECT tipo_formulario FROM usuario_permisos_formulario WHERE id_usuario = $1`, [user.id]);
            const permittedTypes = extendedPerms.rows.map(r => r.tipo_formulario.toLowerCase().trim());
            console.log('EMPRESA PERMITTED TYPES (Extended):', permittedTypes);

            const normBase = user.tipo_formulario ? user.tipo_formulario.toLowerCase().trim() : null;
            console.log('NORMALIZED BASE TYPE:', normBase);

            const filtered = allForms.rows.filter(f => {
                const normForm = f.tipo.toLowerCase().trim();
                const isBase = normForm === normBase;
                const isExt = permittedTypes.includes(normForm);
                console.log(`Checking Form ${f.id} (${f.tipo}): isBase=${isBase}, isExt=${isExt}`);
                return isBase || isExt;
            });

            console.log('FILTERED RESULTS FOR EMPRESA:', filtered);
        }

    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

debugFiltering();
