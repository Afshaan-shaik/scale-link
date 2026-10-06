const { store, hashToken, generateSecureToken } = require('./store');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const pathname = req.url || '';

  // Revoke endpoint: /api/sessions/revoke
  if (pathname.includes('revoke')) {
    let token = body.token || '';
    if (!token && req.headers['authorization']) {
      const auth = req.headers['authorization'];
      if (auth.toLowerCase().startsWith('bearer ')) {
        token = auth.slice(7).trim();
      }
    }
    if (token) {
      const tokenHash = hashToken(token);
      const sess = store.sessions.find(s => s.token_hash === tokenHash);
      if (sess) {
        sess.status = 'revoked';
        sess.revoked_at = new Date().toISOString();
      }
    }
    return res.status(200).json({ revoked: true });
  }

  // Bootstrap endpoint: /api/sessions/bootstrap or /api/sessions
  let token = (body.token || '').trim();
  if (!token && req.headers['authorization']) {
    const auth = req.headers['authorization'];
    if (auth.toLowerCase().startsWith('bearer ')) {
      token = auth.slice(7).trim();
    }
  }
  if (!token && req.headers['x-session-token']) {
    token = req.headers['x-session-token'].trim();
  }

  const now = new Date();

  // Validate existing token
  if (token) {
    const tokenHash = hashToken(token);
    const existingSession = store.sessions.find(
      s => s.token_hash === tokenHash && s.status === 'active' && new Date(s.expires_at) > now
    );
    if (existingSession) {
      // Rolling expiration (extend by 90 days)
      const rollingExpires = new Date(now.getTime() + 90 * 86400000).toISOString();
      existingSession.expires_at = rollingExpires;
      existingSession.last_seen_at = now.toISOString();

      const ws = store.workspaces.find(w => w.id === existingSession.workspace_id) || {
        id: existingSession.workspace_id,
        status: 'active',
        created_at: existingSession.created_at,
      };

      return res.status(200).json({
        session: {
          id: existingSession.id,
          workspace_id: existingSession.workspace_id,
          status: 'active',
          expires_at: existingSession.expires_at,
          token: token,
        },
        workspace: {
          id: ws.id,
          status: ws.status,
          created_at: ws.created_at,
        },
      });
    }
  }

  // Create brand new workspace + session
  const wsId = 'ws_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  const newWorkspace = {
    id: wsId,
    status: 'active',
    created_at: now.toISOString(),
  };
  store.workspaces.push(newWorkspace);

  const newToken = generateSecureToken();
  const tokenHash = hashToken(newToken);
  const expiresAt = new Date(now.getTime() + 90 * 86400000).toISOString();

  const newSession = {
    id: 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
    workspace_id: wsId,
    token_hash: tokenHash,
    status: 'active',
    created_at: now.toISOString(),
    last_seen_at: now.toISOString(),
    expires_at: expiresAt,
  };
  store.sessions.push(newSession);

  return res.status(200).json({
    session: {
      id: newSession.id,
      workspace_id: wsId,
      status: 'active',
      expires_at: expiresAt,
      token: newToken,
    },
    workspace: {
      id: wsId,
      status: 'active',
      created_at: now.toISOString(),
    },
  });
};
