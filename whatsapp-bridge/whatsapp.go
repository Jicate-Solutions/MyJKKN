package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"sync"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waProto "go.mau.fi/whatsmeow/proto/waE2E"
	"google.golang.org/protobuf/proto"

	// Pure-Go SQLite. Registers itself under the driver name "sqlite".
	// Deliberately NOT github.com/mattn/go-sqlite3: that one needs CGO and a C
	// toolchain on Windows, which would rule out shipping a single .exe.
	_ "modernc.org/sqlite"
)

// Version is stamped at build time with -ldflags "-X main.Version=…".
var Version = "dev"

// WA owns the single shared WhatsApp account. One client, one session store —
// not one per department. The per-department design is exactly what jammed the
// old Railway service with `spawn chromium EAGAIN`.
type WA struct {
	cfg       *Config
	log       *Logger
	client    *whatsmeow.Client
	container *sqlstore.Container
	db        *sql.DB

	mu      sync.RWMutex
	qrCode  string // current pairing code, empty once paired
	lastErr string

	// onMessage is installed by the inbound pump once it is wired up. Keeping
	// it behind the mutex means an event arriving during startup is dropped
	// rather than panicking on a nil handler.
	onMessage func(*events.Message)
}

// SetMessageHandler installs the inbound pump.
func (w *WA) SetMessageHandler(fn func(*events.Message)) {
	w.mu.Lock()
	w.onMessage = fn
	w.mu.Unlock()
}

func (w *WA) messageHandler() func(*events.Message) {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.onMessage
}

// OpenDatabase opens the shared SQLite file used for both the WhatsApp session
// and the inbound spool.
func OpenDatabase(path string) (*sql.DB, error) {
	// modernc's DSN uses _pragma=NAME(value); the _foreign_keys=on spelling in
	// whatsmeow's docs belongs to the CGO driver and is silently ignored here.
	dsn := fmt.Sprintf("file:%s?_pragma=foreign_keys(1)&_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)", path)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite %s: %w", path, err)
	}
	// modernc.org/sqlite is not safe for unlimited concurrent writers; one
	// connection removes every "database is locked" class of bug outright.
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping sqlite %s: %w", path, err)
	}
	return db, nil
}

func NewWA(ctx context.Context, cfg *Config, db *sql.DB, log *Logger) (*WA, error) {
	// Identify as a desktop client so WhatsApp keeps the session alive.
	store.DeviceProps.Os = proto.String("JKKN Bridge")

	container := sqlstore.NewWithDB(db, "sqlite", log.Sub("db"))
	if err := container.Upgrade(ctx); err != nil {
		return nil, fmt.Errorf("upgrade whatsmeow schema: %w", err)
	}

	device, err := container.GetFirstDevice(ctx)
	if err != nil {
		return nil, fmt.Errorf("load device from session store: %w", err)
	}

	wa := &WA{cfg: cfg, log: log, container: container, db: db}
	wa.client = whatsmeow.NewClient(device, log.Sub("wa"))
	wa.client.AddEventHandler(wa.handleEvent)
	return wa, nil
}

// Start connects, pairing first if the store holds no session yet, then keeps
// the connection up for the life of ctx.
func (w *WA) Start(ctx context.Context) error {
	if w.client.Store.ID == nil {
		return w.pair(ctx)
	}
	return w.connectWithRetry(ctx)
}

// pair prints a QR to the terminal and serves the same code at GET /qr until
// the operator scans it with the bridge's WhatsApp account.
func (w *WA) pair(ctx context.Context) error {
	qrChan, err := w.client.GetQRChannel(ctx)
	if err != nil {
		return fmt.Errorf("open QR channel: %w", err)
	}
	if err := w.client.Connect(); err != nil {
		return fmt.Errorf("connect for pairing: %w", err)
	}

	go func() {
		for item := range qrChan {
			switch item.Event {
			case "code":
				w.setQR(item.Code)
				w.log.Infof("PAIRING: scan this QR with the bridge's WhatsApp account (it also lives at http://%s/qr). Next code in %s.", w.cfg.ListenAddr, item.Timeout)
				PrintQRToTerminal(item.Code, os.Stdout)
			case "success":
				w.setQR("")
				w.log.Infof("PAIRING: success — the session is now saved to %s. No QR will be needed again unless you log out.", w.cfg.DBPath)
			case "timeout":
				w.setQR("")
				w.log.Warnf("PAIRING: the QR expired before anyone scanned it. Restart the bridge to get a fresh code.")
			default:
				if item.Error != nil {
					w.setQR("")
					w.log.Errorf("PAIRING: failed — %v", item.Error)
				}
			}
		}
	}()
	return nil
}

// connectWithRetry dials WhatsApp and keeps retrying with exponential backoff.
// A transient network failure must never end the process: the Windows box is
// unattended and nobody is there to restart it.
func (w *WA) connectWithRetry(ctx context.Context) error {
	const (
		minBackoff = 5 * time.Second
		maxBackoff = 5 * time.Minute
	)
	backoff := minBackoff
	for {
		err := w.client.Connect()
		if connectSucceeded(err) {
			return nil
		}
		w.setLastErr(err.Error())
		w.log.Errorf("connect to WhatsApp failed: %v — retrying in %s", err, backoff)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
		}
		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}

// connectSucceeded reports whether a Client.Connect() outcome leaves us with a
// live socket.
//
// whatsmeow answers a Connect() on an already-live socket with
// ErrAlreadyConnected, which is NOT nil. Treating that as a failure made
// connectWithRetry loop forever on a connection that was already working: the
// watchdog never returned, so the bridge stopped watching anything. It is a
// success, not an error.
func connectSucceeded(err error) bool {
	return err == nil || errors.Is(err, whatsmeow.ErrAlreadyConnected)
}

// LIDs exposes whatsmeow's LID↔phone-number map so inbound can turn a LID
// sender into a real phone number before MyJKKN ever sees it.
func (w *WA) LIDs() LIDResolver {
	if w.client == nil || w.client.Store == nil || w.client.Store.LIDs == nil {
		return nil
	}
	return w.client.Store.LIDs
}

// KeepAlive re-dials whenever whatsmeow's own auto-reconnect has given up.
func (w *WA) KeepAlive(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if w.client.Store.ID == nil || w.client.IsConnected() {
				continue
			}
			w.log.Warnf("WhatsApp is disconnected — reconnecting")
			if err := w.connectWithRetry(ctx); err != nil && ctx.Err() == nil {
				w.log.Errorf("reconnect gave up: %v", err)
			}
		}
	}
}

func (w *WA) handleEvent(rawEvt any) {
	switch evt := rawEvt.(type) {
	case *events.Connected:
		w.setLastErr("")
		w.log.Infof("WhatsApp connected as %s", w.PhoneNumber())
	case *events.Disconnected:
		w.log.Warnf("WhatsApp disconnected — whatsmeow will try to reconnect")
	case *events.StreamReplaced:
		w.log.Alertf("ANOTHER DEVICE TOOK OVER THIS WHATSAPP SESSION. Someone linked the bridge's number elsewhere. The bridge will stop sending until you re-pair it.")
	case *events.LoggedOut:
		w.setLastErr("logged out: " + evt.Reason.String())
		w.log.Alertf("THIS WHATSAPP ACCOUNT WAS LOGGED OUT (%s). Open http://%s/qr and scan again with the bridge's phone.", evt.Reason.String(), w.cfg.ListenAddr)
	case *events.TemporaryBan:
		w.setLastErr("temporary ban: " + evt.Code.String())
		w.log.Alertf("WHATSAPP HAS TEMPORARILY BANNED THIS NUMBER (%s, expires in %s). Sending will fail until it lifts. Raise SEND_DELAY_MS before turning the bridge back on.", evt.Code.String(), evt.Expire)
	case *events.ClientOutdated:
		// The known killer. An old whatsmeow is refused by WhatsApp with a 405
		// and no amount of restarting fixes it.
		w.setLastErr("client outdated")
		w.log.Alertf("WHATSAPP REJECTED THIS BRIDGE AS OUTDATED (405 / 'Client outdated'). RESTARTING WILL NOT HELP. The .exe must be REBUILT against a newer go.mau.fi/whatsmeow and re-copied to this machine. Tell the MyJKKN team — this is the known multi-day-outage failure. Current build: %s.", Version)
	case *events.ConnectFailure:
		w.setLastErr(fmt.Sprintf("connect failure: %s", evt.Message))
		w.log.Errorf("WhatsApp refused the connection: %s (%s)", evt.Message, evt.Reason.String())
		if evt.Reason == events.ConnectFailureClientOutdated {
			w.log.Alertf("WHATSAPP REJECTED THIS BRIDGE AS OUTDATED (405 / 'Client outdated'). RESTARTING WILL NOT HELP. The .exe must be REBUILT against a newer go.mau.fi/whatsmeow. Current build: %s.", Version)
		}
	case *events.Message:
		if handler := w.messageHandler(); handler != nil {
			handler(evt)
		}
	}
}

// SendText sends a plain text message.
func (w *WA) SendText(ctx context.Context, jid types.JID, body string) (string, error) {
	resp, err := w.client.SendMessage(ctx, jid, &waProto.Message{
		Conversation: proto.String(body),
	})
	if err != nil {
		return "", err
	}
	return resp.ID, nil
}

// Connected reports the live socket state.
func (w *WA) Connected() bool { return w.client.IsConnected() }

// LoggedIn reports whether a WhatsApp session is paired and authenticated.
func (w *WA) LoggedIn() bool { return w.client.IsLoggedIn() }

// PhoneNumber is the bridge's own WhatsApp number, empty while unpaired.
func (w *WA) PhoneNumber() string {
	if w.client.Store.ID == nil {
		return ""
	}
	return w.client.Store.ID.User
}

// QR returns the pending pairing code, empty once paired.
func (w *WA) QR() string {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.qrCode
}

// LastError is the most recent connection-level problem, for /health.
func (w *WA) LastError() string {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.lastErr
}

func (w *WA) setQR(code string) {
	w.mu.Lock()
	w.qrCode = code
	w.mu.Unlock()
}

func (w *WA) setLastErr(msg string) {
	w.mu.Lock()
	w.lastErr = msg
	w.mu.Unlock()
}

// Logout unlinks the device and wipes the stored session. The next start needs
// a fresh QR scan.
func (w *WA) Logout(ctx context.Context) error {
	if w.client.Store.ID == nil {
		return fmt.Errorf("not paired, nothing to log out of")
	}
	return w.client.Logout(ctx)
}

// Close disconnects cleanly on shutdown.
func (w *WA) Close() {
	w.client.Disconnect()
}
