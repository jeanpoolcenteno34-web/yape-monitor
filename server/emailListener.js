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

            // Escuchar nuevos correos
            imap.on('mail', (numNewMsgs) => {
                console.log(`Nuevo correo detectado (${numNewMsgs})`);
                const f = imap.seq.fetch(`${box.messages.total}:*`, { bodies: '' });

                f.on('message', (msg) => {
                    msg.on('body', (stream) => {
                        simpleParser(stream, async (err, parsed) => {
                            if (err) return console.error(err);

                            const subject = parsed.subject || '';
                            const text = parsed.text || '';

                            // Filtrar correos de BCP / Yape
                            if (subject.includes('Abono') || subject.includes('Yape') || subject.includes('Confirmación')) {
                                console.log('Posible notificación de Yape detectada en email');

                                // Regex para extraer monto y nombre (ejemplo basado en el formato BCP)
                                // Monto Recibido: S/ 10.00
                                const amountMatch = text.match(/S\/\s?(\d+\.\d{2})/);
                                // Origen: Yape (JUAN PEREZ)
                                const nameMatch = text.match(/Yape\s?\(([^)]+)\)/i) || text.match(/de\s+([A-Z\s]{5,})/i);

                                if (amountMatch) {
                                    const notification = {
                                        title: "Yape por Email",
                                        text: `Recibiste S/ ${amountMatch[1]} de ${nameMatch ? nameMatch[1] : 'Alguien'}`,
                                        amount: amountMatch[1],
                                        sender: nameMatch ? nameMatch[1] : 'Desconocido',
                                        source: 'email'
                                    };
                                    onNewNotification(notification);
                                }
                            }
                        });
                    });
                });
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
