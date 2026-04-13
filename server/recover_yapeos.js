require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const sUrl = process.env.SUPABASE_URL;
const sKey = process.env.SUPABASE_KEY;
const supabase = createClient(sUrl, sKey);
const DATA_FILE = path.join(__dirname, 'notifications.json');

// Cargar historial actual para deduplicar
let history = [];
if (fs.existsSync(DATA_FILE)) {
    try {
        history = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {}
}

const imap = new Imap({
    user: process.env.EMAIL_USER,
    password: (process.env.EMAIL_PASSWORD || '').replace(/\s+/g, ''),
    host: process.env.EMAIL_HOST || 'imap.gmail.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false }
});

function getCleanName(str) {
    return (str || '').toLowerCase().replace(/[^a-z]/g, '');
}

async function processEmail(parsed) {
    const subject = (parsed.subject || '').toLowerCase();
    const text = parsed.text || '';
    const date = parsed.date;

    const isYape = (subject.includes('yape') || subject.includes('abono') || subject.includes('recepci') ||
                   subject.includes('transferencia') || subject.includes('pago') || text.includes('Yape') || text.includes('envió')) &&
                   !subject.includes('ahora eres miembro') && !subject.includes('promoción');

    if (!isYape) return;

    const textLow = text.toLowerCase();
    if (textLow.includes('yapeaste') || textLow.includes('enviaste') || textLow.includes('propia cuenta')) return;

    // Extracción de Fecha y Hora del texto (más preciso que el timestamp del email)
    const dateMatch = text.match(/Fecha y hora\s*(\d{1,2}\s*de\s*[a-z]+\s*de\s*\d{4})\s*-\s*(\d{1,2}:\d{2}\s*[APM]{2})/i) ||
                     text.match(/(\d{1,2}\s*[a-z]+\s*\d{4})\s*-\s*(\d{1,2}:\d{2}\s*[a-z.]+)/i);
    
    let finalTimestamp = date.toISOString();
    if (dateMatch) {
        // No parseamos a Date objeto para evitar líos de zona horaria, guardamos el original para el reporte
        finalTimestamp = dateMatch[0].trim();
    }

    // Extracción de Monto
    const amountMatch = text.match(/Monto recibido\s*S\/\.?\s?(\d+(?:[,.]\d+)?)/i) || 
                       text.match(/Recibiste un yapeo de S\/\.?\s?(\d+(?:[,.]\d+)?)/i) ||
                       text.match(/S\/\.?\s?(\d+(?:[,.]\d+)?)/i);

    // Extracción de Nombre
    const nameMatch = text.match(/Enviado por\s*(.+)/i) ||
                     text.match(/de\s+([A-Z\s]{3,})\./i) || 
                     text.match(/Yape!\s*([A-Z\s]{2,})\s*te envi/i);

    // Extracción de Código de Operación
    const codeMatch = text.match(/N[º°º]\s*de\s*operaci[óo]n\s*(\d+)/i) || 
                     text.match(/Operaci[óo]n\s*(\d+)/i) ||
                     text.match(/N[º°º]\s*operaci[óo]n\s*(\d+)/i);

    if (amountMatch && nameMatch) {
        const amount = amountMatch[1].replace(',', '.');
        let sender = nameMatch[1].trim().split('\n')[0].split('\r')[0].replace(/\.$/, '').trim().toUpperCase();
        const code = codeMatch ? codeMatch[1] : null;
        
        // Filtros estrictos
        const blacklist = ['TUS CUENTAS', 'TU CUENTA', 'TU NAVEGADOR', 'COMPROBANTES', 'TARJETAS', 'LA PUERTA', 'DELIA BUS', 'AHORRO SOLES', 'ENFOQUE AYACUCHANO', 'GOOGLE'];
        if (blacklist.some(b => sender.includes(b))) return;

        const isDuplicate = history.some(h => {
            const sameCode = code && h.code === code;
            const sameDetails = Math.abs(new Date(h.dateEmail) - date) / 1000 < 60 && h.amount === amount && getCleanName(h.sender) === getCleanName(sender);
            return sameCode || sameDetails;
        });

        if (!isDuplicate) {
            console.log(`[RECOVERY] Encontrado: S/ ${amount} de ${sender} (Operación: ${code || 'N/A'}) - ${finalTimestamp}`);
            const newNotif = {
                title: "Yape por Email",
                text: `${sender} te envió un pago por S/ ${amount}!`,
                amount,
                sender,
                code,
                source: 'email',
                timestamp: date.toISOString(), // Usar ISO para la DB
                timestamp_display: finalTimestamp, // Guardar el texto para mostrarlo si se quiere
                dateEmail: date.toISOString()
            };
            history.unshift(newNotif);
            await supabase.from('notificaciones').insert([{ 
                title: newNotif.title, 
                text: newNotif.text, 
                timestamp: newNotif.timestamp 
            }]);
        }
    }
}

imap.once('ready', () => {
    imap.openBox('INBOX', true, (err, box) => {
        if (err) throw err;

        // March 28, 29, 30
        const searchDate = "28-Mar-2026";
        console.log(`Buscando correos desde: ${searchDate}`);
        
        imap.search([['SINCE', searchDate]], (err, results) => {
            if (err || !results.length) {
                console.log('No se encontraron correos.');
                imap.end();
                return;
            }

            const f = imap.fetch(results, { bodies: '' });
            let processed = 0;

            f.on('message', (msg) => {
                msg.on('body', (stream) => {
                    simpleParser(stream, async (err, parsed) => {
                        await processEmail(parsed);
                        processed++;
                        if (processed === results.length) {
                            history.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
                            fs.writeFileSync(DATA_FILE, JSON.stringify(history, null, 2));
                            
                            // Generar Reporte de Ventas
                            calculateReport();
                            imap.end();
                        }
                    });
                });
            });
        });
    });
});

function calculateReport() {
    const dailyTotals = { "28": 0, "29": 0, "30": 0, "31": 0, "1": 0, "2": 0, "3": 0 };
    history.forEach(h => {
        let day = "0";
        if (h.timestamp.includes(' de ')) {
            const m = h.timestamp.match(/(\d{1,2})\s+de/i);
            if (m) day = m[1];
        } else if (h.timestamp.match(/^\d{1,2}\s/)) {
            const m = h.timestamp.match(/^(\d{1,2})/);
            if (m) day = m[1];
        } else {
            const d = new Date(h.timestamp);
            day = d.getDate().toString();
        }
        
        if (dailyTotals[day] !== undefined) {
            dailyTotals[day] += parseFloat(h.amount);
        }
    });

    console.log("\n--- REPORTE DE VENTAS (Final Limpio) ---");
    console.log(`Día 28 Mar: S/ ${dailyTotals["28"].toFixed(2)}`);
    console.log(`Día 29 Mar: S/ ${dailyTotals["29"].toFixed(2)}`);
    console.log(`Día 30 Mar: S/ ${dailyTotals["30"].toFixed(2)}`);
    console.log(`Día 31 Mar: S/ ${dailyTotals["31"].toFixed(2)}`);
    console.log(`Día 01 Abr: S/ ${dailyTotals["1"].toFixed(2)}`);
    console.log(`Día 02 Abr: S/ ${dailyTotals["2"].toFixed(2)}`);
    console.log(`Día 03 Abr: S/ ${dailyTotals["3"].toFixed(2)}`);
    console.log(`TOTAL SUMADO: S/ ${(dailyTotals["28"] + dailyTotals["29"] + dailyTotals["30"] + dailyTotals["31"] + dailyTotals["1"] + dailyTotals["2"] + dailyTotals["3"]).toFixed(2)}`);
    console.log("----------------------------------------\n");
}

imap.once('error', (err) => console.error('IMAP error:', err));
imap.once('end', () => process.exit(0));

imap.connect();
