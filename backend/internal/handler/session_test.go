package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/scalelink/scalelink/internal/config"
	"github.com/scalelink/scalelink/internal/handler"
	"github.com/scalelink/scalelink/internal/middleware"
	"github.com/scalelink/scalelink/internal/repository"
	"github.com/scalelink/scalelink/internal/service"
)

func setupTestApp() http.Handler {
	cfg := &config.Config{
		BaseURL:                 "http://localhost:8080",
		ShortCodeLength:         6,
		SessionInactivityDays:   90,
		TransferTokenTTLMinutes: 10,
	}

	linkRepo := repository.NewLinkRepository(nil)
	blockRepo := repository.NewBlocklistRepository(nil)
	statsRepo := repository.NewStatsRepository(nil)
	sessionRepo := repository.NewSessionRepository(nil)

	linkSvc, _ := service.NewLinkService(cfg, linkRepo, blockRepo, nil)
	statsSvc := service.NewStatsService(statsRepo)
	sessionSvc := service.NewSessionService(cfg, sessionRepo)

	linkH := handler.NewLinkHandler(linkSvc, statsSvc, nil, nil, http.StatusFound, time.Hour, time.Minute)
	sessionH := handler.NewSessionHandler(sessionSvc)

	r := chi.NewRouter()

	r.Route("/api/sessions", func(r chi.Router) {
		r.Post("/bootstrap", sessionH.Bootstrap)
		r.Post("/revoke", sessionH.Revoke)
	})

	r.Route("/api/workspaces", func(r chi.Router) {
		r.With(middleware.SessionRequired(sessionSvc)).
			Post("/transfer/create", sessionH.CreateTransfer)
		r.Post("/transfer/claim", sessionH.ClaimTransfer)
	})

	r.Route("/api/links", func(r chi.Router) {
		r.With(middleware.OptionalSession(sessionSvc)).
			Post("/", linkH.CreateLink)

		r.With(middleware.OptionalSession(sessionSvc)).
			Get("/", linkH.ListLinks)

		r.With(middleware.OptionalSession(sessionSvc)).
			Get("/{code}/stats", linkH.GetStats)

		r.Group(func(r chi.Router) {
			r.Use(middleware.OptionalSession(sessionSvc))
			r.Get("/{code}", linkH.GetLink)
			r.Patch("/{id}", linkH.UpdateLink)
			r.Delete("/{id}", linkH.DeleteLink)
		})
	})

	r.Get("/{code}", linkH.Redirect)

	return r
}

func bootstrapSession(t *testing.T, app http.Handler, existingToken string) (string, string) {
	body, _ := json.Marshal(map[string]string{"token": existingToken})
	req := httptest.NewRequest("POST", "/api/sessions/bootstrap", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	app.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var resp struct {
		Session struct {
			Token       string `json:"token"`
			WorkspaceID string `json:"workspace_id"`
		} `json:"session"`
		Workspace struct {
			ID string `json:"id"`
		} `json:"workspace"`
	}
	err := json.Unmarshal(rec.Body.Bytes(), &resp)
	require.NoError(t, err)
	return resp.Session.Token, resp.Workspace.ID
}

func TestCrossTabSessionIsolationAndSecurity(t *testing.T) {
	app := setupTestApp()

	// 1. Tab A visits -> receives Token A and Workspace A
	tokenA, wsA := bootstrapSession(t, app, "")
	assert.NotEmpty(t, tokenA)

	// 2. Tab B visits -> receives Token B and Workspace B
	tokenB, wsB := bootstrapSession(t, app, "")
	assert.NotEmpty(t, tokenB)
	assert.NotEqual(t, wsA, wsB, "Tab A and Tab B must have separate workspaces")

	// 3. Tab A creates a short link
	createBody, _ := json.Marshal(map[string]string{
		"long_url": "https://example.com/tab-a-private-destination",
	})
	createReq := httptest.NewRequest("POST", "/api/links", bytes.NewReader(createBody))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.Header.Set("Authorization", "Bearer "+tokenA)
	createRec := httptest.NewRecorder()
	app.ServeHTTP(createRec, createReq)
	require.Equal(t, http.StatusCreated, createRec.Code)

	var linkA struct {
		ID   string `json:"id"`
		Code string `json:"code"`
	}
	require.NoError(t, json.Unmarshal(createRec.Body.Bytes(), &linkA))

	// 4. Tab A lists links -> Tab A sees the link
	listReqA := httptest.NewRequest("GET", "/api/links", nil)
	listReqA.Header.Set("Authorization", "Bearer "+tokenA)
	listRecA := httptest.NewRecorder()
	app.ServeHTTP(listRecA, listReqA)
	require.Equal(t, http.StatusOK, listRecA.Code)

	var listA struct {
		Links []struct {
			ID   string `json:"id"`
			Code string `json:"code"`
		} `json:"links"`
	}
	require.NoError(t, json.Unmarshal(listRecA.Body.Bytes(), &listA))
	require.Len(t, listA.Links, 1)
	assert.Equal(t, linkA.Code, listA.Links[0].Code)

	// 5. Tab B lists links -> Tab B must NOT see Tab A's link! (Strict Workspace Isolation)
	listReqB := httptest.NewRequest("GET", "/api/links", nil)
	listReqB.Header.Set("Authorization", "Bearer "+tokenB)
	listRecB := httptest.NewRecorder()
	app.ServeHTTP(listRecB, listReqB)
	require.Equal(t, http.StatusOK, listRecB.Code)

	var listB struct {
		Links []struct {
			ID   string `json:"id"`
			Code string `json:"code"`
		} `json:"links"`
	}
	require.NoError(t, json.Unmarshal(listRecB.Body.Bytes(), &listB))
	assert.Empty(t, listB.Links, "Tab B must NOT see Tab A's saved links")

	// 6. Tab B attempts to delete Tab A's link -> Rejected (404/403)
	delReqB := httptest.NewRequest("DELETE", "/api/links/"+linkA.ID, nil)
	delReqB.Header.Set("Authorization", "Bearer "+tokenB)
	delRecB := httptest.NewRecorder()
	app.ServeHTTP(delRecB, delReqB)
	assert.True(t, delRecB.Code == http.StatusNotFound || delRecB.Code == http.StatusForbidden)

	// 7. Public redirect: Anyone (even unauthenticated) can open the short URL!
	pubRedirectReq := httptest.NewRequest("GET", "/"+linkA.Code, nil)
	pubRedirectRec := httptest.NewRecorder()
	app.ServeHTTP(pubRedirectRec, pubRedirectReq)
	assert.Equal(t, http.StatusFound, pubRedirectRec.Code)
	assert.Equal(t, "https://example.com/tab-a-private-destination", pubRedirectRec.Header().Get("Location"))

	// 8. Tab A transfers workspace to Tab C
	transferReq := httptest.NewRequest("POST", "/api/workspaces/transfer/create", nil)
	transferReq.Header.Set("Authorization", "Bearer "+tokenA)
	transferRec := httptest.NewRecorder()
	app.ServeHTTP(transferRec, transferReq)
	require.Equal(t, http.StatusCreated, transferRec.Code)

	var transferResp struct {
		TransferToken string `json:"transfer_token"`
	}
	require.NoError(t, json.Unmarshal(transferRec.Body.Bytes(), &transferResp))

	// Tab C claims transfer
	claimBody, _ := json.Marshal(map[string]string{
		"transfer_token": transferResp.TransferToken,
	})
	claimReq := httptest.NewRequest("POST", "/api/workspaces/transfer/claim", bytes.NewReader(claimBody))
	claimReq.Header.Set("Content-Type", "application/json")
	claimRec := httptest.NewRecorder()
	app.ServeHTTP(claimRec, claimReq)
	require.Equal(t, http.StatusOK, claimRec.Code)

	var claimResp struct {
		Session struct {
			Token string `json:"token"`
		} `json:"session"`
		Workspace struct {
			ID string `json:"id"`
		} `json:"workspace"`
	}
	require.NoError(t, json.Unmarshal(claimRec.Body.Bytes(), &claimResp))
	assert.Equal(t, wsA, claimResp.Workspace.ID, "Transferred workspace ID must match Workspace A")
	assert.NotEqual(t, tokenA, claimResp.Session.Token, "Transferred session must have fresh token credential")

	// Tab C now lists links -> sees Tab A's link!
	listReqC := httptest.NewRequest("GET", "/api/links", nil)
	listReqC.Header.Set("Authorization", "Bearer "+claimResp.Session.Token)
	listRecC := httptest.NewRecorder()
	app.ServeHTTP(listRecC, listReqC)
	require.Equal(t, http.StatusOK, listRecC.Code)

	var listC struct {
		Links []struct {
			ID   string `json:"id"`
			Code string `json:"code"`
		} `json:"links"`
	}
	require.NoError(t, json.Unmarshal(listRecC.Body.Bytes(), &listC))
	require.Len(t, listC.Links, 1)
	assert.Equal(t, linkA.Code, listC.Links[0].Code)
}
