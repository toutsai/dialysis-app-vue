import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '@app/core/services/auth.service';

type CollabTab = 'board' | 'inbox' | 'sent';

@Component({
  selector: 'app-collaboration',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './collaboration.component.html',
  styleUrl: './collaboration.component.css'
})
export class CollaborationComponent {
  protected authService = inject(AuthService);

  tabs: { key: CollabTab; label: string }[] = [
    { key: 'board', label: '留言板' },
    { key: 'inbox', label: '收件匣' },
    { key: 'sent', label: '已發送' }
  ];

  activeTab = signal<CollabTab>('board');

  setTab(tab: CollabTab): void {
    this.activeTab.set(tab);
  }

  get tabLabel(): string {
    return this.tabs.find(t => t.key === this.activeTab())?.label ?? '';
  }
}
