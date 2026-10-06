const { store, resolveSession } = require('./store');

function generateCode() {
  const chars = '23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host || 'scale-link-six.vercel.app';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const origin = `${proto}://${host}`;

  // GET /api/links or GET /api/links?code=...
  if (req.method === 'GET') {
    const { code, click } = req.query || {};
    if (code) {
      const link = store.links.find(l => l.code === code);
      if (!link) {
        return res.status(404).json({ error: 'Link not found' });
      }
      if (click === 'true') {
        link.click_count = (link.click_count || 0) + 1;
        const stat = store.stats[code] || {
          code,
          total: 0,
          per_day: [],
          countries: [{ country: 'US', count: 0 }],
          devices: [{ device_type: 'desktop', count: 0 }],
          referrers: [{ referrer: 'direct', count: 0 }],
        };
        stat.total += 1;
        const today = new Date().toISOString().slice(0, 10);
        const dayEntry = stat.per_day.find(d => d.date === today);
        if (dayEntry) dayEntry.count += 1;
        else stat.per_day.push({ date: today, count: 1 });
        store.stats[code] = stat;
      }
      return res.status(200).json({ link });
    }

    // List Saved URLs: strictly filtered by anonymous workspace ownership (Strict Isolation)
    const auth = resolveSession(req);
    if (!auth || !auth.session) {
      return res.status(200).json({ links: [], total: 0, limit: 50, offset: 0 });
    }

    const userLinks = store.links.filter(l => l.workspace_id === auth.session.workspace_id);
    return res.status(200).json({ links: userLinks, total: userLinks.length, limit: 50, offset: 0 });
  }

  // POST /api/links
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};

    let long_url = (body.long_url || '').trim();
    if (!long_url) {
      return res.status(400).json({ error: 'Destination URL is required' });
    }

    const lower = long_url.toLowerCase();
    if (
      lower.startsWith('javascript:') || 
      lower.startsWith('data:') || 
      lower.startsWith('file:') || 
      lower.startsWith('vbscript:')
    ) {
      return res.status(400).json({ error: 'Invalid URL protocol. Only http:// and https:// URLs are allowed.' });
    }

    if (!long_url.startsWith('http://') && !long_url.startsWith('https://')) {
      long_url = 'https://' + long_url;
    }

    // SSRF validation
    if (long_url.includes('localhost') || long_url.includes('127.0.0.1') || long_url.includes('169.254.') || long_url.includes('192.168.')) {
      return res.status(400).json({ error: 'Private IP addresses and loopback addresses are blocked to prevent SSRF.' });
    }

    let code = (body.custom_alias || '').trim();
    if (code) {
      if (!/^[a-zA-Z0-9_-]{3,32}$/.test(code)) {
        return res.status(400).json({ error: 'Custom alias must be 3-32 alphanumeric characters, dashes or underscores' });
      }
      const existing = store.links.find(l => l.code.toLowerCase() === code.toLowerCase());
      if (existing) {
        return res.status(409).json({ error: `Alias '${code}' is already taken.` });
      }
    } else {
      code = generateCode();
      while (store.links.find(l => l.code === code)) {
        code = generateCode();
      }
    }

    // Attach workspace ownership from session
    const auth = resolveSession(req);
    const workspaceId = auth && auth.session ? auth.session.workspace_id : null;

    const newLink = {
      id: 'link_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      code,
      short_url: `${origin}/${code}`,
      long_url,
      click_count: 0,
      workspace_id: workspaceId,
      expires_at: body.expires_at || undefined,
      created_at: new Date().toISOString(),
      is_custom: Boolean(body.custom_alias),
      is_expired: false,
    };

    store.links.unshift(newLink);

    // Initialize stats
    const today = new Date().toISOString().slice(0, 10);
    store.stats[code] = {
      code,
      total: 0,
      per_day: [{ date: today, count: 0 }],
      countries: [{ country: 'US', count: 0 }],
      devices: [{ device_type: 'desktop', count: 0 }],
      referrers: [{ referrer: 'direct', count: 0 }],
    };

    return res.status(201).json(newLink);
  }

  // DELETE /api/links (with query ?id=... or /:id)
  if (req.method === 'DELETE') {
    const auth = resolveSession(req);
    if (!auth || !auth.session) {
      return res.status(401).json({ error: 'Session required to delete link' });
    }

    const { id } = req.query || {};
    const linkIndex = store.links.findIndex(l => l.id === id);
    if (linkIndex === -1) {
      return res.status(404).json({ error: 'Link not found' });
    }

    const link = store.links[linkIndex];
    if (link.workspace_id !== auth.session.workspace_id) {
      return res.status(403).json({ error: 'Access denied: link does not belong to your workspace' });
    }

    store.links.splice(linkIndex, 1);
    return res.status(200).json({ status: 'deleted' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
