import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

interface InpatientEntry {
  id: string;
  name: string;
  chartNo: string;
  ward: string;
  bed: string;
  type: 'IPD' | 'ER';
  diagnosis: string;
  admitDate: string;
}

@Component({
  selector: 'app-inpatient-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './inpatient-sidebar.component.html',
  styleUrl: './inpatient-sidebar.component.css'
})
export class InpatientSidebarComponent {
  @Input() patients: InpatientEntry[] = [];
  @Input() scheduledIds: Set<string> = new Set();
  @Input() useDailyFilter: boolean = false;
  @Input() dayOfWeek: number = 0;

  get filteredPatients(): InpatientEntry[] {
    return this.patients;
  }

  get ipdPatients(): InpatientEntry[] {
    return this.filteredPatients.filter(p => p.type === 'IPD');
  }

  get erPatients(): InpatientEntry[] {
    return this.filteredPatients.filter(p => p.type === 'ER');
  }

  isScheduled(patientId: string): boolean {
    return this.scheduledIds.has(patientId);
  }

  onDragStart(patient: InpatientEntry, event: DragEvent): void {
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', patient.id);
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  getTypeLabel(type: string): string {
    return type === 'IPD' ? '住院' : '急診';
  }

  trackByPatient(_index: number, patient: InpatientEntry): string {
    return patient.id;
  }
}
