import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import ReactQuill from 'react-quill-new'
import 'react-quill-new/dist/quill.snow.css'
import DOMPurify from 'dompurify'
import styles from '@/components/dialogs/MarqueeEditDialog.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MarqueeEditDialogProps {
  isVisible: boolean
  initialContent?: string
  onClose: () => void
  onSave: (content: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MarqueeEditDialog({
  isVisible,
  initialContent = '',
  onClose,
  onSave,
}: MarqueeEditDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [content, setContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)

  // Quill modules configuration
  const quillModules = useMemo(
    () => ({
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ color: [] }, { background: [] }],
        [{ align: [] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link'],
        ['clean'],
      ],
    }),
    []
  )

  const quillFormats = useMemo(
    () => [
      'header',
      'bold',
      'italic',
      'underline',
      'strike',
      'color',
      'background',
      'align',
      'list',
      'link',
    ],
    []
  )

  // Initialize content when opening
  useEffect(() => {
    if (isVisible) {
      setContent(initialContent)
      setPreviewMode(false)
    }
  }, [isVisible, initialContent])

  // Keyboard
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isVisible, handleKeyDown])

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose()
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const sanitized = DOMPurify.sanitize(content)
      await onSave(sanitized)
    } finally {
      setIsSaving(false)
    }
  }

  // Check if content is essentially empty (Quill produces <p><br></p> for empty editor)
  const isContentEmpty = !content || content === '<p><br></p>' || content.replace(/<[^>]*>/g, '').trim() === ''

  const sanitizedPreview = DOMPurify.sanitize(content)

  if (!isVisible) return null

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="marquee-title">
        {/* Header */}
        <div className={styles.header}>
          <h2 id="marquee-title" className={styles.title}>
            跑馬燈訊息編輯
          </h2>
          <div className={styles.headerActions}>
            <div className={styles.toggleGroup}>
              <button
                type="button"
                className={`${styles.toggleButton} ${!previewMode ? styles.toggleActive : ''}`}
                onClick={() => setPreviewMode(false)}
              >
                編輯
              </button>
              <button
                type="button"
                className={`${styles.toggleButton} ${previewMode ? styles.toggleActive : ''}`}
                onClick={() => setPreviewMode(true)}
              >
                預覽
              </button>
            </div>
            <button type="button" className={styles.closeButton} onClick={onClose} aria-label="關閉">
              &times;
            </button>
          </div>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {previewMode ? (
            <div className={styles.previewSection}>
              <div className={styles.previewLabel}>跑馬燈預覽效果：</div>
              <div className={styles.marqueePreviewContainer}>
                <div className={styles.marqueePreviewTrack}>
                  <div
                    className={styles.marqueeContent}
                    dangerouslySetInnerHTML={{ __html: sanitizedPreview }}
                  />
                </div>
              </div>
              <div className={styles.staticPreviewLabel}>靜態內容預覽：</div>
              <div
                className={styles.staticPreview}
                dangerouslySetInnerHTML={{ __html: sanitizedPreview }}
              />
            </div>
          ) : (
            <div className={styles.editorSection}>
              <div className={styles.editorLabel}>
                編輯跑馬燈顯示內容（支援富文字格式）：
              </div>
              <div className={styles.editorWrapper}>
                <ReactQuill
                  theme="snow"
                  value={content}
                  onChange={setContent}
                  modules={quillModules}
                  formats={quillFormats}
                  placeholder="請輸入跑馬燈訊息內容..."
                />
              </div>
              <div className={styles.editorHint}>
                提示：可使用粗體、顏色、連結等格式來強調重要訊息。
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.clearButton}
            onClick={() => setContent('')}
            disabled={isContentEmpty}
          >
            清除內容
          </button>
          <div className={styles.footerRight}>
            <button type="button" className={styles.cancelButton} onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className={styles.submitButton}
              onClick={handleSave}
              disabled={isSaving || isContentEmpty}
            >
              {isSaving ? '儲存中...' : '儲存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
