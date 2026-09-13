package main

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// withEnv sets the bare minimum for LoadConfig to succeed, plus whatever the
// test is actually exercising.
func withEnv(t *testing.T, extra map[string]string) *Config {
	t.Helper()
	t.Setenv("MYJKKN_URL", "https://www.jkkn.ai")
	t.Setenv("BRIDGE_SECRET", "a-shared-secret")
	for k, v := range extra {
		t.Setenv(k, v)
	}
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	return cfg
}

// REGRESSION (fix 1). HEARTBEAT_SECONDS=0 is a documented operator knob and the
// ordinary idiom for "switch this off". The previous build handed the zero to
// time.NewTicker, which panics with "non-positive interval for NewTicker"
// inside an unsupervised goroutine — killing an unattended Windows box into a
// permanent crash loop.
func TestConfig_HeartbeatZeroDisablesRatherThanPanics(t *testing.T) {
	cfg := withEnv(t, map[string]string{"HEARTBEAT_SECONDS": "0"})

	if cfg.HeartbeatPeriod != 0 {
		t.Fatalf("HEARTBEAT_SECONDS=0 should mean OFF (0), got %s", cfg.HeartbeatPeriod)
	}
	if len(cfg.Warnings) == 0 {
		t.Fatal("switching the heartbeat off must be reported to the operator, not silent")
	}

	// The guard that matters: the heartbeat loop must return instead of
	// reaching time.NewTicker(0). Anything else panics this test.
	log, closer, err := NewLogger(filepath.Join(t.TempDir(), "bridge.log"))
	if err != nil {
		t.Fatal(err)
	}
	defer closer.Close()

	done := make(chan struct{})
	go func() {
		defer close(done)
		// wa and api are nil deliberately: a disabled heartbeat must never
		// touch them.
		runHeartbeat(context.Background(), cfg, nil, nil, log)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("runHeartbeat did not return with the heartbeat disabled — it is still ticking")
	}
}

// REGRESSION (fix 1). SEND_DELAY_MS is the anti-ban pacing between two sends.
// Zero removed it outright and let the bridge fire a burst from one number,
// which is exactly what gets a WhatsApp account banned.
func TestConfig_SendDelayHasAFloor(t *testing.T) {
	for _, raw := range []string{"0", "-500", "10"} {
		t.Run("SEND_DELAY_MS="+raw, func(t *testing.T) {
			cfg := withEnv(t, map[string]string{"SEND_DELAY_MS": raw})
			if cfg.SendDelay < minSendDelay {
				t.Fatalf("SEND_DELAY_MS=%s gave %s, below the %s floor", raw, cfg.SendDelay, minSendDelay)
			}
			if len(cfg.Warnings) == 0 {
				t.Fatalf("SEND_DELAY_MS=%s was corrected silently", raw)
			}
		})
	}
}

// Every other numeric knob gets the same treatment: a zero or a negative in a
// .bat file must degrade to a working default, never to a broken bridge.
func TestConfig_EveryNumericKnobIsClamped(t *testing.T) {
	cfg := withEnv(t, map[string]string{
		"POLL_INTERVAL_SECONDS": "0",
		"SEND_DELAY_MS":         "0",
		"HTTP_TIMEOUT_SECONDS":  "0",
		"PENDING_LIMIT":         "0",
		"MAX_MEDIA_MB":          "0",
	})

	if cfg.PollInterval < minPollInterval {
		t.Errorf("PollInterval = %s, want >= %s", cfg.PollInterval, minPollInterval)
	}
	if cfg.SendDelay < minSendDelay {
		t.Errorf("SendDelay = %s, want >= %s", cfg.SendDelay, minSendDelay)
	}
	// A zero HTTP timeout means net/http waits forever: one hung request would
	// stall the outbound loop for good.
	if cfg.HTTPTimeout < minHTTPTimeout {
		t.Errorf("HTTPTimeout = %s, want >= %s", cfg.HTTPTimeout, minHTTPTimeout)
	}
	if cfg.PendingLimit < minPendingLimit {
		t.Errorf("PendingLimit = %d, want >= %d", cfg.PendingLimit, minPendingLimit)
	}
	// A zero media cap rejects every attachment as "larger than the 0 MB limit".
	if cfg.MaxMediaBytes < int64(minMaxMediaMB)*1024*1024 {
		t.Errorf("MaxMediaBytes = %d, want >= %d", cfg.MaxMediaBytes, int64(minMaxMediaMB)*1024*1024)
	}
	if len(cfg.Warnings) != 5 {
		t.Fatalf("expected one warning per corrected knob (5), got %d: %v", len(cfg.Warnings), cfg.Warnings)
	}
}

func TestConfig_AbsurdlyLargeValuesAreCapped(t *testing.T) {
	cfg := withEnv(t, map[string]string{
		"POLL_INTERVAL_SECONDS": "999999",
		"SEND_DELAY_MS":         "999999999",
		"HEARTBEAT_SECONDS":     "999999",
		"PENDING_LIMIT":         "10000",
		"MAX_MEDIA_MB":          "100000",
	})
	if cfg.PollInterval > maxPollInterval {
		t.Errorf("PollInterval = %s, want <= %s", cfg.PollInterval, maxPollInterval)
	}
	if cfg.SendDelay > maxSendDelay {
		t.Errorf("SendDelay = %s, want <= %s", cfg.SendDelay, maxSendDelay)
	}
	if cfg.HeartbeatPeriod > maxHeartbeatPeriod {
		t.Errorf("HeartbeatPeriod = %s, want <= %s", cfg.HeartbeatPeriod, maxHeartbeatPeriod)
	}
	if cfg.PendingLimit > maxPendingLimit {
		t.Errorf("PendingLimit = %d, want <= %d", cfg.PendingLimit, maxPendingLimit)
	}
}

// A negative heartbeat is a typo, not an intention, so it falls back to the
// default rather than switching the heartbeat off.
func TestConfig_NegativeHeartbeatFallsBackToDefault(t *testing.T) {
	cfg := withEnv(t, map[string]string{"HEARTBEAT_SECONDS": "-30"})
	if cfg.HeartbeatPeriod != defaultHeartbeatPeriod {
		t.Fatalf("HeartbeatPeriod = %s, want the default %s", cfg.HeartbeatPeriod, defaultHeartbeatPeriod)
	}
}

func TestConfig_GoodValuesArePassedThroughUntouched(t *testing.T) {
	cfg := withEnv(t, map[string]string{
		"POLL_INTERVAL_SECONDS": "5",
		"SEND_DELAY_MS":         "1500",
		"HEARTBEAT_SECONDS":     "60",
		"HTTP_TIMEOUT_SECONDS":  "30",
		"PENDING_LIMIT":         "20",
		"MAX_MEDIA_MB":          "16",
	})
	if cfg.PollInterval != 5*time.Second || cfg.SendDelay != 1500*time.Millisecond ||
		cfg.HeartbeatPeriod != 60*time.Second || cfg.HTTPTimeout != 30*time.Second ||
		cfg.PendingLimit != 20 || cfg.MaxMediaBytes != 16*1024*1024 {
		t.Fatalf("documented defaults were altered: %+v", cfg)
	}
	if len(cfg.Warnings) != 0 {
		t.Fatalf("the documented defaults produced warnings: %v", cfg.Warnings)
	}
}

// A value that is not a number at all must not become a zero.
func TestConfig_NonNumericValueFallsBackToDefault(t *testing.T) {
	cfg := withEnv(t, map[string]string{"HEARTBEAT_SECONDS": "sixty"})
	if cfg.HeartbeatPeriod != defaultHeartbeatPeriod {
		t.Fatalf("HEARTBEAT_SECONDS=sixty gave %s, want the default %s", cfg.HeartbeatPeriod, defaultHeartbeatPeriod)
	}
	if strings.Contains(strings.Join(cfg.Warnings, " "), "switched OFF") {
		t.Fatal("a typo must not be read as a deliberate switch-off")
	}
}
