/*
 * Session Component
 * Main session controller
 */

import { Fragment, useEffect, useCallback, useRef, useState } from 'react';
import {
  sessionQueue,
  sessionIndex,
  sessionPhase,
  currentShown,
  userAnswer,
  sessionXP,
  aiRating,
  items,
  currentView,
  settings,
  courses,
  sessionStartTime,
  sessionReviewsByTier,
  breakActive,
  breakTimeRemaining,
  essayOutlineText,
  essayPhase,
  aiFeedback,
  recentRatings
} from '../signals';
import type { StudyItem } from '../types';
import { GRADE_ENDPOINT } from '../constants';
import { ProgressBar } from './session/ProgressBar';
import { RatingButtons } from './session/RatingButtons';
import { TierRenderer } from './session/TierRenderer';
import { BreakModal } from './session/BreakModal';

// Tier colors
const tierColours: Record<string, string> = {
  quickfire: '#3b82f6',
  explain: '#22c55e',
  apply: '#f59e0b',
  distinguish: '#8b5cf6',
  mock: '#ef4444',
  worked: '#06b6d4'
};

// Utility: Get present tier for item
function getPresentTier(item: StudyItem): string {
  return (item as unknown as { _presentTier?: string })._presentTier || item.tier || 'quickfire';
}

// Utility: Format MM:SS
function fmtMMSS(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Utility: Compute XP
function computeXP(item: StudyItem, rating: number, intervalDays: number): number {
  const baseXP = 10;
  const tierMultipliers: Record<string, number> = {
    quickfire: 1,
    explain: 1.5,
    apply: 2,
    distinguish: 2.5,
    mock: 3,
    worked: 2
  };
  const ratingMultipliers = [0, 0.5, 1, 1.5, 2];
  const tier = getPresentTier(item);
  const tierMult = tierMultipliers[tier] || 1;
  const ratingMult = ratingMultipliers[rating] || 1;
  return Math.round(baseXP * tierMult * ratingMult);
}

// scheduleFsrs is sacred - use global
interface WindowWithFSRS extends Window {
  scheduleFsrs?: (item: unknown, rating: number, now: number, updateStats: boolean) => { intervalDays: number };
}

// Hook: Per-item elapsed timer
function useItemTimer() {
  const [elapsed, setElapsed] = useState(0);
  
  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionIndex.value]);
  
  return { elapsed, formatted: fmtMMSS(elapsed) };
}

// Hook: Countdown timer (for Apply/Mock tiers)
function useCountdownTimer(initialSeconds: number, onComplete: () => void) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const [isRunning, setIsRunning] = useState(true);
  
  useEffect(() => {
    if (!isRunning || remaining <= 0) return;
    
    const timer = setTimeout(() => {
      const newRemaining = remaining - 1;
      setRemaining(newRemaining);
      if (newRemaining <= 0) {
        onComplete();
      }
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [remaining, isRunning, onComplete]);
  
  return { remaining, formatted: fmtMMSS(remaining), isRunning, setIsRunning };
}

// Build session queue with interleaving and spacing
function buildSessionQueue(allItems: Record<string, StudyItem>, sessionLimit: number): StudyItem[] {
  const now = new Date();
  const candidates: StudyItem[] = [];
  
  // Get due items
  for (const id in allItems) {
    const item = allItems[id];
    if (!item || item.archived) continue;
    
    const f = item.fsrs;
    if (!f || !f.lastReview || !f.due) {
      candidates.push(item);
    } else {
      const dueDate = new Date(f.due);
      if (dueDate <= now) candidates.push(item);
    }
  }
  
  // Sort by: 1) Priority (lower number = higher priority), 2) Random within same priority
  candidates.sort((a, b) => {
    const prioA = typeof a.priority === 'number' ? a.priority : 3;
    const prioB = typeof b.priority === 'number' ? b.priority : 3;
    if (prioA !== prioB) return prioA - prioB;
    return Math.random() - 0.5;
  });
  
  // Interleave by course/topic to avoid clustering
  const byCourse: Record<string, StudyItem[]> = {};
  candidates.forEach(item => {
    const course = item.course || 'uncategorized';
    if (!byCourse[course]) byCourse[course] = [];
    byCourse[course].push(item);
  });
  
  const interleaved: StudyItem[] = [];
  const courseKeys = Object.keys(byCourse);
  let idx = 0;
  
  while (interleaved.length < sessionLimit && interleaved.length < candidates.length) {
    let added = false;
    for (const course of courseKeys) {
      const courseItems = byCourse[course];
      if (courseItems[idx]) {
        interleaved.push(courseItems[idx]);
        added = true;
        if (interleaved.length >= sessionLimit) break;
      }
    }
    if (!added) break;
    idx++;
  }
  
  return interleaved.slice(0, sessionLimit);
}

// AI Grading function
async function requestAIGrade(item: StudyItem, answer: string): Promise<{
  score: number;
  feedback: string;
  rubric?: Record<string, number>;
}> {
  const payload = {
    item: {
      id: item.id,
      prompt: item.prompt,
      modelAnswer: item.modelAnswer,
      tier: getPresentTier(item),
      course: item.course,
      topic: item.topic
    },
    answer,
    tier: getPresentTier(item)
  };
  
  // Call Worker grading endpoint
  const response = await fetch(GRADE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    throw new Error('AI grading failed');
  }
  
  return response.json();
}

// Compute restudy duration based on answer length (Pastötter et al. 2017)
function computeRestudyDuration(answerLength: number): number {
  // Base 30 seconds + 2 seconds per 10 characters, max 120 seconds
  return Math.min(120, 30 + Math.floor(answerLength / 10) * 2);
}

// Session stats computation
function computeSessionStats(queue: StudyItem[], results: { itemId: string; rating: number }[]): {
  totalItems: number;
  reviewedItems: number;
  accuracy: number;
  avgRating: number;
  xpEarned: number;
} {
  const reviewedItems = results.length;
  const accuracy = reviewedItems > 0 
    ? results.filter(r => r.rating >= 3).length / reviewedItems 
    : 0;
  const avgRating = reviewedItems > 0
    ? results.reduce((sum, r) => sum + r.rating, 0) / reviewedItems
    : 0;
  
  return {
    totalItems: queue.length,
    reviewedItems,
    accuracy,
    avgRating,
    xpEarned: sessionXP.value
  };
}

export function Session() {
  const queue = sessionQueue.value;
  const idx = sessionIndex.value;
  const currentItem = queue[idx];
  const phase = sessionPhase.value;
  
  // Initialize queue on mount if empty
  useEffect(() => {
    if (queue.length === 0 && Object.keys(items.value).length > 0) {
      const limit = settings.value.sessionLimit || 12;
      sessionQueue.value = buildSessionQueue(items.value, limit);
      sessionStartTime.value = Date.now();
    }
  }, []);
  
  const { formatted: itemTimer } = useItemTimer();

  // Complete session - defined first since handleRate uses it
  const completeSession = useCallback(() => {
    // Push XP to dragon
    if (settings.value.gamificationMode === 'motivated') {
      const se = (window as unknown as { SyncEngine?: { set: (ns: string, key: string, val: unknown) => void } }).SyncEngine;
      if (se) {
        se.set('dragon', 'lastStudyXP', { xp: sessionXP.value, timestamp: new Date().toISOString() });
      }
    }

    // Clear active session snapshot
    const se = (window as unknown as { SyncEngine?: { set: (ns: string, key: string, val: unknown) => void } }).SyncEngine;
    if (se) {
      se.set('studyengine', 'activeSession', null);
    }

    // Show completion view
    currentView.value = 'done';
  }, []);

  // Handle reveal answer
  const handleReveal = useCallback(() => {
    currentShown.value = true;
    sessionPhase.value = 'revealed';
  }, []);

  // Handle rating
  const handleRate = useCallback((rating: number) => {
    if (!currentItem) return;

    const now = Date.now();
    const tier = getPresentTier(currentItem);

    // Schedule FSRS (sacred - use global)
    const win = window as unknown as WindowWithFSRS;
    const result = win.scheduleFsrs?.(currentItem, rating, now, true) || { intervalDays: 1 };
    
    // Update item in items signal
    const updatedItems = { ...items.value };
    updatedItems[currentItem.id] = currentItem;
    items.value = updatedItems;

    // Update XP
    const xp = computeXP(currentItem, rating, result.intervalDays);
    sessionXP.value += xp;

    // Update reviews by tier
    const reviews = { ...sessionReviewsByTier.value };
    reviews[tier] = (reviews[tier] || 0) + 1;
    sessionReviewsByTier.value = reviews;

    // Advance to next item or complete
    if (idx + 1 >= queue.length) {
      sessionPhase.value = 'complete';
      completeSession();
    } else {
      sessionIndex.value = idx + 1;
      currentShown.value = false;
      userAnswer.value = '';
      sessionPhase.value = 'question';
    }
  }, [currentItem, idx, queue.length, completeSession]);

  // Skip current item
  const handleSkip = useCallback(() => {
    if (!currentItem || queue.length <= 1) return;
    
    // Move current item to end of queue
    const newQueue = [...queue];
    const [skipped] = newQueue.splice(idx, 1);
    newQueue.push(skipped);
    sessionQueue.value = newQueue;
    
    // Reset state for next item
    currentShown.value = false;
    userAnswer.value = '';
  }, [currentItem, queue, idx]);

  // End session early
  const handleEndSession = useCallback(() => {
    if (confirm('End this session early? Your progress will be saved.')) {
      completeSession();
    }
  }, [completeSession]);

  // If no current item, show empty state
  if (!currentItem) {
    return (
      <div className="view view-session">
        <div className="empty-session">
          <p>No items in session queue</p>
          <button onClick={() => currentView.value = 'dashboard'}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const tier = getPresentTier(currentItem);
  const tierColor = tierColours[tier] || tierColours.quickfire;

  return (
    <div className="view view-session active">
      {/* Header */}
      <div className="session-header">
        <div className="session-meta">
          <span className="meta-course">{currentItem.course || '—'}</span>
          <span className="meta-topic">{currentItem.topic || '—'}</span>
        </div>
        <ProgressBar />
        <button className="end-session-btn" onClick={handleEndSession}>
          End Session
        </button>
      </div>

      {/* Item card */}
      <div className="item-card" style={{ borderColor: tierColor + '40' }}>
        {/* Tier badge */}
        <div className="tier-badge" style={{ background: tierColor + '20', color: tierColor }}>
          {tier.charAt(0).toUpperCase() + tier.slice(1)}
        </div>

        {/* Prompt */}
        <div className="prompt-section">
          <div className="prompt-text">
            {tier === 'apply' ? 'Scenario' : currentItem.prompt}
          </div>
        </div>

        {/* Tier-specific content */}
        <TierRenderer
          item={currentItem}
          tier={tier as 'quickfire' | 'explain' | 'apply' | 'distinguish' | 'mock' | 'worked'}
          onReveal={handleReveal}
          onDontKnow={handleReveal}
        />

        {/* Rating buttons (shown after reveal) */}
        {currentShown.value && (
          <div className="rating-section">
            <RatingButtons
              onRate={handleRate}
              aiSuggested={aiRating.value}
            />
          </div>
        )}
      </div>

      {/* Skip button */}
      <div className="skip-section">
        <button className="skip-btn" onClick={handleSkip}>
          Skip this item →
        </button>
      </div>
    </div>
  );
}
