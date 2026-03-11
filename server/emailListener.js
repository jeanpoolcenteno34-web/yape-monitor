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
                                console.log('--- Posible notificación detectada ---');
                                console.log('Asunto:', subject);

                                // Regex más flexible para el monto: acepta S/ solo, con espacio, y 1 o más decimales
                                // Ejemplo: S/ 0.1, S/ 10.00, S/5.5
                                const amountMatch = text.match(/S\/\s?(\d+(?:\.\d+)?)/);
                                
                                // Regex para el nombre (Origen)
                                const nameMatch = text.match(/Yape\s?\(([^)]+)\)/i) || text.match(/de\s+([A-Z\s]{5,})/i);

                                if (amountMatch) {
                                    const amount = amountMatch[1];
                                    const sender = nameMatch ? nameMatch[1].trim() : 'Desconocido';
                                    
                                    console.log(`Detección exitosa: Monto S/ ${amount} de ${sender}`);

                                    const notification = {
                                        title: "Yape por Email",
                                        text: `Recibiste S/ ${amount} de ${sender}`,
                                        amount: amount,
                                        sender: sender,
                                        source: 'email'
                                    };
                                    onNewNotification(notification);
                                } else {
                                    console.log('No se pudo extraer el monto del texto del correo.');
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
