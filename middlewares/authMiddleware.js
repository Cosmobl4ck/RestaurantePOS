const { supabase } = require('../config/supabase');

const verificarSesion = async (req, res, next) => {
    // 1. ¿Hay alguien logueado?
    if (!req.session || !req.session.usuario) {
        return res.redirect('/login');
    }

    try {
        const restauranteId = req.session.usuario.restaurante_id;

        // ✅ CAMBIO CLAVE: Usamos el cliente de Supabase en lugar de pool.query
        const { data: negocio, error } = await supabase
            .from('restaurantes')
            .select('estado, fecha_vencimiento, nombre_comercial')
            .eq('id', restauranteId)
            .single(); // Traemos solo una fila

        // Si hay un error de conexión o el restaurante no existe
        if (error || !negocio) {
            console.error("Error obteniendo restaurante:", error);
            req.session.destroy();
            return res.redirect('/login');
        }

        const hoy = new Date();
        
        // 2. Validación de estado (Activo, Suspendido, etc.)
        if (negocio.estado !== 'activo') {
            return res.status(403).render('error', { error: { message: 'El acceso a este restaurante está suspendido.', status: 403 } });
        }

        // 3. Lógica de bloqueo por Fecha (Vencimiento)
        // Según tu imagen, vence el 15/06/2026, así que hoy debería entrar sin problemas.
        if (negocio.fecha_vencimiento) {
            const vencimiento = new Date(negocio.fecha_vencimiento);

            if (hoy > vencimiento) {
                // Permitir un periodo de gracia de 48 horas
                const limiteBloqueo = new Date(vencimiento.getTime() + 48 * 60 * 60 * 1000);

                if (hoy > limiteBloqueo) {
                    return res.status(403).render('error', { error: { message: 'La licencia de este restaurante está vencida.', status: 403 } });
                }
            }
        }

        // Si pasó todos los filtros, ¡adelante!
        next();

    } catch (error) {
        console.error("Error crítico en seguridad SaaS:", error);
        res.status(500).send("Error interno de validación de licencia. Revisa la consola del servidor.");
    }
};

module.exports = { verificarSesion };