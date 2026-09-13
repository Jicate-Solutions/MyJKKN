package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// Wire types. These mirror the MyJKKN /api/whatsapp-bridge/* contract exactly.
// ---------------------------------------------------------------------------

// PendingMessage is one unit of outbound work handed down by MyJKKN.
type PendingMessage struct {
	ID       string  `json:"id"`
	To       string  `json:"to"`
	Body     string  `json:"body"`
	Type     string  `json:"type"`      // "text" | "media"
	MediaURL *string `json:"media_url"` // null for text
}

// PendingResponse is the body of GET /api/whatsapp-bridge/pending.
type PendingResponse struct {
	Messages []PendingMessage `json:"messages"`
}

// AckRequest reports the outcome of one send back to MyJKKN.
type AckRequest struct {
	ID          string `json:"id"`
	Status      string `json:"status"` // "sent" | "failed"
	WAMessageID string `json:"wa_message_id,omitempty"`
	Error       string `json:"error,omitempty"`
}

// InboundMessage is a WhatsApp message travelling up into MyJKKN.
type InboundMessage struct {
	From string `json:"from"`
	// FromType says how to read From: "phone" (a real E.164 number, safe to
	// match against a learner's phone), "lid" (a WhatsApp pseudonymous id that
	// merely LOOKS like a phone number — never match it against one), or
	// "unknown". See ResolveSenderAddress.
	FromType string `json:"from_type"`
	// ChatJID is the conversation the message belongs to, e.g.
	// "919876543210@s.whatsapp.net" or "1203630...@g.us". Without it a
	// forwarded group message can never be replied to: the sender's address is
	// the person, not the group.
	ChatJID     string `json:"chat_jid"`
	SenderName  string `json:"sender_name"`
	WAMessageID string `json:"wa_message_id"`
	Body        string `json:"body"`
	Type        string `json:"type"`
	Timestamp   string `json:"timestamp"` // ISO 8601
	IsGroup     bool   `json:"is_group"`
}

// Heartbeat tells MyJKKN the bridge is alive and whether WhatsApp is paired.
type Heartbeat struct {
	Connected   bool   `json:"connected"`
	LoggedIn    bool   `json:"logged_in"`
	PhoneNumber string `json:"phone_number"`
	Version     string `json:"version"`
}

const (
	AckSent   = "sent"
	AckFailed = "failed"
)

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

// MyJKKNClient is the only thing in the bridge that talks to MyJKKN. Every
// call is outbound: the Windows box sits behind campus NAT and is never dialled.
type MyJKKNClient struct {
	baseURL string
	secret  string
	http    *http.Client
	log     *Logger
}

func NewMyJKKNClient(cfg *Config, log *Logger) *MyJKKNClient {
	return &MyJKKNClient{
		baseURL: cfg.MyJKKNURL,
		secret:  cfg.BridgeSecret,
		http:    &http.Client{Timeout: cfg.HTTPTimeout},
		log:     log,
	}
}

func (c *MyJKKNClient) do(ctx context.Context, method, path string, body any) ([]byte, error) {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("encode %s body: %w", path, err)
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-bridge-secret", c.secret)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "jkkn-whatsapp-bridge/"+Version)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// Cap the read: a proxy error page must not be able to exhaust memory.
	payload, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, fmt.Errorf("read %s response: %w", path, err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &HTTPError{Status: resp.StatusCode, Path: path, Body: truncate(string(payload), 400)}
	}
	return payload, nil
}

// HTTPError carries the status code so callers can tell "MyJKKN rejected us"
// (401/403 — wrong secret, never retry blindly) from "MyJKKN is down" (5xx).
type HTTPError struct {
	Status int
	Path   string
	Body   string
}

func (e *HTTPError) Error() string {
	return fmt.Sprintf("%s returned HTTP %d: %s", e.Path, e.Status, e.Body)
}

// IsAuthFailure reports whether MyJKKN refused the bridge secret.
func (e *HTTPError) IsAuthFailure() bool {
	return e.Status == http.StatusUnauthorized || e.Status == http.StatusForbidden
}

// FetchPending claims up to limit messages waiting to be sent.
func (c *MyJKKNClient) FetchPending(ctx context.Context, limit int) ([]PendingMessage, error) {
	raw, err := c.do(ctx, http.MethodGet, fmt.Sprintf("/api/whatsapp-bridge/pending?limit=%d", limit), nil)
	if err != nil {
		return nil, err
	}
	var out PendingResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("decode pending response: %w (body was %q)", err, truncate(string(raw), 200))
	}
	return out.Messages, nil
}

// Ack reports one send outcome.
func (c *MyJKKNClient) Ack(ctx context.Context, ack AckRequest) error {
	_, err := c.do(ctx, http.MethodPost, "/api/whatsapp-bridge/ack", ack)
	return err
}

// PostInbound pushes one received message up to MyJKKN.
func (c *MyJKKNClient) PostInbound(ctx context.Context, msg InboundMessage) error {
	_, err := c.do(ctx, http.MethodPost, "/api/whatsapp-bridge/inbound", msg)
	return err
}

// PostInboundRaw replays an already-encoded inbound message from the spool
// without re-decoding it, so a message queued by an older build still ships.
func (c *MyJKKNClient) PostInboundRaw(ctx context.Context, payload []byte) error {
	var msg InboundMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		return fmt.Errorf("spooled row is not a valid inbound message: %w", err)
	}
	return c.PostInbound(ctx, msg)
}

// SendHeartbeat reports liveness. A failure here is never fatal.
func (c *MyJKKNClient) SendHeartbeat(ctx context.Context, hb Heartbeat) error {
	_, err := c.do(ctx, http.MethodPost, "/api/whatsapp-bridge/heartbeat", hb)
	return err
}

func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// ISOTimestamp renders a time the way MyJKKN expects it on the wire.
func ISOTimestamp(t time.Time) string {
	return t.UTC().Format(time.RFC3339)
}
