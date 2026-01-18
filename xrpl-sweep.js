// xrpl-sweep.js
// Node.js script to sweep XRP from a mnemonic-derived wallet to a new address, including AccountDelete.
// Supports all standard BIP-39 lengths: 12, 15, 18, 21, 24 words
// WARNING: Handles sensitive seed phrase data. Run locally on a secure/offline machine!
// Never share your seed. Test on testnet first!
// Dependencies: npm install xrpl bip39 readline-sync

const xrpl = require('xrpl');
const bip39 = require('bip39');
const readlineSync = require('readline-sync');

// Configuration
const TESTNET = false; // Set to true for testing (use testnet faucet: https://testnet.xrpl.org)
const SERVER = TESTNET ? 'wss://s.altnet.rippletest.net:51233' : 'wss://xrplcluster.com';

// Helper: Validate classic XRP address
function isValidAddress(address) {
  return xrpl.isValidAddress(address);
}

async function main() {
  console.log('XRP Wallet Sweep Script (Full BIP-39 Support)');
  console.log('============================================');
  console.log('Supports standard BIP-39 mnemonics: 12, 15, 18, 21, or 24 words');
  console.log('Derives wallet, checks balance, sends spendable XRP, then deletes account');
  console.log('to recover most of the reserve (~0.8 XRP after ~0.2 burn fee).');
  console.log('Assumes NO owner objects (trust lines, offers, etc.). Clean manually first!\n');

  // Get mnemonic securely
  const mnemonic = readlineSync.question('Enter your mnemonic (space-separated, 12/15/18/21/24 words): ', {
    hideEchoBack: true,
  }).trim();

  const words = mnemonic.split(/\s+/);
  const wordCount = words.length;

  const validLengths = [12, 15, 18, 21, 24];
  if (!validLengths.includes(wordCount)) {
    console.error(`Error: Invalid word count (${wordCount}). Must be one of: 12, 15, 18, 21, 24.`);
    process.exit(1);
  }

  if (!bip39.validateMnemonic(mnemonic)) {
    console.error('Error: Invalid mnemonic (checksum failed or words not in wordlist). Double-check spelling/order.');
    process.exit(1);
  }

  // Derive XRP wallet (classic address, standard derivation)
  let wallet;
  try {
    wallet = xrpl.Wallet.fromMnemonic(mnemonic);
    console.log(`\nDerived address: ${wallet.address}`);
  } catch (err) {
    console.error('Error deriving wallet:', err.message);
    process.exit(1);
  }

  // Connect to XRPL
  const client = new xrpl.Client(SERVER);
  console.log(`Connecting to ${TESTNET ? 'Testnet' : 'Mainnet'}...`);
  try {
    await client.connect();
  } catch (err) {
    console.error('Failed to connect:', err.message);
    process.exit(1);
  }

  // Fetch account info
  let accountInfo;
  try {
    accountInfo = await client.request({
      command: 'account_info',
      account: wallet.address,
      ledger_index: 'validated',
    });
  } catch (err) {
    if (err.data?.error === 'actNotFound') {
      console.error('Account does not exist or is not funded.');
    } else {
      console.error('Error fetching account info:', err.message || err);
    }
    await client.disconnect();
    process.exit(1);
  }

  const balanceXrp = xrpl.dropsToXrp(accountInfo.result.account_data.Balance);
  console.log(`Current balance: ${balanceXrp} XRP`);

  // Get current reserve requirements (dynamic from network)
  const serverInfo = await client.request({ command: 'server_info' });
  const baseReserve = Number(serverInfo.result.info.validated_ledger.reserve_base_xrp);
  const ownerReserve = Number(serverInfo.result.info.validated_ledger.reserve_inc_xrp);

  console.log(`Base reserve: ${baseReserve} XRP`);
  console.log(`Owner reserve per object: ${ownerReserve} XRP`);

  const ownerCount = accountInfo.result.account_data.OwnerCount || 0;
  if (ownerCount > 0) {
    console.error(`\nERROR: Account owns ${ownerCount} objects (trust lines, offers, escrows, etc.).`);
    console.error('You must remove them first using a wallet like Xaman or XRP Toolkit.');
    console.error('AccountDelete will fail otherwise.');
    await client.disconnect();
    process.exit(1);
  }

  // Calculate approximate spendable (with fee buffer)
  const totalReserve = baseReserve + ownerCount * ownerReserve;
  const balanceNum = Number(balanceXrp);
  const spendable = balanceNum - totalReserve - 0.02; // ~0.02 XRP buffer for tx fees

  if (spendable <= 0) {
    console.log('\nNo significant spendable XRP above reserve.');
  } else {
    console.log(`Approximate spendable amount: ${spendable.toFixed(6)} XRP`);
  }

  // Get destination address
  let destination;
  while (true) {
    destination = readlineSync.question('\nEnter destination XRP address: ').trim();
    if (isValidAddress(destination)) break;
    console.log('Invalid XRP address. Please try again.');
  }

  // Final confirmation
  console.log(`\nThis will:`);
  console.log(`  1. Send any spendable XRP (> reserve) to ${destination}`);
  console.log(`  2. Delete account ${wallet.address} and send remaining reserve (minus ~0.2 XRP burn) to ${destination}`);
  console.log('This action is IRREVERSIBLE. Double-check everything!\n');

  const confirm = readlineSync.question(`Proceed with sweep from ${wallet.address} to ${destination}? (y/n): `)
    .trim().toLowerCase();

  if (confirm !== 'y' && confirm !== 'yes') {
    console.log('Cancelled.');
    await client.disconnect();
    process.exit(0);
  }

  try {
    // 1. Send spendable amount if meaningful
    if (spendable > 0.1) {  // avoid tiny useless transactions
      const amountDrops = xrpl.xrpToDrops(spendable.toFixed(6));
      const payment = await client.autofill({
        TransactionType: 'Payment',
        Account: wallet.address,
        Amount: amountDrops,
        Destination: destination,
      });

      const signedPayment = wallet.sign(payment);
      console.log('Submitting Payment...');
      const payResult = await client.submitAndWait(signedPayment.tx_blob);

      if (payResult.result.meta.TransactionResult === 'tesSUCCESS') {
        console.log('Payment successful!');
      } else {
        throw new Error(`Payment failed: ${payResult.result.meta.TransactionResult}`);
      }
    }

    // 2. AccountDelete
    const deleteTx = await client.autofill({
      TransactionType: 'AccountDelete',
      Account: wallet.address,
      Destination: destination,
    });

    const signedDelete = wallet.sign(deleteTx);
    console.log('Submitting AccountDelete...');
    const delResult = await client.submitAndWait(signedDelete.tx_blob);

    if (delResult.result.meta.TransactionResult === 'tesSUCCESS') {
      console.log('\nSUCCESS! Account deleted. Remaining funds sent (minus burn fee).');
    } else {
      throw new Error(`AccountDelete failed: ${delResult.result.meta.TransactionResult}`);
    }
  } catch (err) {
    console.error('\nTransaction failed:', err.message || err);
  } finally {
    await client.disconnect();
    console.log('Disconnected from XRPL.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});