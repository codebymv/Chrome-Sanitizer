# AI Privacy Shield 🛡️

A Chrome extension that automatically detects and alerts you about Personally Identifiable Information (PII) before you send it to AI chatbots or upload files.

## Features

✅ **Real-Time Detection** - Identifies PII as you type or paste
✅ **File Scanning** - Analyzes uploaded text files for sensitive data
✅ **Visual Alerts** - Clear notifications when PII is detected
✅ **Severity Levels** - Critical, High, Medium, and Low risk categorization
✅ **10 Data Types** - Comprehensive PII detection
✅ **Session Statistics** - Track detections across your browsing session
✅ **Warning-Only Protection** - In-page monitoring alerts without blocking submission
✅ **Optional File Sanitizer** - Open a dedicated tool to create sanitized file copies
✅ **Works Everywhere** - Compatible with Claude, ChatGPT, Gemini, and Copilot

## Detected Information Types

| Type | Severity | Example |
|------|----------|---------|
| **Social Security Numbers** | Critical | `123-45-6789` |
| **Credit Card Numbers** | Critical | `4532-1234-5678-9012` |
| **Passport Numbers** | Critical | `AB1234567` |
| **Email Addresses** | High | `john@example.com` |
| **Phone Numbers** | High | `(555) 123-4567` |
| **Dates of Birth** | High | `01/15/1990` |
| **Driver's Licenses** | High | `D1234567` |
| **Street Addresses** | Medium | `123 Main Street` |
| **IP Addresses** | Medium | `192.168.1.1` |
| **ZIP Codes** | Low | `90210` |

## How It Works

**Detection Mode** - The extension operates in notification-only mode:

1. **Monitor**: Watches text inputs and file uploads on AI platforms
2. **Scan**: Analyzes content for PII patterns using regex detection
3. **Alert**: Displays severity-coded notifications when PII is found
4. **Inform**: Shows specific examples and counts
5. **Empower**: You decide whether to proceed or remove the PII

**No Auto-Redaction** - Your content is never modified. The extension only notifies you so you can make informed decisions.

### Step 1: Download the Extension
Clone or download this repository, then use the repository root folder (this folder) when loading the unpacked extension.

### Step 2: Enable Developer Mode
1. Open Google Chrome
2. Navigate to `chrome://extensions/`
3. Toggle on **Developer mode** in the top-right corner

### Step 3: Load the Extension
1. Click the **Load unpacked** button
2. Select the folder containing the extension files
3. The AI Privacy Shield icon should appear in your extensions bar

### Step 4: Start Using
Visit any supported AI chatbot site (Claude.ai, ChatGPT, Gemini, Copilot) and start typing. The extension will alert you if PII is detected!

## Usage

### Control Panel
Click the extension icon to:
- Toggle detection on/off
- View session statistics (PII instances found)
- See detection breakdown by type
- Open the File Sanitizer for TXT/CSV/DOCX workflows

### Understanding Alerts
- **Inline Warnings**: Yellow badges appear below text fields when PII is detected
- **Submit Alerts**: Detailed notifications before sending messages
- **File Alerts**: Notifications when uploading files containing PII
- **Severity Levels**: Color-coded (Red=Critical, Orange=High, Blue=Medium, Gray=Low)

### Manual Override
If you intentionally want to send PII:
1. Review the alert to understand what was detected
2. Click "I Understand" to dismiss
3. Proceed with sending your message
4. Or, temporarily disable detection via the extension icon

## Files Included

- `manifest.json` - Extension configuration
- `content-script.js` - Main bundled detection and alert logic for page inputs/uploads
- `popup.html` - Extension popup interface
- `popup.js` - Popup functionality
- `sanitizer.html` - File Sanitizer UI
- `sanitizer.js` - File Sanitizer logic bundle
- `styles.css` - Extension styling
- `icon16.png`, `icon48.png`, `icon128.png` - Extension icons
- `README.md` - This file

## Privacy & Security

- **No Data Collection**: This extension does NOT collect, store, or transmit any data
- **Local Processing**: All detection happens locally in your browser
- **No External API Calls**: The extension does not send your content to external services
- **In-Page Warning Mode**: Chat input monitoring only shows alerts and does not alter text
- **Optional Local File Output**: File Sanitizer generates a sanitized copy only when you run it and download it
- **Open Source**: All code is visible and auditable
- **Client-Side Only**: Everything runs in your browser extension

## Supported Websites

- claude.ai
- chat.openai.com
- gemini.google.com
- copilot.microsoft.com

## Troubleshooting

**Extension not detecting?**
- Refresh the AI chatbot page after installing
- Make sure detection is toggled ON in the extension popup
- Check that the extension is enabled in chrome://extensions/

**No alerts appearing?**
- The extension only alerts when PII patterns are detected
- Some patterns may have false positives/negatives

**Want to customize detection?**
- Edit the regex patterns in `src/shared/pii/patterns.ts` to add/modify rules
- Adjust severity levels for different data types
- Add new PII categories as needed

## Future Enhancements

Potential features for future versions:
- Custom detection rules through UI
- Whitelist for trusted contexts
- Export detection logs
- Support for more data types (bank accounts, medical IDs, etc.)
- Multi-language support
- Machine learning-based detection
- Context-aware sensitivity (e.g., doctor discussing medical info)

## Contributing

This is an open-source project. Feel free to:
- Report issues or false positives/negatives
- Suggest new PII patterns to detect
- Improve detection accuracy
- Enhance the UI/UX

---

**Important Note**: While this extension provides PII detection capabilities, no automated system is 100% accurate. Always review your messages before sending when dealing with highly sensitive information. The extension is a helpful tool, not a replacement for conscious privacy practices.
