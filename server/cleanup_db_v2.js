require('dotenv').config({ path: './server/.env' });
const { createClient } = require('@supabase/supabase-js');

const sUrl = process.env.SUPABASE_URL;
const sKey = process.env.SUPABASE_KEY;

if (!sUrl || !sKey) {
    console.error('Error: SUPABASE_URL or SUPABASE_KEY not found in .env');
    process.exit(1);
}

const supabase = createClient(sUrl, sKey);

async function cleanup() {
    console.log('--- Iniciando limpieza de base de datos ---');

    // 1. Eliminar "Desconocido", "Cuenta de Ahorro", "Yapeaste", "Enviaste"
    const filters = ['desconocido', 'cuenta de ahorro', 'yapeaste', 'enviaste'];
    
    for (const term of filters) {
        console.log(`Buscando registros con: "${term}"...`);
        const { data, error } = await supabase
            .from('notificaciones')
            .delete()
            .or(`text.ilike.%${term}%,title.ilike.%${term}%`);

        if (error) console.error(`Error eliminando "${term}":`, error);
        else console.log(`Eliminados registros que contienen "${term}".`);
    }

    // 2. Eliminar duplicados inteligentes
    console.log('Buscando duplicados...');
    const { data: all, error: fetchError } = await supabase
        .from('notificaciones')
        .select('*')
        .order('timestamp', { ascending: false });

    if (fetchError) {
        console.error('Error al obtener registros:', fetchError);
        return;
    }

    const idsToDelete = [];
    const seen = [];

    all.forEach(record => {
        const text = (record.text || '').toLowerCase();
        const time = new Date(record.timestamp);

        // Buscar si ya vimos uno muy parecido en los últimos 10 minutos
        const duplicate = seen.find(old => {
            const timeDiff = Math.abs(time - old.time) / 1000;
            if (timeDiff > 600) return false;
            
            // Si el texto es idéntico
            if (old.text === text) return true;

            // O si tienen el mismo monto y el tiempo es muy cercano (< 3 min)
            const m1 = text.match(/s\/\.?\s?(\d+(?:[,.]\d+)?)/i);
            const m2 = old.text.match(/s\/\.?\s?(\d+(?:[,.]\d+)?)/i);
            if (m1 && m2 && m1[1] === m2[1] && timeDiff < 180) return true;

            return false;
        });

        if (duplicate) {
            idsToDelete.push(record.id);
        } else {
            seen.push({ text, time });
        }
    });

    if (idsToDelete.length > 0) {
        console.log(`Eliminando ${idsToDelete.length} duplicados detectados...`);
        // Borrar en lotes si es necesario, pero Supabase permite arrays en .in()
        const { error: delError } = await supabase
            .from('notificaciones')
            .delete()
            .in('id', idsToDelete);

        if (delError) console.error('Error eliminando duplicados:', delError);
        else console.log('Duplicados eliminados con éxito.');
    } else {
        console.log('No se encontraron duplicados.');
    }

    console.log('--- Limpieza completada ---');
}

cleanup();
