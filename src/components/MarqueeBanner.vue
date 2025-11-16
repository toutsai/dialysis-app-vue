<template>
  <div v-if="htmlContent" class="marquee-banner">
    <div class="marquee-icon"><i class="fas fa-bullhorn"></i></div>
    <div class="marquee-content-wrapper">
      <div class="marquee-content">
        <!-- ✨ 核心修改: 使用 v-html 來渲染 HTML 內容 -->
        <div class="content-inner" v-html="htmlContent"></div>
        <!-- 為了無縫滾動，我們將內容複製一份 -->
        <div class="content-inner duplicated-content" v-html="htmlContent"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/composables/useFirebase'

const htmlContent = ref('') // 現在儲存的是 HTML 字串
let unsubscribe = null

onMounted(() => {
  const marqueeRef = doc(db, 'site_config', 'marquee_announcements')
  unsubscribe = onSnapshot(marqueeRef, (docSnap) => {
    if (docSnap.exists() && docSnap.data().content) {
      // 讀取 content 欄位
      htmlContent.value = docSnap.data().content
    } else {
      htmlContent.value = ''
    }
  })
})

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe()
  }
})
</script>

<style scoped>
.marquee-banner {
  display: flex;
  align-items: center;
  background-color: #fffbe3;
  color: #b45309;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  overflow: hidden;
  font-weight: 500;
  margin-bottom: 1.5rem;
  border: 1px solid #fde68a;
  height: 42px; /* 固定高度讓版面更穩定 */
}

.marquee-icon {
  margin-right: 1rem;
  font-size: 1.2rem;
}

.marquee-content-wrapper {
  flex-grow: 1;
  overflow: hidden;
}

.marquee-content {
  display: flex; /* 讓兩個 inner div 並排 */
  width: fit-content; /* 讓容器寬度由內容決定 */
  animation: scroll-left 30s linear infinite;
}

.marquee-content:hover {
  animation-play-state: paused;
}

.content-inner {
  /* 讓 v-html 渲染出來的內容都在一行內 */
  display: flex;
  align-items: center;
  gap: 1.5rem; /* 公告之間的間距 */
  white-space: nowrap;
}

/* 針對 v-html 內部的 p 標籤做樣式重置 */
.content-inner > :deep(p) {
  margin: 0;
}

.duplicated-content {
  padding-left: 3rem; /* 複製內容前的間距 */
}

@keyframes scroll-left {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}
</style>
