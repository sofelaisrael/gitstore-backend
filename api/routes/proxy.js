import express from 'express';
import axios from 'axios';
const router = express.Router();
router.get('/image', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string' || !url.startsWith('https://')) return res.status(400).end();
  try {
    const upstream = await axios.get(decodeURIComponent(url), { responseType: 'arraybuffer', timeout: 5000, maxContentLength: 5 * 1024 * 1024, headers: { 'User-Agent': 'OpenHub-Store/1.0' } });
    const ct = upstream.headers['content-type'] || '';
    if (!ct.startsWith('image/')) return res.status(415).end();
    res.set('Content-Type', ct);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(Buffer.from(upstream.data));
  } catch (error) { res.status(error.response?.status || 502).end(); }
});
export default router;
