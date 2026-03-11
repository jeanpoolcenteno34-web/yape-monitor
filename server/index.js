const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { startEmailListener } = require('./emailListener');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

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

// Función para procesar nuevas notificaciones
function handleNewNotification(data) {
    const newNotif = {
        ...data,
        timestamp: new Date().toISOString()
    };
    notificationsHistory.unshift(newNotif);

    // Guardar solo en local si no estamos en la nube o si queremos persistencia volátil
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(notificationsHistory, null, 2));
    } catch (e) {
        console.error('Error al guardar localmente:', e);
    }

    // PUSH A SUPABASE (Nuestra base de datos real)
    // Solo enviamos 'title' y 'text' para que sea compatible con la tabla existente
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
