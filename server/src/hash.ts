/** Generate a bcrypt hash for the OWNER_PASSWORD_HASH env var (Render). */
import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error('Usage: npm run hash -- "your-password-here"');
  process.exit(1);
}
bcrypt.hash(password, 12).then((h) => {
  console.log(h);
});
