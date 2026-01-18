# XRPL Sweep Tool

A secure, command-line tool to sweep XRP from any BIP-39 mnemonic-derived wallet to a new address — including full **AccountDelete** to recover most of the account reserve (currently ~0.8 XRP after the ~0.2 XRP burn fee).

**Important Security Warning**  
This tool handles your **seed phrase** directly.  
**Only run it on a secure machine.**  
Never share your mnemonic. Use at your own risk.

## Features

- Supports all standard BIP-39 mnemonic lengths: 12, 15, 18, 21, 24 words
- Automatically derives classic XRP address from mnemonic
- Checks current balance and dynamic reserve requirements
- Sends all spendable XRP above reserve
- Performs **AccountDelete** to recover remaining reserve (minus burn fee)
- Requires no owner objects (trust lines, offers, etc.) — clean them first!
- Testnet support for safe testing

## Requirements

- Node.js >= 18
- Yarn or npm

## Installation

```bash
# Clone the repo
git clone https://github.com/ergofobe/xrpl-sweep.git
cd xrpl-sweep

# Install dependencies
npm install
# or
yarn install
```

## Usage

```bash
# Basic usage
npm start
# or
node xrpl-sweep.js
```

## Global install (recommended)

Add a shebang line at the very top of xrpl-sweep.js (if not already present):

```javascript
#!/usr/bin/env node
```

Then:

```bash
npm install -g .
```

Now you can run it from anywhere:

```bash
xrpl-sweep
```

## Testing on Testnet

Set `TESTNET = true` at the top of xrpl-sweep.js

Fund your test account at: https://testnet.xrpl.org

Run the script and verify behavior before using on mainnet

## How It Works (High-Level)

- You enter your mnemonic phrase (hidden input)
- Script derives your XRP classic address
- Connects to XRPL (mainnet or testnet)
- Checks balance, owner count, and current reserve requirements
- Calculates spendable amount
- Prompts for destination address
- (Optional) Sends spendable XRP via Payment
- Submits AccountDelete transaction to recover the rest
- Disconnects cleanly

## Important Notes & Limitations

- Must have 0 OwnerCount — remove all trust lines, offers, escrows, etc. first
- Irreversible — once AccountDelete succeeds, the old address is gone forever
- Burn fee — ~0.2 XRP (current owner reserve amount) is permanently burned
- Small transaction fees (~0.000012 XRP each) also apply
- No automatic object cleanup — do that manually with Xaman, XRP Toolkit, etc.
- Always verify the derived address matches your expected wallet before confirming

## License

MIT License

## Author

Jim Phillips  
jim@ergophobia.org  
https://github.com/ergofobe 

## Disclaimer

This is an open-source tool provided as-is. Use it responsibly and only after understanding the risks. The author is not responsible for lost funds, mistakes, or security issues.