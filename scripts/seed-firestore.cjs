// scripts/seed-firestore.js

const { initializeApp } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const { faker } = require('@faker-js/faker/locale/zh_TW')

// ===================================================================
// --- ✨ 設定區 ---
// ===================================================================

// 1. 您的 Firebase 專案 ID
const projectId = 'my-dialysis-app-develop' // ✅ 已根據您的要求設定

// 2. 各類病人的產生數量
const PATIENT_COUNTS = {
  outpatient: 200, // 門診
  inpatient: 12, // 住院
  emergency: 2, // 急診
}

// 3. 特殊感染疾病的病人數量
const INFECTION_COUNTS = {
  HBV: 15, // B型肝炎
  HCV: 2, // C型肝炎
  COVID: 2, // 新冠肺炎
  // 您可以隨時在這裡加入 HIV, RPR 等
}

// 4. 特殊透析模式的病人數量 (其餘皆為預設的 'HD')
const SPECIAL_MODES_COUNTS = {
  SLED: 3,
  PP: 1,
}

// ===================================================================
// --- 連接到 Firestore 模擬器 ---
// ===================================================================

// firebase-admin SDK 會自動偵測 FIRESTORE_EMULATOR_HOST 環境變數
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'

initializeApp({ projectId })
const db = getFirestore()

// ===================================================================
// --- 輔助函式 ---
// ===================================================================

// 產生一個隨機的病歷號 (7位數)
function generateMedicalRecordNumber() {
  return faker.string.numeric(7)
}

// 根據類型建立一個基礎的假病人資料
function createRandomPatient(type) {
  const gender = faker.helpers.arrayElement(['male', 'female'])
  const lastName = faker.person.lastName()
  const firstName = faker.person.firstName(gender)
  const birthDate = faker.date.birthdate({ min: 20, max: 90, mode: 'age' })

  // 將英文類型對應到中文
  const typeMapping = {
    outpatient: '門診',
    inpatient: '住院',
    emergency: '急診',
  }

  return {
    name: `${lastName}${firstName}`,
    medicalRecordNumber: generateMedicalRecordNumber(),
    gender: gender === 'male' ? '男' : '女',
    birthDate: Timestamp.fromDate(birthDate),
    contact: {
      phone: faker.phone.number(),
      address: faker.location.streetAddress(true),
    },
    patientType: typeMapping[type] || '未知',
    dialysisMode: 'HD', // 預設為 HD
    medicalNotes: '', // 預設醫療註記為空
    isDeleted: false,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  }
}

// ===================================================================
// --- ✨ 主要執行函式 ---
// ===================================================================

async function seedDatabase() {
  const totalPatients = Object.values(PATIENT_COUNTS).reduce((a, b) => a + b, 0)
  console.log(`⏳ 準備產生總共 ${totalPatients} 筆病人資料...`)

  let allPatients = []

  // --- 步驟 1: 根據設定的數量，產生所有基礎病人 ---
  console.log('  -> 正在產生基礎病人資料...')
  for (const [type, count] of Object.entries(PATIENT_COUNTS)) {
    for (let i = 0; i < count; i++) {
      allPatients.push(createRandomPatient(type))
    }
  }

  // --- 步驟 2: 隨機打亂所有病人順序 ---
  // 這是非常重要的一步！確保特殊條件能隨機分配給不同類型的病人。
  console.log('  -> 正在隨機分配特殊條件...')
  allPatients = faker.helpers.shuffle(allPatients)

  let currentIndex = 0

  // --- 步驟 3: 分配特殊感染疾病 ---
  for (const [infection, count] of Object.entries(INFECTION_COUNTS)) {
    for (let i = 0; i < count; i++) {
      if (currentIndex < allPatients.length) {
        const patient = allPatients[currentIndex]
        // 附加註記，如果已有註記則用逗號分隔
        patient.medicalNotes += (patient.medicalNotes ? ', ' : '') + infection
        currentIndex++
      }
    }
  }

  // --- 步驟 4: 分配特殊透析模式 ---
  // 我們從剛剛分配完感染疾病的索引繼續，確保這些病人不會跟感染者重疊
  for (const [mode, count] of Object.entries(SPECIAL_MODES_COUNTS)) {
    for (let i = 0; i < count; i++) {
      if (currentIndex < allPatients.length) {
        allPatients[currentIndex].dialysisMode = mode
        currentIndex++
      }
    }
  }

  // --- 步驟 5: 將最終資料寫入 Firestore ---
  console.log(`  -> 正在將 ${allPatients.length} 筆資料寫入 Firestore...`)
  const batch = db.batch()
  const patientsCollection = db.collection('patients')

  allPatients.forEach((patient) => {
    const newPatientRef = patientsCollection.doc()
    batch.set(newPatientRef, patient)
  })

  try {
    await batch.commit()
    console.log(`✅ 成功！已將 ${allPatients.length} 筆病人資料寫入 Firestore 模擬器。`)
    console.log(
      `   - 門診: ${PATIENT_COUNTS.outpatient}, 住院: ${PATIENT_COUNTS.inpatient}, 急診: ${PATIENT_COUNTS.emergency}`,
    )
    const totalInfections = Object.values(INFECTION_COUNTS).reduce((a, b) => a + b, 0)
    const totalSpecialModes = Object.values(SPECIAL_MODES_COUNTS).reduce((a, b) => a + b, 0)
    console.log(`   - 特殊疾病: ${totalInfections} 人, 特殊透析: ${totalSpecialModes} 人`)
  } catch (error) {
    console.error('❌ 寫入資料時發生錯誤:', error)
  }
}

// 執行腳本
seedDatabase()
