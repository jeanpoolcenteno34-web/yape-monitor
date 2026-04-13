require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const sUrl = process.env.SUPABASE_URL;
const sKey = process.env.SUPABASE_KEY;
const supabase = createClient(sUrl, sKey);

async function cleanSupabase() {
    console.log("--- [DB] Iniciando limpieza de Supabase ---");
    
    // Delete entries with null title or null text
    const { data: d1, error: e1 } = await supabase
        .from('notificaciones')
        .delete()
        .is('title', null);
    
    const { data: d2, error: e2 } = await supabase
        .from('notificaciones')
        .delete()
        .is('text', null);

    if (e1 || e2) console.error("Error al limpiar:", e1, e2);
    else console.log("DB Limpia de registros nulos.");
}

cleanSupabase();
