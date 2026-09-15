package main

import (
	"context"
	"fmt"
	"strings"

	"go.mau.fi/whatsmeow/types"
)

// How MyJKKN is told to read the "from" field of an inbound message.
const (
	// FromTypePhone — "from" is a real E.164 phone number and may be matched
	// against a learner's or a staff member's phone.
	FromTypePhone = "phone"
	// FromTypeLID — "from" is a WhatsApp LID (a per-account pseudonymous id),
	// NOT a phone number. It happens to be numeric, which is exactly why it
	// must be labelled: matched against a phone column it would resolve to
	// some unrelated person.
	FromTypeLID = "lid"
	// FromTypeUnknown — an address on a server the bridge does not classify.
	// Never match it against anything.
	FromTypeUnknown = "unknown"
)

// jidSuffixes that MyJKKN, or a hand-edited row, may have left on a "to" value.
// The canonical wire format is bare E.164 digits ("919894116664"); these are
// stripped defensively rather than rejected.
var strippableToSuffixes = []string{
	"@" + types.DefaultUserServer, // @s.whatsapp.net
	"@c.us",                       // whatsapp-web.js's spelling, from the old Railway service
}

// NormalizeToJID turns whatever MyJKKN put in the "to" field into a WhatsApp JID.
//
// The canonical wire format is E.164 DIGITS ONLY — no leading "+", no server
// suffix, e.g. "919894116664". These shapes are all accepted:
//
//	"919876543210"                   -> 919876543210@s.whatsapp.net  (canonical)
//	"+91 98765 43210"                -> 919876543210@s.whatsapp.net
//	"919876543210@s.whatsapp.net"    -> 919876543210@s.whatsapp.net  (suffix stripped)
//	"919876543210@c.us"              -> 919876543210@s.whatsapp.net  (suffix stripped)
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

	// A user-server suffix carries no information a bare number does not, and
	// the digits still have to pass the country-code check below — so strip it
	// rather than short-circuiting into ParseJID.
	for _, suffix := range strippableToSuffixes {
		if len(s) > len(suffix) && strings.EqualFold(s[len(s)-len(suffix):], suffix) {
			s = s[:len(s)-len(suffix)]
			break
		}
	}

	// Still a JID (a group, a newsletter, …) — hand it to whatsmeow as-is.
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

// LIDResolver is whatsmeow's stored LID↔phone-number map, narrowed to the one
// lookup the bridge needs. Narrowing it also makes the rule testable without a
// live WhatsApp session.
type LIDResolver interface {
	GetPNForLID(ctx context.Context, lid types.JID) (types.JID, error)
}

// IsLIDServer reports whether a JID lives on one of WhatsApp's LID servers.
func IsLIDServer(server string) bool {
	return server == types.HiddenUserServer || server == types.HostedLIDServer
}

// ResolveSenderAddress decides what MyJKKN should be told about who sent a
// message, and how to read it.
//
// This matters because a LID is a bare numeric string that looks exactly like a
// phone number. On the pinned whatsmeow an inbound Sender is frequently a LID
// (`@lid`) rather than a phone JID, so sending Sender.User straight through as
// `from` hands MyJKKN a number it will match against a learner's phone — and
// the learner it lands on is whoever happens to own that numeric string. So:
//
//  1. a phone JID is a phone number;
//  2. a LID whose phone number whatsmeow already knows (either carried on the
//     event as SenderAlt, or in the stored mapping) becomes that phone number;
//  3. an unresolvable LID is passed through LABELLED as a LID, never as a phone.
func ResolveSenderAddress(ctx context.Context, info types.MessageSource, lids LIDResolver) (from string, fromType string) {
	sender := info.Sender.ToNonAD()

	if sender.Server == types.DefaultUserServer {
		return sender.User, FromTypePhone
	}
	if !IsLIDServer(sender.Server) {
		return sender.User, FromTypeUnknown
	}

	// whatsmeow puts the other address of the sender on the event itself when
	// it knows it. For a LID sender that is the phone number.
	if alt := info.SenderAlt.ToNonAD(); alt.Server == types.DefaultUserServer && alt.User != "" {
		return alt.User, FromTypePhone
	}

	if lids != nil {
		if pn, err := lids.GetPNForLID(ctx, sender); err == nil &&
			pn.Server == types.DefaultUserServer && pn.User != "" {
			return pn.User, FromTypePhone
		}
	}

	return sender.User, FromTypeLID
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
