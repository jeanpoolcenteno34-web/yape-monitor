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

            // Función para procesar correos
            const processMessages = (num) => {
                if (num <= 0) return;
                const start = Math.max(1, box.messages.total - (num - 1));
                const f = imap.seq.fetch(`${start}:*`, { bodies: '' });
                f.on('message', (msg) => {
                    msg.on('body', (stream) => {
                        simpleParser(stream, async (err, parsed) => {
                            if (err) return console.error(err);
                            const subject = (parsed.subject || '').toLowerCase();
                            const text = parsed.text || '';
                            console.log(`--- [LOG] Analizando correo: "${parsed.subject}" ---`);

                            // Filtros más amplios e insensibles a mayúsculas
                            const isYape = subject.includes('yape') || 
                                           subject.includes('abono') || 
                                           subject.includes('confirmaci') || 
                                           subject.includes('recepci') ||
                                           subject.includes('recibiste');

                            if (isYape) {
                                console.log('--- [LOG] Coincidencia encontrada en el correo ---');
                                const amountMatch = text.match(/S\/\s?(\d+(?:\.\d+)?)/);
                                const nameMatch = text.match(/Yape\s?\(([^)]+)\)/i) || 
                                                 text.match(/de\s+([A-Z\s]{5,})/i) ||
                                                 text.match(/Origen:\s?([^\n\r]+)/i);

                                if (amountMatch) {
                                    const amount = amountMatch[1];
                                    const sender = nameMatch ? nameMatch[1].trim() : 'Desconocido';
                                    console.log(`--- [LOG] ¡EXITO! Detectado S/ ${amount} de ${sender}`);
                                    onNewNotification({
                                        title: "Yape por Email",
                                        text: `Recibiste S/ ${amount} de ${sender}`,
                                        amount: amount,
                                        sender: sender,
                                        source: 'email'
                                    });
                                }
                            }
                        });
                    });
                });
            };

            // 1. Procesar correos existentes al conectar
            if (box.messages.total > 0) {
                console.log('--- [LOG] Verificando últimos 5 correos en la bandeja ---');
                processMessages(5);
            }

            // 2. Escuchar nuevos correos
            imap.on('mail', (numNewMsgs) => {
                console.log(`--- [LOG] ¡Nuevo correo detectado en tiempo real! ---`);
                processMessages(numNewMsgs);
            });

            // 3. Búsqueda de respaldo cada 2 minutos (por si falla el evento en tiempo real)
            setInterval(() => {
                console.log('--- [LOG] Búsqueda de respaldo periódica ---');
                imap.openBox('INBOX', false, (err, newBox) => {
                    if (!err && newBox.messages.total > box.messages.total) {
                        const diff = newBox.messages.total - box.messages.total;
                        box.messages.total = newBox.messages.total;
                        processMessages(diff);
                    }
                });
            }, 120000); // 2 minutos
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
