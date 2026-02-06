import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '@app/core/services/auth.service';

interface GuideSection {
  id: string;
  title: string;
  content: string;
}

@Component({
  selector: 'app-usage-guide',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './usage-guide.component.html',
  styleUrl: './usage-guide.component.css'
})
export class UsageGuideComponent {
  protected authService = inject(AuthService);

  expandedSections = signal<Set<string>>(new Set());

  sections: GuideSection[] = [
    {
      id: 'getting-started',
      title: '快速入門',
      content: '歡迎使用部北透析管理平台。登入後您將看到每日排程表，可從左側選單導覽至各功能頁面。'
    },
    {
      id: 'schedule',
      title: '排程管理',
      content: '排程管理包含每日排程表、週排班表、門急住床位總表等功能。您可以檢視和管理透析排程。'
    },
    {
      id: 'patients',
      title: '病人管理',
      content: '在病人管理頁面中，您可以新增、編輯和查詢病人資料。支援門診（OPD）、住院（IPD）、急診（ER）分類。'
    },
    {
      id: 'orders',
      title: '藥囑管理',
      content: '藥囑管理提供透析相關藥物醫囑的檢視、新增及確認功能。需具備相應權限才能進行操作。'
    },
    {
      id: 'collaboration',
      title: '協作訊息',
      content: '協作訊息中心包含留言板、收件匣和已發送功能，方便團隊成員之間溝通交流。'
    },
    {
      id: 'reports',
      title: '統計報表',
      content: '統計報表提供透析次數統計、病人人數統計、護理工時統計等報表，支援匯出功能。'
    },
    {
      id: 'kidit',
      title: 'KiDit 申報',
      content: 'KiDit 申報工作站用於產生健保申報檔案，包含資料驗證和歷史申報查詢功能。'
    },
    {
      id: 'account',
      title: '帳號與安全',
      content: '在帳號設定中您可以變更密碼。建議定期更換密碼以確保帳號安全。如需其他帳號調整，請聯繫管理員。'
    }
  ];

  toggleSection(sectionId: string): void {
    const current = new Set(this.expandedSections());
    if (current.has(sectionId)) {
      current.delete(sectionId);
    } else {
      current.add(sectionId);
    }
    this.expandedSections.set(current);
  }

  isSectionExpanded(sectionId: string): boolean {
    return this.expandedSections().has(sectionId);
  }
}
