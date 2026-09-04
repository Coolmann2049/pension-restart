import crypto from "node:crypto";

const password = process.argv[2];
if (!password || password.length < 10) {
  console.error('Usage: npm run hash-password -- "a password of at least 10 characters"');
  process.exit(1);
}
const salt = crypto.randomBytes(16).toString("hex");
const digest = crypto.scryptSync(password, salt, 64).toString("hex");
console.log(`scrypt$${salt}$${digest}`);
