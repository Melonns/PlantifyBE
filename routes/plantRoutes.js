const express = require('express');
const router = express.Router();
const plantController = require('../controllers/plantController');
const verifyToken = require('../middleware/authMiddleware');

// 1. Import multer
const multer = require('multer');

// 2. Konfigurasi multer untuk menyimpan file di memory (RAM)
// Ini cara cepat karena kita hanya akan 'meneruskan' file-nya
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// 3. Terapkan middleware 'upload' SEBELUM 'plantController.scanPlant'
// upload.single('image') artinya: "Harapkan satu file, yg dikirim
// oleh Kotlin dengan field 'image'"
router.post(
  '/scan', 
//   verifyToken, 
  upload.single('image'), // <-- TAMBAHKAN INI
  plantController.scanPlant
);

router.get('/', plantController.getAllPlants); 

module.exports = router;