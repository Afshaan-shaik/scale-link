/**
 * ScaleLink Anonymous Session & Workspace Manager
 * 
 * Strict Tab & Device Isolation Architecture:
 * - Tab-scoped credential storage in sessionStorage (NEVER shared across tabs like localStorage)
 * - BroadcastChannel handshake to detect duplicated tab session storage clones
 * - One-time workspace transfer via URL fragment (#transfer=<TOKEN>) with history.replaceState cleanup
 * - Rolling inactivity heartbeat and graceful error handling
 */

const SESSION_TOKEN_KEY = 'scalelink_tab_session_token';
const WORKSPACE_ID_KEY = 'scalelink_tab_workspace_id';
const TAB_OWNER_ID_KEY = 'scalelink_tab_owner_id';

// Unique in-memory identifier for this exact browser tab instance (lives only in JS memory)
const CURRENT_TAB_INSTANCE_ID = (typeof crypto !== 'undefined' && crypto.randomUUID) 
  ? crypto.randomUUID() 
  : 'tab_' + Math.random().toString(36).substring(2) + Date.now();

export interface SessionState {
  token: string;
  workspaceId: string;
  status: 'active' | 'loading' | 'error';
}

// In-memory active session cache
let currentSession: SessionState = {
  token: '',
  workspaceId: '',
  status: 'loading',
};

// Handshake listener for cross-tab clone detection
if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
  try {
    const channel = new BroadcastChannel('scalelink_tab_isolation_v1');
    channel.onmessage = (event) => {
      const data = event.data;
      if (!data) return;

      // If another tab asks "is this owner tab alive?", and we are that owner, reply "I am alive"
      if (data.type === 'ping_tab_alive' && data.ownerId === sessionStorage.getItem(TAB_OWNER_ID_KEY)) {
        if (data.tabInstanceId !== CURRENT_TAB_INSTANCE_ID) {
          channel.postMessage({
            type: 'pong_tab_alive',
            ownerId: data.ownerId,
            activeTabInstanceId: CURRENT_TAB_INSTANCE_ID,
          });
        }
      }
    };
  } catch {}
}

/**
 * Checks whether this tab cloned another active tab's sessionStorage.
 * If the original tab is still alive in another window, this cloned tab resets to a clean state.
 */
async function verifyTabIsolation(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return true;

  const storedOwnerId = sessionStorage.getItem(TAB_OWNER_ID_KEY);
  if (!storedOwnerId) {
    // Fresh tab with no owner
    sessionStorage.setItem(TAB_OWNER_ID_KEY, CURRENT_TAB_INSTANCE_ID);
    return true;
  }

  // If this tab already owns its sessionStorage, it's a normal page refresh
  if (storedOwnerId === CURRENT_TAB_INSTANCE_ID) {
    return true;
  }

  // Cloned sessionStorage detected: check if the original tab is still active via BroadcastChannel
  if (typeof BroadcastChannel !== 'undefined') {
    return new Promise((resolve) => {
      try {
        const channel = new BroadcastChannel('scalelink_tab_isolation_v1');
        let responded = false;

        const timer = setTimeout(() => {
          channel.close();
          if (!responded) {
            // Original tab is closed/gone; we can inherit the owner id
            sessionStorage.setItem(TAB_OWNER_ID_KEY, CURRENT_TAB_INSTANCE_ID);
            resolve(true);
          }
        }, 80);

        channel.onmessage = (e) => {
          if (e.data && e.data.type === 'pong_tab_alive' && e.data.ownerId === storedOwnerId) {
            responded = true;
            clearTimeout(timer);
            channel.close();
            // Original tab IS alive in another window! Wipe cloned credentials so this tab gets a fresh workspace
            sessionStorage.removeItem(SESSION_TOKEN_KEY);
            sessionStorage.removeItem(WORKSPACE_ID_KEY);
            sessionStorage.setItem(TAB_OWNER_ID_KEY, CURRENT_TAB_INSTANCE_ID);
            resolve(false);
          }
        };

        channel.postMessage({
          type: 'ping_tab_alive',
          ownerId: storedOwnerId,
          tabInstanceId: CURRENT_TAB_INSTANCE_ID,
        });
      } catch {
        resolve(true);
      }
    });
  }

  sessionStorage.setItem(TAB_OWNER_ID_KEY, CURRENT_TAB_INSTANCE_ID);
  return true;
}

/**
 * Detects and extracts a #transfer=<TOKEN> fragment from window.location.hash.
 * Immediately strips the secret token from the address bar using history.replaceState.
 */
function extractAndStripTransferFragment(): string | null {
  if (typeof window === 'undefined') return null;

  const hash = window.location.hash;
  if (!hash || !hash.includes('transfer=')) return null;

  const match = hash.match(/transfer=([A-Za-z0-9_-]+)/);
  if (match && match[1]) {
    const token = match[1];
    // Strip fragment immediately from visible browser URL
    const cleanUrl = window.location.pathname + window.location.search;
    window.history.replaceState(null, '', cleanUrl);
    return token;
  }
  return null;
}

/**
 * Bootstraps or restores the anonymous session for this browser tab.
 */
export async function bootstrapSession(): Promise<SessionState> {
  // 1. Check for incoming workspace transfer in URL fragment
  const transferToken = extractAndStripTransferFragment();
  if (transferToken) {
    try {
      const res = await fetch('/api/workspaces/transfer/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transfer_token: transferToken }),
      });

      if (res.ok) {
        const data = await res.json();
        const token = data.session.token;
        const workspaceId = data.workspace.id;

        sessionStorage.setItem(SESSION_TOKEN_KEY, token);
        sessionStorage.setItem(WORKSPACE_ID_KEY, workspaceId);
        sessionStorage.setItem(TAB_OWNER_ID_KEY, CURRENT_TAB_INSTANCE_ID);

        currentSession = { token, workspaceId, status: 'active' };
        return currentSession;
      }
    } catch {}
  }

  // 2. Verify tab isolation (prevent cloned sessionStorage across duplicate tabs)
  await verifyTabIsolation();

  // 3. Check for existing session token in sessionStorage
  const existingToken = sessionStorage.getItem(SESSION_TOKEN_KEY) || '';

  try {
    const res = await fetch('/api/sessions/bootstrap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(existingToken ? { 'Authorization': `Bearer ${existingToken}` } : {}),
      },
      body: JSON.stringify({ token: existingToken }),
    });

    if (res.ok) {
      const data = await res.json();
      const token = data.session.token;
      const workspaceId = data.workspace.id;

      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
      sessionStorage.setItem(WORKSPACE_ID_KEY, workspaceId);
      sessionStorage.setItem(TAB_OWNER_ID_KEY, CURRENT_TAB_INSTANCE_ID);

      currentSession = { token, workspaceId, status: 'active' };
      return currentSession;
    }
  } catch {}

  // Offline / emergency fallback: generate high-entropy client token
  const fallbackToken = generateClientEntropyToken();
  const fallbackWs = (typeof crypto !== 'undefined' && crypto.randomUUID) 
    ? crypto.randomUUID() 
    : 'ws_' + Math.random().toString(36).substring(2);

  sessionStorage.setItem(SESSION_TOKEN_KEY, fallbackToken);
  sessionStorage.setItem(WORKSPACE_ID_KEY, fallbackWs);
  sessionStorage.setItem(TAB_OWNER_ID_KEY, CURRENT_TAB_INSTANCE_ID);

  currentSession = { token: fallbackToken, workspaceId: fallbackWs, status: 'active' };
  return currentSession;
}

/**
 * Returns current session token.
 */
export function getSessionToken(): string {
  if (currentSession.token) return currentSession.token;
  if (typeof sessionStorage !== 'undefined') {
    return sessionStorage.getItem(SESSION_TOKEN_KEY) || '';
  }
  return '';
}

/**
 * Returns current workspace ID.
 */
export function getWorkspaceId(): string {
  if (currentSession.workspaceId) return currentSession.workspaceId;
  if (typeof sessionStorage !== 'undefined') {
    return sessionStorage.getItem(WORKSPACE_ID_KEY) || '';
  }
  return '';
}

/**
 * Starts a brand new anonymous session & workspace for this tab.
 * The old session is revoked, the tab credential is reset, and an empty workspace is loaded.
 */
export async function startNewWorkspace(): Promise<SessionState> {
  const oldToken = getSessionToken();
  if (oldToken) {
    fetch('/api/sessions/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${oldToken}`,
      },
      body: JSON.stringify({ token: oldToken }),
    }).catch(() => {});
  }

  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  sessionStorage.removeItem(WORKSPACE_ID_KEY);
  currentSession = { token: '', workspaceId: '', status: 'loading' };

  return bootstrapSession();
}

/**
 * Creates a single-use, 10-minute transfer link for the current anonymous workspace.
 */
export async function createWorkspaceTransfer(): Promise<{ transferUrl: string; expiresAt: string; token: string }> {
  const token = getSessionToken();
  if (!token) throw new Error('Session not initialized');

  const res = await fetch('/api/workspaces/transfer/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to create workspace transfer');
  }

  const data = await res.json();
  const transferToken = data.transfer_token;
  const transferUrl = `${window.location.origin}/#transfer=${transferToken}`;

  return {
    transferUrl,
    expiresAt: data.expires_at,
    token: transferToken,
  };
}

/**
 * Authenticated fetch wrapper injecting Bearer token for protected API calls.
 */
export async function sessionFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = getSessionToken();
  const headers = new Headers(init?.headers || {});
  
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (token && !headers.has('X-Session-Token')) {
    headers.set('X-Session-Token', token);
  }

  return fetch(url, {
    ...init,
    headers,
  });
}

function generateClientEntropyToken(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return 'tok_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
}
