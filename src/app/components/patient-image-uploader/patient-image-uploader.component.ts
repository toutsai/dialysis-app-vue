import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { inject } from '@angular/core';

@Component({
  selector: 'app-patient-image-uploader',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './patient-image-uploader.component.html',
  styleUrl: './patient-image-uploader.component.css'
})
export class PatientImageUploaderComponent {
  @Input() patient: any = null;
  @Output() uploadSuccess = new EventEmitter<{ url: string; path: string }>();
  @Output() uploadError = new EventEmitter<string>();

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement!: ElementRef<HTMLCanvasElement>;

  private storage = inject(Storage);
  private stream: MediaStream | null = null;

  isUploading = false;
  isCameraActive = false;
  previewUrl: string | null = null;
  capturedBlob: Blob | null = null;
  uploadProgress = 0;
  errorMessage = '';

  async startCamera(): Promise<void> {
    this.errorMessage = '';
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 640, height: 480 }
      });
      this.isCameraActive = true;
      setTimeout(() => {
        if (this.videoElement?.nativeElement) {
          this.videoElement.nativeElement.srcObject = this.stream;
        }
      });
    } catch (err: any) {
      this.errorMessage = '無法啟動相機: ' + (err.message || '未知錯誤');
      this.uploadError.emit(this.errorMessage);
    }
  }

  capturePhoto(): void {
    if (!this.videoElement?.nativeElement || !this.canvasElement?.nativeElement) return;

    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        this.capturedBlob = blob;
        this.previewUrl = URL.createObjectURL(blob);
        this.stopCamera();
      }
    }, 'image/jpeg', 0.85);
  }

  stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.isCameraActive = false;
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      this.errorMessage = '請選擇圖片檔案';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.errorMessage = '檔案大小不可超過 10MB';
      return;
    }

    this.capturedBlob = file;
    this.previewUrl = URL.createObjectURL(file);
    this.errorMessage = '';
  }

  triggerFileInput(): void {
    this.fileInput?.nativeElement?.click();
  }

  clearPreview(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
    }
    this.previewUrl = null;
    this.capturedBlob = null;
    this.errorMessage = '';
  }

  async uploadImage(): Promise<void> {
    if (!this.capturedBlob || !this.patient?.id) return;

    this.isUploading = true;
    this.uploadProgress = 0;
    this.errorMessage = '';

    try {
      const timestamp = Date.now();
      const path = `patients/${this.patient.id}/images/${timestamp}.jpg`;
      const storageRef = ref(this.storage, path);

      await uploadBytes(storageRef, this.capturedBlob, {
        contentType: 'image/jpeg',
        customMetadata: {
          patientId: this.patient.id,
          patientName: this.patient.name || '',
          uploadedAt: new Date().toISOString()
        }
      });

      const url = await getDownloadURL(storageRef);
      this.uploadProgress = 100;
      this.uploadSuccess.emit({ url, path });
      this.clearPreview();
    } catch (err: any) {
      this.errorMessage = '上傳失敗: ' + (err.message || '未知錯誤');
      this.uploadError.emit(this.errorMessage);
    } finally {
      this.isUploading = false;
    }
  }

  ngOnDestroy(): void {
    this.stopCamera();
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
    }
  }
}
