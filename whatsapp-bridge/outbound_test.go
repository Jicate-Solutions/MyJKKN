package main

import (
	"testing"
	"time"
)

// REGRESSION (fix 5). The poll loop used a fixed ticker, so a MyJKKN outage
// meant hammering a dead host at the same rate forever with one log line per
// tick. Consecutive failures must push the polls apart, up to a cap.
func TestBackoffDelay(t *testing.T) {
	base := 5 * time.Second
	max := 5 * time.Minute

	cases := []struct {
		failures int
		want     time.Duration
	}{
		{0, 5 * time.Second},  // healthy
		{1, 5 * time.Second},  // first failure: no penalty yet
		{2, 10 * time.Second}, // then it doubles
		{3, 20 * time.Second},
		{4, 40 * time.Second},
		{5, 80 * time.Second},
		{6, 160 * time.Second},
		{7, max}, // 320s would exceed the cap
		{8, max},
		{99, max},
	}
	for _, tc := range cases {
		if got := backoffDelay(base, tc.failures, max); got != tc.want {
			t.Errorf("backoffDelay(%s, %d, %s) = %s, want %s", base, tc.failures, max, got, tc.want)
		}
	}
}

// However long the outage, the bridge must still wake up often enough that a
// campus notice goes out within minutes of MyJKKN returning.
func TestBackoffDelay_NeverExceedsTheCap(t *testing.T) {
	for _, base := range []time.Duration{time.Second, 5 * time.Second, time.Hour} {
		for failures := 0; failures < 200; failures++ {
			if got := backoffDelay(base, failures, maxOutboundBackoff); got > maxOutboundBackoff && got != base {
				t.Fatalf("backoffDelay(%s, %d) = %s, above the %s cap", base, failures, got, maxOutboundBackoff)
			}
		}
	}
}
