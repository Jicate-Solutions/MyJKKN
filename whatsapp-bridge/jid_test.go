package main

import "testing"

func TestNormalizeToJID_BareNumberGetsUserServer(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"plain 12-digit Indian number", "919876543210", "919876543210@s.whatsapp.net"},
		{"leading plus", "+919876543210", "919876543210@s.whatsapp.net"},
		{"spaces and dashes", "+91 98765-43210", "919876543210@s.whatsapp.net"},
		{"brackets", "(91) 9876543210", "919876543210@s.whatsapp.net"},
		{"11 digits", "12025550123", "12025550123@s.whatsapp.net"},
		{"15 digits, the E.164 maximum", "123456789012345", "123456789012345@s.whatsapp.net"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NormalizeToJID(tc.in)
			if err != nil {
				t.Fatalf("NormalizeToJID(%q) returned error: %v", tc.in, err)
			}
			if got.String() != tc.want {
				t.Fatalf("NormalizeToJID(%q) = %q, want %q", tc.in, got.String(), tc.want)
			}
		})
	}
}

func TestNormalizeToJID_AlreadyJIDPassesThrough(t *testing.T) {
	cases := []string{
		"919876543210@s.whatsapp.net",
		"120363001234567890@g.us",
	}
	for _, in := range cases {
		t.Run(in, func(t *testing.T) {
			got, err := NormalizeToJID(in)
			if err != nil {
				t.Fatalf("NormalizeToJID(%q) returned error: %v", in, err)
			}
			if got.String() != in {
				t.Fatalf("NormalizeToJID(%q) = %q, want it unchanged", in, got.String())
			}
		})
	}
}

// A 10-digit number has no country code. Guessing one would deliver a learner's
// message to a stranger in another country, so it must be a loud failure.
func TestNormalizeToJID_RefusesToGuessACountryCode(t *testing.T) {
	_, err := NormalizeToJID("9876543210")
	if err == nil {
		t.Fatal("a 10-digit number with no country code must be rejected, not guessed")
	}
}

func TestNormalizeToJID_Rejects(t *testing.T) {
	cases := []struct {
		name string
		in   string
	}{
		{"empty", ""},
		{"whitespace only", "   "},
		{"no digits", "call the office"},
		{"too short", "12345"},
		{"too long for E.164", "1234567890123456"},
		{"JID with no user part", "@s.whatsapp.net"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := NormalizeToJID(tc.in); err == nil {
				t.Fatalf("NormalizeToJID(%q) should have failed", tc.in)
			}
		})
	}
}

// The canonical to_phone wire format is E.164 DIGITS ONLY — "919894116664", no
// leading "+", no server suffix. A suffix arriving from an older caller (or a
// hand-edited row) is stripped defensively rather than rejected; "@c.us" is the
// spelling the retired whatsapp-web.js service used.
func TestNormalizeToJID_StripsUserServerSuffixes(t *testing.T) {
	cases := []struct {
		name string
		in   string
	}{
		{"canonical digits only", "919894116664"},
		{"s.whatsapp.net suffix", "919894116664@s.whatsapp.net"},
		{"whatsapp-web.js c.us suffix", "919894116664@c.us"},
		{"c.us suffix, odd casing", "919894116664@C.US"},
		{"leading plus", "+919894116664"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NormalizeToJID(tc.in)
			if err != nil {
				t.Fatalf("NormalizeToJID(%q) returned error: %v", tc.in, err)
			}
			if got.String() != "919894116664@s.whatsapp.net" {
				t.Fatalf("NormalizeToJID(%q) = %q, want %q", tc.in, got.String(), "919894116664@s.whatsapp.net")
			}
		})
	}
}

// Stripping a suffix must not smuggle a number past the country-code check: a
// 10-digit number is still refused however it was spelled.
func TestNormalizeToJID_SuffixStrippingKeepsTheCountryCodeRule(t *testing.T) {
	for _, in := range []string{"9876543210@c.us", "9876543210@s.whatsapp.net"} {
		if _, err := NormalizeToJID(in); err == nil {
			t.Fatalf("NormalizeToJID(%q) must still refuse to guess a country code", in)
		}
	}
}

// A group JID is a real address, not a suffixed phone number, and must survive.
func TestNormalizeToJID_GroupJIDIsUntouched(t *testing.T) {
	const group = "120363001234567890@g.us"
	got, err := NormalizeToJID(group)
	if err != nil {
		t.Fatalf("NormalizeToJID(%q) returned error: %v", group, err)
	}
	if got.String() != group {
		t.Fatalf("NormalizeToJID(%q) = %q, want it unchanged", group, got.String())
	}
}

func TestPhoneFromJID(t *testing.T) {
	jid, err := NormalizeToJID("+91 98765 43210")
	if err != nil {
		t.Fatal(err)
	}
	if got := PhoneFromJID(jid); got != "919876543210" {
		t.Fatalf("PhoneFromJID = %q, want %q", got, "919876543210")
	}
}
