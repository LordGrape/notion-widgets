// Learn component - Learn Mode for scaffolded AI instruction
// Ported from studyengine/js/learn.js

import { useSignal, useComputed } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { appState, settings, currentView, persistState } from '../signals';
import type { StudyItem, LearnSegment, LearnProgressMeta } from '../types';
import { LEARN_PLAN_ENDPOINT, LEARN_CHECK_ENDPOINT } from '../signals';
import { getTopicsForCourse } from '../logic/courses';
import { scheduleFsrs } from '../logic/fsrs';

interface LearnSession {
  course: string;
  topic: string;
  segments: LearnSegment[];
  currentSegmentIdx: number;
  consolidationRatings: number[];
  cardsHandedOff: number;
  startTime: number;
}

interface LearnProps {
  courseName: string;
  topicName: string;
}

export function Learn({ courseName, topicName }: LearnProps) {
  const session = useSignal<LearnSession | null>(null);
  const isLoading = useSignal(false);
  const error = useSignal<string | null>(null);
  const checkAnswer = useSignal('');
  const showFeedback = useSignal(false);
  const feedbackCorrect = useSignal<boolean | null>(null);
  const inConsolidation = useSignal(false);
  const consolidationIdx = useSignal(0);
  
  // Load learn session
  useEffect(() => {
    startLearnSession();
  }, []);
  
  const startLearnSession = async () => {
    isLoading.value = true;
    error.value = null;
    
    try {
      // Fetch learn plan from worker
      const response = await fetch(LEARN_PLAN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Widget-Key': getWidgetKey()
        },
        body: JSON.stringify({
          course: courseName,
          topic: topicName,
          items: getTopicItems(courseName, topicName)
        })
      });
      
      if (!response.ok) throw new Error('Failed to fetch learn plan');
      
      const plan = await response.json();
      
      session.value = {
        course: courseName,
        topic: topicName,
        segments: plan.segments || [],
        currentSegmentIdx: 0,
        consolidationRatings: [],
        cardsHandedOff: 0,
        startTime: Date.now()
      };
    } catch (e) {
      error.value = 'Failed to start learn session. Please try again.';
      // Fallback: create simple segments from cards
      const items = getTopicItems(courseName, topicName);
      session.value = {
        course: courseName,
        topic: topicName,
        segments: items.map(item => ({
          concept: item.prompt.substring(0, 100),
          explanation: item.modelAnswer.substring(0, 500),
          checkType: 'predict' as const,
          checkQuestion: 'What is the key concept here?'
        })),
        currentSegmentIdx: 0,
        consolidationRatings: [],
        cardsHandedOff: 0,
        startTime: Date.now()
      };
    } finally {
      isLoading.value = false;
    }
  };
  
  const getTopicItems = (course: string, topic: string): StudyItem[] => {
    const items: StudyItem[] = [];
    const allItems = appState.value.items;
    for (const id in allItems) {
      if (allItems[id].course === course && (allItems[id].topic || 'General') === topic) {
        items.push(allItems[id]);
      }
    }
    return items;
  };
  
  const submitCheck = async () => {
    if (!checkAnswer.value.trim()) return;
    
    const currentSegment = session.value?.segments[session.value.currentSegmentIdx];
    if (!currentSegment) return;
    
    try {
      const response = await fetch(LEARN_CHECK_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Widget-Key': getWidgetKey()
        },
        body: JSON.stringify({
          segment: currentSegment,
          answer: checkAnswer.value
        })
      });
      
      const result = await response.json();
      feedbackCorrect.value = result.correct || false;
      showFeedback.value = true;
    } catch (e) {
      // Fallback: accept any non-empty answer
      feedbackCorrect.value = checkAnswer.value.length > 10;
      showFeedback.value = true;
    }
  };
  
  const advanceSegment = () => {
    if (!session.value) return;
    
    checkAnswer.value = '';
    showFeedback.value = false;
    feedbackCorrect.value = null;
    
    if (session.value.currentSegmentIdx + 1 < session.value.segments.length) {
      session.value = {
        ...session.value,
        currentSegmentIdx: session.value.currentSegmentIdx + 1
      };
    } else {
      // Move to consolidation phase
      inConsolidation.value = true;
    }
  };
  
  const rateConsolidation = (rating: number) => {
    if (!session.value) return;
    
    const newRatings = [...session.value.consolidationRatings, rating];
    
    if (consolidationIdx.value + 1 < Math.min(3, session.value.segments.length)) {
      consolidationIdx.value++;
      session.value = {
        ...session.value,
        consolidationRatings: newRatings
      };
    } else {
      // Complete learn session
      completeSession(newRatings);
    }
  };
  
  const completeSession = (finalRatings: number[]) => {
    if (!session.value) return;
    
    const duration = Date.now() - session.value.startTime;
    const avgRating = finalRatings.reduce((a, b) => a + b, 0) / finalRatings.length;
    
    // Update learn progress
    if (!appState.value.learnProgress[courseName]) {
      appState.value.learnProgress[courseName] = {};
    }
    
    const progress: LearnProgressMeta = {
      status: avgRating >= 3 ? 'learned' : 'in_progress',
      segmentsTotal: session.value.segments.length,
      segmentsCompleted: session.value.segments.length,
      consolidationAvgRating: avgRating,
      lastLearnedAt: new Date().toISOString(),
      linkedCardIds: getTopicItems(courseName, topicName).map(i => i.id)
    };
    
    appState.value.learnProgress[courseName][topicName] = progress;
    
    // Hand off cards to FSRS
    const items = getTopicItems(courseName, topicName);
    items.forEach(item => {
      const initialRating = avgRating >= 3 ? 3 : 2;
      scheduleFsrs(item, initialRating, Date.now(), true, settings.value.desiredRetention);
    });
    
    persistState();
    currentView.value = 'dashboard';
  };
  
  const exitSession = () => {
    if (confirm('Exit learn session? Your progress will be saved.')) {
      currentView.value = 'dashboard';
    }
  };
  
  if (isLoading.value) {
    return (
      <div class="view active" id="viewLearn">
        <div class="learn-loading">Loading learn session...</div>
      </div>
    );
  }
  
  if (error.value) {
    return (
      <div class="view active" id="viewLearn">
        <div class="learn-error">{error.value}</div>
        <button class="big-btn" onClick={() => { currentView.value = 'dashboard'; }}>
          Back to Dashboard
        </button>
      </div>
    );
  }
  
  if (!session.value) {
    return (
      <div class="view active" id="viewLearn">
        <div class="learn-error">Failed to initialize session</div>
      </div>
    );
  }
  
  if (inConsolidation.value) {
    const items = getTopicItems(courseName, topicName);
    const item = items[consolidationIdx.value];
    
    return (
      <div class="view active" id="viewLearn">
        <div class="learn-topbar">
          <span class="learn-title">CONSOLIDATION</span>
          <button class="learn-exit" onClick={exitSession}>✕</button>
        </div>
        
        <div class="learn-content">
          <div class="consolidation-prompt">
            Rate your recall for: <strong>{item?.prompt.substring(0, 100)}...</strong>
          </div>
          
          <div class="ratings">
            <button class="rate again" onClick={() => rateConsolidation(1)}>
              Again (1)
            </button>
            <button class="rate hard" onClick={() => rateConsolidation(2)}>
              Hard (2)
            </button>
            <button class="rate good" onClick={() => rateConsolidation(3)}>
              Good (3)
            </button>
            <button class="rate easy" onClick={() => rateConsolidation(4)}>
              Easy (4)
            </button>
          </div>
          
          <div class="consolidation-progress">
            Item {consolidationIdx.value + 1} of {Math.min(3, items.length)}
          </div>
        </div>
      </div>
    );
  }
  
  const currentSegment = session.value.segments[session.value.currentSegmentIdx];
  
  return (
    <div class="view active" id="viewLearn">
      <div class="learn-topbar">
        <span class="learn-title">LEARNING: {topicName}</span>
        <button class="learn-exit" onClick={exitSession}>✕</button>
      </div>
      
      <div class="learn-content">
        <div class="learn-progress">
          Segment {session.value.currentSegmentIdx + 1} of {session.value.segments.length}
        </div>
        
        <div class="learn-segment">
          <div class="learn-concept">{currentSegment.concept}</div>
          <div class="learn-explanation">{currentSegment.explanation}</div>
        </div>
        
        {!showFeedback.value && (
          <div class="learn-check">
            <div class="check-question">{currentSegment.checkQuestion}</div>
            <textarea
              value={checkAnswer.value}
              onInput={(e) => { checkAnswer.value = (e.target as HTMLTextAreaElement).value; }}
              placeholder="Type your answer..."
              rows={3}
            />
            <button class="big-btn" onClick={submitCheck}>Submit</button>
          </div>
        )}
        
        {showFeedback.value && (
          <div class="learn-feedback">
            <div class={`feedback-result ${feedbackCorrect.value ? 'correct' : 'incorrect'}`}>
              {feedbackCorrect.value ? '✓ Good!' : '✗ Not quite'}
            </div>
            <button class="big-btn" onClick={advanceSegment}>Continue →</button>
          </div>
        )}
      </div>
    </div>
  );
}

function getWidgetKey(): string {
  return (window as { WIDGET_KEY?: string }).WIDGET_KEY || 
         (typeof SyncEngine !== 'undefined' ? (SyncEngine.key || '') : '');
}
