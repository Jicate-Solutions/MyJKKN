package main

import (
	"errors"
	"fmt"
	"net"
	"testing"

	"go.mau.fi/whatsmeow"
)

// REGRESSION (fix 2). whatsmeow answers Connect() on an already-live socket
// with ErrAlreadyConnected, which is NOT nil. connectWithRetry only ever
// returned on `err == nil`, so that answer sent it round the loop again —
// forever, on a connection that was already working. The watchdog never
// returned and the bridge effectively stopped watching anything.
func TestConnectSucceeded_AlreadyConnectedIsSuccess(t *testing.T) {
	if !connectSucceeded(nil) {
		t.Fatal("a nil error is a successful connect")
	}
	if !connectSucceeded(whatsmeow.ErrAlreadyConnected) {
		t.Fatal("ErrAlreadyConnected means the socket is up — it must end the retry loop, not restart it")
	}
	// It must still be recognised through a wrapper: whatsmeow and our own code
	// both annotate errors on the way out.
	wrapped := fmt.Errorf("connect for pairing: %w", whatsmeow.ErrAlreadyConnected)
	if !connectSucceeded(wrapped) {
		t.Fatal("a wrapped ErrAlreadyConnected must still count as connected")
	}
}

func TestConnectSucceeded_RealFailuresStillRetry(t *testing.T) {
	cases := []error{
		errors.New("dial tcp: lookup web.whatsapp.com: no such host"),
		&net.OpError{Op: "dial", Err: errors.New("connection refused")},
		whatsmeow.ErrNotLoggedIn,
	}
	for _, err := range cases {
		if connectSucceeded(err) {
			t.Fatalf("%v is a genuine failure and must keep the retry loop going", err)
		}
	}
}
