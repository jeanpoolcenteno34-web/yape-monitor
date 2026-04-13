const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');

// --- REGISTRO CON INVITACIÓN ---
router.post('/register', async (req, res) => {
  const { email, password, invite_code, full_name, yape_number } = req.body;
  const db = req.app.get('db');

  try {
    // 1. Verificar código de invitación
    const inviteRes = await db.query(
      'SELECT * FROM invitations WHERE code = $1 AND is_used = false',
      [invite_code]
    );

    if (inviteRes.rows.length === 0) {
      return res.status(400).json({ error: 'Código de invitación inválido o ya utilizado.' });
    }

    const invitation = inviteRes.rows[0];

    // 2. Crear usuario
    const hashedPassword = await bcrypt.hash(password, 10);
    const userRes = await db.query(
      'INSERT INTO users (email, password_hash, full_name, yape_number) VALUES ($1, $2, $3, $4) RETURNING id, email',
      [email, hashedPassword, full_name, yape_number]
    );

    const newUser = userRes.rows[0];

    // 3. Marcar invitación como usada
    await db.query(
      'UPDATE invitations SET is_used = true, used_by = $1 WHERE id = $2',
      [newUser.id, invitation.id]
    );

    res.status(201).json({ message: 'Usuario registrado con éxito.', user: newUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en el registro.' });
  }
});

// --- LOGIN ---
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const db = req.app.get('db');

  try {
    const userRes = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
      return res.status(400).json({ error: 'Credenciales inválidas.' });
    }

    const user = userRes.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(400).json({ error: 'Credenciales inválidas.' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email, full_name: user.full_name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en el inicio de sesión.' });
  }
});

// --- GENERAR INVITACIÓN (Solo Administrador con Master Code) ---
router.post('/invite', async (req, res) => {
  const { master_code, code_to_create } = req.body;
  const db = req.app.get('db');

  if (master_code !== process.env.ADMIN_INVITE_CODE) {
    return res.status(403).json({ error: 'Código maestro incorrecto.' });
  }

  try {
    await db.query('INSERT INTO invitations (code) VALUES ($1)', [code_to_create]);
    res.status(201).json({ message: `Invitación ${code_to_create} creada con éxito.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear la invitación.' });
  }
});

module.exports = router;
