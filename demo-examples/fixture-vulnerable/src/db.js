const crypto = require('crypto');

// SQL Injection: user input directly interpolated into query
function getUser(db, userId) {
  const query = `SELECT * FROM users WHERE id = ${userId}`;
  return db.query(query);
}

// SQL Injection: string concatenation in query
function searchUsers(db, name) {
  return db.query('SELECT * FROM users WHERE name = \'' + name + '\'');
}

// Weak Crypto: MD5 hashing for passwords
function hashPassword(password) {
  return crypto.createHash('md5').update(password).digest('hex');
}

// Weak Crypto: Math.random for token generation
function generateToken() {
  return Math.random().toString(36).substring(2);
}

module.exports = { getUser, searchUsers, hashPassword, generateToken };
