const { store, resolveSession } = require('./store');

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { code } = req.query || {};
  if (!code) {
    return res.status(400).json({ error: 'code query parameter required' });
  }

  // Exempt demo link gh-repo from strict ownership
  if (code !== 'gh-repo') {
    const link = store.links.find(l => l.code === code);
    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }

    if (link.workspace_id) {
      const auth = resolveSession(req);
      if (!auth || !auth.session || auth.session.workspace_id !== link.workspace_id) {
        return res.status(403).json({ error: 'Access denied: link belongs to another workspace' });
      }
    }
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
