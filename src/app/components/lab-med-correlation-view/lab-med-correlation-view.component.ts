import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

interface LabEntry {
  code: string;
  name: string;
  value: number;
  date: string;
  unit: string;
}

interface MedSlot {
  id: string;
  name: string;
  dose: string;
  frequency: string;
  startDate: string;
  endDate: string;
}

interface CorrelationRow {
  labName: string;
  labCode: string;
  labValue: number;
  labUnit: string;
  labDate: string;
  relatedMeds: MedSlot[];
  trend: 'up' | 'down' | 'stable' | 'unknown';
}

@Component({
  selector: 'app-lab-med-correlation-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lab-med-correlation-view.component.html',
  styleUrl: './lab-med-correlation-view.component.css'
})
export class LabMedCorrelationViewComponent implements OnChanges {
  @Input() patient: any = null;
  @Input() slotList: MedSlot[] = [];

  correlations: CorrelationRow[] = [];

  private labMedMap: Record<string, string[]> = {
    K: ['Kayexalate', 'Kalimate'],
    P: ['鈣片', 'Phosphate Binder', 'Renvela'],
    CA: ['鈣片', 'Calcitriol', 'One-alpha'],
    HB: ['EPO', 'Eprex', 'Aranesp', '鐵劑'],
    FERR: ['鐵劑', 'Venofer'],
    PTH: ['Calcitriol', 'One-alpha', 'Cinacalcet'],
    ALB: ['營養補充'],
    GOT: ['降血脂藥'],
    GPT: ['降血脂藥']
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['patient'] || changes['slotList']) {
      this.buildCorrelations();
    }
  }

  buildCorrelations(): void {
    if (!this.patient?.labData) {
      this.correlations = [];
      return;
    }

    const labData = this.patient.labData;
    this.correlations = [];

    for (const [code, medNames] of Object.entries(this.labMedMap)) {
      const lab = labData[code];
      if (!lab) continue;

      const relatedMeds = this.slotList.filter(slot =>
        medNames.some(name =>
          slot.name.toLowerCase().includes(name.toLowerCase())
        )
      );

      this.correlations.push({
        labName: lab.name || code,
        labCode: code,
        labValue: lab.value,
        labUnit: lab.unit || '',
        labDate: lab.date || '',
        relatedMeds,
        trend: this.determineTrend(lab)
      });
    }
  }

  private determineTrend(lab: any): 'up' | 'down' | 'stable' | 'unknown' {
    if (!lab.previousValue || lab.previousValue === lab.value) return 'stable';
    if (lab.value > lab.previousValue) return 'up';
    if (lab.value < lab.previousValue) return 'down';
    return 'unknown';
  }

  getTrendIcon(trend: string): string {
    const icons: Record<string, string> = {
      up: '\u2191',
      down: '\u2193',
      stable: '\u2192',
      unknown: '-'
    };
    return icons[trend] || '-';
  }

  getTrendClass(trend: string): string {
    return `trend-${trend}`;
  }

  hasCorrelations(): boolean {
    return this.correlations.length > 0;
  }
}
