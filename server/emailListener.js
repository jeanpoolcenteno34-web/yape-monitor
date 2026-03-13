require('dotenv').config();
const Imap = require('imap');
const { simpleParser } = require('mailparser');

function startEmailListener(onNewNotification) {
    const userEmail = process.env.EMAIL_USER || 'NO CONFIGURADO';
    const maskedEmail = userEmail.replace(/(.{3})(.*)(@.*)/, '$1***$3');
    
    console.log(`--- [MONITOR] Intentando conectar con: ${maskedEmail} ---`);
    console.log(`--- [MONITOR] Servidor IMAP: ${process.env.EMAIL_HOST || 'imap.gmail.com'} ---`);

    const imap = new Imap({
        user: process.env.EMAIL_USER,
        password: process.env.EMAIL_PASSWORD,
        host: process.env.EMAIL_HOST || 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        keepalive: {
            interval: 10000,
            idleInterval: 30000,
            forceNoop: true
        }
    });

    let currentBox = 'INBOX';

    function openInbox(cb) {
        imap.openBox(currentBox, false, cb);
    }

    const fetchAndProcess = (criteria) => {
        imap.search(criteria, (err, results) => {
            if (err || !results || results.length === 0) return;
            
            const f = imap.fetch(results, { bodies: '', markSeen: true });
            f.on('message', (msg) => {
                msg.on('body', (stream) => {
                    simpleParser(stream, async (err, parsed) => {
                        if (err) return console.error('Parser Error:', err);
                        const subject = (parsed.subject || '').toLowerCase();
                        const text = parsed.text || '';
                        
                        console.log(`--- [LOG] Nuevo correo: "${parsed.subject}" ---`);

                        // Filtro más flexible para BCP y Yape
                        const isYape = subject.includes('yape') || 
                                       subject.includes('abono') || 
                                       subject.includes('recepci') ||
                                       subject.includes('transferencia') ||
                                       subject.includes('pago') ||
                                       subject.includes('confirmaci') ||
                                       subject.includes('prueba') ||
                                       text.includes('Yape') ||
                                       text.includes('Abono') ||
                                       text.includes('envió');

                        if (isYape) {
                            // Regex mejorada para montos S/ o S/. con decimales opcionales
                            const amountMatch = text.match(/S\/\.?\s?(\d+(?:[,.]\d+)?)/i) || 
                                              text.match(/monto:\s?S\/\.?\s?(\d+(?:[,.]\d+)?)/i);
                            
                            let sender = 'Desconocido';
                            // Regex para capturar el nombre del remitente en diferentes formatos de BCP/Yape
                            const nameMatch = text.match(/Yape\s?\(([^)]+)\)/i) || 
                                             text.match(/de\s+([A-Z\s]{5,})/i) ||
                                             text.match(/Origen:\s?([^\n\r]+)/i) ||
                                             text.match(/([A-Z][a-z]+ [A-Z][a-z]+)\s+te envió/i);
                            
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
                                console.log(`--- [LOG] ¡EXITO! S/ ${amountStr} procesado ---`);
                            }
                        }
                    });
                });
            });
        });
    };

    imap.once('ready', () => {
        console.log('--- [MONITOR] Conexión establecida con Gmail ---');
        openInbox((err, box) => {
            if (err) {
                console.error('Error al abrir inbox:', err);
                return imap.end();
            }

            console.log('--- [MONITOR] Sincronizando pendientes... ---');
            fetchAndProcess(['UNSEEN']);

            const startIdling = () => {
                imap.idle();
                console.log('--- [MONITOR] Escuchando en tiempo real (IDLE)... ---');
            };

            startIdling();

            imap.on('mail', (numNewMsgs) => {
                console.log(`--- [MONITOR] ${numNewMsgs} correo(s) nuevo(s) detectado(s) ---`);
                fetchAndProcess(['UNSEEN']);
            });

            imap.on('update', () => {
                // Algunos servidores notifican mediante UPDATE
                fetchAndProcess(['UNSEEN']);
            });
        });
    });

    imap.on('error', (err) => {
        console.error('--- [ERROR] Error en Monitor IMAP:', err.message);
    });

    imap.once('end', () => {
        console.log('--- [RECONECT] Conexión cerrada. Reintentando en 10s... ---');
        setTimeout(() => startEmailListener(onNewNotification), 10000);
    });

    // Heartbeat cada 60s
    const heartbeat = setInterval(() => {
        if (imap.state === 'authenticated') imap.noop();
    }, 60000);

    // Sincronización de seguridad cada 5 minutos (por si falla IDLE)
    const backupSync = setInterval(() => {
        if (imap.state === 'authenticated') fetchAndProcess(['UNSEEN']);
    }, 300000);

    imap.connect();
}

module.exports = { startEmailListener };
