const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './server/.env' });

const sUrl = process.env.SUPABASE_URL;
const sKey = process.env.SUPABASE_KEY;

if (!sUrl || !sKey) {
    console.error('Error: Faltan credenciales de Supabase');
    process.exit(1);
}

const supabase = createClient(sUrl, sKey);

async function cleanData() {
    console.log('--- Iniciando limpieza de datos ---');

    // 1. Borrar transferencias internas (Tu cuenta de ahorro, etc)
    const { data: d1, error: e1 } = await supabase
        .from('notifications')
        .delete()
        .or('sender.ilike.%cuenta de ahorro%,sender.ilike.%mis cuentas%,sender.ilike.%entre tus cuentas%,sender.ilike.%propia cuenta%');
    
    if (e1) console.error('Error d1:', e1);
    else console.log('✓ Se han borrado movimientos internos.');

    // 2. Borrar "Desconocido" de Email (como pidió el usuario)
    const { data: d2, error: e2 } = await supabase
        .from('notifications')
        .delete()
        .eq('source', 'email')
        .eq('sender', 'Desconocido');

    if (e2) console.error('Error d2:', e2);
    else console.log('✓ Se han borrado yapeos de "Desconocido" vía Email.');

    // 3. Borrar el duplicado específico de S/ 4.00 de Email (Jose Miguel)
    // El usuario mostró que el de Email es el duplicado.
    const { data: d3, error: e3 } = await supabase
        .from('notifications')
        .delete()
        .eq('source', 'email')
        .eq('amount', '4.00')
        .ilike('sender', '%CORRALES%');

    if (e3) console.error('Error d3:', e3);
    else console.log('✓ Se ha borrado el duplicado de S/ 4.00 de Email.');

    // 4. Borrar el de S/ 160.00 de Desconocido (mencionado en imagen)
    // Ya debería haber caído en el paso 2, pero por si acaso.
    
    console.log('--- Limpieza completada ---');
}

cleanData();
