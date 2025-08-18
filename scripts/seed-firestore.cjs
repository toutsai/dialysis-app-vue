// scripts/seed-firestore.cjs (✨ 修正版，會讀取 .env.emulator ✨)

// ✨ 核心修改 1：引入必要的模組，並設定要讀取的 .env 檔案路徑
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env.emulator') })

const admin = require('firebase-admin')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const { faker } = require('@faker-js/faker/locale/zh_TW')

// ✨ 核心修改 2：從 process.env 中讀取 Project ID，而不是寫死
const projectId = process.env.VITE_FIREBASE_PROJECT_ID

const USERS_TO_CREATE = [
  { uid: 'admin', username: 'admin', password: 'password123', name: '管理員', role: 'admin' },
  { uid: 'editor', username: 'editor', password: 'password123', name: '編輯人員', role: 'editor' },
  { uid: 'viewer', username: 'viewer', password: 'password123', name: '檢視人員', role: 'viewer' },
]
const PATIENT_COUNTS = { outpatient: 200, inpatient: 12, emergency: 2 }
const INFECTION_COUNTS = { HBV: 15, HCV: 2, COVID: 2, 'BC肝?': 3 }
const SPECIAL_MODES_COUNTS = { SLED: 3, PP: 1 }
const FREQUENCIES = [
  '一三五',
  '二四六',
  '一四',
  '二五',
  '三六',
  '每日',
  '每周一',
  '每周二',
  '每周三',
  '每周四',
  '每周五',
  '每周六',
]

// --- 環境設定 ---
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'

// ✨ 核心修改 3：增加一個安全檢查，確保 Project ID 有被成功讀取
if (!projectId) {
  console.error('❌ 錯誤：無法從 .env.emulator 檔案中讀取 VITE_FIREBASE_PROJECT_ID。')
  console.error('   請確認 scripts/seed-firestore.cjs 檔案中的路徑設定是否正確。')
  process.exit(1) // 如果沒有讀取到，就中斷腳本執行
}

admin.initializeApp({ projectId })
const db = getFirestore()

function createRandomPatient(type) {
  const createdAt = Timestamp.now()
  const updatedAt = new Date(
    createdAt.toMillis() + faker.number.int({ min: 0, max: 1000 * 60 * 60 * 24 * 5 }),
  )
  const statusMapping = { outpatient: 'opd', inpatient: 'ipd', emergency: 'er' }
  const patientStatus = {
    isFirstDialysis: { active: false, date: null },
    isPaused: { active: false, date: null },
    hasBloodDraw: { active: false, date: null },
  }
  if (Math.random() < 0.1) {
    patientStatus.isFirstDialysis.active = true
    patientStatus.isFirstDialysis.date = faker.date.recent({ days: 30 }).toISOString().split('T')[0]
  }
  if (Math.random() < 0.05) {
    patientStatus.isPaused.active = true
    patientStatus.isPaused.date = faker.date.recent({ days: 5 }).toISOString().split('T')[0]
  }
  if (Math.random() < 0.2) {
    patientStatus.hasBloodDraw.active = true
    patientStatus.hasBloodDraw.date = faker.date.recent({ days: 10 }).toISOString().split('T')[0]
  }
  const hospitalInfo = { source: '', transferOut: '' }
  if (Math.random() < 0.1) {
    hospitalInfo.source = `${faker.location.city()}醫院`
  }

  return {
    name: `${faker.person.lastName()}${faker.person.firstName()}`,
    medicalRecordNumber: faker.string.numeric(7),
    gender: faker.helpers.arrayElement(['男', '女']),
    birthDate: faker.date.birthdate({ min: 20, max: 90, mode: 'age' }),
    contact: { phone: faker.phone.number(), address: faker.location.streetAddress(true) },
    status: statusMapping[type] || 'unknown',
    mode: 'HD',
    diseases: [],
    freq: faker.helpers.arrayElement(FREQUENCIES),
    isDeleted: false,
    createdAt: createdAt,
    updatedAt: Timestamp.fromDate(updatedAt),
    patientStatus: patientStatus,
    hospitalInfo: hospitalInfo,
    inpatientReason: type !== 'opd' ? faker.lorem.words(3) : '',
    dialysisReason: type !== 'opd' ? faker.lorem.words(4) : '',
  }
}

async function seedUsers() {
  console.log(`⏳ 正在建立 ${USERS_TO_CREATE.length} 位預設使用者...`)
  const authPromises = USERS_TO_CREATE.map(async (user) => {
    try {
      await admin.auth().createUser({ uid: user.uid, displayName: user.name })
      console.log(`   -> ✅ Auth 使用者 '${user.username}' 已建立。`)
    } catch (error) {
      if (error.code === 'auth/uid-already-exists') {
        console.log(`   -> 🟡 Auth 使用者 '${user.username}' 已存在，跳過建立。`)
      } else {
        throw error
      }
    }
  })
  const firestoreBatch = db.batch()
  USERS_TO_CREATE.forEach((user) => {
    const userRef = db.collection('users').doc(user.uid)
    firestoreBatch.set(userRef, user)
  })
  await Promise.all([...authPromises, firestoreBatch.commit()])
  console.log('✅ 所有使用者資料已寫入 Firestore。')
}

async function seedPatients() {
  console.log(
    `\n⏳ 準備產生總共 ${Object.values(PATIENT_COUNTS).reduce((a, b) => a + b, 0)} 筆病人資料...`,
  )
  let allPatients = []
  for (const [type, count] of Object.entries(PATIENT_COUNTS)) {
    for (let i = 0; i < count; i++) {
      allPatients.push(createRandomPatient(type))
    }
  }
  allPatients = faker.helpers.shuffle(allPatients)
  let currentIndex = 0
  for (const [infection, count] of Object.entries(INFECTION_COUNTS)) {
    for (let i = 0; i < count; i++) {
      if (currentIndex < allPatients.length) {
        allPatients[currentIndex].diseases.push(infection)
        currentIndex++
      }
    }
  }
  for (const [mode, count] of Object.entries(SPECIAL_MODES_COUNTS)) {
    for (let i = 0; i < count; i++) {
      if (currentIndex < allPatients.length) {
        allPatients[currentIndex].mode = mode
        currentIndex++
      }
    }
  }
  const batch = db.batch()
  const patientsCollection = db.collection('patients')
  allPatients.forEach((patient) => {
    const newPatientRef = patientsCollection.doc()
    batch.set(newPatientRef, patient)
  })
  await batch.commit()
  console.log(`✅ 成功！已將 ${allPatients.length} 筆病人資料寫入 Firestore 模擬器。`)
}

async function seedAllData() {
  try {
    await seedUsers()
    await seedPatients()
    console.log('\n🎉🎉🎉 資料填充完成！🎉🎉🎉')
  } catch (error) {
    console.error('❌ 資料填充過程中發生嚴重錯誤:', error)
  }
}

seedAllData()
