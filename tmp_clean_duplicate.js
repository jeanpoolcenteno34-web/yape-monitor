const { createClient } = require('@supabase/supabase-js');

const sUrl = "https://qjekbbfskzyhjtuoepqj.supabase.co";
const sKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZWtiYmZza3p5aGp0dW9lcHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyOTQ2NjUsImV4cCI6MjA4Nzg3MDY2NX0.1srkJCZJ4ny5G52o76YNPZ2hzbuhgVFVSENNHKlADWE";
const supabase = createClient(sUrl, sKey);

async function cleanSpecificDuplicate() {
    console.log("Buscando duplicados de S/ 8.70 de Jesus Michael...");
    
    const { data, error } = await supabase
        .from('notificaciones')
        .select('*')
        .ilike('text', '%8.70%')
        .ilike('text', '%Jesus Michael%')
        .order('timestamp', { ascending: false });

    if (error) {
        console.error("Error:", error);
        return;
    }

    if (data && data.length > 1) {
        console.log(`Encontrados ${data.length} registros. Manteniendo el más antiguo y borrando el resto.`);
        // El más antiguo tiene el timestamp menor. Sorted by DESC, so the last is oldest.
        const toKeep = data[data.length - 1];
        const toDeleteIds = data.slice(0, data.length - 1).map(n => n.id);

        console.log(`Borrando IDs: ${toDeleteIds.join(', ')}`);
        
        const { error: delError } = await supabase
            .from('notificaciones')
            .delete()
            .in('id', toDeleteIds);

        if (delError) console.error("Error al borrar:", delError);
        else console.log("¡Duplicado borrado con éxito!");
    } else {
        console.log("No se encontraron duplicados específicos o solo hay uno.");
    }
}

cleanSpecificDuplicate();
