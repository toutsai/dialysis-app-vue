// scripts/fix-timestamps.cjs

const admin = require('firebase-admin')

// --- 設定 ---
// (與你的 migrate-users.cjs 腳本使用相同的服務帳號金鑰設定)
const serviceAccount = require('../my-dialysis-app-develop-key.json') // ⚠️ 請確認路徑正確

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const db = admin.firestore()

async function fixUserTimestamps() {
  console.log(`🚀 開始修正專案 "${serviceAccount.project_id}" 中 users 集合的時間戳格式...`)

  const usersRef = db.collection('users')
  const snapshot = await usersRef.get()

  if (snapshot.empty) {
    console.log('🟡 `users` 集合為空，無需修正。')
    return
  }

  const batch = db.batch()
  let fixesCount = 0

  snapshot.forEach((doc) => {
    const data = doc.data()
    const updates = {}

    // 檢查 createdAt 欄位
    if (data.createdAt && typeof data.createdAt === 'string') {
      try {
        const dateObject = new Date(data.createdAt)
        updates.createdAt = admin.firestore.Timestamp.fromDate(dateObject)
        console.log(`   -> 準備修正 UID: ${doc.id} 的 createdAt 格式...`)
      } catch (e) {
        console.error(`   -> ❌ 無法解析 UID: ${doc.id} 的 createdAt 字串: "${data.createdAt}"`)
      }
    }

    // 檢查 updatedAt 欄位
    if (data.updatedAt && typeof data.updatedAt === 'string') {
      try {
        const dateObject = new Date(data.updatedAt)
        updates.updatedAt = admin.firestore.Timestamp.fromDate(dateObject)
        console.log(`   -> 準備修正 UID: ${doc.id} 的 updatedAt 格式...`)
      } catch (e) {
        console.error(`   -> ❌ 無法解析 UID: ${doc.id} 的 updatedAt 字串: "${data.updatedAt}"`)
      }
    }

    // 如果有需要更新的欄位，才加入到 batch 中
    if (Object.keys(updates).length > 0) {
      batch.update(doc.ref, updates)
      fixesCount++
    }
  })

  if (fixesCount > 0) {
    await batch.commit()
    console.log(`\n✅ 成功！共修正了 ${fixesCount} 份文件的時間戳格式。`)
  } else {
    console.log('\n✅ 所有文件的時間戳格式都正確，無需修正。')
  }

  console.log('🎉🎉🎉 時間戳修正任務完成！🎉🎉🎉')
}

fixUserTimestamps().catch((error) => {
  console.error('❌ 修正過程中發生嚴重錯誤:', error)
})
