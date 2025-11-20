const crypto = require('crypto')
const { promisify } = require('util')

const scryptAsync = promisify(crypto.scrypt)

// 使用 scrypt 產生強雜湊，包含隨機 salt 與迭代次數等參數。
const SCRYPT_PREFIX = 'scrypt'
const ITERATIONS = 16384 // N 參數，2^14，兼顧安全與效能
const KEY_LENGTH = 64
const SALT_LENGTH = 16

function isScryptHash(value) {
  return typeof value === 'string' && value.startsWith(`${SCRYPT_PREFIX}:`)
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LENGTH).toString('hex')
  const key = await scryptAsync(password, salt, KEY_LENGTH, { N: ITERATIONS })
  return `${SCRYPT_PREFIX}:${ITERATIONS}:${salt}:${key.toString('hex')}`
}

async function verifyPassword(password, storedPassword) {
  if (!storedPassword) return false

  if (!isScryptHash(storedPassword)) {
    return password === storedPassword
  }

  const [prefix, iterationsStr, salt, keyHex] = storedPassword.split(':')
  if (prefix !== SCRYPT_PREFIX || !salt || !keyHex) return false

  const iterations = Number(iterationsStr) || ITERATIONS
  const derivedKey = await scryptAsync(password, salt, Buffer.from(keyHex, 'hex').length, {
    N: iterations,
  })
  return crypto.timingSafeEqual(derivedKey, Buffer.from(keyHex, 'hex'))
}

module.exports = {
  hashPassword,
  verifyPassword,
  isScryptHash,
}
