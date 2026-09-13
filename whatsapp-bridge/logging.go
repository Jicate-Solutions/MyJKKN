package main

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"

	waLog "go.mau.fi/whatsmeow/util/log"
	"gopkg.in/natefinch/lumberjack.v2"
)

// Logger writes to the console and to a rotating file at the same time, so the
// operator can either watch the window or send us the log folder.
type Logger struct {
	std *log.Logger
}

// NewLogger opens (and creates) the rotating log file next to the executable.
func NewLogger(path string) (*Logger, io.Closer, error) {
	if dir := filepath.Dir(path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, nil, fmt.Errorf("create log directory %s: %w", dir, err)
		}
	}
	rotator := &lumberjack.Logger{
		Filename:   path,
		MaxSize:    10, // megabytes per file
		MaxBackups: 10,
		MaxAge:     30, // days
		Compress:   true,
	}
	out := io.MultiWriter(os.Stdout, rotator)
	return &Logger{std: log.New(out, "", log.LstdFlags|log.LUTC)}, rotator, nil
}

func (l *Logger) Infof(format string, args ...any)  { l.emit("INFO ", format, args...) }
func (l *Logger) Warnf(format string, args ...any)  { l.emit("WARN ", format, args...) }
func (l *Logger) Errorf(format string, args ...any) { l.emit("ERROR", format, args...) }

// Alertf prints an impossible-to-miss banner. Reserved for the failures that
// need a human at the Windows box today.
func (l *Logger) Alertf(format string, args ...any) {
	line := strings.Repeat("!", 78)
	l.std.Printf("\n%s\n!! %s\n%s\n", line, fmt.Sprintf(format, args...), line)
}

func (l *Logger) emit(level, format string, args ...any) {
	l.std.Printf("%s %s", level, fmt.Sprintf(format, args...))
}

// Sub adapts our logger to whatsmeow's logging interface.
func (l *Logger) Sub(module string) waLog.Logger {
	return &waLogAdapter{parent: l, module: module}
}

type waLogAdapter struct {
	parent *Logger
	module string
}

func (a *waLogAdapter) Warnf(msg string, args ...any)  { a.parent.Warnf("[%s] "+msg, prepend(a.module, args)...) }
func (a *waLogAdapter) Errorf(msg string, args ...any) { a.parent.Errorf("[%s] "+msg, prepend(a.module, args)...) }
func (a *waLogAdapter) Infof(msg string, args ...any)  { a.parent.Infof("[%s] "+msg, prepend(a.module, args)...) }

// Debugf is deliberately silent: whatsmeow's debug stream is far too chatty to
// keep on a box nobody is watching.
func (a *waLogAdapter) Debugf(msg string, args ...any) {}

func (a *waLogAdapter) Sub(module string) waLog.Logger {
	return &waLogAdapter{parent: a.parent, module: a.module + "/" + module}
}

func prepend(first string, rest []any) []any {
	out := make([]any, 0, len(rest)+1)
	out = append(out, first)
	return append(out, rest...)
}
