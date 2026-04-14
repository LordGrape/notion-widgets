/*
 * Sidebar Preact Component
 * Phase 4: Converted from sidebar.js
 */

import { Fragment, useEffect, useRef } from 'react';
import { signal, computed } from '@preact/signals-react';
import { items, courses, selectedCourse, selectedTopic, currentView, sidebarOpen } from '../signals';
import type { StudyItem, Course, SubDeck } from '../types';

// Tree node types
type TreeLevel = 'all' | 'course' | 'module' | 'subdeck' | 'topic';

interface SidebarSelection {
  level: TreeLevel;
  course: string | null;
  module: string | null;
  subDeck: string | null;
  topic: string | null;
}

// Local state (not persisted to SyncEngine)
export const sidebarSelection = signal<SidebarSelection>({ level: 'all', course: null, module: null, subDeck: null, topic: null });
export const sidebarExpanded = signal<Record<string, boolean>>({});

// Build course tree from items
function buildCourseTree(itemsData: Record<string, StudyItem>): Record<string, {
  topics: Record<string, { cards: string[]; dueCards: number }>;
  totalCards: number;
  dueCards: number;
  subDecks: Record<string, { cards: number; due: number }>;
}> {
  const tree: Record<string, {
    topics: Record<string, { cards: string[]; dueCards: number }>;
    totalCards: number;
    dueCards: number;
    subDecks: Record<string, { cards: number; due: number }>;
  }> = {};

  for (const id in itemsData) {
    const it = itemsData[id];
    if (!it || it.archived) continue;
    
    const course = it.course || 'Uncategorized';
    const topic = it.topic || 'General';
    
    if (!tree[course]) {
      tree[course] = { topics: {}, totalCards: 0, dueCards: 0, subDecks: {} };
    }
    if (!tree[course].topics[topic]) {
      tree[course].topics[topic] = { cards: [], dueCards: 0 };
    }
    
    tree[course].topics[topic].cards.push(id);
    tree[course].totalCards++;
    
    const sd = it.subDeck || '__ungrouped__';
    if (!tree[course].subDecks[sd]) {
      tree[course].subDecks[sd] = { cards: 0, due: 0 };
    }
    tree[course].subDecks[sd].cards++;
    
    // Check if due
    const f = it.fsrs;
    if (!f || !f.lastReview) {
      tree[course].dueCards++;
      tree[course].topics[topic].dueCards++;
      tree[course].subDecks[sd].due++;
    } else {
      const dueDate = new Date(f.due);
      if (dueDate <= new Date()) {
        tree[course].dueCards++;
        tree[course].topics[topic].dueCards++;
        tree[course].subDecks[sd].due++;
      }
    }
  }
  
  return tree;
}

export function Sidebar() {
  const tree = computed(() => buildCourseTree(items.value));
  const totalCards = computed(() => {
    let total = 0, due = 0;
    for (const c in tree.value) {
      total += tree.value[c].totalCards;
      due += tree.value[c].dueCards;
    }
    return { total, due };
  });
  
  const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;
  if (isEmbedded) return null;

  const handleToggle = (key: string) => {
    sidebarExpanded.value = { ...sidebarExpanded.value, [key]: !sidebarExpanded.value[key] };
  };

  const handleSelect = (level: TreeLevel, course: string | null, module: string | null = null, subDeck: string | null = null, topic: string | null = null) => {
    sidebarSelection.value = { level, course, module, subDeck, topic };
    selectedCourse.value = course ? courses.value[course] || null : null;
    selectedTopic.value = topic;
    
    if (course && !sidebarExpanded.value[course]) {
      sidebarExpanded.value = { ...sidebarExpanded.value, [course]: true };
    }
    
    // Call global handlers for compatibility
    if (typeof (window as unknown as { updateBreadcrumb?: () => void }).updateBreadcrumb === 'function') {
      (window as unknown as { updateBreadcrumb: () => void }).updateBreadcrumb();
    }
    if (typeof (window as unknown as { applySidebarFilter?: () => void }).applySidebarFilter === 'function') {
      (window as unknown as { applySidebarFilter: () => void }).applySidebarFilter();
    }
  };

  const courseNames = Object.keys(tree.value).sort();

  return (
    <aside className="sidebar" id="sidebar" aria-label="Sidebar">
      <div className="sb-header">
        <div className="logo">◆</div>
        <h1 className="sb-brand">STUDY ENGINE</h1>
        <button 
          className="sb-collapse-btn icon-btn" 
          id="sidebarCollapseBtn"
          onClick={() => sidebarOpen.value = !sidebarOpen.value}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
        >
          ◀
        </button>
      </div>

      <div className="sb-search">
        <input 
          type="text" 
          className="se-input sb-search-input" 
          id="sidebarSearch" 
          placeholder="Search cards..." 
          aria-label="Search cards"
        />
      </div>

      <div className="sb-actions">
        <button className="sb-action-btn" id="sbArchivedBtn" style={{ display: 'none' }}>
          <span>📦</span>
          <span>Archived</span>
          <span className="sb-badge" id="sbArchivedCount">0</span>
        </button>
      </div>

      <div className="sb-tree" id="sidebarTree">
        {/* All Courses row */}
        <div 
          className={`tree-node depth-0 tree-node-hoverable tree-node-root-actions ${sidebarSelection.value.level === 'all' ? 'active' : ''}`}
          onClick={() => handleSelect('all', null)}
          data-level="all"
        >
          <span className="tree-icon">📚</span>
          <span className="tree-label">All Courses</span>
          {totalCards.value.due > 0 && <span className="tree-badge">{totalCards.value.due}</span>}
          <span className="tree-hover-actions">
            <button 
              className="tree-action-btn" 
              data-action="create-course"
              title="Add deck"
              aria-label="Add deck"
              onClick={(e) => {
                e.stopPropagation();
                if (typeof (window as unknown as { openCreateCourseFlow?: () => void }).openCreateCourseFlow === 'function') {
                  (window as unknown as { openCreateCourseFlow: () => void }).openCreateCourseFlow();
                }
              }}
            >
              ＋
            </button>
          </span>
        </div>
        <div className="tree-section-divider"></div>

        {/* Course list */}
        {courseNames.map(courseName => {
          const courseData = courses.value[courseName] || {};
          const ct = tree.value[courseName];
          const color = courseData.color || '#8b5cf6';
          const isExpanded = sidebarExpanded.value[courseName] || false;
          const isActive = sidebarSelection.value.course === courseName;
          
          return (
            <Fragment key={courseName}>
              {/* Course row */}
              <div 
                className={`tree-node depth-0 tree-node-hoverable ${isActive ? 'active' : ''}`}
                data-level="course"
                data-course={courseName}
              >
                <span 
                  className={`tree-chevron ${isExpanded ? 'expanded' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggle(courseName);
                  }}
                ></span>
                <span className="tree-icon" style={{ color }}>●</span>
                <span className="tree-label" onClick={() => handleSelect('course', courseName)}>{courseName}</span>
                {ct.dueCards > 0 && <span className="tree-badge">{ct.dueCards}</span>}
                <span className="tree-hover-actions">
                  <button 
                    className="tree-action-btn" 
                    data-action="add-module"
                    title="Add subdeck"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggle(courseName);
                      // Show inline input would go here
                    }}
                  >
                    ＋
                  </button>
                  <button 
                    className="tree-action-btn" 
                    data-action="course-menu"
                    title="More options"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Context menu would go here
                    }}
                  >
                    ⋯
                  </button>
                </span>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="tree-children">
                  {/* Subdecks */}
                  {Object.keys(ct.subDecks).sort().map(sdName => {
                    const stats = ct.subDecks[sdName];
                    const isUngrouped = sdName === '__ungrouped__';
                    const label = isUngrouped ? 'Ungrouped' : sdName;
                    
                    return (
                      <div
                        key={sdName}
                        className={`tree-node depth-1 tree-node-hoverable ${
                          sidebarSelection.value.subDeck === sdName && sidebarSelection.value.course === courseName ? 'active' : ''
                        }`}
                        data-level="subdeck"
                        data-course={courseName}
                        data-subdeck={sdName}
                        onClick={() => handleSelect('subdeck', courseName, null, sdName)}
                      >
                        <span className="tree-chevron" style={{ visibility: 'hidden' }}></span>
                        <span className="subdeck-icon">{isUngrouped ? '📦' : '📂'}</span>
                        <span className="tree-label">{label}</span>
                        {stats.cards > 0 && <span className="tree-count">{stats.cards}</span>}
                        {stats.due > 0 && <span className="tree-badge">{stats.due}</span>}
                      </div>
                    );
                  })}

                  {/* Topics */}
                  {Object.keys(ct.topics).sort().map(topic => {
                    const topicData = ct.topics[topic];
                    const isTopicActive = sidebarSelection.value.topic === topic && sidebarSelection.value.course === courseName;
                    
                    return (
                      <div
                        key={topic}
                        className={`tree-node depth-2 ${isTopicActive ? 'active' : ''}`}
                        data-level="topic"
                        data-course={courseName}
                        data-topic={topic}
                        onClick={() => handleSelect('topic', courseName, null, null, topic)}
                      >
                        <span className="tree-label">{topic}</span>
                        <span className="tree-count">{topicData.cards.length}</span>
                        {topicData.dueCards > 0 && <span className="tree-badge">{topicData.dueCards}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      <div className="sb-footer">
        <button className="sb-footer-btn" id="footerStatsBtn" title="Stats" onClick={() => { currentView.value = 'dashboard'; }}>
          <span>📊</span>
        </button>
        <button className="sb-footer-btn" id="footerSettingsBtn" title="Settings" onClick={() => { (window as unknown as { openSettings?: () => void }).openSettings?.(); }}>
          <span>⚙️</span>
        </button>
      </div>
    </aside>
  );
}
