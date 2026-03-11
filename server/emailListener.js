require('dotenv').config();
const Imap = require('imap');
const { simpleParser } = require('mailparser');

function startEmailListener(onNewNotification) {
    const imap = new Imap({
        user: process.env.EMAIL_USER,
        password: process.env.EMAIL_PASSWORD,
        host: process.env.EMAIL_HOST || 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false }
    });

    function openInbox(cb) {
        imap.openBox('INBOX', false, cb);
    }

    imap.once('ready', () => {
        console.log('--- Conectado al correo para monitoreo ---');
        openInbox((err, box) => {
            if (err) throw err;

            // Función para procesar correos específicos
            const fetchAndProcess = (criteria) => {
                imap.search(criteria, (err, results) => {
                    if (err || !results || results.length === 0) {
                        return;
                    }
                    
                    const f = imap.fetch(results, { bodies: '' });
                    f.on('message', (msg) => {
                        msg.on('body', (stream) => {
                            simpleParser(stream, async (err, parsed) => {
                                if (err) return console.error(err);
                                const subject = (parsed.subject || '').toLowerCase();
                                const text = parsed.text || '';
                                
                                console.log(`--- [DEBUG] Correo UNSEEN hallado: "${parsed.subject}" ---`);

                                // Filtro de Yape
                                const isYape = subject.includes('yape') || 
                                               subject.includes('abono') || 
                                               subject.includes('recepci') ||
                                               subject.includes('transferencia');

                                if (isYape) {
                                    console.log(`--- [DEBUG] Analizando contenido de Yape... ---`);
                                    // Regex para monto (S/ o S/.)
                                    const amountMatch = text.match(/S\/\.?\s?(\d+(?:[,.]\d+)?)/i);
                                    
                                    let sender = 'Desconocido';
                                    const nameMatch = text.match(/Yape\s?\(([^)]+)\)/i) || 
                                                     text.match(/de\s+([A-Z\s]{5,})/i) ||
                                                     text.match(/Origen:\s?([^\n\r]+)/i);
                                    
                                    if (nameMatch) {
                                        const potentialName = nameMatch[1].trim();
                                        if (!potentialName.toLowerCase().includes('exitosamente')) {
                                            sender = potentialName;
                                        }
                                    }

                                    if (amountMatch) {
                                        let amountStr = amountMatch[1].replace(',', '.');
                                        onNewNotification({
                                            title: "Yape por Email",
                                            text: `Recibiste S/ ${amountStr} de ${sender}`,
                                            amount: amountStr,
                                            sender: sender,
                                            source: 'email'
                                        });
                                        console.log(`--- [LOG] ¡EXITO! Procesado S/ ${amountStr} ---`);
                                    } else {
                                        console.log(`--- [DEBUG] No se halló monto en el texto: ${text.substring(0, 50)}... ---`);
                                    }
                                }
                            });
                        });
                        // Marcar como leído
                        msg.once('attributes', (attrs) => {
                            imap.addFlags(attrs.uid, ['\\Seen'], () => {});
                        });
                    });
                });
            };

            // 1. Al conectar, buscar TODOS los UNSEEN (sin importar la fecha)
            console.log('--- [LOG] Sincronizando correos no leídos... ---');
            fetchAndProcess(['UNSEEN']);

            // 2. Escuchar nuevos
            imap.on('mail', () => {
                fetchAndProcess(['UNSEEN']);
            });

            // 3. Respaldo cada 5 min
            setInterval(() => {
                fetchAndProcess(['UNSEEN']);
            }, 300000);
        });
    });

    imap.once('error', (err) => {
        console.error('Error de IMAP:', err);
        // Reintentar en 30 segundos si hay error de conexión
        setTimeout(() => startEmailListener(onNewNotification), 30000);
    });

    imap.once('end', () => {
        console.log('Conexión IMAP cerrada. Reconectando...');
        setTimeout(() => startEmailListener(onNewNotification), 5000);
    });

    imap.connect();
}

module.exports = { startEmailListener };
