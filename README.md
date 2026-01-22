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

**POST** `/print`
Unified endpoint that accepts an array of printing commands.

**GET** `/printer/open`
Triggers the cash drawer opening command.

### Instruction Set (Agnostic API)

The `/print` endpoint accepts a JSON array of commands. This allows any application to build custom layouts without modifying the agent source code.

| Command | Properties | Description |
| :--- | :--- | :--- |
| `text` | `value`, `align`, `bold`, `underline` | Prints a line of text. |
| `table` | `rows`, `columns` | Prints a structured table. `columns` define widths (0.0 to 1.0). |
| `image` | `data` (base64), `align` | Prints an optimized high-contrast dithered image. |
| `barcode`| `value`, `mode` | Prints standard barcodes (CODE128, EAN13, etc). |
| `qrcode` | `value` | Prints a QR code. |
| `separator`| - | Prints a horizontal separator line. |
| `newLine` | - | Adds vertical spacing. |
| `cut` | - | Performs a paper cut. |
| `beep` | - | Triggers the printer's internal buzzer. |
| `raw` | `data` (int array) | Sends raw ESC/POS bytes to the hardware. |

#### Example Payload
```json
[
  { "type": "text", "value": "SABOR ARTESANAL", "align": "center", "bold": true },
  { "type": "separator" },
  { "type": "table", 
    "columns": [{ "width": 0.5 }, { "width": 0.5, "align": "RIGHT" }], 
    "rows": [["Producto", "Precio"], ["Helado", "1500.00"]] 
  },
  { "type": "cut" }
]
```

## Configuration

A `config.json` file is located in the installation directory. You can also modify settings via the Dashboard UI.

```json
{
  "port": 3000,
  "printer": {
    "type": "epson",
    "interface": "printer:POS-58", 
    "width": 32,
    "characterSet": "PC852_LATIN2"
  },
  "test_mode": false
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

As of release 2.0.0, bundled installer is only compatible with Windows and Linux (untested), future releases aim to support macOS.
 
## Uninstalling

Run the **Uninstall POS Agent** shortcut from your Desktop or run `uninstall.exe` from the installation directory.
