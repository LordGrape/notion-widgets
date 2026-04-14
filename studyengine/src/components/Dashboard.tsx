import { useComputed } from '@preact/signals';
import {
  dueCount,
  totalItems,
  masteredCount,
  coursesList,
  selectedCourse,
  currentView,
  settings
} from '../signals';
import { getCourseStats } from '../logic/courses';
import { detectSupportedTiers } from '../logic/cards';
import type { Tier } from '../types';

export function Dashboard() {
  const due = useComputed(() => dueCount.value);
  const total = useComputed(() => totalItems.value);
  const mastered = useComputed(() => masteredCount.value);
  const courses = useComputed(() => coursesList.value);
  const course = useComputed(() => selectedCourse.value);

  const hasItems = total.value > 0;
  const selectedCourseStats = course.value !== 'All'
    ? getCourseStats(course.value)
    : null;

  const startSession = () => {
    currentView.value = 'session';
  };

  return (
    <div class="view active" id="viewDash">
      <div class="topbar">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true">
            <canvas id="mascotCanvas" class="logo" width="28" height="28" />
          </div>
          <div class="brand-copy">
            <div class="brand-kicker">Adaptive recall desk</div>
            <h1>Study Engine</h1>
            <div class="sub">Focus dashboard for spaced retrieval</div>
          </div>
        </div>
        <div class="nav-tabs">
          <button class="nav-tab active" data-nav="home">Home</button>
          <button class="nav-tab" data-nav="courses">Courses</button>
        </div>
      </div>

      <div id="tabHome" class="tab-panel active">
        <div class="dash-grid">
          <div class="hero-stat" id="heroStat" style={{ display: hasItems ? 'block' : 'none' }}>
            <div class="hero-value" id="statDue">{due.value}</div>
            <div class="hero-label">Items due</div>
            <div class="hero-sub">Across all tiers</div>
          </div>

          <div class="unified-stats-grid stats-row">
            <div class="stat" id="statMasteredWrap">
              <div class="k">Mastered</div>
              <div class="v n">{mastered.value}</div>
              <div class="s">stability &gt; 30d</div>
            </div>
            <div class="stat">
              <div class="k">Total Items</div>
              <div class="v n">{total.value}</div>
              <div class="s">across all courses</div>
            </div>
          </div>
        </div>

        <div class="breakdown" id="tierBreakdown" />

        <button
          class="big-btn"
          id="startBtn"
          disabled={due.value === 0}
          onClick={startSession}
        >
          Start Session
        </button>

        <div class="mini-actions" style={{ marginTop: '12px' }}>
          <button class="ghost-btn">Add Items</button>
          <button class="ghost-btn">Import JSON</button>
        </div>

        {!hasItems && (
          <div id="emptyState" class="empty-state">
            <div class="empty-title">No items yet</div>
            <div class="empty-desc">
              Add study items manually or import a JSON batch to start your first retrieval session.
            </div>
          </div>
        )}
      </div>

      {course.value !== 'All' && selectedCourseStats && (
        <div class="course-stats-panel" style={{ marginTop: '20px' }}>
          <h3>{course.value} Stats</h3>
          <div class="stats-row">
            <div class="stat">
              <div class="k">Items</div>
              <div class="v">{selectedCourseStats.total}</div>
            </div>
            <div class="stat">
              <div class="k">Due</div>
              <div class="v">{selectedCourseStats.due}</div>
            </div>
            <div class="stat">
              <div class="k">Reviewed</div>
              <div class="v">{selectedCourseStats.reviewed}</div>
            </div>
            <div class="stat">
              <div class="k">Avg Retention</div>
              <div class="v">{selectedCourseStats.avgRetention ? `${selectedCourseStats.avgRetention}%` : '—'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
