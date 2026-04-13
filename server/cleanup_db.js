require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const sUrl = process.env.SUPABASE_URL;
const sKey = process.env.SUPABASE_KEY;
const supabase = createClient(sUrl, sKey);

async function cleanupSupabase() {
    console.log("Iniciando limpieza de Supabase...");
    
    // Lista de términos que identifican yapeos "raros" o internos
    const blacklist = ['TUS CUENTAS', 'TU CUENTA', 'TU NAVEGADOR', 'COMPROBANTES', 'TARJETAS', 'LA PUERTA', 'DELIA BUS', 'ENFOQUE', 'GOOGLE'];
    
    for (const term of blacklist) {
        console.log(`Borrando registros que contienen: ${term}...`);
        const { error, count } = await supabase
            .from('notificaciones')
            .delete()
            .ilike('text', `%${term}%`);
        
        if (error) console.error(`Error borrando ${term}:`, error.message);
        else console.log(`Borrados registros con "${term}".`);
    }

    // Borrar yapeos salientes (que suelen empezar con "Yapeaste" o "¡Acabas de yapear")
    console.log("Borrando yapeos salientes...");
    const { error: errorExit } = await supabase
        .from('notificaciones')
        .delete()
        .or('text.ilike.%yapeaste%,text.ilike.%enviaste%');
    
    // Borrar duplicados exactos (mismo texto y timestamp muy cercano)
    console.log("Buscando duplicados internos en la base de datos...");
    const { data: allNotifs } = await supabase.from('notificaciones').select('*').order('timestamp', { ascending: false }).limit(1000);
    
    if (allNotifs) {
        let toDelete = [];
        for (let i = 0; i < allNotifs.length; i++) {
            for (let j = i + 1; j < allNotifs.length; j++) {
                const a = allNotifs[i];
                const b = allNotifs[j];
                const diff = Math.abs(new Date(a.timestamp) - new Date(b.timestamp)) / 1000;
                
                if (diff < 300 && a.text === b.text && !toDelete.includes(b.id)) {
                    toDelete.push(b.id);
                }
            }
        }
        
        if (toDelete.length > 0) {
            console.log(`Borrando ${toDelete.length} duplicados...`);
            // Delete in chunks of 50 to avoid URL length issues
            for (let k = 0; k < toDelete.length; k += 50) {
                const chunk = toDelete.slice(k, k + 50);
                await supabase.from('notificaciones').delete().in('id', chunk);
            }
        }
    }

    console.log("Limpieza completada.");
    process.exit(0);
}

cleanupSupabase();
