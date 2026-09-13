package main

import (
	"fmt"
	"strings"

	"go.mau.fi/whatsmeow/types"
)

// NormalizeToJID turns whatever MyJKKN put in the "to" field into a WhatsApp JID.
//
// Accepted shapes:
//
//	"919876543210"                   -> 919876543210@s.whatsapp.net
//	"+91 98765 43210"                -> 919876543210@s.whatsapp.net
//	"919876543210@s.whatsapp.net"    -> passed through unchanged
//	"1203630xxxxxxxxx@g.us"          -> passed through unchanged (group)
//
// A bare number is NEVER given a country code: guessing one would send the
// message to a stranger. A number without a country code is rejected here and
// acked back to MyJKKN as failed, which is loud and fixable, rather than
// delivered to the wrong person, which is not.
func NormalizeToJID(raw string) (types.JID, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return types.JID{}, fmt.Errorf("empty recipient")
	}

	// Already a JID (contains a server part) — hand it to whatsmeow as-is.
	if strings.Contains(s, "@") {
		jid, err := types.ParseJID(s)
		if err != nil {
			return types.JID{}, fmt.Errorf("not a valid JID %q: %w", s, err)
		}
		if jid.User == "" {
			return types.JID{}, fmt.Errorf("JID %q has no user part", s)
		}
		return jid, nil
	}

	digits := onlyDigits(s)
	if digits == "" {
		return types.JID{}, fmt.Errorf("recipient %q contains no digits", raw)
	}
	// An Indian mobile is 10 digits; with the 91 country code it is 12. Shorter
	// than 10 is certainly not a dialable international number.
	if len(digits) < 10 {
		return types.JID{}, fmt.Errorf("recipient %q has only %d digits — too short to be an international number", raw, len(digits))
	}
	if len(digits) == 10 {
		return types.JID{}, fmt.Errorf("recipient %q has no country code — refusing to guess one (prefix it, e.g. 91%s)", raw, digits)
	}
	if len(digits) > 15 {
		return types.JID{}, fmt.Errorf("recipient %q has %d digits — longer than the E.164 maximum of 15", raw, len(digits))
	}
	return types.NewJID(digits, types.DefaultUserServer), nil
}

// PhoneFromJID gives back the bare digits MyJKKN stores, e.g. "919876543210".
func PhoneFromJID(jid types.JID) string {
	return jid.User
}

func onlyDigits(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}
