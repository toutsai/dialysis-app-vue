const fs = require('fs')
const path = require('path')
const admin = require('firebase-admin')
const { hashPassword, isScryptHash } = require('../functions/utils/passwordUtils')

const credentialPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  process.env.SERVICE_ACCOUNT_PATH ||
  path.join(__dirname, '..', 'my-dialysis-app-develop-key.json')

if (!fs.existsSync(credentialPath)) {
  console.error(`找不到服務帳戶金鑰檔案：${credentialPath}`)
  process.exit(1)
}

admin.initializeApp({
  credential: admin.credential.cert(require(credentialPath)),
})

const db = admin.firestore()

async function migrateUserPasswords() {
  const snapshot = await db.collection('users').get()
  if (snapshot.empty) {
    console.log('users 集合為空，無需遷移。')
    return
  }

  let upgraded = 0
  let skipped = 0

  for (const doc of snapshot.docs) {
    const data = doc.data() || {}
    const storedPassword = data.password

    if (!storedPassword) {
      skipped += 1
      continue
    }

    if (isScryptHash(storedPassword)) {
      skipped += 1
      continue
    }

    const hashedPassword = await hashPassword(storedPassword)
    await doc.ref.update({ password: hashedPassword })
    upgraded += 1
  }

  console.log(`遷移完成：${upgraded} 筆密碼已改為雜湊，${skipped} 筆維持不動。`)
}

migrateUserPasswords()
  .then(() => {
    console.log('✅ 密碼雜湊遷移腳本執行完畢。')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ 遷移過程中發生錯誤：', error)
    process.exit(1)
  })
