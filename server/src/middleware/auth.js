// 認證中介軟體
import jwt from 'jsonwebtoken'
import { getDatabase } from '../db/init.js'

// JWT 密鑰 (生產環境應從環境變數讀取)
const JWT_SECRET = process.env.JWT_SECRET || 'dialysis-local-secret-key-change-in-production'
const JWT_EXPIRES_IN = '24h'

/**
 * 產生 JWT Token
 */
export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      uid: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      title: user.title
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  )
}

/**
 * 驗證 JWT Token
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch (error) {
    return null
  }
}

/**
 * 認證中介軟體 - 驗證使用者是否已登入
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: true,
      message: '未提供認證令牌'
    })
  }

  const token = authHeader.split(' ')[1]
  const decoded = verifyToken(token)

  if (!decoded) {
    return res.status(401).json({
      error: true,
      message: '無效或過期的認證令牌'
    })
  }

  // 將使用者資訊附加到請求物件
  req.user = decoded
  next()
}

/**
 * 角色權限層級
 */
const roleHierarchy = {
  viewer: 1,
  contributor: 2,
  editor: 3,
  admin: 4
}

/**
 * 檢查使用者是否有足夠權限
 */
export function hasPermission(userRole, requiredRole) {
  const userLevel = roleHierarchy[userRole] || 0
  const requiredLevel = roleHierarchy[requiredRole] || 999
  return userLevel >= requiredLevel
}

/**
 * 權限檢查中介軟體工廠
 * @param {string} requiredRole - 所需的最低權限角色
 */
export function requireRole(requiredRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: true,
        message: '請先登入'
      })
    }

    if (!hasPermission(req.user.role, requiredRole)) {
      return res.status(403).json({
        error: true,
        message: '權限不足'
      })
    }

    next()
  }
}

/**
 * 便捷的權限中介軟體
 */
export const isViewer = [authenticate]
export const isContributor = [authenticate, requireRole('contributor')]
export const isEditor = [authenticate, requireRole('editor')]
export const isAdmin = [authenticate, requireRole('admin')]

/**
 * 記錄稽核日誌
 */
export async function logAudit(action, userId, userName, collection, documentId, details = {}, success = true) {
  try {
    const db = getDatabase()
    const { v4: uuidv4 } = await import('uuid')

    db.prepare(`
      INSERT INTO audit_logs (id, action, user_id, user_name, collection_name, document_id, details, success, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `).run(
      uuidv4(),
      action,
      userId,
      userName,
      collection,
      documentId,
      JSON.stringify(details),
      success ? 1 : 0
    )

    db.close()
  } catch (error) {
    console.error('稽核日誌記錄失敗:', error)
  }
}
