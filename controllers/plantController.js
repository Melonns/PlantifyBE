const axios = require('axios');

// ==========================================================
// KAMUS MINI UNTUK MENERJEMAHKAN DATA PERENUAL
// ==========================================================
const translateWatering = (watering) => {
  const map = {
    "Frequent": "Sering (2-3x seminggu)",
    "Average": "Sedang (1x seminggu)",
    "Minimum": "Jarang (2-3x sebulan)",
    "None": "Sangat Jarang"
  };
  return map[watering] || watering; // Kembalikan terjemahan atau teks aslinya
};

const translateSunlight = (sunlightArray) => {
  if (!sunlightArray || sunlightArray.length === 0) return "Info tidak tersedia";
  
  const map = {
    "full_sun": "Matahari Penuh",
    "part_shade": "Teduh Sebagian",
    "full_shade": "Teduh Penuh",
    "indirect_light": "Cahaya Tidak Langsung"
  };
  
  // Terjemahkan setiap item di array
  return sunlightArray.map(s => map[s] || s).join(', ');
};

// ==========================================================
// FUNGSI GET ALL PLANTS (DUMMY)
// ==========================================================
const getAllPlants = (req, res) => {
  try {
    const plants = [
      { id: 1, name: 'Monstera' },
      { id: 2, name: 'Lidah Buaya' }
    ];
    res.status(200).json({
      status: 'success',
      data: plants
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Server error'
    });
  }
};

// ==========================================================
// FUNGSI UTAMA SCAN PLANT
// ==========================================================
const scanPlant = async (req, res) => {
  try {
    // --- 1. Validasi File ---
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'Tidak ada file gambar yang diupload'
      });
    }

    // --- 2. PANGGILAN API PERTAMA: PLANTNET (Identifikasi) ---
    console.log("Mengirim request ke PlantNet...");
    const plantNetApiKey = process.env.plantnet_api;
    const imageBuffer = req.file.buffer;
    const imageBlob = new Blob([imageBuffer], { type: req.file.mimetype });
    const form = new FormData();
    form.append('images', imageBlob, req.file.originalname);
    
    // Minta bahasa Indonesia ke PlantNet
    const plantNetUrl = `https://my-api.plantnet.org/v2/identify/all?api-key=${plantNetApiKey}&lang=id`;
    
    const plantNetResponse = await axios.post(plantNetUrl, form);
    
    // Cek hasil PlantNet
    if (!plantNetResponse.data.results || plantNetResponse.data.results.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Tanaman tidak ditemukan oleh PlantNet' });
    }

    const plantNetResult = plantNetResponse.data.results[0];
    const confidence = plantNetResult.score;

    // Filter confidence
    if (confidence < 0.15) {
      return res.status(200).json({
        status: 'success',
        message: 'Tanaman tidak dapat dikenali',
        data: { isPlant: false, confidence: confidence }
      });
    }

    // Ekstrak data penting dari PlantNet
    const fullScientificName = plantNetResult.species.scientificName; // Nama lengkap (utk final JSON)
    const cleanScientificName = plantNetResult.species.scientificNameWithoutAuthor; // Nama bersih (utk kueri Perenual)
    
    const commonName = (plantNetResult.species.commonNames && plantNetResult.species.commonNames.length > 0)
                        ? plantNetResult.species.commonNames[0]
                        : cleanScientificName; // Cadangan pakai nama bersih
    
    // --- 3. PANGGILAN API KEDUA: PERENUAL (Detail Perawatan) ---
    console.log(`Mencari detail perawatan untuk: ${cleanScientificName}`); // Log nama yg bersih
    
    // Siapkan key dan URL Perenual
    const perenualApiKey = process.env.perenual_api; // Sesuai nama di .env
    const encodedScientificName = encodeURIComponent(cleanScientificName); // Gunakan nama bersih
    const perenualUrl = `https://perenual.com/api/species-list?key=${perenualApiKey}&q=${encodedScientificName}`;

    let careData = {}; // Default object

    try {
      const perenualResponse = await axios.get(perenualUrl);

      // Cek apakah Perenual menemukan datanya
      if (perenualResponse.data.data && perenualResponse.data.data.length > 0) {
        const plantDetails = perenualResponse.data.data[0];
        
        // Terjemahkan data perawatan
        careData = {
          watering: translateWatering(plantDetails.watering),
          sunlight: translateSunlight(plantDetails.sunlight),
          description: plantDetails.description || "Deskripsi tidak tersedia." // Deskripsi masih B. Inggris
        };

      } else {
        console.log("Perenual tidak menemukan data, kirim default.");
        careData = { watering: "Info tidak tersedia", sunlight: "Info tidak tersedia", description: "Info tidak tersedia" };
      }
    } catch (perenualError) {
      console.error("Error dari Perenual:", perenualError.message);
      // Jika Perenual error, kita tetap lanjut, tapi kirim data default
      careData = { watering: "Gagal memuat info", sunlight: "Gagal memuat info", description: "Gagal memuat info" };
    }

    // --- 4. GABUNGKAN SEMUA DATA DAN KIRIM KE KOTLIN ---
    const finalData = {
      isPlant: true,
      scientificName: fullScientificName, // Kirim nama lengkap ke user
      commonName: commonName,
      confidence: confidence,
      care: careData // Data perawatan
    };

    res.status(200).json({
      status: 'success',
      message: 'Scan berhasil',
      data: finalData
    });

  } catch (error) {
    // Error handling utama (jika PlantNet gagal, dll)
    console.error("Error saat scan:", error.response ? error.response.data : error.message);
    res.status(500).json({
      status: 'error',
      message: 'Gagal memproses gambar',
      error: error.message
    });
  }
};

// Ekspor semua fungsi
module.exports = {
  getAllPlants,
  scanPlant
};