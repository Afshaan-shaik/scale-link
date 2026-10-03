package main

import (
	"os"

	"github.com/rs/zerolog/log"
)

// worker is the async click-event consumer (Phase 3).
// In Phase 1 this binary exits cleanly so the service compiles.
func main() {
	log.Info().Msg("worker service — full implementation in Phase 3")
	os.Exit(0)
}
