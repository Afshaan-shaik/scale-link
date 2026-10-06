const { store, hashToken, generateSecureToken, resolveSession } = require('./store');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const pathname = req.url || '';
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  // POST /api/workspaces/transfer/create
  if (pathname.includes('/transfer/create')) {
    const auth = resolveSession(req);
    if (!auth || !auth.session) {
      return res.status(401).json({ error: 'Session required to transfer workspace' });
    }

    const transferToken = generateSecureToken();
    const tokenHash = hashToken(transferToken);
    const expiresAt = new Date(Date.now() + 10 * 60000).toISOString();

    const transferRecord = {
      id: 'xfer_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
      workspace_id: auth.session.workspace_id,
      token_hash: tokenHash,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
      used_at: null,
    };
    store.transfers.push(transferRecord);

    return res.status(201).json({
      transfer_token: transferToken,
      workspace_id: auth.session.workspace_id,
      expires_at: expiresAt,
    });
  }

  // POST /api/workspaces/transfer/claim
  if (pathname.includes('/transfer/claim')) {
    const transferToken = (body.transfer_token || '').trim();
    if (!transferToken) {
      return res.status(400).json({ error: 'transfer_token is required' });
    }

    const tokenHash = hashToken(transferToken);
    const now = new Date();
    const transfer = store.transfers.find(t => t.token_hash === tokenHash);

    if (!transfer) {
      return res.status(404).json({ error: 'Transfer token not found or invalid' });
    }
    if (transfer.used_at) {
      return res.status(409).json({ error: 'Transfer token has already been used' });
    }
    if (new Date(transfer.expires_at) <= now) {
      return res.status(410).json({ error: 'Transfer token has expired' });
    }

    // Mark used
    transfer.used_at = now.toISOString();

    // Create a brand new session for this new browser context attached to existing workspace
    const newSessionToken = generateSecureToken();
    const sessTokenHash = hashToken(newSessionToken);
    const expiresAt = new Date(now.getTime() + 90 * 86400000).toISOString();

    const newSession = {
      id: 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
      workspace_id: transfer.workspace_id,
      token_hash: sessTokenHash,
      status: 'active',
      created_at: now.toISOString(),
      last_seen_at: now.toISOString(),
      expires_at: expiresAt,
    };
    store.sessions.push(newSession);

    const ws = store.workspaces.find(w => w.id === transfer.workspace_id) || {
      id: transfer.workspace_id,
      status: 'active',
      created_at: now.toISOString(),
    };

    return res.status(200).json({
      session: {
        id: newSession.id,
        workspace_id: transfer.workspace_id,
        status: 'active',
        expires_at: expiresAt,
        token: newSessionToken,
      },
      workspace: {
        id: ws.id,
        status: ws.status,
        created_at: ws.created_at,
      },
    });
  }

  return res.status(404).json({ error: 'Not found' });
};
