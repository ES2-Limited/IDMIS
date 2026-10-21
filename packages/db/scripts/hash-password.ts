import readline from 'node:readline';
import { Writable } from 'node:stream';
import * as argon2 from 'argon2';

function promptPassword(promptText: string): Promise<string> {
  return new Promise((resolve) => {
    let muted = false;
    const mutableStdout = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) {
          process.stdout.write(chunk, encoding);
        }
        callback();
      },
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: true,
    });

    process.stdout.write(promptText);
    muted = true;

    rl.question('', (password) => {
      muted = false;
      process.stdout.write('\n');
      rl.close();
      resolve(password.trim());
    });
  });
}

async function main() {
  const password = await promptPassword('Enter password to hash: ');

  if (!password) {
    console.error('Error: Password cannot be empty.');
    process.exit(1);
  }

  const hash = await argon2.hash(password, {
    type: argon2.argon2id,
  });

  console.log('\nArgon2id Hash generated successfully:');
  console.log(`ADMIN_PASSWORD_HASH="${hash}"\n`);
}

main().catch((err) => {
  console.error('Failed to hash password:', err);
  process.exit(1);
});
