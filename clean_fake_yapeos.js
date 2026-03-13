const { createClient } = require('@supabase/supabase-js');

const S_URL = "https://qjekbbfskzyhjtuoepqj.supabase.co";
const S_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZWtiYmZza3p5aGp0dW9lcHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyOTQ2NjUsImV4cCI6MjA4Nzg3MDY2NX0.1srkJCZJ4ny5G52o76YNPZ2hzbuhgVFVSENNHKlADWE";

const supabase = createClient(S_URL, S_KEY);

async function cleanFakes() {
    console.log("Obteniendo notificaciones para buscar yapeos falsos (< S/ 0.10)...");
    const { data: notifs, error } = await supabase.from('notificaciones')
        .select('id, text, timestamp')
        .order('timestamp', { ascending: false });

    if (error) {
        console.error("Error obteniendo datos:", error);
        return;
    }

    if (!notifs) return console.log('No hay datos.');

    const toDelete = [];
    
    for (let notif of notifs) {
        if (!notif.text) continue;
        
        let amount = 0;
        const m = notif.text.match(/S\/ ?(\d+(\.\d+)?)/i);
        if (m) amount = parseFloat(m[1]);
        
        const textLow = notif.text.toLowerCase();
        
        // Exclude strictly fake amounts > 0 but < 0.10 (like 0.01)
        const isMicro = amount > 0 && amount < 0.10;
        const isSurvey = textLow.includes('encuesta') || textLow.includes('participa por un') || textLow.includes('prueba');
        const isFakeLink = textLow.includes('app.yape.com.pe') || textLow.includes('email_home_yape');
        const isYapero = textLow.includes('de yapero'); // Fake S/ 7 de yapero
        
        if (isMicro || isSurvey || isFakeLink || isYapero) {
            toDelete.push(notif.id);
            console.log(`Falso detectado: ${notif.text} (ID: ${notif.id})`);
        }
    }
    
    console.log(`\nEncontrados ${toDelete.length} yapeos falsos.`);
    
    if (toDelete.length === 0) {
        console.log("No hay nada que borrar.");
        process.exit();
    }

    for (let i = 0; i < toDelete.length; i += 100) {
        const batch = toDelete.slice(i, i + 100);
        const { error: delError } = await supabase.from('notificaciones').delete().in('id', batch);
        if (delError) {
             console.error(`Error borrando bloque:`, delError);
        } else {
             console.log(`Borrados ${batch.length} registros falsos.`);
        }
    }
    console.log('¡Limpieza completada!');
    process.exit();
}

cleanFakes();
