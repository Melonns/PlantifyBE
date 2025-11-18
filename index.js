require('dotenv').config();
const express = require('express');
const app = express();
const port = 3000;

// Middleware untuk membaca JSON dari body request
app.use(express.json());

// Import routes
const plantRoutes = require('./routes/plantRoutes');
// const userRoutes = require('./routes/userRoutes'); // (Nanti kalau sudah ada)

// Arahkan semua request yang awalnya '/api/plants' ke file plantRoutes
app.use('/api/plants', plantRoutes);
// app.use('/api/users', userRoutes); // (Nanti kalau sudah ada)

// Jalankan server
app.listen(port, () => {
  console.log(`Server PlantifyBE berjalan di http://localhost:${port}`);
});