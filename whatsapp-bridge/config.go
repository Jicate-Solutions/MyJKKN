package main

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is the whole runtime configuration of the bridge. Every field comes
// from an environment variable so the Windows operator never edits code.
type Config struct {
	MyJKKNURL       string        // e.g. https://www.jkkn.ai
	BridgeSecret    string        // shared secret sent as x-bridge-secret
	PollInterval    time.Duration // how often to ask MyJKKN for pending work
	SendDelay       time.Duration // pause between two outbound sends
	DBPath          string        // SQLite file holding the WhatsApp session + inbound spool
	ListenAddr      string        // operator HTTP endpoints, loopback only
	LogPath         string        // rotating log file
	PendingLimit    int           // how many messages to claim per poll
	ForwardGroups   bool          // forward group messages to MyJKKN
	AllowInsecure   bool          // permit a plain http:// MyJKKN URL
	HTTPTimeout     time.Duration // timeout for every call to MyJKKN
	MaxMediaBytes   int64         // refuse to upload anything larger
	HeartbeatPeriod time.Duration
}

func LoadConfig() (*Config, error) {
	c := &Config{
		MyJKKNURL:       strings.TrimRight(os.Getenv("MYJKKN_URL"), "/"),
		BridgeSecret:    os.Getenv("BRIDGE_SECRET"),
		PollInterval:    time.Duration(envInt("POLL_INTERVAL_SECONDS", 5)) * time.Second,
		SendDelay:       time.Duration(envInt("SEND_DELAY_MS", 1500)) * time.Millisecond,
		DBPath:          envStr("DB_PATH", "jkkn-whatsapp-bridge.db"),
		ListenAddr:      envStr("LISTEN_ADDR", "127.0.0.1:8080"),
		LogPath:         envStr("LOG_PATH", "logs/bridge.log"),
		PendingLimit:    envInt("PENDING_LIMIT", 20),
		ForwardGroups:   envBool("FORWARD_GROUP_MESSAGES", false),
		AllowInsecure:   envBool("ALLOW_INSECURE_URL", false),
		HTTPTimeout:     time.Duration(envInt("HTTP_TIMEOUT_SECONDS", 30)) * time.Second,
		MaxMediaBytes:   int64(envInt("MAX_MEDIA_MB", 16)) * 1024 * 1024,
		HeartbeatPeriod: time.Duration(envInt("HEARTBEAT_SECONDS", 60)) * time.Second,
	}

	if c.MyJKKNURL == "" {
		return nil, fmt.Errorf("MYJKKN_URL is not set (expected something like https://www.jkkn.ai)")
	}
	u, err := url.Parse(c.MyJKKNURL)
	if err != nil || u.Host == "" {
		return nil, fmt.Errorf("MYJKKN_URL %q is not a valid URL", c.MyJKKNURL)
	}
	// The bridge secret travels in a plain header, so refuse plain HTTP unless
	// the operator has deliberately opted in (useful only for a LAN test rig).
	if u.Scheme != "https" && !c.AllowInsecure {
		return nil, fmt.Errorf("MYJKKN_URL must be https:// (got %q) — the bridge secret would otherwise cross the network in clear text; set ALLOW_INSECURE_URL=true only for local testing", u.Scheme)
	}
	if c.BridgeSecret == "" {
		return nil, fmt.Errorf("BRIDGE_SECRET is not set")
	}
	if c.PollInterval < time.Second {
		c.PollInterval = time.Second
	}
	if c.PendingLimit < 1 || c.PendingLimit > 100 {
		c.PendingLimit = 20
	}
	if !strings.HasPrefix(c.ListenAddr, "127.0.0.1:") && !strings.HasPrefix(c.ListenAddr, "localhost:") {
		return nil, fmt.Errorf("LISTEN_ADDR must bind loopback (127.0.0.1:PORT); got %q", c.ListenAddr)
	}
	return c, nil
}

func envStr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func envBool(key string, def bool) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	switch v {
	case "":
		return def
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}
