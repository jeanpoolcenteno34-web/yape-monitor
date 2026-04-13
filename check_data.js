const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './server/.env' });

const sUrl = process.env.SUPABASE_URL;
const sKey = process.env.SUPABASE_KEY;
const supabase = createClient(sUrl, sKey);

async function checkData() {
    const { data, error } = await supabase
        .from('notificaciones')
        .select('*')
        .gte('timestamp', '2026-03-16T00:00:00Z')
        .lte('timestamp', '2026-03-16T23:59:59Z')
        .order('timestamp', { ascending: true });

    if (error) {
        console.error('Error fetching data:', error);
        return;
    }

    console.log(JSON.stringify(data, null, 2));
}

checkData();
