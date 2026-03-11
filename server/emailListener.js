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
                const f = imap.seq.fetch(`${box.messages.total - (num - 1)}:*`, { bodies: '' });
                f.on('message', (msg) => {
                    msg.on('body', (stream) => {
                        simpleParser(stream, async (err, parsed) => {
                            if (err) return console.error(err);
                            const subject = parsed.subject || '';
                            const text = parsed.text || '';
                            console.log(`--- [LOG] Analizando correo: "${subject}" ---`);

                            if (subject.includes('Abono') || subject.includes('Yape') || subject.includes('Confirmación') || subject.includes('recibiste')) {
                                const amountMatch = text.match(/S\/\s?(\d+(?:\.\d+)?)/);
                                const nameMatch = text.match(/Yape\s?\(([^)]+)\)/i) || text.match(/de\s+([A-Z\s]{5,})/i);

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

            // 1. Procesar correos que ya estaban (por si uno llegó mientras reiniciaba)
            if (box.messages.total > 0) {
                console.log('--- [LOG] Verificando últimos correos existentes ---');
                processMessages(Math.min(box.messages.total, 3)); // Revisar los últimos 3
            }

            // 2. Escuchar nuevos correos en tiempo real
            imap.on('mail', (numNewMsgs) => {
                console.log(`--- [LOG] ¡Nuevo correo detectado! (${numNewMsgs}) ---`);
                processMessages(numNewMsgs);
            });
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
