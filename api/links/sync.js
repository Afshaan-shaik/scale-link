const { store, resolveSession } = require('../store');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const links = Array.isArray(body.links) ? body.links : [];
  const auth = resolveSession(req);
  const currentWorkspaceId = auth?.session?.workspace_id || null;

  let syncedCount = 0;
  for (const l of links) {
    if (!l || !l.code || !l.long_url) continue;

    const existingIndex = store.links.findIndex(item => item.code === l.code);
    const targetWsId = l.workspace_id || currentWorkspaceId;

    if (existingIndex !== -1) {
      // Update existing link
      const existing = store.links[existingIndex];
      existing.long_url = l.long_url;
      if (typeof l.click_count === 'number') {
        existing.click_count = Math.max(existing.click_count || 0, l.click_count);
      }
      if (targetWsId && !existing.workspace_id) {
        existing.workspace_id = targetWsId;
      }
    } else {
      // Add new link
      store.links.unshift({
        id: l.id || ('link_' + Math.random().toString(36).substring(2, 10)),
        code: l.code,
        long_url: l.long_url,
        short_url: l.short_url || `https://${req.headers.host || 'scale-link-six.vercel.app'}/${l.code}`,
        click_count: l.click_count || 0,
        workspace_id: targetWsId,
        expires_at: l.expires_at || undefined,
        created_at: l.created_at || new Date().toISOString(),
        is_custom: Boolean(l.is_custom),
        is_expired: false,
      });
    }
    syncedCount++;
  }

  return res.status(200).json({ status: 'ok', synced: syncedCount });
};
