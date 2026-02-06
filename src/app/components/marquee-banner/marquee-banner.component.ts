import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, collection, collectionData, query, orderBy } from '@angular/fire/firestore';
import { Subscription } from 'rxjs';

interface MarqueeItem {
  id: string;
  text: string;
  active: boolean;
  priority: number;
  createdAt: any;
}

@Component({
  selector: 'app-marquee-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './marquee-banner.component.html',
  styleUrl: './marquee-banner.component.css'
})
export class MarqueeBannerComponent implements OnInit, OnDestroy {
  private firestore = inject(Firestore);
  private subscription: Subscription | null = null;

  messages: MarqueeItem[] = [];
  combinedText = '';
  isPaused = false;

  ngOnInit(): void {
    const marqueeRef = collection(this.firestore, 'marquee');
    const q = query(marqueeRef, orderBy('priority', 'desc'));

    this.subscription = collectionData(q, { idField: 'id' }).subscribe({
      next: (items: MarqueeItem[]) => {
        this.messages = items.filter(item => item.active !== false);
        this.combinedText = this.messages.map(m => m.text).join('　　　★　　　');
      },
      error: (err) => {
        console.error('Failed to load marquee messages:', err);
        this.messages = [];
        this.combinedText = '';
      }
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  onMouseEnter(): void {
    this.isPaused = true;
  }

  onMouseLeave(): void {
    this.isPaused = false;
  }
}
