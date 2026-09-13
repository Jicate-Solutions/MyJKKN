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

func TestPhoneFromJID(t *testing.T) {
	jid, err := NormalizeToJID("+91 98765 43210")
	if err != nil {
		t.Fatal(err)
	}
	if got := PhoneFromJID(jid); got != "919876543210" {
		t.Fatalf("PhoneFromJID = %q, want %q", got, "919876543210")
	}
}
