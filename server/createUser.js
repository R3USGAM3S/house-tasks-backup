const bcrypt = require('bcrypt')
const db = require('./database')

const username = 'karl'
const password = 'salasana123'

bcrypt.hash(password, 10).then((hash) => {
  db.run(
    'INSERT INTO users (username, password_hash) VALUES (?, ?)',
    [username, hash],
    (error) => {
      if (error) console.error('Virhe:', error.message)
      else console.log('Käyttäjä luotu:', username)
      db.close()
    }
  )
})