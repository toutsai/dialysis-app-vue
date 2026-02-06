import { useState, useRef, useCallback, useEffect } from 'react'
import { functions } from '@/firebase'
import { httpsCallable } from 'firebase/functions'
import styles from '@/components/PatientImageUploader.module.css'

interface PatientImageUploaderProps {
  patient: any
  onUploadSuccess?: () => void
  onUploadError?: (error: any) => void
}

type UploaderState = 'idle' | 'camera' | 'preview' | 'uploading' | 'success' | 'error'

export default function PatientImageUploader({
  patient,
  onUploadSuccess,
  onUploadError,
}: PatientImageUploaderProps) {
  const [state, setState] = useState<UploaderState>('idle')
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const patientId = patient?.id ?? ''
  const patientName = patient?.name ?? patientId

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop()
      }
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  const startCamera = useCallback(async () => {
    setErrorMessage('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setState('camera')
    } catch (err: any) {
      console.error('[PatientImageUploader] Camera access error:', err)
      setErrorMessage('無法存取攝影機，請檢查權限設定')
      setState('error')
    }
  }, [])

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)

    setCapturedImage(dataUrl)
    stopCamera()
    setState('preview')
  }, [stopCamera])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      if (!file.type.startsWith('image/')) {
        setErrorMessage('請選擇圖片檔案')
        setState('error')
        return
      }

      const reader = new FileReader()
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string
        setCapturedImage(dataUrl)
        setState('preview')
      }
      reader.onerror = () => {
        setErrorMessage('讀取檔案失敗')
        setState('error')
      }
      reader.readAsDataURL(file)

      // Reset file input
      e.target.value = ''
    },
    []
  )

  const handleRetake = useCallback(() => {
    setCapturedImage(null)
    setErrorMessage('')
    setState('idle')
  }, [])

  const handleUpload = useCallback(async () => {
    if (!capturedImage || !patientId) return

    setState('uploading')
    setUploadProgress(0)
    setErrorMessage('')

    try {
      // Simulate progress while waiting for Cloud Function
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return 90
          }
          return prev + 10
        })
      }, 300)

      const uploadToGDrive = httpsCallable<
        { patientId: string; imageData: string; fileName: string },
        { success: boolean; fileId?: string; message?: string }
      >(functions, 'uploadPatientImage')

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const fileName = `${patientId}_${timestamp}.jpg`

      const result = await uploadToGDrive({
        patientId,
        imageData: capturedImage,
        fileName,
      })

      clearInterval(progressInterval)
      setUploadProgress(100)

      if (result.data.success) {
        setState('success')
        onUploadSuccess?.()
      } else {
        throw new Error(result.data.message ?? '上傳失敗')
      }
    } catch (err: any) {
      console.error('[PatientImageUploader] Upload error:', err)
      const message = err?.message ?? '上傳失敗，請稍後再試'
      setErrorMessage(message)
      setState('error')
      onUploadError?.(err)
    }
  }, [capturedImage, patientId, onUploadSuccess, onUploadError])

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.headerTitle}>病人影像上傳</h3>
      </div>

      <div className={styles.body}>
        <div className={styles.patientLabel}>
          病人: {patientName} ({patientId})
        </div>

        {/* Preview / Camera Area */}
        <div className={styles.previewArea}>
          {state === 'camera' && (
            <video
              ref={videoRef}
              className={styles.video}
              playsInline
              muted
              autoPlay
            />
          )}
          {state === 'preview' && capturedImage && (
            <img
              src={capturedImage}
              alt="已拍攝影像"
              className={styles.previewImage}
            />
          )}
          {state === 'success' && capturedImage && (
            <img
              src={capturedImage}
              alt="已上傳影像"
              className={styles.previewImage}
            />
          )}
          {(state === 'idle' || state === 'error') && (
            <div className={styles.placeholderIcon}>
              <span className={styles.cameraIcon}>{'\uD83D\uDCF7'}</span>
              <span>點擊下方按鈕拍照或選擇檔案</span>
            </div>
          )}
          {state === 'uploading' && capturedImage && (
            <img
              src={capturedImage}
              alt="上傳中"
              className={styles.previewImage}
            />
          )}
        </div>
        <canvas ref={canvasRef} className={styles.canvas} />

        {/* Upload Progress */}
        {state === 'uploading' && (
          <div className={styles.progressContainer}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <div className={styles.progressLabel}>
              上傳中... {uploadProgress}%
            </div>
          </div>
        )}

        {/* Status Messages */}
        {state === 'success' && (
          <div className={styles.successMessage}>影像上傳成功</div>
        )}
        {state === 'error' && errorMessage && (
          <div className={styles.errorMessage}>{errorMessage}</div>
        )}

        {/* Controls */}
        <div className={styles.controls}>
          {state === 'idle' && (
            <>
              <button
                type="button"
                className={styles.startCameraBtn}
                onClick={startCamera}
                disabled={!patientId}
              >
                開啟攝影機
              </button>
              <button
                type="button"
                className={styles.fileBtn}
                onClick={() => fileInputRef.current?.click()}
                disabled={!patientId}
              >
                選擇檔案
              </button>
            </>
          )}

          {state === 'camera' && (
            <>
              <button
                type="button"
                className={styles.captureBtn}
                onClick={capturePhoto}
              >
                拍照
              </button>
              <button
                type="button"
                className={styles.retakeBtn}
                onClick={() => {
                  stopCamera()
                  setState('idle')
                }}
              >
                取消
              </button>
            </>
          )}

          {state === 'preview' && (
            <>
              <button
                type="button"
                className={styles.uploadBtn}
                onClick={handleUpload}
              >
                確認上傳
              </button>
              <button
                type="button"
                className={styles.retakeBtn}
                onClick={handleRetake}
              >
                重新拍攝
              </button>
            </>
          )}

          {state === 'success' && (
            <button
              type="button"
              className={styles.startCameraBtn}
              onClick={handleRetake}
            >
              再次拍攝
            </button>
          )}

          {state === 'error' && (
            <>
              <button
                type="button"
                className={styles.startCameraBtn}
                onClick={handleRetake}
              >
                重試
              </button>
            </>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className={styles.hiddenInput}
          onChange={handleFileSelect}
        />
      </div>
    </div>
  )
}
