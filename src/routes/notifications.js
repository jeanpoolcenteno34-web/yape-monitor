const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

// --- REPORTAR NUEVA NOTIFICACIÓN (Desde la App Android) ---
router.post('/report', authMiddleware, async (req, res) => {
  const { title, text, amount, operation_code, sender_name, timestamp_phone } = req.body;
  const db = req.app.get('db');
  const io = req.app.get('io');
  const userId = req.user.id;

  try {
    // 1. Guardar en Base de Datos
    const result = await db.query(
      `INSERT INTO notifications (user_id, title, text, amount, operation_code, sender_name, timestamp_phone) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [userId, title, text, amount, operation_code, sender_name, timestamp_phone]
    );

    const newNotif = result.rows[0];

    // 2. Emitir por Socket.io al instante (Solo a la sala del usuario)
    io.to(`user_${userId}`).emit('new-yape', newNotif);

    console.log(`--- [NOTIFICACIÓN] Capturada para usuario ${userId}: S/ ${amount} ---`);
    res.status(201).json({ status: 'success', data: newNotif });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al procesar la notificación.' });
  }
});

// --- OBTENER HISTORIAL (Para el Dashboard) ---
router.get('/history', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const db = req.app.get('db');

  try {
    const result = await db.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY timestamp_phone DESC LIMIT 200',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener historial.' });
  }
});

// --- PING DE DISPOSITIVO (Estado de salud) ---
router.post('/ping', authMiddleware, async (req, res) => {
  const { device_id, device_name } = req.body;
  const db = req.app.get('db');
  const userId = req.user.id;

  try {
    await db.query(
      `INSERT INTO devices (user_id, device_id, device_name, last_ping) 
       VALUES ($1, $2, $3, NOW()) 
       ON CONFLICT (device_id) DO UPDATE SET last_ping = NOW(), device_name = EXCLUDED.device_name`,
      [userId, device_id, device_name]
    );
    res.json({ status: 'pong' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en el ping del dispositivo.' });
  }
});

// --- ACTUALIZAR NOTIFICACIÓN (Ej: Marcar como Benito) ---
router.patch('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;
  const db = req.app.get('db');
  const userId = req.user.id;

  try {
    const result = await db.query(
      'UPDATE notifications SET text = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [text, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notificación no encontrada o sin permisos.' });
    }

    res.json({ status: 'success', data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar la notificación.' });
  }
});

module.exports = router;
