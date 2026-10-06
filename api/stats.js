const store = require('./store');

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { code } = req.query || {};
  if (!code) {
    return res.status(400).json({ error: 'code query parameter required' });
  }

  const stat = store.stats[code];
  if (!stat) {
    const today = new Date().toISOString().slice(0, 10);
    return res.status(200).json({
      code,
      total: 0,
      per_day: [{ date: today, count: 0 }],
      countries: [{ country: 'US', count: 0 }],
      devices: [{ device_type: 'desktop', count: 0 }],
      referrers: [{ referrer: 'direct', count: 0 }],
    });
  }

  return res.status(200).json(stat);
};
