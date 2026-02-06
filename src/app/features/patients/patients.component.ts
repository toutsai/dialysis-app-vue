import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '@app/core/services/auth.service';

type PatientTab = 'OPD' | 'IPD' | 'ER' | 'Deleted';

@Component({
  selector: 'app-patients',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './patients.component.html',
  styleUrl: './patients.component.css'
})
export class PatientsComponent {
  protected authService = inject(AuthService);

  tabs: { key: PatientTab; label: string }[] = [
    { key: 'OPD', label: '門診 (OPD)' },
    { key: 'IPD', label: '住院 (IPD)' },
    { key: 'ER', label: '急診 (ER)' },
    { key: 'Deleted', label: '已刪除' }
  ];

  activeTab = signal<PatientTab>('OPD');

  setTab(tab: PatientTab): void {
    this.activeTab.set(tab);
  }
}
