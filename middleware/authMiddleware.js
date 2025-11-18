const admin = require('firebase-admin');

// Inisialisasi Firebase Admin
const serviceAccount = require('../serviceAccountKey.json'); // Sesuaikan path
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Ini adalah middleware-nya
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      status: 'error', 
      message: 'Unauthorized: Token tidak ada atau format salah' 
    });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    // Verifikasi token ke server Google
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    // Simpan data user di request agar bisa dipakai controller
    req.user = decodedToken; 

    // Lanjutkan ke controller (misal: scanPlant)
    next(); 
  } catch (error) {
    return res.status(403).json({ 
      status: 'error', 
      message: 'Forbidden: Token tidak valid' 
    });
  }
};

module.exports = verifyToken;