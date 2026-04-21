const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
    let qBase = `
        SELECT b.id, b.accion, b.detalle, b.fecha, u.nombres_completos, u.identificacion, r.nombre as rol 
        FROM bitacora b 
        JOIN usuarios u ON b.id_usuario = u.id 
        JOIN roles r ON u.id_rol = r.id 
    `;
    let countBase = `
        SELECT COUNT(b.id) 
        FROM bitacora b 
        JOIN usuarios u ON b.id_usuario = u.id 
        JOIN roles r ON u.id_rol = r.id 
    `;

    let conditions = [];
    let values = [];
    let paramIndex = 1;

    const rol = req.user.rol;
    
    if (rol === 'EMPRESA') {
        const empresaId = req.user.id_empresa || req.user.id;
        conditions.push(`b.id_empresa_contexto = $${paramIndex++}`);
        values.push(empresaId);
        conditions.push(`b.fecha >= CURRENT_DATE - INTERVAL '2 months'`);
    } else if (rol === 'ADICIONAL') {
        conditions.push(`b.id_usuario = $${paramIndex++}`);
        values.push(req.user.id);
        conditions.push(`b.fecha >= CURRENT_DATE - INTERVAL '1 month'`);
    }

    const { search, page = 1 } = req.query;
    if (search) {
        conditions.push(`(u.nombres_completos ILIKE $${paramIndex} OR u.identificacion ILIKE $${paramIndex} OR b.accion ILIKE $${paramIndex})`);
        values.push(`%${search}%`);
        paramIndex++;
    }

    let whereClause = conditions.length > 0 ? `WHERE ` + conditions.join(' AND ') : '';

    const limit = 15;
    const offset = (parseInt(page) - 1) * limit;

    let finalQuery = `${qBase} ${whereClause} ORDER BY b.fecha DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    let countQuery = `${countBase} ${whereClause}`;

    try {
        const resultCount = await db.query(countQuery, values);
        const totalRows = parseInt(resultCount.rows[0].count);
        
        let execValues = [...values, limit, offset];
        const { rows } = await db.query(finalQuery, execValues);
        
        res.json({
            data: rows,
            pagination: {
                total: totalRows,
                page: parseInt(page),
                totalPages: Math.ceil(totalRows / limit)
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener bitácora' });
    }
});

// LISTAR NOTIFICACIONES DEL USUARIO Y ALERTAS VIRTUALES DE EXPIRACIÓN
router.get('/notificaciones', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await db.query(
            'SELECT * FROM notificaciones WHERE user_id = $1 ORDER BY fecha DESC LIMIT 50',
            [userId]
        );
        const notifs = result.rows;

        // Inyectar alertas de documentos a punto de expirar
        const expiringDocs = await db.query(`
            SELECT id, tipo, nombre_archivo, fecha_expiracion 
            FROM documentos_personales 
            WHERE user_id = $1 
              AND fecha_expiracion IS NOT NULL 
              AND fecha_expiracion <= CURRENT_DATE + INTERVAL '15 days'
              AND fecha_expiracion >= CURRENT_DATE
        `, [userId]);

        expiringDocs.rows.forEach(doc => {
            notifs.unshift({
                id: 'exp-' + doc.id,
                titulo: '⚠️ Expiración Próxima: ' + doc.tipo,
                mensaje: `El documento "${doc.nombre_archivo}" expira pronto (Fecha límite: ${new Date(doc.fecha_expiracion).toLocaleDateString()}). Por favor, considere recargarlo o sustituirlo a la brevedad.`,
                fecha: new Date(),
                leida: false,
                isVirtual: true
            });
        });

        // Inyectar alertas de documentos ya expirados
        const expiredDocs = await db.query(`
            SELECT id, tipo, nombre_archivo, fecha_expiracion 
            FROM documentos_personales 
            WHERE user_id = $1 
              AND fecha_expiracion IS NOT NULL 
              AND fecha_expiracion < CURRENT_DATE
        `, [userId]);

        expiredDocs.rows.forEach(doc => {
            notifs.unshift({
                id: 'exp-d-' + doc.id,
                titulo: '❌ Documento Vencido: ' + doc.tipo,
                mensaje: `Su documento "${doc.nombre_archivo}" superó su fecha límite de vigencia (${new Date(doc.fecha_expiracion).toLocaleDateString()}). Es imperativo actualizarlo en el sistema.`,
                fecha: doc.fecha_expiracion,
                leida: false,
                isVirtual: true
            });
        });

        res.json(notifs);
    } catch (err) {
        res.status(500).json({ error: 'Error al obtener notificaciones' });
    }
});

// MARCAR COMO LEÍDA
router.post('/notificaciones/:id/read', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        
        // Bloqueo de notificaciones virtuales
        if(id.startsWith('exp-')) {
             return res.json({ success: true, fake: true });
        }
        
        await db.query('UPDATE notificaciones SET leida = TRUE WHERE id = $1 AND user_id = $2', [id, userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Error al actualizar' });
    }
});

// LIMPIAR TODAS LAS NOTIFICACIONES
router.delete('/notificaciones/clear', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        await db.query('DELETE FROM notificaciones WHERE user_id = $1', [userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Error al limpiar' });
    }
});

module.exports = router;
