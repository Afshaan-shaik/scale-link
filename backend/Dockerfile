# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /build

COPY go.mod ./
# Download dependencies (go.sum will be generated)
RUN go mod download || true

COPY . .

# Tidy and download any remaining deps
RUN go mod tidy && go mod download

# Build API binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" -o /bin/api ./cmd/api

# Build worker binary  
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" -o /bin/worker ./cmd/worker

# Build seed binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-w -s" -o /bin/seed ./cmd/seed

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM alpine:3.20

# Use alpine (not scratch) so we get a shell for debugging
RUN apk add --no-cache ca-certificates tzdata curl

COPY --from=builder /bin/api    /api
COPY --from=builder /bin/worker /worker
COPY --from=builder /bin/seed   /seed

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["/api"]
