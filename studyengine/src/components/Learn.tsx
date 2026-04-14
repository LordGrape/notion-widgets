/*
 * Learn Component
 * Learn mode: prime → encode → consolidate → complete
 */

import { h, Fragment } from 'preact';
import { useEffect, useCallback } from 'preact/hooks';
import {
  learnSession,
  learnSegmentIndex,
  learnPhase,
  courses,
  items,
  currentView,
  selectedCourse
} from '../signals';

export function Learn() {
  const session = learnSession.value;
  const phase = learnPhase.value;
  const segmentIdx = learnSegmentIndex.value;

  // Exit learn mode
  const exitLearn = useCallback(() => {
    if (confirm('Exit learn mode? Your progress will be saved.')) {
      learnSession.value = null;
      currentView.value = 'dashboard';
    }
  }, []);

  // Advance to next phase/segment
  const advance = useCallback(() => {
    if (!session) return;

    switch (phase) {
      case 'prime':
        learnPhase.value = 'encode';
        break;
      case 'encode':
        if (segmentIdx + 1 < session.segments.length) {
          learnSegmentIndex.value = segmentIdx + 1;
        } else {
          learnPhase.value = 'consolidate';
        }
        break;
      case 'consolidate':
        learnPhase.value = 'complete';
        break;
      case 'complete':
        learnSession.value = null;
        currentView.value = 'dashboard';
        break;
    }
  }, [phase, segmentIdx, session]);

  // Get learnable topics for selected course
  const getLearnableTopics = useCallback((courseName: string) => {
    const topics: Record<string, { name: string; cards: string[]; count: number }> = {};
    for (const id in items.value) {
      const it = items.value[id];
      if (!it || it.archived || it.course !== courseName) continue;
      const t = (it.topic || 'General').trim();
      if (!topics[t]) topics[t] = { name: t, cards: [], count: 0 };
      topics[t].cards.push(id);
      topics[t].count++;
    }
    return Object.values(topics).sort((a, b) => b.count - a.count);
  }, []);

  // Start learn session
  const startLearn = useCallback((topicName: string) => {
    const courseName = selectedCourse.value?.name;
    if (!courseName) return;

    // Create mock segments from topic content
    const topicItems = Object.values(items.value).filter(
      it => it && !it.archived && it.course === courseName && (it.topic || 'General').trim() === topicName
    );

    const segments = topicItems.slice(0, 5).map((it, i) => ({
      id: it.id,
      content: it.prompt || 'Study this concept carefully.',
      title: it.topic || `Segment ${i + 1}`
    }));

    learnSession.value = {
      course: courseName,
      topics: [topicName],
      segments,
      currentSegmentIndex: 0,
      status: 'prime'
    };
    learnPhase.value = 'prime';
    learnSegmentIndex.value = 0;
  }, []);

  // If no session, show topic selection
  if (!session) {
    const courseName = selectedCourse.value?.name;
    const topics = courseName ? getLearnableTopics(courseName) : [];

    return (
      <div class="view view-learn active">
        <div class="learn-header">
          <h2>Learn Mode</h2>
          <p>Select a topic to begin guided learning</p>
        </div>
        <div class="learn-topics">
          {topics.map(topic => (
            <button 
              key={topic.name}
              class="learn-topic-btn"
              onClick={() => startLearn(topic.name)}
            >
              <span class="topic-name">{topic.name}</span>
              <span class="topic-count">{topic.count} cards</span>
            </button>
          ))}
        </div>
        <button class="back-btn" onClick={() => currentView.value = 'dashboard'}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  const currentSegment = session.segments[segmentIdx];

  return (
    <div class="view view-learn active">
      {/* Header */}
      <div class="learn-header">
        <h2>{session.course} — {session.topics[0]}</h2>
        <span class="learn-phase">{phase}</span>
        <button class="exit-btn" onClick={exitLearn}>Exit</button>
      </div>

      {/* Prime Phase */}
      {phase === 'prime' && (
        <div class="learn-phase-content prime">
          <h3>Prime Mode</h3>
          <p>Before we begin, here are some questions to activate your prior knowledge:</p>
          <div class="prime-questions">
            <div class="prime-question">What do you already know about {session.topics[0]}?</div>
            <div class="prime-question">What questions do you have?</div>
          </div>
          <button class="advance-btn" onClick={advance}>Start Learning</button>
        </div>
      )}

      {/* Encode Phase */}
      {phase === 'encode' && currentSegment && (
        <div class="learn-phase-content encode">
          <div class="segment-indicator">
            Segment {segmentIdx + 1} of {session.segments.length}
          </div>
          <h3>{currentSegment.title}</h3>
          <div class="segment-content">{currentSegment.content}</div>
          <div class="encoding-prompt">
            <p>Take a moment to process this information. What's the key concept?</p>
          </div>
          <button class="advance-btn" onClick={advance}>
            {segmentIdx + 1 < session.segments.length ? 'Next Segment' : 'Continue to Consolidation'}
          </button>
        </div>
      )}

      {/* Consolidate Phase */}
      {phase === 'consolidate' && (
        <div class="learn-phase-content consolidate">
          <h3>Consolidation Check</h3>
          <p>Test your understanding before completing:</p>
          <div class="consolidation-questions">
            <div class="consol-question">
              <p>Can you summarize the key points from {session.topics[0]}?</p>
              <div class="consol-rating">
                <button data-rate="1">1 — Not confident</button>
                <button data-rate="2">2 — Somewhat</button>
                <button data-rate="3">3 — Pretty confident</button>
                <button data-rate="4">4 — Very confident</button>
              </div>
            </div>
          </div>
          <button class="advance-btn" onClick={advance}>Complete Learning</button>
        </div>
      )}

      {/* Complete Phase */}
      {phase === 'complete' && (
        <div class="learn-phase-content complete">
          <h3>🎉 Learning Complete!</h3>
          <p>You've completed the guided learning for {session.topics[0]}.</p>
          <p>The concepts you've learned are now primed for your next study session.</p>
          <button class="advance-btn" onClick={advance}>Back to Dashboard</button>
        </div>
      )}
    </div>
  );
}
