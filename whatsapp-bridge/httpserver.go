package main

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// OperatorServer exposes the three endpoints a human at the Windows box needs.
// It binds loopback only: nothing on the campus LAN can reach it, and there is
// no inbound path from the internet at all.
type OperatorServer struct {
	cfg   *Config
	wa    *WA
	spool *Spool
	log   *Logger
	srv   *http.Server
}

func NewOperatorServer(cfg *Config, wa *WA, spool *Spool, log *Logger) *OperatorServer {
	s := &OperatorServer{cfg: cfg, wa: wa, spool: spool, log: log}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/qr", s.handleQR)
	mux.HandleFunc("/logout", s.handleLogout)
	s.srv = &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	return s
}

func (s *OperatorServer) Start() error {
	s.log.Infof("operator endpoints listening on http://%s (/health, /qr, /logout)", s.cfg.ListenAddr)
	go func() {
		if err := s.srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			s.log.Errorf("operator HTTP server stopped: %v", err)
		}
	}()
	return nil
}

func (s *OperatorServer) Shutdown(ctx context.Context) error {
	return s.srv.Shutdown(ctx)
}

type healthResponse struct {
	Status      string `json:"status"`
	Connected   bool   `json:"connected"`
	LoggedIn    bool   `json:"logged_in"`
	PhoneNumber string `json:"phone_number"`
	Version     string `json:"version"`
	SpoolDepth  int    `json:"spool_depth"`
	LastError   string `json:"last_error,omitempty"`
}

func (s *OperatorServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	depth, err := s.spool.Depth(r.Context())
	if err != nil {
		s.log.Warnf("/health: could not read spool depth: %v", err)
	}
	resp := healthResponse{
		Status:      "ok",
		Connected:   s.wa.Connected(),
		LoggedIn:    s.wa.LoggedIn(),
		PhoneNumber: s.wa.PhoneNumber(),
		Version:     Version,
		SpoolDepth:  depth,
		LastError:   s.wa.LastError(),
	}
	if !resp.LoggedIn {
		resp.Status = "unpaired"
	} else if !resp.Connected {
		resp.Status = "disconnected"
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *OperatorServer) handleQR(w http.ResponseWriter, r *http.Request) {
	code := s.wa.QR()
	if code == "" {
		if s.wa.LoggedIn() {
			writeJSON(w, http.StatusOK, map[string]string{
				"status":  "paired",
				"message": "Already paired as " + s.wa.PhoneNumber() + ". No QR needed.",
			})
			return
		}
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"status":  "no_code",
			"message": "No pairing code right now. Restart the bridge to request a fresh one.",
		})
		return
	}

	// A browser asks for HTML; curl gets plain ASCII.
	if strings.Contains(r.Header.Get("Accept"), "text/html") {
		png, err := QRPNG(code, 512)
		if err != nil {
			http.Error(w, "could not render QR: "+err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(png)
		return
	}

	var buf bytes.Buffer
	PrintQRToTerminal(code, &buf)
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	fmt.Fprintf(w, "Scan this with the bridge's WhatsApp account:\n\n%s\n", buf.String())
}

func (s *OperatorServer) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "use POST"})
		return
	}
	// /logout unlinks the WhatsApp session and stops every message on campus
	// until somebody walks to the Windows box and rescans a QR. Binding to
	// loopback is not protection: any browser tab or any process on that box
	// could reach it, and a plain cross-origin form POST was enough to fire it.
	if reason := authorizeOperatorRequest(r, s.cfg); reason != "" {
		s.log.Warnf("/logout: refused a request — %s (origin=%q host=%q remote=%q)", reason, r.Header.Get("Origin"), r.Host, r.RemoteAddr)
		writeJSON(w, http.StatusForbidden, map[string]string{
			"error": "refused: " + reason + ". Send the bridge secret in the x-bridge-secret header from this machine.",
		})
		return
	}
	if err := s.wa.Logout(r.Context()); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	s.log.Warnf("/logout: the WhatsApp session was unlinked by the operator. Restart the bridge and scan a new QR.")
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "logged_out",
		"message": "Session unlinked. Restart the bridge and scan a new QR to pair again.",
	})
}

// authorizeOperatorRequest guards the state-changing operator endpoints. It
// returns an empty string when the request may proceed, or a short reason why
// it may not.
//
// Three independent checks, because each stops a different attack:
//
//   - the shared secret in a custom header. A cross-origin <form> POST cannot
//     set a header at all, and a cross-origin fetch() that tries triggers a
//     CORS preflight this server never answers. This is the real lock.
//   - Origin must be local when it is present, so a page on the box itself
//     cannot drive the endpoint from a tab the operator has open.
//   - Host must be loopback, which closes DNS rebinding (a hostname that
//     resolves to 127.0.0.1 but carries an attacker's origin).
func authorizeOperatorRequest(r *http.Request, cfg *Config) string {
	if !isLoopbackHost(r.Host) {
		return "requests must arrive on 127.0.0.1 or localhost"
	}
	if origin := strings.TrimSpace(r.Header.Get("Origin")); origin != "" && !isLocalOrigin(origin) {
		return "cross-origin requests are not accepted"
	}
	presented := r.Header.Get("x-bridge-secret")
	if presented == "" {
		return "missing the x-bridge-secret header"
	}
	if subtle.ConstantTimeCompare([]byte(presented), []byte(cfg.BridgeSecret)) != 1 {
		return "the x-bridge-secret header does not match BRIDGE_SECRET"
	}
	return ""
}

// isLoopbackHost reports whether a Host header names this machine.
func isLoopbackHost(host string) bool {
	hostname := host
	if h, _, err := net.SplitHostPort(host); err == nil {
		hostname = h
	}
	switch strings.ToLower(strings.Trim(hostname, "[]")) {
	case "127.0.0.1", "localhost", "::1":
		return true
	}
	return false
}

// isLocalOrigin reports whether an Origin header names a page served by this
// machine. "null" (a sandboxed iframe or a file:// page) is deliberately NOT
// local: it is exactly what an attacker's frame presents.
func isLocalOrigin(origin string) bool {
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}
	return isLoopbackHost(u.Host)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
