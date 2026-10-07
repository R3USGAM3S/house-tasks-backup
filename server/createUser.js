const path = require('path')

for (const file of [
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '.env.local'),
  path.join(__dirname, '..', '.env'),
]) {
  try {
    process.loadEnvFile(file)
  } catch {
    // missing file
  }
}

const bcrypt = require('bcrypt')
const db = require('./database')

// Usage: node createUser.js <username> <password>
// Creates the user, or changes the password if the user already exists.
const [username, password] = process.argv.slice(2)

async function main() {
  if (!username || !password) {
    console.error('Usage: node createUser.js <username> <password>')
    process.exit(1)
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters')
    process.exit(1)
  }

  await db.init()
  const hash = await bcrypt.hash(password, 10)
  await db.run(
    `INSERT INTO users (username, password_hash) VALUES (?, ?)
     ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash`,
    [username, hash],
  )
  console.log('Käyttäjä tallennettu:', username)
}

main()
  .catch((error) => {
    console.error('Virhe:', error.message)
    process.exitCode = 1
  })
  .finally(() => db.close())
