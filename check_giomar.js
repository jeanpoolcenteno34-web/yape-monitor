const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './server/.env' });

const sUrl = process.env.SUPABASE_URL;
const sKey = process.env.SUPABASE_KEY;
const supabase = createClient(sUrl, sKey);

async function checkGiomar() {
    const { data, error } = await supabase
        .from('notificaciones')
        .select('*')
        .ilike('text', '%Giomar%')
        .order('timestamp', { ascending: false });

    if (error) {
        console.error('Error fetching data:', error);
        return;
    }

    console.log(JSON.stringify(data, null, 2));
}

checkGiomar();
