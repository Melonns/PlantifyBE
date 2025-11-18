const express = require('express');
const router = express.Router();

const userController = require('../controllers/userController');

// Definisikan rute untuk mendapatkan semua pengguna
router.post('/login', userController.loginUser);
router.post('/register', userController.registerUser);
router.get('/', userController.getAllUsers);
router.get('/:id', userController.getUserById);

// Ekspor router agar bisa dipakai di index.js
module.exports = router;