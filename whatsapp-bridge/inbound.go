package main

import (
	"context"
	"errors"
	"strings"
	"time"

	"go.mau.fi/whatsmeow/types/events"
)

// Inbound carries WhatsApp messages up into MyJKKN.
//
// Every message is written to the local SQLite spool FIRST and only then
// delivered. If campus internet is down, or Vercel is mid-deploy, the message
// waits on disk instead of evaporating — the drain loop replays it in order
// once MyJKKN answers again.
type Inbound struct {
	cfg   *Config
	api   *MyJKKNClient
	spool *Spool
	log   *Logger

	// wake nudges the drain loop as soon as something is queued, so a message
	// arriving while MyJKKN is healthy is not held for a whole tick.
	wake chan struct{}
}

func NewInbound(cfg *Config, api *MyJKKNClient, spool *Spool, log *Logger) *Inbound {
	return &Inbound{cfg: cfg, api: api, spool: spool, log: log, wake: make(chan struct{}, 1)}
}

// Handle converts a whatsmeow event into the MyJKKN wire shape and queues it.
func (in *Inbound) Handle(evt *events.Message) {
	if evt.Info.IsFromMe {
		return // our own outbound echo
	}
	if evt.Info.Chat.Server == "broadcast" {
		return // status updates and broadcast lists are not conversations
	}
	if evt.Info.IsGroup && !in.cfg.ForwardGroups {
		return
	}

	body := extractText(evt)
	if strings.TrimSpace(body) == "" {
		// Media and reactions arrive with no text. There is nothing for MyJKKN
		// to read, so note it and move on rather than posting an empty row.
		in.log.Infof("inbound: ignoring a non-text message (%s) from %s", evt.Info.Type, evt.Info.Sender.User)
		return
	}

	msg := InboundMessage{
		From:        evt.Info.Sender.User,
		SenderName:  evt.Info.PushName,
		WAMessageID: evt.Info.ID,
		Body:        body,
		Type:        "text",
		Timestamp:   ISOTimestamp(evt.Info.Timestamp),
		IsGroup:     evt.Info.IsGroup,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := in.spool.Enqueue(ctx, msg); err != nil {
		// Losing the row here is the one genuinely unrecoverable case, so say so.
		in.log.Alertf("COULD NOT SAVE AN INCOMING WHATSAPP MESSAGE TO DISK (%v). THIS MESSAGE IS LOST. Check that %s is writable and the disk is not full.", err, in.cfg.DBPath)
		return
	}
	in.log.Infof("inbound: queued message %s from %s", msg.WAMessageID, msg.From)
	select {
	case in.wake <- struct{}{}:
	default:
	}
}

// Run drains the spool into MyJKKN, backing off while MyJKKN is unreachable.
func (in *Inbound) Run(ctx context.Context) {
	const (
		minBackoff = 2 * time.Second
		maxBackoff = 2 * time.Minute
	)
	backoff := minBackoff

	for {
		delivered, failed := in.drain(ctx)
		if ctx.Err() != nil {
			in.log.Infof("inbound: stopped")
			return
		}
		if failed {
			in.log.Warnf("inbound: MyJKKN is not accepting messages — %d still queued, retrying in %s", in.depth(ctx), backoff)
			select {
			case <-ctx.Done():
				return
			case <-time.After(backoff):
			}
			backoff *= 2
			if backoff > maxBackoff {
				backoff = maxBackoff
			}
			continue
		}
		backoff = minBackoff
		if delivered > 0 {
			continue // there may be more waiting
		}
		select {
		case <-ctx.Done():
			return
		case <-in.wake:
		case <-time.After(15 * time.Second):
		}
	}
}

// drain sends one batch. It returns how many went out and whether MyJKKN
// refused, which is the signal to back off.
func (in *Inbound) drain(ctx context.Context) (int, bool) {
	rows, err := in.spool.Next(ctx, 25)
	if err != nil {
		in.log.Errorf("inbound: could not read the spool: %v", err)
		return 0, true
	}

	sent := 0
	for _, row := range rows {
		if ctx.Err() != nil {
			return sent, false
		}
		err := in.api.PostInboundRaw(ctx, row.Payload)
		if err == nil {
			if delErr := in.spool.Delete(ctx, row.ID); delErr != nil {
				// Leaving it queued would re-post the same message forever.
				in.log.Errorf("inbound: delivered row %d but could not remove it from the spool: %v — it may be posted twice", row.ID, delErr)
			}
			sent++
			continue
		}

		// A row MyJKKN will never accept (malformed, or rejected outright as a
		// bad request) must not block every message behind it.
		var httpErr *HTTPError
		if errors.As(err, &httpErr) && httpErr.Status == 400 {
			in.log.Errorf("inbound: MyJKKN permanently rejected spool row %d (%v) — dropping it so the queue can move", row.ID, err)
			_ = in.spool.Delete(ctx, row.ID)
			continue
		}
		if errors.As(err, &httpErr) && httpErr.IsAuthFailure() {
			in.log.Alertf("MYJKKN REJECTED THE BRIDGE SECRET on /inbound (HTTP %d). Incoming WhatsApp messages are piling up on disk and none are reaching MyJKKN. Fix BRIDGE_SECRET on this machine.", httpErr.Status)
		}
		in.spool.RecordFailure(ctx, row.ID, err.Error())
		return sent, true
	}
	return sent, false
}

func (in *Inbound) depth(ctx context.Context) int {
	n, err := in.spool.Depth(ctx)
	if err != nil {
		return -1
	}
	return n
}

// extractText pulls the readable text out of the handful of message shapes that
// actually carry one.
func extractText(evt *events.Message) string {
	m := evt.Message
	if m == nil {
		return ""
	}
	if t := m.GetConversation(); t != "" {
		return t
	}
	if t := m.GetExtendedTextMessage().GetText(); t != "" {
		return t
	}
	if t := m.GetImageMessage().GetCaption(); t != "" {
		return t
	}
	if t := m.GetVideoMessage().GetCaption(); t != "" {
		return t
	}
	if t := m.GetDocumentMessage().GetCaption(); t != "" {
		return t
	}
	if b := m.GetButtonsResponseMessage().GetSelectedDisplayText(); b != "" {
		return b
	}
	if l := m.GetListResponseMessage().GetTitle(); l != "" {
		return l
	}
	return ""
}
