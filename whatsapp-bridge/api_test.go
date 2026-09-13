package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestPendingResponse_Unmarshal(t *testing.T) {
	raw := `{"messages":[
		{"id":"11111111-1111-1111-1111-111111111111","to":"919876543210","body":"Fees due","type":"text","media_url":null},
		{"id":"22222222-2222-2222-2222-222222222222","to":"919876543211","body":"Hall ticket","type":"media","media_url":"https://example.test/a.pdf"}
	]}`

	var got PendingResponse
	if err := json.Unmarshal([]byte(raw), &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(got.Messages) != 2 {
		t.Fatalf("got %d messages, want 2", len(got.Messages))
	}

	first := got.Messages[0]
	if first.ID != "11111111-1111-1111-1111-111111111111" || first.To != "919876543210" || first.Body != "Fees due" || first.Type != "text" {
		t.Fatalf("first message decoded wrong: %+v", first)
	}
	if first.MediaURL != nil {
		t.Fatalf("a text message must decode media_url as nil, got %q", *first.MediaURL)
	}

	second := got.Messages[1]
	if second.MediaURL == nil || *second.MediaURL != "https://example.test/a.pdf" {
		t.Fatalf("media message lost its media_url: %+v", second)
	}
}

func TestPendingResponse_EmptyQueue(t *testing.T) {
	var got PendingResponse
	if err := json.Unmarshal([]byte(`{"messages":[]}`), &got); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(got.Messages) != 0 {
		t.Fatalf("expected an empty queue, got %d", len(got.Messages))
	}
}

func TestAckRequest_Marshal(t *testing.T) {
	// A success ack must not carry an "error" key at all.
	sent, err := json.Marshal(AckRequest{ID: "abc", Status: AckSent, WAMessageID: "3EB0"})
	if err != nil {
		t.Fatal(err)
	}
	if string(sent) != `{"id":"abc","status":"sent","wa_message_id":"3EB0"}` {
		t.Fatalf("sent ack marshalled as %s", sent)
	}

	// A failure ack must not carry a wa_message_id.
	failed, err := json.Marshal(AckRequest{ID: "abc", Status: AckFailed, Error: "no country code"})
	if err != nil {
		t.Fatal(err)
	}
	if string(failed) != `{"id":"abc","status":"failed","error":"no country code"}` {
		t.Fatalf("failed ack marshalled as %s", failed)
	}
}

func TestInboundMessage_Marshal(t *testing.T) {
	ts := time.Date(2026, 9, 13, 10, 30, 0, 0, time.UTC)
	raw, err := json.Marshal(InboundMessage{
		From:        "919876543210",
		SenderName:  "Priya",
		WAMessageID: "3EB0ABC",
		Body:        "When does the hostel reopen?",
		Type:        "text",
		Timestamp:   ISOTimestamp(ts),
		IsGroup:     false,
	})
	if err != nil {
		t.Fatal(err)
	}
	want := `{"from":"919876543210","sender_name":"Priya","wa_message_id":"3EB0ABC","body":"When does the hostel reopen?","type":"text","timestamp":"2026-09-13T10:30:00Z","is_group":false}`
	if string(raw) != want {
		t.Fatalf("inbound marshalled as\n  %s\nwant\n  %s", raw, want)
	}
}

func TestISOTimestamp_IsUTC(t *testing.T) {
	ist := time.FixedZone("IST", 5*3600+1800)
	got := ISOTimestamp(time.Date(2026, 9, 13, 16, 0, 0, 0, ist))
	if got != "2026-09-13T10:30:00Z" {
		t.Fatalf("ISOTimestamp = %q, want the UTC form 2026-09-13T10:30:00Z", got)
	}
}

func TestClient_FetchPendingSendsSecretAndLimit(t *testing.T) {
	var gotSecret, gotQuery, gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotSecret = r.Header.Get("x-bridge-secret")
		gotQuery = r.URL.RawQuery
		gotPath = r.URL.Path
		_, _ = w.Write([]byte(`{"messages":[{"id":"a","to":"919876543210","body":"hi","type":"text","media_url":null}]}`))
	}))
	defer srv.Close()

	c := NewMyJKKNClient(&Config{MyJKKNURL: srv.URL, BridgeSecret: "s3cret", HTTPTimeout: 5 * time.Second}, testLogger(t))
	msgs, err := c.FetchPending(context.Background(), 20)
	if err != nil {
		t.Fatalf("FetchPending: %v", err)
	}
	if gotPath != "/api/whatsapp-bridge/pending" {
		t.Fatalf("path = %q", gotPath)
	}
	if gotQuery != "limit=20" {
		t.Fatalf("query = %q, want limit=20", gotQuery)
	}
	if gotSecret != "s3cret" {
		t.Fatalf("x-bridge-secret = %q", gotSecret)
	}
	if len(msgs) != 1 || msgs[0].ID != "a" {
		t.Fatalf("messages = %+v", msgs)
	}
}

func TestClient_AckPostsTheBody(t *testing.T) {
	var body AckRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("ack used %s, want POST", r.Method)
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := NewMyJKKNClient(&Config{MyJKKNURL: srv.URL, BridgeSecret: "x", HTTPTimeout: 5 * time.Second}, testLogger(t))
	err := c.Ack(context.Background(), AckRequest{ID: "m1", Status: AckFailed, Error: "boom"})
	if err != nil {
		t.Fatalf("Ack: %v", err)
	}
	if body.ID != "m1" || body.Status != AckFailed || body.Error != "boom" {
		t.Fatalf("server received %+v", body)
	}
}

func TestClient_AuthFailureIsDistinguishable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "bad secret", http.StatusUnauthorized)
	}))
	defer srv.Close()

	c := NewMyJKKNClient(&Config{MyJKKNURL: srv.URL, BridgeSecret: "wrong", HTTPTimeout: 5 * time.Second}, testLogger(t))
	_, err := c.FetchPending(context.Background(), 20)
	if err == nil {
		t.Fatal("expected an error on HTTP 401")
	}
	httpErr, ok := err.(*HTTPError)
	if !ok {
		t.Fatalf("error was %T, want *HTTPError", err)
	}
	if !httpErr.IsAuthFailure() {
		t.Fatalf("HTTP %d should be classified as an auth failure", httpErr.Status)
	}
}

func TestMediaKind(t *testing.T) {
	cases := map[string]string{
		"image/jpeg":      "image",
		"image/png":       "image",
		"video/mp4":       "video",
		"audio/ogg":       "audio",
		"application/pdf": "document",
		"":                "document",
	}
	for mime, want := range cases {
		if got := mediaKind(mime).name; got != want {
			t.Fatalf("mediaKind(%q) = %q, want %q", mime, got, want)
		}
	}
}

func TestFileNameFromURL(t *testing.T) {
	cases := map[string]string{
		"https://example.test/files/hall-ticket.pdf":         "hall-ticket.pdf",
		"https://example.test/files/hall-ticket.pdf?sig=abc": "hall-ticket.pdf",
		"https://example.test/":                              "attachment",
	}
	for in, want := range cases {
		if got := fileNameFromURL(in); got != want {
			t.Fatalf("fileNameFromURL(%q) = %q, want %q", in, got, want)
		}
	}
}

func testLogger(t *testing.T) *Logger {
	t.Helper()
	log, closer, err := NewLogger(t.TempDir() + "/test.log")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = closer.Close() })
	return log
}
