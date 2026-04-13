require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const sUrl = process.env.SUPABASE_URL;
const sKey = process.env.SUPABASE_KEY;
const supabase = createClient(sUrl, sKey);

async function checkToday() {
    const today = new Date().toISOString().split('T')[0];
    console.log(`Buscando yapeos para: ${today}`);
    
    const { data, error } = await supabase
        .from('notificaciones')
        .select('*')
        .gte('timestamp', `${today}T00:00:00Z`);
    
    if (error) console.error(error);
    else {
        console.log(`Encontrados ${data.length} yapeos hoy.`);
        data.forEach(n => console.log(`- ${n.timestamp}: ${n.text}`));
    }
    process.exit(0);
}

checkToday();
