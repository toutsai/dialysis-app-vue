// scripts/seed-firestore.cjs (✨ 全功能版：建立使用者 + 病人 ✨)

const admin = require('firebase-admin') // 引入整個 admin SDK
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const { faker } = require('@faker-js/faker/locale/zh_TW')

// ===================================================================
// --- ✨ 設定區 ---
// ===================================================================
const projectId = 'my-dialysis-app-develop'

// --- 使用者設定 ---
const USERS_TO_CREATE = [
  {
    uid: 'admin',
    username: 'admin',
    password: 'admin123', // 登入用的密碼
    name: '管理員',
    role: 'admin',
  },
  {
    uid: 'editor',
    username: 'editor',
    password: '123456',
    name: '編輯人員',
    role: 'editor',
  },
  {
    uid: 'viewer',
    username: 'viewer',
    password: '123456',
    name: '檢視人員',
    role: 'viewer',
  },
]

// --- 病人設定 (不變) ---
const PATIENT_COUNTS = { outpatient: 200, inpatient: 12, emergency: 2 }
const INFECTION_COUNTS = { HBV: 15, HCV: 2, COVID: 2 }
const SPECIAL_MODES_COUNTS = { SLED: 3, PP: 1 }
const FREQUENCIES = ['一三五', '二四六', '一四', '二五', '三六', '一五', '二六', '臨時']

// ===================================================================
// --- 連接到 Firestore 模擬器 ---
// ===================================================================
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
// ✨ 新增：連接到 Auth 模擬器
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'

admin.initializeApp({ projectId })
const db = getFirestore()

// ===================================================================
// --- 建立使用者的函式 ---
// ===================================================================
async function seedUsers() {
  console.log(`⏳ 正在建立 ${USERS_TO_CREATE.length} 位預設使用者...`)

  // 1. 建立 Auth 使用者
  const authPromises = USERS_TO_CREATE.map(async (user) => {
    try {
      await admin.auth().createUser({ uid: user.uid, displayName: user.name })
      console.log(`   -> ✅ Auth 使用者 '${user.username}' 已建立。`)
    } catch (error) {
      if (error.code === 'auth/uid-already-exists') {
        console.log(`   -> 🟡 Auth 使用者 '${user.username}' 已存在，跳過建立。`)
      } else {
        throw error // 如果是其他錯誤，就拋出
      }
    }
  })

  // 2. 建立 Firestore 中的使用者資料
  const firestoreBatch = db.batch()
  USERS_TO_CREATE.forEach((user) => {
    const userRef = db.collection('users').doc(user.uid)
    firestoreBatch.set(userRef, user)
  })

  // 同時執行 Auth 和 Firestore 的操作
  await Promise.all([...authPromises, firestoreBatch.commit()])
  console.log('✅ 所有使用者資料已寫入 Firestore。')
}

// ===================================================================
// --- 建立病人的函式 (不變) ---
// ===================================================================
async function seedPatients() {
  console.log(
    `\n⏳ 準備產生總共 ${Object.values(PATIENT_COUNTS).reduce((a, b) => a + b, 0)} 筆病人資料...`,
  )
  let allPatients = []
  // ... (此處省略了與上一版完全相同的病人產生邏輯) ...
  const createRandomPatient = (type) => {
    const gender = faker.helpers.arrayElement(['male', 'female'])
    const lastName = faker.person.lastName()
    const firstName = faker.person.firstName(gender)
    const birthDate = faker.date.birthdate({ min: 20, max: 90, mode: 'age' })
    const statusMapping = { outpatient: 'opd', inpatient: 'ipd', emergency: 'er' }
    return {
      name: `${lastName}${firstName}`,
      medicalRecordNumber: faker.string.numeric(7),
      gender: gender === 'male' ? '男' : '女',
      birthDate: Timestamp.fromDate(birthDate),
      contact: { phone: faker.phone.number(), address: faker.location.streetAddress(true) },
      status: statusMapping[type] || 'unknown',
      mode: 'HD',
      diseases: [],
      freq: faker.helpers.arrayElement(FREQUENCIES),
      medicalNotes: '',
      isDeleted: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }
  }
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

// ===================================================================
// --- ✨ 主要執行函式 ---
// ===================================================================
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
