import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-memo-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './memo-panel.component.html',
  styleUrl: './memo-panel.component.css'
})
export class MemoPanelComponent implements OnChanges {
  @Input() patientId = '';
  @Input() messages: any[] = [];

  filteredMessages: any[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['patientId'] || changes['messages']) {
      this.filterMessages();
    }
  }

  private filterMessages(): void {
    if (!this.patientId || !this.messages) {
      this.filteredMessages = [];
      return;
    }
    this.filteredMessages = this.messages.filter(
      (m: any) => m.patientId === this.patientId && m.category === 'message'
    );
  }

  formatTime(timestamp: any): string {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('zh-TW', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  }
}
