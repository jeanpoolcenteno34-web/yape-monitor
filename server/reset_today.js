require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const sUrl = process.env.SUPABASE_URL;
const sKey = process.env.SUPABASE_KEY;
const supabase = createClient(sUrl, sKey);

async function resetToday() {
    const today = "2026-03-31";
    console.log(`Borrando todos los registros del: ${today}`);
    
    const { error, count } = await supabase
        .from('notificaciones')
        .delete()
        .gte('timestamp', `${today}T00:00:00Z`);
    
    if (error) console.error(error);
    else console.log(`Registros de hoy borrados.`);
    
    process.exit(0);
}

resetToday();
