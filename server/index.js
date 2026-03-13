const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { startEmailListener } = require('./emailListener');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const sUrl = process.env.SUPABASE_URL;
const sKey = process.env.SUPABASE_KEY;

if (!sUrl || !sKey) {
    console.error('--- [ERROR] Faltan variables de Supabase (SUPABASE_URL o SUPABASE_KEY) ---');
    console.warn('--- El servidor no se detendrá pero las funciones de DB fallarán ---');
}

const supabase = (sUrl && sKey) ? createClient(sUrl, sKey) : null;

const app = express();
app.use(cors());
app.use(express.json());

// Archivo para persistencia (usamos /tmp en nube o el mismo directorio localmente)
const isCloud = process.env.RENDER || process.env.NODE_ENV === 'production';
const DATA_FILE = isCloud ? '/tmp/notifications.json' : path.join(__dirname, 'notifications.json');

// Cargar notificaciones existentes
let notificationsHistory = [];
if (fs.existsSync(DATA_FILE)) {
    try {
        notificationsHistory = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        console.error('Error cargando historial:', e);
    }
}

// Servir los archivos de la carpeta raíz (donde está index.html)
const webPath = path.join(__dirname, '..');
app.use(express.static(webPath));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// Función para procesar nuevas notificaciones con de-duplicación inteligente
function handleNewNotification(data) {
    const now = new Date();
    const currentText = (data.text || '').toLowerCase();
    
    // Extraer monto para comparar
    let currentAmount = data.amount;
    if (!currentAmount) {
        const m = currentText.match(/s\/\.?\s?(\d+(?:[,.]\d+)?)/i);
        if (m) currentAmount = m[1].replace(',', '.');
    }

    // Revisar si ya recibimos algo parecido en los últimos 10 minutos (600s)
    const isDuplicate = notificationsHistory.some(old => {
        const oldTime = new Date(old.timestamp);
        const diffSeconds = Math.abs(now - oldTime) / 1000;
        if (diffSeconds > 600) return false;

        const oldText = (old.text || '').toLowerCase();
        if (oldText === currentText) return true;

        let oldAmount = old.amount;
        if (!oldAmount) {
            const m = oldText.match(/s\/\.?\s?(\d+(?:[,.]\d+)?)/i);
            if (m) oldAmount = m[1].replace(',', '.');
        }

        // Si el monto es el mismo, revisamos el nombre
        if (currentAmount && oldAmount && parseFloat(currentAmount) === parseFloat(oldAmount)) {
            // Extraer nombres para comparar (básico: quitar espacios y convertir a minúsculas)
            const cleanName = (str) => (str || '').toLowerCase().replace(/[^a-z]/g, '');
            const currentName = cleanName(data.sender || data.title || '');
            const oldName = cleanName(old.sender || old.title || '');
            
            if (currentName && oldName && (currentName.includes(oldName) || oldName.includes(currentName))) {
                return true;
            }
            
            // Si no hay nombres claros, confiamos en el monto si la diferencia de tiempo es muy corta (< 3 min)
            if (diffSeconds < 180) return true;
        }
        return false;
    });

    if (isDuplicate) {
        console.log(`--- [DEDUPLICACIÓN] Ignorando aviso repetido ---`);
        return;
    }

    const newNotif = {
        ...data,
        timestamp: now.toISOString(),
        amount: currentAmount // Guardamos el monto extraído
    };
    notificationsHistory.unshift(newNotif);

    // Mantener solo los últimos 100 en memoria local
    if (notificationsHistory.length > 100) notificationsHistory.pop();

    // Guardar solo en local si no estamos en la nube o si queremos persistencia volátil
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(notificationsHistory, null, 2));
    } catch (e) {
        console.error('Error al guardar localmente:', e);
    }

    // PUSH A SUPABASE (Nuestra base de datos real)
    supabase.from('notificaciones').insert([
        { 
            title: newNotif.title, 
            text: newNotif.text 
        }
    ]).then(({ error }) => {
        if (error) console.error('Error enviando a Supabase:', error);
        else console.log('Sincronizado con Supabase');
    });

    io.emit('new-yape', newNotif);
}

// Iniciar monitoreo de correo
if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
    startEmailListener(handleNewNotification);
} else {
    console.log('--- Email Monitor ESPERANDO CONFIGURACIÓN (Variables EMAIL_USER/EMAIL_PASSWORD) ---');
}

// WEBHOOK
app.post('/webhook', (req, res) => {
    handleNewNotification(req.body);
    res.status(200).json({ status: 'recibido' });
});

app.get('/history', (req, res) => {
    res.json(notificationsHistory);
});

app.get('/test', (req, res) => {
    const mockData = { title: "Prueba Nube", text: "El servidor 24/7 está funcionando!" };
    io.emit('new-yape', mockData);
    res.send('<h1>Monitor Activo en la Nube!</h1>');
});

app.get('*', (req, res) => {
    res.sendFile(path.join(webPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor 24/7 escuchando en puerto ${PORT}`);
});
