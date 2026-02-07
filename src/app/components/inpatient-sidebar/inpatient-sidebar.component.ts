import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-inpatient-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inpatient-sidebar.component.html',
  styleUrl: './inpatient-sidebar.component.css'
})
export class InpatientSidebarComponent implements OnChanges {
  @Input() patients: any[] = [];
  @Input() freqMap: Record<string, number[]> = {};
  @Input() targetDate = '';
  @Output() patientClick = new EventEmitter<any>();
  @Output() dragStart = new EventEmitter<any>();

  filterMode: 'daily' | 'frequency' = 'daily';
  selectedFreq = 'all';

  ngOnChanges(changes: SimpleChanges): void {
    // Reset filter when patients change
  }

  get filteredPatients(): any[] {
    if (!this.patients) return [];
    let filtered = this.patients.filter(p => !p.isDeleted && !p.isDiscontinued);

    if (this.filterMode === 'frequency' && this.selectedFreq !== 'all') {
      filtered = filtered.filter(p => p.freq === this.selectedFreq);
    } else if (this.filterMode === 'daily') {
      const dayOfWeek = this.getDayOfWeek();
      filtered = filtered.filter(p => this.shouldPatientBeScheduled(p, dayOfWeek));
    }

    return filtered.sort((a, b) => {
      if (a.status === 'ipd' && b.status !== 'ipd') return -1;
      if (a.status !== 'ipd' && b.status === 'ipd') return 1;
      if (a.status === 'er' && b.status !== 'er') return -1;
      if (a.status !== 'er' && b.status === 'er') return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  get frequencyOptions(): string[] {
    return Object.keys(this.freqMap);
  }

  onPatientClick(patient: any): void {
    this.patientClick.emit(patient);
  }

  onDragStart(event: DragEvent, patient: any): void {
    this.dragStart.emit({ event, patient });
  }

  getStatusText(status: string): string {
    return { opd: '門診', ipd: '住院', er: '急診' }[status] || status;
  }

  getStatusClass(status: string): string {
    return { opd: 'status-opd', ipd: 'status-ipd', er: 'status-er' }[status] || '';
  }

  private getDayOfWeek(): number {
    if (this.targetDate) {
      const date = new Date(this.targetDate);
      const day = date.getDay();
      return day === 0 ? 6 : day - 1;
    }
    return new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
  }

  private shouldPatientBeScheduled(patient: any, dayOfWeek: number): boolean {
    if (patient.freq === '臨時') return true;
    if (!patient.freq || !this.freqMap) return false;
    const scheduledDays = this.freqMap[patient.freq];
    return scheduledDays ? scheduledDays.includes(dayOfWeek) : false;
  }
}
