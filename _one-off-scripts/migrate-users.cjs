// scripts/migrate-users.cjs

const admin = require('firebase-admin')

// ===================================================================
// ✨✨✨ 唯一需要手動設定的地方 ✨✨✨
//
// 1. 從你的 Firebase Console 下載服務帳號金鑰檔案。
//    - 前往 https://console.firebase.google.com/
//    - 選擇你的 `my-dialysis-app-develop` 專案。
//    - 點擊左上角的齒輪圖示 -> 專案設定 (Project settings)。
//    - 切換到「服務帳戶」(Service accounts) 標籤頁。
//    - 點擊「產生新的私密金鑰」(Generate new private key) 按鈕，並下載 JSON 檔案。
//
// 2. 將下載的 JSON 檔案放到你的專案中安全的位置，例如專案的根目錄，
//    或者一個名為 `secrets` 的資料夾中。
//    **重要：** 請務必將這個檔案的名稱加入到 `.gitignore` 中，
//    絕對不要將金鑰檔案上傳到 Git！
//
// 3. 將下面的路徑替換成你存放金鑰檔案的實際路徑。
// ===================================================================
const serviceAccount = require('../my-dialysis-app-develop-key.json') // <-- ⚠️ 請替換成你的檔案路徑

// 使用服務帳號金鑰來初始化 Admin SDK
// 這樣可以確保腳本只會連接到 `my-dialysis-app-develop` 這個專案
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const db = admin.firestore()
const auth = admin.auth()

async function migrateUsers() {
  console.log(`🚀 開始遷移專案 "${serviceAccount.project_id}" 的使用者資料...`)

  const usersSnapshot = await db.collection('users').get()
  if (usersSnapshot.empty) {
    console.log('🟡 `users` 集合中沒有找到任何使用者，無需遷移。')
    return
  }

  console.log(`🔍 找到 ${usersSnapshot.size} 位使用者準備遷移...`)
  const migrationPromises = []

  usersSnapshot.forEach((doc) => {
    const userData = doc.data()
    const uid = doc.id

    const migrationTask = async () => {
      if (!userData.password || !userData.username) {
        console.log(`   -> 🟡 跳過 UID: ${uid} (缺少 password 或 username 欄位)`)
        return
      }

      const email = userData.email || `${userData.username}@example.com`
      const password = userData.password
      const displayName = userData.name || userData.username

      try {
        await auth.createUser({
          uid: uid,
          email: email,
          password: password,
          displayName: displayName,
        })
        console.log(`   -> ✅ 成功為 UID: ${uid} 建立 Auth 使用者。`)

        await doc.ref.update({
          password: admin.firestore.FieldValue.delete(),
          email: email,
        })
        console.log(`   -> 🔐 已從 Firestore 中移除 UID: ${uid} 的密碼。`)
      } catch (error) {
        if (
          error.code === 'auth/uid-already-exists' ||
          error.code === 'auth/email-already-exists'
        ) {
          console.log(`   -> 🟡 UID: ${uid} 在 Auth 中已存在，跳過建立，但仍會嘗試移除密碼。`)
          try {
            await doc.ref.update({ password: admin.firestore.FieldValue.delete() })
            console.log(`   -> 🔐 已從 Firestore 中移除 UID: ${uid} 的密碼。`)
          } catch (updateError) {
            console.error(`   -> ❌ 移除 UID: ${uid} 的密碼時失敗:`, updateError)
          }
        } else {
          console.error(`   -> ❌ 為 UID: ${uid} 建立 Auth 使用者時失敗:`, error)
        }
      }
    }

    migrationPromises.push(migrationTask())
  })

  await Promise.all(migrationPromises)
  console.log('\n🎉🎉🎉 使用者遷移完成！🎉🎉🎉')
}

migrateUsers().catch((error) => {
  console.error('❌ 遷移過程中發生嚴重錯誤:', error)
})
