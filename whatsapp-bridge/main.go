// Command jkkn-whatsapp-bridge is the JKKN WhatsApp bridge.
//
// It runs on an always-on Windows box on the JKKN campus and links ONE shared
// WhatsApp account to MyJKKN. MyJKKN runs on Vercel; this machine sits behind
// campus NAT and cannot be dialled from the internet. So all traffic is
// outbound: the bridge POLLS MyJKKN for messages to send and POSTS results and
// incoming messages back. No open ports, no tunnel, no static IP, no firewall
// change.
//
// It replaces a Railway whatsapp-web.js service that ran one headless Chromium
// per department and died with `spawn chromium EAGAIN`. There is exactly one
// WhatsApp session here, and no browser at all.
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "\nFATAL: %v\n\n", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := LoadConfig()
	if err != nil {
		return err
	}

	log, logCloser, err := NewLogger(cfg.LogPath)
	if err != nil {
		return err
	}
	defer logCloser.Close()

	log.Infof("JKKN WhatsApp bridge %s starting", Version)
	log.Infof("MyJKKN: %s | session file: %s | log: %s", cfg.MyJKKNURL, cfg.DBPath, cfg.LogPath)

	// Ctrl+C, and the stop signal a Windows service manager sends.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := OpenDatabase(cfg.DBPath)
	if err != nil {
		return err
	}
	defer db.Close()

	spool, err := NewSpool(ctx, db, log)
	if err != nil {
		return err
	}
	if depth, err := spool.Depth(ctx); err == nil && depth > 0 {
		log.Infof("%d incoming message(s) were left queued from the last run — they will be delivered first", depth)
	}

	wa, err := NewWA(ctx, cfg, db, log)
	if err != nil {
		return err
	}
	defer wa.Close()

	api := NewMyJKKNClient(cfg, log)
	inbound := NewInbound(cfg, api, spool, log)
	wa.SetMessageHandler(inbound.Handle)

	operator := NewOperatorServer(cfg, wa, spool, log)
	if err := operator.Start(); err != nil {
		return err
	}

	if err := wa.Start(ctx); err != nil {
		return err
	}
	if wa.PhoneNumber() == "" {
		log.Infof("No saved WhatsApp session. Scan the QR below (or open http://%s/qr) with the phone holding the bridge's SIM.", cfg.ListenAddr)
	}

	outbound := NewOutbound(cfg, wa, api, log)
	go outbound.Run(ctx)
	go inbound.Run(ctx)
	go wa.KeepAlive(ctx)
	go runHeartbeat(ctx, cfg, wa, api, log)

	<-ctx.Done()
	log.Infof("shutdown requested — closing WhatsApp connection")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := operator.Shutdown(shutdownCtx); err != nil {
		log.Warnf("operator server did not shut down cleanly: %v", err)
	}
	log.Infof("stopped")
	return nil
}

// runHeartbeat tells MyJKKN the bridge is alive. A failure is logged and
// otherwise ignored: a dashboard going quiet must never stop real messages.
func runHeartbeat(ctx context.Context, cfg *Config, wa *WA, api *MyJKKNClient, log *Logger) {
	ticker := time.NewTicker(cfg.HeartbeatPeriod)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			hb := Heartbeat{
				Connected:   wa.Connected(),
				LoggedIn:    wa.LoggedIn(),
				PhoneNumber: wa.PhoneNumber(),
				Version:     Version,
			}
			if err := api.SendHeartbeat(ctx, hb); err != nil && ctx.Err() == nil {
				log.Warnf("heartbeat to MyJKKN failed: %v", err)
			}
		}
	}
}
