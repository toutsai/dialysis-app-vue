// 檔案: seed.js (或 seed.cjs) - ✨ 疾病機率 20:1 版本 ✨

// 引入必要的函式庫
import { Faker, zh_TW, en } from '@faker-js/faker'
import admin from 'firebase-admin'
import serviceAccount from './serviceAccountKey.json' with { type: 'json' }

// 建立一個使用繁體中文語系的 faker 實例
const faker = new Faker({
  locale: [zh_TW, en],
})

// 初始化 Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

// 獲取 Firestore 資料庫的實例
const db = admin.firestore()

// ==========================================================
// --- 您可以在這裡修改要生成的病人數量 ---
const PATIENT_COUNTS = {
  opd: 200, // 門診病人數量
  ipd: 15, // 住院病人數量
  er: 5, // 急診病人數量
}
// ==========================================================

// --- 輔助函式 ---

// 隨機選擇陣列中的一個元素
const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)]

// 產生一個假的病人資料
function generateFakePatient(status) {
  const name = faker.person.fullName()
  const medicalRecordNumber = faker.string.numeric(7)

  const freqOptions = [
    ...Array(10).fill('一三五'),
    ...Array(10).fill('二四六'),
    '一四',
    '二五',
    '三六',
    '一五',
    '二六',
  ]
  const freq = getRandomElement(freqOptions)

  const physician = getRandomElement(['王醫師', '林醫師', '陳醫師', '李醫師'])

  // --- ✨ 核心修改：將機率從 2% (0.98) 提高到 5% (0.95)，即約 20:1 ---
  // Math.random() > 0.95 的意思是只有當隨機數落在 0.95 和 1.0 之間時條件才成立，機率約為 5%
  const diseases =
    Math.random() > 0.95 ? [getRandomElement(['HIV', 'RPR', 'HBV', 'HCV', 'COVID'])] : []

  return {
    name,
    medicalRecordNumber,
    status,
    freq,
    physician,
    diseases,
    mode: 'HD',
    vascAccess: getRandomElement(['AVF', 'AVG', 'CVC']),
    remarks: Math.random() > 0.8 ? faker.lorem.sentence(5) : '',
    isDeleted: false,
    isDiscontinued: false,
    createdAt: new Date().toISOString(),
  }
}

// (可選) 清空集合的函式
async function clearCollection(collectionPath) {
  const collectionRef = db.collection(collectionPath)
  const snapshot = await collectionRef.limit(500).get()

  if (snapshot.empty) {
    console.log(`- 集合 ${collectionPath} 已是空的，無需清除。`)
    return
  }

  const batch = db.batch()
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref)
  })

  await batch.commit()
  console.log(`- 已清除 ${snapshot.size} 筆來自 ${collectionPath} 的文件。`)

  if (snapshot.size === 500) {
    await clearCollection(collectionPath)
  }
}

// 填充資料庫的主函式
async function seedDatabase() {
  console.log('--- 開始執行資料填充腳本 ---')

  console.log('🧹 正在清空 "patients" 集合...')
  await clearCollection('patients')

  const totalPatients = PATIENT_COUNTS.opd + PATIENT_COUNTS.ipd + PATIENT_COUNTS.er
  console.log(`🚀 準備建立 ${totalPatients} 位新病人:`)
  console.log(`   - 門診 (opd): ${PATIENT_COUNTS.opd} 位`)
  console.log(`   - 住院 (ipd): ${PATIENT_COUNTS.ipd} 位`)
  console.log(`   - 急診 (er): ${PATIENT_COUNTS.er} 位`)

  const batch = db.batch()
  const patientsRef = db.collection('patients')

  for (const status in PATIENT_COUNTS) {
    const count = PATIENT_COUNTS[status]
    for (let i = 0; i < count; i++) {
      const newPatient = generateFakePatient(status)
      const docRef = patientsRef.doc()
      batch.set(docRef, newPatient)
    }
  }

  try {
    await batch.commit()
    console.log(`✅ 成功！ ${totalPatients} 位假病人資料已成功寫入 Firestore！`)
  } catch (error) {
    console.error('❌ 寫入資料時發生錯誤:', error)
  }

  console.log('--- 腳本執行完畢 ---')
}

// 執行腳本
seedDatabase()
