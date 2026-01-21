# POS Agent

> A small Node.js utility to handle ECS-POS printing requests from web apps using real printing hardware.

This agent runs as a background service on Windows, exposing a local API that allows web applications to send raw ESC/POS commands explicitly to a local thermal printer.

## Features

- **Background Service**: Runs silently in the background (hidden window).
- **Auto-Start**: Automatically starts with Windows via the Startup folder.
- **HTTPS Support**: Generates and trusts a self-signed certificate for `localhost` to allow communication with secure web apps.
- **Status Dashboard**: localized web interface at `https://localhost:3000` showing service status and live console logs.
- **Universal Support**: Works with most ESC/POS compatible thermal printers (Epson, generic, etc.).

## Installation

1. Download the latest `POSAgent-Setup.exe`.
2. Right-click and **Run as Administrator**.
3. Follow the on-screen instructions (the installer will configure certificates and shortcuts automatically).
4. Upon completion, the service will start automatically.

## Pre-configuration (Advanced)

If you need to deploy the agent with specific settings (e.g., to multiple machines), you can **pre-configure** the installer:

1. Create a `config.json` file with your desired settings (see Configuration section).
2. Place this `config.json` file in the **same folder** as `POSAgent-Setup.exe`.
3. Run the installer.

The installer will detect the external file and use it instead of the default configuration.

## Usage

Once installed, the agent listens on port **3000**.

### Check Status
Visit `https://localhost:3000/` in your browser to view the status dashboard and live logs.

### API Endpoints

**POST** `/imprimir`
Sends a print job to the configured printer.

## Configuration

A `config.json` file is located in `%LOCALAPPDATA%\POSAgent\config.json`. You can modify it to change the listening port or default printer settings.

```json
{
  "port": 3000,
  "printer": {
    "type": "epson",
    "interface": "printer:EPSON TM-T20II Receipt", 
    "width": 48,
    "characterSet": "PC852_LATIN2"
  },
  "test_mode": true
}
```

## Development

To build the project from source:

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the installer:**
   ```bash
   npm run build
   The output installer will be located in the `dist/` directory.

## OS support

As of release 1.0.6, the agent is only compatible with Windows, future releases aim to support Linux and macOS.

## Uninstalling

Run the **Uninstall POS Agent** shortcut from your Desktop or run `uninstall.exe` from the installation directory.
