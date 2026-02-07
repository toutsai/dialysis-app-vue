import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-daily-draft-list-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './daily-draft-list-dialog.component.html',
  styleUrl: './daily-draft-list-dialog.component.css'
})
export class DailyDraftListDialogComponent {
  @Input() isVisible = false;
  @Input() isLoading = false;
  @Input() drafts: any[] = [];
  @Input() patientsInShift: any[] = [];
  @Input() targetDate = '';
  @Output() closeEvent = new EventEmitter<void>();

  // These would be imported from constants
  readonly medicationGroups: any[] = [];
  readonly allMeds: any[] = [];

  get shiftDisplayName(): string {
    if (this.patientsInShift.length === 0) return '全日';
    const shiftCode = this.patientsInShift[0]?.shift;
    const map: Record<string, string> = { early: '早班', noon: '午班', late: '晚班' };
    return map[shiftCode] || '未知班別';
  }

  get checklistData(): any[] {
    if (this.isLoading || this.patientsInShift.length === 0) return [];

    const draftsMap = new Map<string, any>();
    this.drafts.forEach((draft: any) => {
      const key = `${draft.patientId}-${draft.orderCode}`;
      draftsMap.set(key, draft);
    });

    return this.patientsInShift.map((patient: any) => {
      const patientMeds: Record<string, any> = {};
      this.allMeds.forEach((med: any) => {
        const key = `${patient.id}-${med.code}`;
        const draft = draftsMap.get(key);
        if (draft) {
          patientMeds[med.code] = {
            dose: draft.dose,
            unit: draft.unit,
            freqOrNote: draft.orderType === 'injection' ? draft.note : draft.frequency,
          };
        } else {
          patientMeds[med.code] = null;
        }
      });
      return { patient, meds: patientMeds };
    });
  }

  closeDialog(): void {
    this.closeEvent.emit();
  }

  exportToExcel(): void {
    // XLSX export logic would go here
    console.log('Export to Excel');
  }
}
