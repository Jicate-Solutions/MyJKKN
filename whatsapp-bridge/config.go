package main

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Clamp bounds for every numeric knob. A value outside these is corrected and
// reported, never obeyed: this box is unattended, so a typo in a .bat file must
// degrade into a sane default rather than into a crash loop or a WhatsApp ban.
const (
	minPollInterval = 1 * time.Second
	maxPollInterval = 1 * time.Hour

	// A burst from one number is what gets a WhatsApp account banned, so the
	// anti-ban pacing has a floor that SEND_DELAY_MS=0 cannot remove.
	minSendDelay     = 250 * time.Millisecond
	maxSendDelay     = 60 * time.Second
	defaultSendDelay = 1500 * time.Millisecond

	minHTTPTimeout     = 5 * time.Second
	maxHTTPTimeout     = 5 * time.Minute
	defaultHTTPTimeout = 30 * time.Second

	// HEARTBEAT_SECONDS=0 DISABLES the heartbeat (see LoadConfig). Any other
	// value is clamped into this range so a "1" cannot hammer MyJKKN.
	minHeartbeatPeriod     = 10 * time.Second
	maxHeartbeatPeriod     = 1 * time.Hour
	defaultHeartbeatPeriod = 60 * time.Second

	minPendingLimit     = 1
	maxPendingLimit     = 100
	defaultPendingLimit = 20

	minMaxMediaMB     = 1
	maxMaxMediaMB     = 100
	defaultMaxMediaMB = 16
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
	HeartbeatPeriod time.Duration // 0 means the heartbeat is switched off

	// Warnings records every value that had to be corrected. LoadConfig runs
	// before the log file exists, so main prints these once the logger is up.
	Warnings []string
}

func LoadConfig() (*Config, error) {
	c := &Config{
		MyJKKNURL:     strings.TrimRight(os.Getenv("MYJKKN_URL"), "/"),
		BridgeSecret:  os.Getenv("BRIDGE_SECRET"),
		DBPath:        envStr("DB_PATH", "jkkn-whatsapp-bridge.db"),
		ListenAddr:    envStr("LISTEN_ADDR", "127.0.0.1:8080"),
		LogPath:       envStr("LOG_PATH", "logs/bridge.log"),
		ForwardGroups: envBool("FORWARD_GROUP_MESSAGES", false),
		AllowInsecure: envBool("ALLOW_INSECURE_URL", false),
	}

	c.PollInterval = c.clampDuration(
		"POLL_INTERVAL_SECONDS",
		time.Duration(envInt("POLL_INTERVAL_SECONDS", 5))*time.Second,
		minPollInterval, maxPollInterval,
	)
	c.SendDelay = c.clampDuration(
		"SEND_DELAY_MS",
		time.Duration(envInt("SEND_DELAY_MS", int(defaultSendDelay/time.Millisecond)))*time.Millisecond,
		minSendDelay, maxSendDelay,
	)
	c.HTTPTimeout = c.clampDuration(
		"HTTP_TIMEOUT_SECONDS",
		time.Duration(envInt("HTTP_TIMEOUT_SECONDS", int(defaultHTTPTimeout/time.Second)))*time.Second,
		minHTTPTimeout, maxHTTPTimeout,
	)
	c.PendingLimit = c.clampInt(
		"PENDING_LIMIT",
		envInt("PENDING_LIMIT", defaultPendingLimit),
		minPendingLimit, maxPendingLimit,
	)
	c.MaxMediaBytes = int64(c.clampInt(
		"MAX_MEDIA_MB",
		envInt("MAX_MEDIA_MB", defaultMaxMediaMB),
		minMaxMediaMB, maxMaxMediaMB,
	)) * 1024 * 1024
	c.HeartbeatPeriod = c.heartbeatPeriod()

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
	if !strings.HasPrefix(c.ListenAddr, "127.0.0.1:") && !strings.HasPrefix(c.ListenAddr, "localhost:") {
		return nil, fmt.Errorf("LISTEN_ADDR must bind loopback (127.0.0.1:PORT); got %q", c.ListenAddr)
	}
	return c, nil
}

// heartbeatPeriod reads HEARTBEAT_SECONDS.
//
// HEARTBEAT_SECONDS=0 means OFF, deliberately: 0 is the ordinary operator
// idiom for "disable this", and the previous build turned it into a panic
// (time.NewTicker rejects a non-positive interval) inside an unsupervised
// goroutine, which killed the process on a box nobody is watching. A negative
// value is a typo, not an intention, so it falls back to the default.
func (c *Config) heartbeatPeriod() time.Duration {
	raw := envInt("HEARTBEAT_SECONDS", int(defaultHeartbeatPeriod/time.Second))
	if raw == 0 {
		c.warnf("HEARTBEAT_SECONDS=0 — the heartbeat is switched OFF. MyJKKN will show this bridge as silent even while messages keep flowing. Set HEARTBEAT_SECONDS=60 to turn it back on.")
		return 0
	}
	if raw < 0 {
		c.warnf("HEARTBEAT_SECONDS=%d is negative — using the default of %s instead.", raw, defaultHeartbeatPeriod)
		return defaultHeartbeatPeriod
	}
	return c.clampDuration("HEARTBEAT_SECONDS", time.Duration(raw)*time.Second, minHeartbeatPeriod, maxHeartbeatPeriod)
}

// clampDuration forces v into [min,max] and records what it had to change.
func (c *Config) clampDuration(name string, v, min, max time.Duration) time.Duration {
	if v < min {
		c.warnf("%s was %s, below the minimum of %s — using %s.", name, v, min, min)
		return min
	}
	if v > max {
		c.warnf("%s was %s, above the maximum of %s — using %s.", name, v, max, max)
		return max
	}
	return v
}

// clampInt forces v into [min,max] and records what it had to change.
func (c *Config) clampInt(name string, v, min, max int) int {
	if v < min {
		c.warnf("%s was %d, below the minimum of %d — using %d.", name, v, min, min)
		return min
	}
	if v > max {
		c.warnf("%s was %d, above the maximum of %d — using %d.", name, v, max, max)
		return max
	}
	return v
}

func (c *Config) warnf(format string, args ...any) {
	c.Warnings = append(c.Warnings, fmt.Sprintf(format, args...))
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
	n, err := strconv.Atoi(strings.TrimSpace(v))
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
