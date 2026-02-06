import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, getDocs, doc, getDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';

interface DiagnosticCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'checking';
  message: string;
  duration: number;
}

@Component({
  selector: 'app-system-diagnostic',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './system-diagnostic.component.html',
  styleUrl: './system-diagnostic.component.css'
})
export class SystemDiagnosticComponent implements OnInit {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  checks: DiagnosticCheck[] = [];
  isRunning = false;
  lastRunTime: string = '';

  ngOnInit(): void {
    this.initChecks();
  }

  initChecks(): void {
    this.checks = [
      { name: 'Firebase 連線', status: 'checking', message: '', duration: 0 },
      { name: 'Firestore 讀取', status: 'checking', message: '', duration: 0 },
      { name: '使用者驗證', status: 'checking', message: '', duration: 0 },
      { name: '瀏覽器相容性', status: 'checking', message: '', duration: 0 },
      { name: '網路連線', status: 'checking', message: '', duration: 0 },
      { name: 'Local Storage', status: 'checking', message: '', duration: 0 }
    ];
  }

  async runDiagnostics(): Promise<void> {
    this.isRunning = true;
    this.initChecks();

    await this.checkFirebaseConnection();
    await this.checkFirestoreRead();
    await this.checkAuth();
    this.checkBrowserCompat();
    this.checkNetwork();
    this.checkLocalStorage();

    this.isRunning = false;
    this.lastRunTime = new Date().toLocaleString('zh-TW');
  }

  private async checkFirebaseConnection(): Promise<void> {
    const start = performance.now();
    try {
      const testRef = doc(this.firestore, '_diagnostics', 'ping');
      await getDoc(testRef);
      this.updateCheck('Firebase 連線', 'pass', '連線正常', performance.now() - start);
    } catch (err: any) {
      this.updateCheck('Firebase 連線', 'fail', err.message || '連線失敗', performance.now() - start);
    }
  }

  private async checkFirestoreRead(): Promise<void> {
    const start = performance.now();
    try {
      const colRef = collection(this.firestore, 'patients');
      const snapshot = await getDocs(colRef);
      this.updateCheck(
        'Firestore 讀取',
        'pass',
        `成功讀取 ${snapshot.size} 筆記錄`,
        performance.now() - start
      );
    } catch (err: any) {
      this.updateCheck('Firestore 讀取', 'fail', err.message || '讀取失敗', performance.now() - start);
    }
  }

  private async checkAuth(): Promise<void> {
    const start = performance.now();
    const user = this.auth.currentUser;
    if (user) {
      this.updateCheck('使用者驗證', 'pass', `已登入: ${user.email}`, performance.now() - start);
    } else {
      this.updateCheck('使用者驗證', 'warn', '未登入', performance.now() - start);
    }
  }

  private checkBrowserCompat(): void {
    const start = performance.now();
    const issues: string[] = [];

    if (!window.fetch) issues.push('缺少 Fetch API');
    if (!window.Promise) issues.push('缺少 Promise');
    if (!window.localStorage) issues.push('缺少 LocalStorage');
    if (!window.indexedDB) issues.push('缺少 IndexedDB');

    if (issues.length === 0) {
      this.updateCheck('瀏覽器相容性', 'pass', '所有功能支援正常', performance.now() - start);
    } else {
      this.updateCheck('瀏覽器相容性', 'warn', issues.join(', '), performance.now() - start);
    }
  }

  private checkNetwork(): void {
    const start = performance.now();
    if (navigator.onLine) {
      this.updateCheck('網路連線', 'pass', '網路連線正常', performance.now() - start);
    } else {
      this.updateCheck('網路連線', 'fail', '無網路連線', performance.now() - start);
    }
  }

  private checkLocalStorage(): void {
    const start = performance.now();
    try {
      const testKey = '__diag_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      this.updateCheck('Local Storage', 'pass', '讀寫正常', performance.now() - start);
    } catch {
      this.updateCheck('Local Storage', 'fail', '無法使用 Local Storage', performance.now() - start);
    }
  }

  private updateCheck(name: string, status: DiagnosticCheck['status'], message: string, duration: number): void {
    const check = this.checks.find(c => c.name === name);
    if (check) {
      check.status = status;
      check.message = message;
      check.duration = Math.round(duration);
    }
  }

  getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      pass: '\u2713',
      fail: '\u2717',
      warn: '\u26A0',
      checking: '\u25CB'
    };
    return icons[status] || '?';
  }

  get passCount(): number {
    return this.checks.filter(c => c.status === 'pass').length;
  }

  get failCount(): number {
    return this.checks.filter(c => c.status === 'fail').length;
  }

  get warnCount(): number {
    return this.checks.filter(c => c.status === 'warn').length;
  }
}
