# Claude Code Voice Alert System

## Overview

This voice alert system provides **automatic audio notifications** when using Claude Code with multiple agents. You'll hear voice alerts for:

- **Permission requests** - When Claude needs your approval
- **Task completion** - When main agent finishes
- **Subagent completion** - When background agents finish

Perfect for multi-tasking while running multiple Claude Code sessions!

---

## 🚀 Quick Start

### 1. Test the System

Run the test script to verify everything works:

```powershell
powershell.exe -ExecutionPolicy Bypass -File ".claude\hooks\test-voice.ps1"
```

You should hear:
- "This is a test"
- "Permission needed" (faster)
- "Task complete"
- "Agent finished"

### 2. Restart Claude Code

For hooks to take effect:
1. Exit Claude Code completely
2. Restart Claude Code
3. Open your project

### 3. Try It Out

- Ask Claude to do something that requires permission
- Listen for "Permission needed" alert
- Wait for task completion
- Listen for "Task complete" alert

---

## 📁 File Structure

```
.claude/
├── hooks/
│   ├── voice-alert.ps1           # Core TTS engine
│   ├── hook-permission.ps1       # Permission alerts
│   ├── hook-stop.ps1             # Task completion alerts
│   ├── hook-subagent-stop.ps1    # Subagent alerts
│   └── test-voice.ps1            # Testing script
└── settings.local.json           # Hook configuration
```

---

## 🎛️ Customization

### Change Alert Messages

Edit the hook files to customize messages:

**hook-permission.ps1:**
```powershell
& $scriptPath `
    -Message "Your attention please"  # Change this
    -Rate 2 `
    -Volume 100
```

**hook-stop.ps1:**
```powershell
& $scriptPath `
    -Message "All done"  # Change this
    -Rate 1 `
    -Volume 90
```

**hook-subagent-stop.ps1:**
```powershell
& $scriptPath `
    -Message "Background task finished"  # Change this
    -Rate 1 `
    -Volume 90
```

### Adjust Voice Settings

Parameters you can customize:

| Parameter | Description | Range | Default |
|-----------|-------------|-------|---------|
| **Message** | Text to speak | Any string | Varies |
| **Rate** | Speech speed | -10 to 10 | 1 |
| **Volume** | Speaker volume | 0-100 | 85-100 |
| **CooldownSeconds** | Min time between alerts | 0-60 | 3 |
| **Voice** | TTS voice name | See below | "Microsoft David Desktop" |

### Available Voices

To see available voices on your system:

```powershell
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.GetInstalledVoices() | ForEach-Object {
    Write-Host $_.VoiceInfo.Name
}
```

Common Windows voices:
- **Microsoft David Desktop** (Male, US English)
- **Microsoft Zira Desktop** (Female, US English)
- **Microsoft Hazel Desktop** (Female, UK English)

To change voice, edit **voice-alert.ps1** line 16:
```powershell
[string]$Voice = "Microsoft Zira Desktop"  # Change to preferred voice
```

---

## ⚙️ Advanced Configuration

### Disable Specific Alerts

Edit `.claude/settings.local.json` to comment out unwanted hooks:

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \".claude\\hooks\\hook-permission.ps1\""
          }
        ]
      }
    ]
    // Remove or comment out Stop or SubagentStop to disable those alerts
  }
}
```

### Conditional Alerts

Modify hook scripts to filter events:

**Example: Only alert for specific tools**

```powershell
# hook-permission.ps1 - Only alert for Bash commands
try {
    # Read JSON from stdin
    $inputJson = $Input | Out-String
    if ($inputJson) {
        $data = $inputJson | ConvertFrom-Json

        # Only alert for Bash tool
        if ($data.tool_name -ne "Bash") {
            exit 0  # Skip alert
        }
    }

    # Trigger alert
    $scriptPath = Join-Path $PSScriptRoot "voice-alert.ps1"
    & $scriptPath -Message "Bash permission needed" -Rate 2 -Volume 100

    exit 0
} catch {
    exit 0
}
```

### Time-Based Volume

Reduce volume at night:

```powershell
# voice-alert.ps1 - Add after param() block
$hour = (Get-Date).Hour
$volume = if ($hour -ge 22 -or $hour -lt 7) { 50 } else { $Volume }
```

### Custom Sound Effects

Use different sounds instead of voice:

```powershell
# hook-permission.ps1 - Play system sound
[System.Media.SystemSounds]::Asterisk.Play()

# Or play WAV file
$player = New-Object System.Media.SoundPlayer
$player.SoundLocation = "C:\Windows\Media\notify.wav"
$player.Play()
```

---

## 🔧 Troubleshooting

### No Sound Heard

1. **Check speaker volume**: Ensure system volume is not muted
2. **Test manually**:
   ```powershell
   Add-Type -AssemblyName System.Speech
   $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
   $synth.Speak("Test")
   ```
3. **Check execution policy**:
   ```powershell
   Get-ExecutionPolicy
   # Should be RemoteSigned or Bypass
   ```
4. **Verify hook files exist**:
   ```powershell
   ls .claude\hooks\
   ```

### Alerts Too Frequent

Increase cooldown in hook scripts:

```powershell
& $scriptPath `
    -Message "Permission needed" `
    -CooldownSeconds 10  # Increase from 3 to 10
```

### Voice Too Fast/Slow

Adjust Rate parameter (-10 to 10):

```powershell
-Rate 0  # Slower
-Rate 1  # Normal (default)
-Rate 2  # Faster
```

### Different Voice Needed

Change Voice parameter in voice-alert.ps1 or individual hooks:

```powershell
-Voice "Microsoft Zira Desktop"  # Female voice
```

### Hooks Not Triggering

1. **Restart Claude Code** after editing settings.local.json
2. **Check JSON syntax** in settings.local.json
3. **Verify file paths** are correct (use double backslashes `\\`)
4. **Check permissions** on PowerShell scripts

---

## 🎯 Use Cases

### Multi-Agent Workflow

Running multiple agents simultaneously? Voice alerts help you:

1. **Know when input needed** - "Permission needed" alert
2. **Track completion** - "Task complete" for main agent
3. **Monitor background tasks** - "Agent finished" for subagents

### Context Switching

Working on other tasks while Claude Code runs:

1. Start long-running task (e.g., code refactoring)
2. Switch to other work (email, meetings, etc.)
3. Hear "Task complete" when Claude finishes
4. Review results and continue

### Testing & Debugging

Run tests or builds in background:

1. Ask Claude to run test suite
2. Continue coding in another file
3. Hear completion alert
4. Review test results

---

## 📊 Hook Events Reference

| Event | When It Fires | Your Alert |
|-------|---------------|------------|
| **PermissionRequest** | Claude asks for permission | "Permission needed" |
| **Stop** | Main agent finishes | "Task complete" |
| **SubagentStop** | Background agent finishes | "Agent finished" |

### Additional Available Events

You can add hooks for these events too:

- **PreToolUse** - Before any tool executes
- **PostToolUse** - After tool completes
- **UserPromptSubmit** - When you submit input
- **Notification** - Any notification
- **SessionStart** - Session begins
- **SessionEnd** - Session ends

Example adding SessionStart alert:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \"Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('Claude Code started')\""
          }
        ]
      }
    ]
  }
}
```

---

## 🔐 Security Notes

- Scripts run with **your user permissions** (not elevated)
- **No network access** required
- All processing is **local** to your machine
- Scripts use **Windows built-in TTS** (System.Speech)
- **Cooldown mechanism** prevents spam/abuse

---

## 💡 Tips & Best Practices

1. **Test first**: Run test-voice.ps1 before using in production
2. **Adjust volume**: Set comfortable volume levels for your environment
3. **Use cooldown**: Prevents alert spam (default 3 seconds)
4. **Customize messages**: Make alerts meaningful to you
5. **Disable when not needed**: Comment out hooks when not multi-tasking
6. **Check compatibility**: Works on Windows with .NET Framework
7. **Restart after changes**: Always restart Claude Code after editing settings

---

## 🛠️ Development

### Adding New Alerts

1. Create new PowerShell script in `.claude/hooks/`
2. Use voice-alert.ps1 as template
3. Add hook entry to settings.local.json
4. Test with new script
5. Restart Claude Code

### Custom Event Handlers

Hook scripts can read event data from stdin:

```powershell
# Read JSON input
$inputJson = $Input | Out-String
if ($inputJson) {
    $data = $inputJson | ConvertFrom-Json

    # Access event data
    $toolName = $data.tool_name
    $sessionId = $data.session_id
    # ... customize behavior based on event
}
```

### Logging for Debugging

Add logging to troubleshoot hooks:

```powershell
# At start of hook script
$logFile = Join-Path $env:TEMP "claude-hooks.log"
Add-Content -Path $logFile -Value "$(Get-Date) - Hook triggered"
```

---

## 📝 Examples

### Example 1: Different Voice Per Event

**hook-permission.ps1:**
```powershell
& $scriptPath -Message "Permission needed" -Voice "Microsoft David Desktop"
```

**hook-stop.ps1:**
```powershell
& $scriptPath -Message "Task complete" -Voice "Microsoft Zira Desktop"
```

### Example 2: Urgent vs Normal Alerts

**Permission (Urgent):**
```powershell
& $scriptPath -Message "Permission needed NOW" -Rate 3 -Volume 100
```

**Completion (Normal):**
```powershell
& $scriptPath -Message "All done" -Rate 0 -Volume 70
```

### Example 3: Sound Effect + Voice

```powershell
# Play beep first
[Console]::Beep(1000, 200)

# Then speak
& $scriptPath -Message "Permission needed"
```

---

## 🔄 Updates & Maintenance

### Updating Hook Scripts

1. Edit PowerShell files in `.claude/hooks/`
2. **No restart needed** for script changes
3. Restart only if changing settings.local.json

### Version Control

Consider excluding from git:

```gitignore
# .gitignore
.claude/hooks/
.claude/settings.local.json
```

Or commit for team use:
```bash
git add .claude/hooks/
git commit -m "Add voice alert system for multi-agent workflow"
```

---

## 📚 Resources

- **Claude Code Hooks Documentation**: https://code.claude.com/docs/hooks
- **Windows Speech API**: https://learn.microsoft.com/en-us/dotnet/api/system.speech
- **PowerShell Best Practices**: https://learn.microsoft.com/en-us/powershell/

---

## ❓ FAQ

**Q: Can I use this on macOS/Linux?**
A: This implementation uses Windows Speech API. For macOS, use `say` command. For Linux, use `espeak` or `festival`.

**Q: Does this slow down Claude Code?**
A: No. Alerts run asynchronously and don't block Claude's execution.

**Q: Can I use music instead of voice?**
A: Yes! Replace voice-alert.ps1 with audio file playback using Media.SoundPlayer.

**Q: Will this work in Claude Code Web?**
A: No. Hooks only work in Claude Code CLI version.

**Q: Can I share this with my team?**
A: Yes! Commit the `.claude/hooks/` directory to your repository.

---

## 🎉 Enjoy Your Voice-Enabled Claude Code!

You now have a fully functional voice alert system for multi-agent workflows. Customize it to your preferences and enjoy hands-free notifications!

**Need help?** Check the troubleshooting section or create an issue in your project repository.
