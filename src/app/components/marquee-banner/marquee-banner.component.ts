import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  collection, query, orderBy, onSnapshot, type Unsubscribe
} from 'firebase/firestore';
import { FirebaseService } from '@services/firebase.service';

interface MarqueeItem {
  id: string;
  text: string;
  active: boolean;
  priority: number;
  createdAt: unknown;
}

@Component({
  selector: 'app-marquee-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './marquee-banner.component.html',
  styleUrl: './marquee-banner.component.css'
})
export class MarqueeBannerComponent implements OnInit, OnDestroy {
  private firebase = inject(FirebaseService);
  private unsubscribe: Unsubscribe | null = null;

  messages: MarqueeItem[] = [];
  combinedText = '';
  isPaused = false;

  ngOnInit(): void {
    const marqueeRef = collection(this.firebase.db, 'marquee');
    const q = query(marqueeRef, orderBy('priority', 'desc'));

    this.unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as MarqueeItem));
      this.messages = items.filter(item => item.active !== false);
      this.combinedText = this.messages.map(m => m.text).join('　　　★　　　');
    }, (err: Error) => {
      console.error('Failed to load marquee messages:', err);
      this.messages = [];
      this.combinedText = '';
    });
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
  }

  onMouseEnter(): void {
    this.isPaused = true;
  }

  onMouseLeave(): void {
    this.isPaused = false;
  }
}
