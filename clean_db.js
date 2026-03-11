const { createClient } = require('@supabase/supabase-js');

const S_URL = "https://qjekbbfskzyhjtuoepqj.supabase.co";
const S_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZWtiYmZza3p5aGp0dW9lcHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyOTQ2NjUsImV4cCI6MjA4Nzg3MDY2NX0.1srkJCZJ4ny5G52o76YNPZ2hzbuhgVFVSENNHKlADWE";

const supabase = createClient(S_URL, S_KEY);

async function clean() {
    console.log("Limpiando...");
    const { error } = await supabase
        .from('notificaciones')
        .delete()
        .ilike('text', '%186.00%');

    if (error) {
        console.error("Error al limpiar:", error);
    } else {
        console.log("Registro de 186 soles eliminado con éxito.");
    }
    process.exit();
}

clean();
