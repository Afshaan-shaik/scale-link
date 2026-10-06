package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/scalelink/scalelink/internal/config"
	"github.com/scalelink/scalelink/internal/repository"
	"github.com/scalelink/scalelink/internal/service"
)

func setupTestSessionService() *service.SessionService {
	cfg := &config.Config{
		SessionInactivityDays:   90,
		TransferTokenTTLMinutes: 10,
	}
	repo := repository.NewSessionRepository(nil) // in-memory standalone
	return service.NewSessionService(cfg, repo)
}

func TestSessionBootstrapAndRestore(t *testing.T) {
	svc := setupTestSessionService()
	ctx := context.Background()

	// 1. Initial bootstrap with no token -> brand new session + workspace
	sess1, ws1, token1, err := svc.BootstrapSession(ctx, "")
	require.NoError(t, err)
	assert.NotEmpty(t, token1)
	assert.NotNil(t, sess1)
	assert.NotNil(t, ws1)
	assert.Equal(t, ws1.ID, sess1.WorkspaceID)

	// 2. Bootstrap with existing valid token -> restores same workspace & session
	sess2, ws2, token2, err := svc.BootstrapSession(ctx, token1)
	require.NoError(t, err)
	assert.Equal(t, token1, token2)
	assert.Equal(t, ws1.ID, ws2.ID)
	assert.Equal(t, sess1.ID, sess2.ID)

	// 3. Validate session directly
	validSess, validWs, err := svc.ValidateSession(ctx, token1)
	require.NoError(t, err)
	assert.Equal(t, sess1.ID, validSess.ID)
	assert.Equal(t, ws1.ID, validWs.ID)
}

func TestSessionIsolationAcrossContexts(t *testing.T) {
	svc := setupTestSessionService()
	ctx := context.Background()

	// Tab A
	sessA, wsA, tokenA, err := svc.BootstrapSession(ctx, "")
	require.NoError(t, err)

	// Tab B
	sessB, wsB, tokenB, err := svc.BootstrapSession(ctx, "")
	require.NoError(t, err)

	// Distinct sessions and workspaces
	assert.NotEqual(t, tokenA, tokenB)
	assert.NotEqual(t, sessA.ID, sessB.ID)
	assert.NotEqual(t, wsA.ID, wsB.ID)
}

func TestSessionRevocation(t *testing.T) {
	svc := setupTestSessionService()
	ctx := context.Background()

	sess, ws, token, err := svc.BootstrapSession(ctx, "")
	require.NoError(t, err)
	assert.NotNil(t, sess)
	assert.NotNil(t, ws)

	// Revoke session
	err = svc.RevokeSession(ctx, token)
	require.NoError(t, err)

	// Validate should now fail
	_, _, err = svc.ValidateSession(ctx, token)
	assert.Error(t, err)

	// Bootstrap with revoked token should gracefully create a brand new workspace
	sessNew, wsNew, tokenNew, err := svc.BootstrapSession(ctx, token)
	require.NoError(t, err)
	assert.NotEqual(t, token, tokenNew)
	assert.NotEqual(t, ws.ID, wsNew.ID)
	assert.NotEqual(t, sess.ID, sessNew.ID)
}

func TestWorkspaceTransferFlow(t *testing.T) {
	svc := setupTestSessionService()
	ctx := context.Background()

	// Device A creates workspace
	_, wsA, _, err := svc.BootstrapSession(ctx, "")
	require.NoError(t, err)

	// Device A generates one-time transfer token
	transferToken, transfer, err := svc.CreateTransfer(ctx, wsA.ID)
	require.NoError(t, err)
	assert.NotEmpty(t, transferToken)
	assert.Equal(t, wsA.ID, transfer.WorkspaceID)

	// Device B claims transfer token
	sessB, wsB, tokenB, err := svc.ClaimTransfer(ctx, transferToken)
	require.NoError(t, err)
	assert.NotEmpty(t, tokenB)

	// Device B receives a NEW session attached to the ORIGINAL workspace
	assert.Equal(t, wsA.ID, wsB.ID, "transferred session must point to original workspace")
	assert.Equal(t, wsA.ID, sessB.WorkspaceID)

	// Reusing the same transfer token must fail immediately
	_, _, _, err = svc.ClaimTransfer(ctx, transferToken)
	assert.ErrorIs(t, err, service.ErrTransferAlreadyUsed)
}

func TestExpiredTransferToken(t *testing.T) {
	svc := setupTestSessionService()
	ctx := context.Background()

	_, ws, _, err := svc.BootstrapSession(ctx, "")
	require.NoError(t, err)

	transferToken, transfer, err := svc.CreateTransfer(ctx, ws.ID)
	require.NoError(t, err)

	// Simulate expired token
	transfer.ExpiresAt = time.Now().Add(-1 * time.Minute)

	_, _, _, err = svc.ClaimTransfer(ctx, transferToken)
	assert.Error(t, err)
}
