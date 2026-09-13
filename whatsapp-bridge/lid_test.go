package main

import (
	"context"
	"errors"
	"testing"

	"go.mau.fi/whatsmeow/types"
)

// stubLIDs is whatsmeow's stored LID↔phone map, faked.
type stubLIDs struct {
	pn  types.JID
	err error
}

func (s stubLIDs) GetPNForLID(_ context.Context, _ types.JID) (types.JID, error) {
	return s.pn, s.err
}

func pnJID(user string) types.JID  { return types.NewJID(user, types.DefaultUserServer) }
func lidJID(user string) types.JID { return types.NewJID(user, types.HiddenUserServer) }

// REGRESSION (fix 3). inbound.go used to send evt.Info.Sender.User as `from`
// unconditionally. On the pinned whatsmeow a Sender is frequently a LID
// (`@lid`) — a bare numeric string that is NOT a phone number. MyJKKN matches
// `from` against a learner's phone, so a LID sent as a phone silently resolves
// to whichever unrelated person owns that numeric string.
func TestResolveSenderAddress(t *testing.T) {
	cases := []struct {
		name     string
		source   types.MessageSource
		lids     LIDResolver
		wantFrom string
		wantType string
	}{
		{
			name:     "a phone JID is a phone number",
			source:   types.MessageSource{Sender: pnJID("919894116664")},
			wantFrom: "919894116664",
			wantType: FromTypePhone,
		},
		{
			name: "a LID sender whose phone number rode along on the event",
			source: types.MessageSource{
				Sender:         lidJID("123456789012345"),
				SenderAlt:      pnJID("919894116664"),
				AddressingMode: types.AddressingModeLID,
			},
			wantFrom: "919894116664",
			wantType: FromTypePhone,
		},
		{
			name: "a LID sender resolved through whatsmeow's stored mapping",
			source: types.MessageSource{
				Sender:         lidJID("123456789012345"),
				AddressingMode: types.AddressingModeLID,
			},
			lids:     stubLIDs{pn: pnJID("919894116664")},
			wantFrom: "919894116664",
			wantType: FromTypePhone,
		},
		{
			name: "an unresolvable LID is labelled, never passed off as a phone",
			source: types.MessageSource{
				Sender:         lidJID("123456789012345"),
				AddressingMode: types.AddressingModeLID,
			},
			lids:     stubLIDs{pn: types.JID{}},
			wantFrom: "123456789012345",
			wantType: FromTypeLID,
		},
		{
			name: "a LID whose lookup errored is labelled too",
			source: types.MessageSource{
				Sender:         lidJID("123456789012345"),
				AddressingMode: types.AddressingModeLID,
			},
			lids:     stubLIDs{err: errors.New("session store is locked")},
			wantFrom: "123456789012345",
			wantType: FromTypeLID,
		},
		{
			name: "no resolver at all still refuses to call a LID a phone",
			source: types.MessageSource{
				Sender:         lidJID("123456789012345"),
				AddressingMode: types.AddressingModeLID,
			},
			lids:     nil,
			wantFrom: "123456789012345",
			wantType: FromTypeLID,
		},
		{
			name: "a hosted LID is a LID as well",
			source: types.MessageSource{
				Sender: types.NewJID("123456789012345", types.HostedLIDServer),
			},
			wantFrom: "123456789012345",
			wantType: FromTypeLID,
		},
		{
			name:     "an address on an unclassified server is never a phone",
			source:   types.MessageSource{Sender: types.NewJID("120363001234567890", types.GroupServer)},
			wantFrom: "120363001234567890",
			wantType: FromTypeUnknown,
		},
		{
			name: "a device-suffixed phone JID still yields the bare number",
			source: types.MessageSource{
				Sender: types.NewADJID("919894116664", 0, 3),
			},
			wantFrom: "919894116664",
			wantType: FromTypePhone,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			from, fromType := ResolveSenderAddress(context.Background(), tc.source, tc.lids)
			if from != tc.wantFrom || fromType != tc.wantType {
				t.Fatalf("ResolveSenderAddress = (%q, %q), want (%q, %q)", from, fromType, tc.wantFrom, tc.wantType)
			}
		})
	}
}

// The single rule the whole fix exists to enforce, stated on its own: a LID
// must never leave this bridge labelled as a phone number.
func TestResolveSenderAddress_ALIDIsNeverLabelledAsAPhone(t *testing.T) {
	unresolvable := []LIDResolver{
		nil,
		stubLIDs{pn: types.JID{}},
		stubLIDs{err: errors.New("no mapping")},
		// A mapping that answers with another LID is not a phone number either.
		stubLIDs{pn: lidJID("999999999999999")},
	}
	for i, lids := range unresolvable {
		src := types.MessageSource{Sender: lidJID("123456789012345"), AddressingMode: types.AddressingModeLID}
		from, fromType := ResolveSenderAddress(context.Background(), src, lids)
		if fromType == FromTypePhone {
			t.Fatalf("case %d: a LID was handed to MyJKKN as phone %q — it would be matched against a learner's number", i, from)
		}
	}
}

func TestIsLIDServer(t *testing.T) {
	if !IsLIDServer(types.HiddenUserServer) || !IsLIDServer(types.HostedLIDServer) {
		t.Fatal("both LID servers must be recognised")
	}
	if IsLIDServer(types.DefaultUserServer) || IsLIDServer(types.GroupServer) {
		t.Fatal("a phone or group server is not a LID server")
	}
}
