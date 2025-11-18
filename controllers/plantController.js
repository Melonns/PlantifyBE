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
      return res
        .status(404)
        .json({
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
        Berikan data perawatan untuk tanaman dengan nama ilmiah "${cleanScientificName}".
        
        Jawab HANYA dalam format JSON yang valid.
        JANGAN gunakan markdown (seperti \`\`\`json).
        JANGAN tambahkan teks pembuka atau penutup.
        Gunakan Bahasa Indonesia yang ringkas dan jelas.

        Untuk setiap dari 7 kunci (pupuk, air, cahaya, suhu, media_tanam, ganti_pot, masalah_umum),
        berikan sebuah objek yang berisi dua sub-kunci:
        1. "instruksi": Ringkasan singkat dalam 3-5 kata (contoh: "Siram 2-3 minggu sekali").
        2. "detail": Penjelasan detail dari instruksi tersebut (contoh: "Siram tanah secara menyeluruh, lalu biarkan benar-benar kering sebelum menyiram lagi...").
        
        Format JSON harus seperti ini:
        {
          "pupuk": {
            "instruksi": "Ringkasan singkat pupuk",
            "detail": "Penjelasan detail mengenai pemupukan (kapan, jenis, seberapa sering)."
          },
          "air": {
            "instruksi": "Ringkasan singkat air",
            "detail": "Penjelasan detail mengenai penyiraman (seberapa sering, seberapa basah, tanda-tanda)."
          },
          "cahaya": {
            "instruksi": "Ringkasan singkat cahaya",
            "detail": "Penjelasan detail mengenai kebutuhan cahaya (langsung, tidak langsung, toleransi)."
          },
          "suhu": {
            "instruksi": "Ringkasan singkat suhu",
            "detail": "Penjelasan detail mengenai suhu dan kelembapan ideal."
          },
          "media_tanam": {
            "instruksi": "Ringkasan singkat media tanam",
            "detail": "Penjelasan detail mengenai media tanam atau campuran tanah yang ideal."
          },
          "ganti_pot": {
            "instruksi": "Ringkasan singkat ganti pot",
            "detail": "Penjelasan detail mengenai kapan dan bagaimana ganti pot (repotting)."
          },
          "masalah_umum": {
            "instruksi": "Ringkasan singkat masalah",
            "detail": "Instruksi untuk troubleshooting masalah umum (misal: daun kuning, hama, daun terkulai)."
          }
        }
        
        Jika Anda tidak tahu tanamannya, kembalikan JSON dengan nilai "Info tidak tersedia" untuk "instruksi" dan "detail" di semua 7 kunci.
      `;

      // Panggil API Gemini
      const result = await geminiModel.generateContent(prompt);
      const response = await result.response;
      const textResponse = response.text();

      console.log("Balasan mentah dari Gemini:", textResponse);

      // Parsing JSON dari balasan Gemini
      careData = JSON.parse(textResponse);
    } catch (geminiError) {
      console.error("Error dari Gemini:", geminiError.message);
      // Fallback jika Gemini error
      const errorDetail = {
        instruksi: "Info gagal dimuat",
        detail: "Info perawatan gagal dimuat.",
      };
      careData = {
        pupuk: errorDetail,
        air: errorDetail,
        cahaya: errorDetail,
        suhu: errorDetail,
        media_tanam: errorDetail,
        ganti_pot: errorDetail,
        masalah_umum: errorDetail,
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
