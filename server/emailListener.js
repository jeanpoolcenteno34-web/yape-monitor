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

            // Función para procesar correos específicos por su UID o secuencia
            const fetchAndProcess = (criteria) => {
                imap.search(criteria, (err, results) => {
                    if (err || !results || results.length === 0) return;
                    
                    const f = imap.fetch(results, { bodies: '' });
                    f.on('message', (msg) => {
                        msg.on('body', (stream) => {
                            simpleParser(stream, async (err, parsed) => {
                                if (err) return console.error(err);
                                const subject = (parsed.subject || '').toLowerCase();
                                const text = parsed.text || '';
                                
                                const isYape = subject.includes('yape') || 
                                               subject.includes('abono') || 
                                               subject.includes('confirmaci') || 
                                               subject.includes('recepci');

                                if (isYape) {
                                    const amountMatch = text.match(/S\/\s?(\d+(?:\.\d+)?)/);
                                    const nameMatch = text.match(/Yape\s?\(([^)]+)\)/i) || 
                                                     text.match(/de\s+([A-Z\s]{5,})/i);

                                    if (amountMatch) {
                                        const amount = amountMatch[1];
                                        const sender = nameMatch ? nameMatch[1].trim() : 'Desconocido';
                                        
                                        onNewNotification({
                                            title: "Yape por Email",
                                            text: `Recibiste S/ ${amount} de ${sender}`,
                                            amount: amount,
                                            sender: sender,
                                            source: 'email'
                                        });
                                        console.log(`--- [LOG] ¡EXITO! Procesado Yape de S/ ${amount} ---`);
                                    }
                                }
                            });
                        });
                        // Marcar como leído para que no se repita
                        msg.once('attributes', (attrs) => {
                            imap.addFlags(attrs.uid, ['\\Seen'], () => {});
                        });
                    });
                });
            };

            // 1. Al conectar, buscar SOLO los que no han sido leídos (UNSEEN)
            console.log('--- [LOG] Buscando nuevos Yapes no leídos ---');
            fetchAndProcess(['UNSEEN']);

            // 2. Escuchar nuevos correos
            imap.on('mail', () => {
                console.log('--- [LOG] Nuevo correo detectado. Verificando... ---');
                fetchAndProcess(['UNSEEN']);
            });

            // 3. Respaldo periódico cada 5 minutos
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
