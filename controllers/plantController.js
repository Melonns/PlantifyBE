const axios = require("axios");
// Import SDK Gemini
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ==========================================================
// Inisialisasi Klien Gemini
// ==========================================================
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// ==========================================================
// FUNGSI GET ALL PLANTS (DUMMY)
// ==========================================================
const getAllPlants = (req, res) => {
  try {
    const plants = [
      { id: 1, name: "Monstera" },
      { id: 2, name: "Lidah Buaya" },
    ];
    res.status(200).json({
      status: "success",
      data: plants,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};

// ==========================================================
// FUNGSI UTAMA SCAN PLANT (DENGAN GEMINI)
// ==========================================================
const scanPlant = async (req, res) => {
  // --- Deklarasi variabel di scope atas ---
  let fullScientificName, cleanScientificName, confidence;
  let plantNetCommonName = null;
  let finalCommonName = null;
  let careData = {};
  let finalData = {};

  try {
    // --- 1. Validasi File ---
    if (!req.file) {
      return res.status(400).json({
        status: "error",
        message: "Tidak ada file gambar yang diupload",
      });
    }

    // --- 2. PANGGILAN API PERTAMA: PLANTNET ---
    console.log("Mengirim request ke PlantNet...");
    const plantNetApiKey = process.env.plantnet_api;
    const imageBuffer = req.file.buffer;
    const imageBlob = new Blob([imageBuffer], { type: req.file.mimetype });
    const form = new FormData();
    form.append("images", imageBlob, req.file.originalname);

    const plantNetUrl = `https://my-api.plantnet.org/v2/identify/all?api-key=${plantNetApiKey}&lang=id`;

    const plantNetResponse = await axios.post(plantNetUrl, form);

    if (
      !plantNetResponse.data.results ||
      plantNetResponse.data.results.length === 0
    ) {
      return res.status(404).json({
        status: "error",
        message: "Tanaman tidak ditemukan oleh PlantNet",
      });
    }

    const plantNetResult = plantNetResponse.data.results[0];
    confidence = plantNetResult.score;

    if (confidence < 0.15) {
      return res.status(200).json({
        status: "success",
        message: "Tanaman tidak dapat dikenali",
        data: { isPlant: false, confidence: confidence },
      });
    }

    fullScientificName = plantNetResult.species.scientificName;
    cleanScientificName = plantNetResult.species.scientificNameWithoutAuthor;
    plantNetCommonName =
      plantNetResult.species.commonNames &&
      plantNetResult.species.commonNames.length > 0
        ? plantNetResult.species.commonNames[0]
        : null;

    finalCommonName = plantNetCommonName || cleanScientificName;

    // --- 3. PANGGILAN API KEDUA: GEMINI ---
    console.log(
      `Meminta data perawatan ke Gemini untuk: ${cleanScientificName}`
    );

    try {
      // ==========================================================
      // PROMPT BARU: Meminta 'instruksi' (singkat) dan 'detail' (panjang)
      // ==========================================================
      const prompt = `
        Anda adalah seorang ahli botani untuk aplikasi Plantify.
        Berikan data lengkap untuk tanaman dengan nama ilmiah "${cleanScientificName}".
        
        Jawab HANYA dalam format JSON yang valid.
        JANGAN gunakan markdown (seperti \`\`\`json).
        JANGAN tambahkan teks pembuka atau penutup.
        Gunakan Bahasa Indonesia yang ringkas dan jelas.

        Format JSON harus memiliki dua kunci utama: "ringkasan" dan "perawatan".

        1. "ringkasan": Harus berisi objek dengan kunci:
          - "deskripsi": Penjelasan singkat tentang tanaman ini.
          - "status": Info tambahan (misal: "Ramah hewan", "Tidak ramah hewan", "Pembersih udara").
          - "keamanan": Info toksisitas (misal: "Tidak beracun", "Beracun ringan jika tertelan", "Sangat beracun").
          - "fungsi_singkat": 1-5 kata fungsi utama (misal: "Tanaman Hias Gantung", "Peneduh Taman").

        2. "perawatan": Harus berisi 7 objek (pupuk, air, cahaya, suhu, media_tanam, ganti_pot, masalah_umum),
          di mana setiap objek memiliki:
          - "instruksi": Ringkasan singkat (3-5 kata).
          - "detail": Penjelasan detail.

        Contoh format JSON lengkap:
        {
          "ringkasan": {
            "deskripsi": "Deskripsi singkat tanaman...",
            "status": "Tidak ramah untuk hewan peliharaan.",
            "keamanan": "Beracun ringan jika getahnya terkena kulit atau tertelan.",
            "fungsi_singkat": "Tanaman Hias Indoor"
          },
          "perawatan": {
            "pupuk": {
              "instruksi": "Pupuk sebulan sekali",
              "detail": "Gunakan pupuk cair seimbang sebulan sekali..."
            },
            "air": {
              "instruksi": "Siram saat kering",
              "detail": "Biarkan 2-3 cm bagian atas tanah mengering..."
            },
            "cahaya": { "instruksi": "...", "detail": "..." },
            "suhu": { "instruksi": "...", "detail": "..." },
            "media_tanam": { "instruksi": "...", "detail": "..." },
            "ganti_pot": { "instruksi": "...", "detail": "..." },
            "masalah_umum": { "instruksi": "...", "detail": "..." }
          }
        }
      `;
      let geminiResponseText = null;
      let attempts = 0;
      const maxRetries = 3; // Coba maksimal 3 kali
      let delay = 1000; // Mulai dengan jeda 1 detik

      while (attempts < maxRetries) {
        try {
          // Coba panggil Gemini
          const result = await geminiModel.generateContent(prompt);
          const response = await result.response;
          geminiResponseText = response.text();

          console.log("Balasan mentah dari Gemini:", geminiResponseText);
          break; // <-- SUKSES! Keluar dari 'while' loop.
        } catch (error) {
          // Cek apakah ini error 503 (Overloaded)
          if (
            error.message &&
            (error.message.includes("503") ||
              error.message.includes("overloaded"))
          ) {
            attempts++;
            if (attempts >= maxRetries) {
              // Jika sudah max retries, lempar error agar ditangkap 'catch' di luar
              throw new Error(
                `Gemini overloaded. Gagal setelah ${maxRetries} percobaan.`
              );
            }

            console.warn(
              `Gemini 503. Percobaan ${attempts}. Mencoba lagi dalam ${delay}ms...`
            );

            // Tunggu (delay) sebelum loop berikutnya
            await new Promise((resolve) => setTimeout(resolve, delay));

            // Gandakan jeda untuk percobaan berikutnya (Exponential Backoff)
            delay *= 2;
          } else {
            // Jika ini error lain (bukan 503), langsung lempar.
            throw error;
          }
        }
      }

      // Panggil API Gemini
      careData = JSON.parse(geminiResponseText);
    } catch (geminiError) {
      console.error("Error dari Gemini:", geminiError.message);
      // Fallback jika Gemini error
      console.error("Error dari Gemini (Final):", geminiError.message);
      
      const errorDetail = { "instruksi": "Info gagal dimuat (server sibuk)", "detail": "Server AI sedang sibuk. Silakan coba lagi beberapa saat." };
      careData = {
        "pupuk": errorDetail,
        "air": errorDetail,
        "cahaya": errorDetail,
        "suhu": errorDetail,
        "media_tanam": errorDetail,
        "ganti_pot": errorDetail,
        "masalah_umum": errorDetail
      };
    }
    // ==========================================================

    // --- 4. GABUNGKAN SEMUA DATA DAN KIRIM KE KOTLIN ---
    finalData = {
      isPlant: true,
      scientificName: fullScientificName,
      commonName: finalCommonName,
      confidence: confidence,
      care: careData, // 'careData' sekarang berisi objek bersarang
    };

    res.status(200).json({
      status: "success",
      message: "Scan berhasil",
      data: finalData,
    });
  } catch (error) {
    // Error handling utama
    console.error("Error saat scan (Outer):", error.message);
    res.status(500).json({
      status: "error",
      message: "Gagal memproses gambar",
      error: error.message,
    });
  }
};

// Ekspor semua fungsi
module.exports = {
  getAllPlants,
  scanPlant,
};
