const bcrypt = require('bcrypt')
const db = require('./database')

// Usage: node createUser.js <username> <password>
// Creates the user, or changes the password if the user already exists.
const [username, password] = process.argv.slice(2)

if (!username || !password) {
  console.error('Usage: node createUser.js <username> <password>')
  process.exit(1)
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters')
  process.exit(1)
}

bcrypt.hash(password, 10).then((hash) => {
  db.run(
    `INSERT INTO users (username, password_hash) VALUES (?, ?)
     ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash`,
    [username, hash],
    (error) => {
      if (error) console.error('Virhe:', error.message)
      else console.log('Käyttäjä tallennettu:', username)
      db.close()
    }
  )
})
