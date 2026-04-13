const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Middlewares
app.use(cors());
app.use(express.json());

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

pool.on('connect', () => console.log('--- [DB] Conectado a PostgreSQL ---'));
pool.on('error', (err) => console.error('--- [DB] Error inesperado:', err));

// Exportar pool e io para rutas
app.set('db', pool);
app.set('io', io);

// Rutas (Se crearán a continuación)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/notifications', require('./routes/notifications'));

// Socket.io Logic
io.on('connection', (socket) => {
  console.log(`--- [SOCKET] Cliente conectado: ${socket.id} ---`);
  
  // Unirse a sala de usuario específico para notificaciones privadas
  socket.on('join', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`--- [SOCKET] Usuario ${userId} unido a su sala privada ---`);
  });

  socket.on('disconnect', () => {
    console.log(`--- [SOCKET] Cliente desconectado ---`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`--- [SERVER] Yape Monitor Pro escuchando en puerto ${PORT} ---`);
});
