package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/scalelink/scalelink/internal/config"
	"github.com/scalelink/scalelink/internal/model"
	"github.com/scalelink/scalelink/internal/repository"
)

// ErrInvalidCredentials is returned when login credentials are wrong.
var ErrInvalidCredentials = errors.New("invalid email or password")

// ErrEmailTaken is returned when trying to register with an existing email.
var ErrEmailTaken = errors.New("email already registered")

// Claims holds the JWT payload.
type Claims struct {
	UserID string `json:"uid"`
	Email  string `json:"email"`
	jwt.RegisteredClaims
}

// TokenPair holds an access/refresh token pair.
type TokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"` // seconds
}

// AuthService handles user registration, login, and token management.
type AuthService struct {
	cfg      *config.Config
	userRepo *repository.UserRepository
	keyRepo  *repository.APIKeyRepository
}

// NewAuthService creates a new AuthService.
func NewAuthService(cfg *config.Config, userRepo *repository.UserRepository, keyRepo *repository.APIKeyRepository) *AuthService {
	return &AuthService{cfg: cfg, userRepo: userRepo, keyRepo: keyRepo}
}

// Register creates a new user account.
func (s *AuthService) Register(ctx context.Context, email, password string) (*model.User, error) {
	if len(password) < 8 {
		return nil, fmt.Errorf("password must be at least 8 characters")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	user := &model.User{
		ID:           uuid.New(),
		Email:        email,
		PasswordHash: string(hash),
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		if errors.Is(err, repository.ErrConflict) {
			return nil, ErrEmailTaken
		}
		return nil, fmt.Errorf("create user: %w", err)
	}
	return user, nil
}

// Login verifies credentials and returns a JWT token pair.
func (s *AuthService) Login(ctx context.Context, email, password string) (*TokenPair, error) {
	user, err := s.userRepo.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrInvalidCredentials
		}
		return nil, fmt.Errorf("get user: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	return s.issueTokenPair(user)
}

// RefreshTokens validates a refresh token and issues a new pair.
func (s *AuthService) RefreshTokens(ctx context.Context, refreshToken string) (*TokenPair, error) {
	claims, err := s.parseToken(refreshToken)
	if err != nil {
		return nil, fmt.Errorf("invalid refresh token: %w", err)
	}

	user, err := s.userRepo.GetByID(ctx, claims.UserID)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}
	return s.issueTokenPair(user)
}

// ValidateAccessToken parses and validates an access token, returning claims.
func (s *AuthService) ValidateAccessToken(tokenStr string) (*Claims, error) {
	return s.parseToken(tokenStr)
}

// ── API Key management ────────────────────────────────────────────────────────

// CreateAPIKey generates a new API key for a user.
// Returns the plain-text key (shown once) and the stored model.
func (s *AuthService) CreateAPIKey(ctx context.Context, userID uuid.UUID, name string) (string, *model.APIKey, error) {
	raw, err := generateSecureToken(32)
	if err != nil {
		return "", nil, fmt.Errorf("generate api key: %w", err)
	}
	plainKey := "sl_" + raw // prefix for easy identification in logs

	hash, err := bcrypt.GenerateFromPassword([]byte(plainKey), bcrypt.MinCost)
	if err != nil {
		return "", nil, fmt.Errorf("hash api key: %w", err)
	}

	key := &model.APIKey{
		ID:        uuid.New(),
		UserID:    userID,
		Name:      name,
		KeyHash:   string(hash),
		KeyPrefix: plainKey[:8], // show first 8 chars in UI
	}
	if err := s.keyRepo.Create(ctx, key); err != nil {
		return "", nil, fmt.Errorf("store api key: %w", err)
	}
	return plainKey, key, nil
}

// ValidateAPIKey checks an API key and returns the associated user.
func (s *AuthService) ValidateAPIKey(ctx context.Context, plainKey string) (*model.User, *model.APIKey, error) {
	// We can't do a direct hash lookup because bcrypt is not deterministic.
	// Instead: find by prefix then compare. For production scale, use HMAC
	// (deterministic) or store a salted SHA-256 alongside bcrypt for lookup.
	// Phase 1 decision: iterate active keys by prefix (low volume).
	// DESIGN.md documents this trade-off.
	_ = plainKey
	return nil, nil, fmt.Errorf("api key validation not implemented in phase 1 — use JWT")
}

// ListAPIKeys returns active API keys for a user.
func (s *AuthService) ListAPIKeys(ctx context.Context, userID uuid.UUID) ([]*model.APIKey, error) {
	return s.keyRepo.ListByUser(ctx, userID)
}

// RevokeAPIKey revokes an API key.
func (s *AuthService) RevokeAPIKey(ctx context.Context, keyID uuid.UUID, userID uuid.UUID) error {
	return s.keyRepo.Revoke(ctx, keyID, userID)
}

// ── helpers ───────────────────────────────────────────────────────────────────

func (s *AuthService) issueTokenPair(user *model.User) (*TokenPair, error) {
	now := time.Now()

	accessClaims := &Claims{
		UserID: user.ID.String(),
		Email:  user.Email,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.JWTAccessTTL)),
			Subject:   user.ID.String(),
			Issuer:    "scalelink",
		},
	}
	accessToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims).
		SignedString([]byte(s.cfg.JWTSecret))
	if err != nil {
		return nil, fmt.Errorf("sign access token: %w", err)
	}

	refreshClaims := &Claims{
		UserID: user.ID.String(),
		Email:  user.Email,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.JWTRefreshTTL)),
			Subject:   user.ID.String(),
			Issuer:    "scalelink-refresh",
		},
	}
	refreshToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims).
		SignedString([]byte(s.cfg.JWTSecret))
	if err != nil {
		return nil, fmt.Errorf("sign refresh token: %w", err)
	}

	return &TokenPair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    int64(s.cfg.JWTAccessTTL.Seconds()),
	}, nil
}

func (s *AuthService) parseToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(s.cfg.JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}
	return claims, nil
}

func generateSecureToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
