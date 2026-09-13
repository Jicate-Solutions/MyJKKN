package main

import (
	"io"

	"github.com/mdp/qrterminal/v3"
	qrcode "github.com/skip2/go-qrcode"
)

// PrintQRToTerminal draws the pairing code as blocks in the console window the
// operator is looking at.
func PrintQRToTerminal(code string, out io.Writer) {
	qrterminal.GenerateWithConfig(code, qrterminal.Config{
		Level:      qrterminal.L,
		Writer:     out,
		BlackChar:  qrterminal.WHITE, // terminals are dark; invert for scannability
		WhiteChar:  qrterminal.BLACK,
		QuietZone:  2,
	})
}

// QRPNG renders the pairing code as a PNG so it can be opened in a browser at
// GET /qr — easier to scan than console blocks over Remote Desktop.
func QRPNG(code string, size int) ([]byte, error) {
	return qrcode.Encode(code, qrcode.Medium, size)
}
