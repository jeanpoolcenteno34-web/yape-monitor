const { createClient } = require('@supabase/supabase-js');
const S_URL = "https://qjekbbfskzyhjtuoepqj.supabase.co";
const S_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqZWtiYmZza3p5aGp0dW9lcHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyOTQ2NjUsImV4cCI6MjA4Nzg3MDY2NX0.1srkJCZJ4ny5G52o76YNPZ2hzbuhgVFVSENNHKlADWE";
const supabase = createClient(S_URL, S_KEY);

async function clean() {
    console.log("Fetching notifications...");
    const { data: notifs } = await supabase.from('notificaciones')
        .select('id, text, timestamp')
        .order('timestamp', { ascending: false });

    if (!notifs) return console.log('No data');

    const seen = [];
    const toDelete = [];
    
    for (let notif of notifs) {
        if (!notif.text) continue;
        const currentText = notif.text.toLowerCase();
        const currentTimestamp = new Date(notif.timestamp);
        
        const isDup = seen.some(old => {
            const diff = Math.abs(currentTimestamp - new Date(old.timestamp)) / 1000;
            if (diff > 120) return false;
            return old.text === currentText;
        });

        if (isDup) {
            toDelete.push(notif.id);
        } else {
            seen.push({ text: currentText, timestamp: notif.timestamp });
        }
    }
    
    console.log(`Found ${toDelete.length} duplicates`);
    
    for (let i = 0; i < toDelete.length; i += 100) {
        const batch = toDelete.slice(i, i + 100);
        await supabase.from('notificaciones').delete().in('id', batch);
        console.log(`Deleted batch of ${batch.length}`);
    }
    console.log('Done!');
}
clean();
