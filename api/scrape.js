const scrapr = require('scrapr');

module.exports = async (req, res) => {
  // Aktifkan CORS agar frontend bisa akses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.query.url || (req.body && req.body.url);
  if (!url) {
    return res.status(400).json({ status: false, message: 'URL tidak boleh kosong' });
  }

  try {
    let result = null;

    // Deteksi Platform TikTok
    if (url.includes('tiktok.com')) {
      const fallbacks = [scrapr.tiktok.tiktokio, scrapr.tiktok.snaptik, scrapr.tiktok.ssstik];
      for (const scraper of fallbacks) {
        try {
          const resData = await scraper(url);
          if (resData && resData.status) {
            result = resData.result;
            break;
          }
        } catch (e) { continue; }
      }
    } 
    // Deteksi Platform YouTube / Lainnya
    else {
      try {
        const resData = await scrapr.youtube.ytmp3(url);
        if (resData && resData.status) result = resData.result;
      } catch (e) {}
    }

    if (result) {
      return res.status(200).json({ status: true, result });
    } else {
      return res.status(500).json({ status: false, message: 'Gagal mengekstrak video dari semua server' });
    }
  } catch (err) {
    return res.status(500).json({ status: false, message: err.message });
  }
};
