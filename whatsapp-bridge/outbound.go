package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"go.mau.fi/whatsmeow"
	waProto "go.mau.fi/whatsmeow/proto/waE2E"
	"google.golang.org/protobuf/proto"
)

// Outbound is the poll-send-ack loop. MyJKKN runs on Vercel and the Windows box
// sits behind campus NAT, so the traffic is one-way by design: the bridge asks
// for work, never the other way round. No open ports, no tunnel, no static IP.
type Outbound struct {
	cfg  *Config
	wa   *WA
	api  *MyJKKNClient
	log  *Logger
	http *http.Client
}

func NewOutbound(cfg *Config, wa *WA, api *MyJKKNClient, log *Logger) *Outbound {
	return &Outbound{
		cfg:  cfg,
		wa:   wa,
		api:  api,
		log:  log,
		http: &http.Client{Timeout: cfg.HTTPTimeout},
	}
}

func (o *Outbound) Run(ctx context.Context) {
	ticker := time.NewTicker(o.cfg.PollInterval)
	defer ticker.Stop()
	o.log.Infof("outbound: polling %s every %s, %s between sends", o.cfg.MyJKKNURL, o.cfg.PollInterval, o.cfg.SendDelay)

	for {
		select {
		case <-ctx.Done():
			o.log.Infof("outbound: stopped")
			return
		case <-ticker.C:
			o.tick(ctx)
		}
	}
}

func (o *Outbound) tick(ctx context.Context) {
	// Claiming work we cannot deliver would burn MyJKKN's queue, so stay quiet
	// until WhatsApp is actually usable.
	if !o.wa.LoggedIn() || !o.wa.Connected() {
		return
	}

	messages, err := o.api.FetchPending(ctx, o.cfg.PendingLimit)
	if err != nil {
		o.reportAPIError("fetch pending", err)
		return
	}
	if len(messages) == 0 {
		return
	}
	o.log.Infof("outbound: %d message(s) to send", len(messages))

	for i, msg := range messages {
		if ctx.Err() != nil {
			return
		}
		if i > 0 {
			// Pace the sends: a burst from a fresh number is what gets a
			// WhatsApp account banned.
			select {
			case <-ctx.Done():
				return
			case <-time.After(o.cfg.SendDelay):
			}
		}
		o.sendOne(ctx, msg)
	}
}

func (o *Outbound) sendOne(ctx context.Context, msg PendingMessage) {
	waID, err := o.deliver(ctx, msg)
	ack := AckRequest{ID: msg.ID, Status: AckSent, WAMessageID: waID}
	if err != nil {
		ack.Status = AckFailed
		ack.WAMessageID = ""
		ack.Error = truncate(err.Error(), 500)
		o.log.Errorf("outbound: message %s to %s failed: %v", msg.ID, msg.To, err)
	} else {
		o.log.Infof("outbound: message %s delivered to %s (wa id %s)", msg.ID, msg.To, waID)
	}

	if ackErr := o.api.Ack(ctx, ack); ackErr != nil {
		// The message is already on its way to the recipient; only the
		// bookkeeping failed. MyJKKN's own timeout logic owns it from here —
		// re-sending on our side would risk a duplicate to a real person.
		o.log.Errorf("outbound: could not ack message %s (status=%s): %v — MyJKKN may re-queue it", msg.ID, ack.Status, ackErr)
	}
}

func (o *Outbound) deliver(ctx context.Context, msg PendingMessage) (string, error) {
	jid, err := NormalizeToJID(msg.To)
	if err != nil {
		return "", err
	}

	switch strings.ToLower(strings.TrimSpace(msg.Type)) {
	case "", "text":
		if strings.TrimSpace(msg.Body) == "" {
			return "", errors.New("text message has an empty body")
		}
		return o.wa.SendText(ctx, jid, msg.Body)

	case "media":
		if msg.MediaURL == nil || strings.TrimSpace(*msg.MediaURL) == "" {
			// Falling back to text keeps the message reaching the person
			// instead of silently dying over a missing attachment.
			if strings.TrimSpace(msg.Body) == "" {
				return "", errors.New("media message has neither media_url nor body")
			}
			o.log.Warnf("outbound: message %s is type=media with no media_url — sending its body as plain text", msg.ID)
			return o.wa.SendText(ctx, jid, msg.Body)
		}
		return o.sendMedia(ctx, msg, *msg.MediaURL)

	default:
		return "", fmt.Errorf("unknown message type %q (expected text or media)", msg.Type)
	}
}

func (o *Outbound) sendMedia(ctx context.Context, msg PendingMessage, mediaURL string) (string, error) {
	data, mime, err := o.fetchMedia(ctx, mediaURL)
	if err != nil {
		return "", err
	}

	kind := mediaKind(mime)
	uploaded, err := o.wa.client.Upload(ctx, data, kind.waType)
	if err != nil {
		return "", fmt.Errorf("upload %s to WhatsApp: %w", mime, err)
	}

	jid, err := NormalizeToJID(msg.To)
	if err != nil {
		return "", err
	}

	var payload *waProto.Message
	caption := msg.Body
	switch kind.name {
	case "image":
		payload = &waProto.Message{ImageMessage: &waProto.ImageMessage{
			Caption: proto.String(caption), Mimetype: proto.String(mime),
			URL: &uploaded.URL, DirectPath: &uploaded.DirectPath, MediaKey: uploaded.MediaKey,
			FileEncSHA256: uploaded.FileEncSHA256, FileSHA256: uploaded.FileSHA256, FileLength: &uploaded.FileLength,
		}}
	case "video":
		payload = &waProto.Message{VideoMessage: &waProto.VideoMessage{
			Caption: proto.String(caption), Mimetype: proto.String(mime),
			URL: &uploaded.URL, DirectPath: &uploaded.DirectPath, MediaKey: uploaded.MediaKey,
			FileEncSHA256: uploaded.FileEncSHA256, FileSHA256: uploaded.FileSHA256, FileLength: &uploaded.FileLength,
		}}
	case "audio":
		payload = &waProto.Message{AudioMessage: &waProto.AudioMessage{
			Mimetype: proto.String(mime),
			URL: &uploaded.URL, DirectPath: &uploaded.DirectPath, MediaKey: uploaded.MediaKey,
			FileEncSHA256: uploaded.FileEncSHA256, FileSHA256: uploaded.FileSHA256, FileLength: &uploaded.FileLength,
		}}
	default:
		payload = &waProto.Message{DocumentMessage: &waProto.DocumentMessage{
			Caption: proto.String(caption), Mimetype: proto.String(mime),
			FileName: proto.String(fileNameFromURL(mediaURL)),
			URL: &uploaded.URL, DirectPath: &uploaded.DirectPath, MediaKey: uploaded.MediaKey,
			FileEncSHA256: uploaded.FileEncSHA256, FileSHA256: uploaded.FileSHA256, FileLength: &uploaded.FileLength,
		}}
	}

	resp, err := o.wa.client.SendMessage(ctx, jid, payload)
	if err != nil {
		return "", err
	}
	return resp.ID, nil
}

func (o *Outbound) fetchMedia(ctx context.Context, mediaURL string) ([]byte, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, mediaURL, nil)
	if err != nil {
		return nil, "", fmt.Errorf("bad media_url %q: %w", mediaURL, err)
	}
	resp, err := o.http.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("download media: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", fmt.Errorf("media_url returned HTTP %d", resp.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, o.cfg.MaxMediaBytes+1))
	if err != nil {
		return nil, "", fmt.Errorf("read media body: %w", err)
	}
	if int64(len(data)) > o.cfg.MaxMediaBytes {
		return nil, "", fmt.Errorf("attachment is larger than the %d MB limit", o.cfg.MaxMediaBytes/1024/1024)
	}
	if len(data) == 0 {
		return nil, "", errors.New("media_url returned an empty body")
	}

	mime := resp.Header.Get("Content-Type")
	if i := strings.Index(mime, ";"); i >= 0 {
		mime = strings.TrimSpace(mime[:i])
	}
	if mime == "" {
		mime = http.DetectContentType(data)
	}
	return data, mime, nil
}

type mediaClass struct {
	name   string
	waType whatsmeow.MediaType
}

func mediaKind(mime string) mediaClass {
	switch {
	case strings.HasPrefix(mime, "image/"):
		return mediaClass{"image", whatsmeow.MediaImage}
	case strings.HasPrefix(mime, "video/"):
		return mediaClass{"video", whatsmeow.MediaVideo}
	case strings.HasPrefix(mime, "audio/"):
		return mediaClass{"audio", whatsmeow.MediaAudio}
	default:
		return mediaClass{"document", whatsmeow.MediaDocument}
	}
}

func fileNameFromURL(raw string) string {
	trimmed := raw
	if i := strings.IndexAny(trimmed, "?#"); i >= 0 {
		trimmed = trimmed[:i]
	}
	if i := strings.LastIndex(trimmed, "/"); i >= 0 {
		trimmed = trimmed[i+1:]
	}
	if trimmed == "" {
		return "attachment"
	}
	return trimmed
}

// reportAPIError keeps a wrong shared secret from scrolling past as noise.
func (o *Outbound) reportAPIError(what string, err error) {
	var httpErr *HTTPError
	if errors.As(err, &httpErr) && httpErr.IsAuthFailure() {
		o.log.Alertf("MYJKKN REJECTED THE BRIDGE SECRET (HTTP %d on %s). Sending is stopped until BRIDGE_SECRET on this machine matches the one in MyJKKN. Nothing will go out meanwhile.", httpErr.Status, httpErr.Path)
		return
	}
	o.log.Errorf("outbound: %s failed: %v", what, err)
}
