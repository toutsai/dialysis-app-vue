// 資料庫初始化腳本
import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DB_PATH = join(__dirname, '../../data/dialysis.db')

export function initDatabase() {
  console.log('🔧 正在初始化資料庫...')
  console.log(`📂 資料庫路徑: ${DB_PATH}`)

  // 確保資料目錄存在
  const dataDir = dirname(DB_PATH)
  import('fs').then(fs => {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }
  })

  const db = new Database(DB_PATH)

  // 啟用 WAL 模式 (更好的並發性能)
  db.pragma('journal_mode = WAL')

  // 讀取並執行 schema
  const schemaPath = join(__dirname, 'schema.sql')
  const schema = readFileSync(schemaPath, 'utf-8')

  db.exec(schema)

  console.log('✅ 資料庫 Schema 已建立')

  return db
}

export function getDatabase() {
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  return db
}

// 如果直接執行此檔案，則初始化資料庫
if (import.meta.url === `file://${process.argv[1]}`) {
  const db = initDatabase()

  // 建立預設管理員帳號
  import('bcryptjs').then(async (bcryptModule) => {
    const bcrypt = bcryptModule.default || bcryptModule
    const hashedPassword = bcrypt.hashSync('admin123', 10)
    const { v4: uuidv4 } = await import('uuid')

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO users (id, username, password_hash, name, title, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      uuidv4(),
      'admin',
      hashedPassword,
      '系統管理員',
      '管理員',
      'admin'
    )

    console.log('✅ 預設管理員帳號已建立')
    console.log('   使用者名稱: admin')
    console.log('   預設密碼: admin123')
    console.log('   ⚠️  請在首次登入後立即修改密碼！')

    db.close()
    console.log('\n🎉 資料庫初始化完成！')
  })
}
