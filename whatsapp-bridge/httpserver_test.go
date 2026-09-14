package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

const testSecret = "a-shared-secret"

func testCfg() *Config {
	return &Config{BridgeSecret: testSecret, ListenAddr: "127.0.0.1:8080"}
}

func logoutRequest(headers map[string]string) *http.Request {
	r := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:8080/logout", nil)
	r.Host = "127.0.0.1:8080"
	for k, v := range headers {
		if k == "Host" {
			r.Host = v
			continue
		}
		r.Header.Set(k, v)
	}
	return r
}

// REGRESSION (fix 4). /logout unlinks the shared WhatsApp session and stops
// every campus message until a human walks to the Windows box and rescans a QR.
// It had no auth, no token and no origin check: a page open in any browser on
// that box could POST to it cross-origin and log the bridge out. Loopback
// binding is not protection from something running on the loopback.
func TestAuthorizeOperatorRequest_RejectsTheCrossOriginPost(t *testing.T) {
	cases := []struct {
		name    string
		headers map[string]string
	}{
		{
			name:    "the reviewer's cross-origin POST, no token",
			headers: map[string]string{"Origin": "https://evil.example"},
		},
		{
			name: "cross-origin even while presenting the right secret",
			headers: map[string]string{
				"Origin":          "https://evil.example",
				"x-bridge-secret": testSecret,
			},
		},
		{
			name:    "a local page with no token at all",
			headers: map[string]string{"Origin": "http://127.0.0.1:8080"},
		},
		{
			name:    "no origin and no token (curl, or a local process)",
			headers: map[string]string{},
		},
		{
			name:    "a wrong secret",
			headers: map[string]string{"x-bridge-secret": "not-the-secret"},
		},
		{
			name:    "an empty secret",
			headers: map[string]string{"x-bridge-secret": ""},
		},
		{
			name: "a rebound DNS name that resolves to loopback",
			headers: map[string]string{
				"Host":            "bridge.evil.example:8080",
				"x-bridge-secret": testSecret,
			},
		},
		{
			name: "a sandboxed frame presenting Origin: null",
			headers: map[string]string{
				"Origin":          "null",
				"x-bridge-secret": testSecret,
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if reason := authorizeOperatorRequest(logoutRequest(tc.headers), testCfg()); reason == "" {
				t.Fatal("this request was allowed to log the bridge out")
			}
		})
	}
}

func TestAuthorizeOperatorRequest_AllowsTheOperator(t *testing.T) {
	cases := []struct {
		name    string
		headers map[string]string
	}{
		{"curl from the box itself", map[string]string{"x-bridge-secret": testSecret}},
		{"localhost spelling", map[string]string{"Host": "localhost:8080", "x-bridge-secret": testSecret}},
		{"a local page", map[string]string{"Origin": "http://127.0.0.1:8080", "x-bridge-secret": testSecret}},
		{"a local page on another local port", map[string]string{"Origin": "http://localhost:3000", "x-bridge-secret": testSecret}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if reason := authorizeOperatorRequest(logoutRequest(tc.headers), testCfg()); reason != "" {
				t.Fatalf("the operator was refused: %s", reason)
			}
		})
	}
}

// The handler must refuse before it touches the WhatsApp session — proven here
// by leaving that session nil: reaching it would panic.
func TestHandleLogout_RefusesBeforeTouchingTheSession(t *testing.T) {
	log, closer, err := NewLogger(t.TempDir() + "/bridge.log")
	if err != nil {
		t.Fatal(err)
	}
	defer closer.Close()

	s := &OperatorServer{cfg: testCfg(), wa: nil, spool: nil, log: log}

	rec := httptest.NewRecorder()
	s.handleLogout(rec, logoutRequest(map[string]string{"Origin": "https://evil.example"}))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("cross-origin POST /logout returned %d, want 403", rec.Code)
	}

	rec = httptest.NewRecorder()
	s.handleLogout(rec, httptest.NewRequest(http.MethodGet, "http://127.0.0.1:8080/logout", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET /logout returned %d, want 405", rec.Code)
	}
}

func TestIsLoopbackHost(t *testing.T) {
	local := []string{"127.0.0.1:8080", "localhost:8080", "127.0.0.1", "localhost", "[::1]:8080"}
	for _, h := range local {
		if !isLoopbackHost(h) {
			t.Errorf("%q should be recognised as this machine", h)
		}
	}
	remote := []string{"evil.example:8080", "192.168.1.10:8080", "", "jkkn.ai"}
	for _, h := range remote {
		if isLoopbackHost(h) {
			t.Errorf("%q must not be treated as this machine", h)
		}
	}
}
