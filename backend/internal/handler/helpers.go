package handler

import (
	"encoding/json"
	"net/http"
)

// respond writes a JSON response with the given status code and body.
func respond(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if body != nil {
		_ = json.NewEncoder(w).Encode(body)
	}
}

// respondError writes a JSON error response.
func respondError(w http.ResponseWriter, status int, message string) {
	respond(w, status, map[string]string{"error": http.StatusText(status), "message": message})
}

// decode reads and decodes a JSON request body into dest.
func decode(r *http.Request, dest any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(dest)
}

// realIP extracts the client IP, stripping the port.
func realIP(r *http.Request) string {
	addr := r.RemoteAddr
	// Strip port
	for i := len(addr) - 1; i >= 0; i-- {
		if addr[i] == ':' {
			return addr[:i]
		}
	}
	return addr
}
