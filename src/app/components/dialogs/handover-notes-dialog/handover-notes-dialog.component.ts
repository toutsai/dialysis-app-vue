import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface HandoverNote {
  id: string;
  shift: string;
  date: string;
  author: string;
  content: string;
  category: string;
  isResolved: boolean;
}

@Component({
  selector: 'app-handover-notes-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './handover-notes-dialog.component.html',
  styleUrl: './handover-notes-dialog.component.css'
})
export class HandoverNotesDialogComponent implements OnChanges {
  @Input() isVisible = false;
  @Input() patientId = '';
  @Output() closed = new EventEmitter<void>();

  notes: HandoverNote[] = [];
  isLoading = false;
  newNote = '';
  selectedCategory = 'general';
  activeShift = 'all';

  categories = [
    { value: 'general', label: '一般' },
    { value: 'medication', label: '用藥' },
    { value: 'condition', label: '病情' },
    { value: 'procedure', label: '處置' },
    { value: 'lab', label: '檢驗' },
    { value: 'family', label: '家屬溝通' }
  ];

  shifts = [
    { value: 'all', label: '全部' },
    { value: 'day', label: '白班' },
    { value: 'evening', label: '小夜' },
    { value: 'night', label: '大夜' }
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible && this.patientId) {
      this.loadNotes();
    }
  }

  private loadNotes(): void {
    this.isLoading = true;
    this.notes = [];
    setTimeout(() => {
      this.isLoading = false;
    }, 500);
  }

  get filteredNotes(): HandoverNote[] {
    if (this.activeShift === 'all') return this.notes;
    return this.notes.filter(n => n.shift === this.activeShift);
  }

  setShift(shift: string): void {
    this.activeShift = shift;
  }

  addNote(): void {
    if (!this.newNote.trim()) return;
    const note: HandoverNote = {
      id: Date.now().toString(),
      shift: 'day',
      date: new Date().toISOString(),
      author: '',
      content: this.newNote.trim(),
      category: this.selectedCategory,
      isResolved: false
    };
    this.notes.unshift(note);
    this.newNote = '';
  }

  toggleResolved(note: HandoverNote): void {
    note.isResolved = !note.isResolved;
  }

  getCategoryLabel(value: string): string {
    const found = this.categories.find(c => c.value === value);
    return found ? found.label : value;
  }

  onClose(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('dialog-overlay')) {
      this.onClose();
    }
  }
}
