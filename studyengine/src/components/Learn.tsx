/*
 * Learn Component
 * Learn mode: prime → encode → consolidate → complete
 */

import { useCallback, useMemo, useState } from 'react';
import {
  learnSession,
  learnSegmentIndex,
  learnPhase,
  items,
  currentView,
  selectedCourse
} from '../signals';

interface LearnableTopic {
  name: string;
  cards: string[];
  count: number;
}

export function Learn() {
  const session = learnSession.value;
  const phase = learnPhase.value;
  const segmentIdx = learnSegmentIndex.value;
  const [confidence, setConfidence] = useState<number | null>(null);

  const exitLearn = useCallback(() => {
    if (confirm('Exit learn mode? Your progress will be saved.')) {
      learnSession.value = null;
      learnSegmentIndex.value = 0;
      learnPhase.value = 'prime';
      currentView.value = 'dashboard';
    }
  }, []);

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
        learnSegmentIndex.value = 0;
        learnPhase.value = 'prime';
        currentView.value = 'dashboard';
        break;
    }
  }, [phase, segmentIdx, session]);

  const getLearnableTopics = useCallback((courseName: string): LearnableTopic[] => {
    const topics: Record<string, LearnableTopic> = {};

    for (const id in items.value) {
      const it = items.value[id];
      if (!it || it.archived || it.course !== courseName) continue;

      const topicName = (it.topic || 'General').trim();
      if (!topics[topicName]) {
        topics[topicName] = { name: topicName, cards: [], count: 0 };
      }

      topics[topicName].cards.push(id);
      topics[topicName].count += 1;
    }

    return Object.values(topics).sort((a, b) => b.count - a.count);
  }, []);

  const startLearn = useCallback((topicName: string) => {
    const courseName = selectedCourse.value?.name;
    if (!courseName) return;

    const topicItems = Object.values(items.value).filter(
      it => it && !it.archived && it.course === courseName && (it.topic || 'General').trim() === topicName
    );

    const segments = topicItems.slice(0, 5).map((it, i) => ({
      id: it.id,
      content: it.modelAnswer || it.prompt || 'Study this concept carefully.',
      title: it.prompt || it.topic || `Segment ${i + 1}`
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
    setConfidence(null);
  }, []);

  const topicList = useMemo(() => {
    const courseName = selectedCourse.value?.name;
    if (!courseName) return [];
    return getLearnableTopics(courseName);
  }, [getLearnableTopics, selectedCourse.value?.name, items.value]);

  if (!session) {
    return (
      <div className="view view-learn active se-learn">
        <div className="se-learn-card se-learn-title-card">
          <h2>Learn Mode</h2>
          <p>Choose a topic to begin your guided learning sequence.</p>
        </div>

        <div className="se-learn-topic-grid">
          {topicList.map(topic => (
            <button
              key={topic.name}
              className="se-learn-topic-card stat-style"
              onClick={() => startLearn(topic.name)}
            >
              <span className="se-learn-topic-name">{topic.name}</span>
              <span className="se-learn-topic-count">{topic.count} cards</span>
            </button>
          ))}
        </div>

        {topicList.length === 0 && (
          <div className="se-learn-card">
            <p>No topics found for this course yet. Add cards with topics to start Learn Mode.</p>
          </div>
        )}

        <button className="ghost-btn" onClick={() => { currentView.value = 'dashboard'; }}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  const currentSegment = session.segments[segmentIdx];

  return (
    <div className="view view-learn active se-learn">
      <div className="se-learn-header se-learn-card">
        <div>
          <h2>{session.course} — {session.topics[0]}</h2>
        </div>
        <div className="se-learn-header-meta">
          <span className="se-learn-phase-pill">{phase.toUpperCase()}</span>
          <button className="ghost-btn" onClick={exitLearn}>Exit</button>
        </div>
      </div>

      {phase === 'prime' && (
        <div className="se-learn-phase-wrap">
          <div className="se-learn-card">
            <h3>Prime your understanding</h3>
            <div className="se-learn-prompt">
              <p>What do you already know about <strong>{session.topics[0]}</strong>?</p>
              <p>What questions or confusions are you carrying into this topic?</p>
            </div>
          </div>
          <button className="big-btn" onClick={advance}>Start Learning</button>
        </div>
      )}

      {phase === 'encode' && currentSegment && (
        <div className="se-learn-phase-wrap">
          <div className="se-learn-segment-pill">Segment {segmentIdx + 1} of {session.segments.length}</div>
          <div className="se-learn-card">
            <h3>{currentSegment.title || `Segment ${segmentIdx + 1}`}</h3>
            <p>{currentSegment.content}</p>
          </div>
          <div className="se-learn-prompt">
            Reflect: What is the key idea here, and how would you explain it simply?
          </div>
          <button className="big-btn" onClick={advance}>
            {segmentIdx + 1 < session.segments.length ? 'Next Segment' : 'Continue to Consolidation'}
          </button>
        </div>
      )}

      {phase === 'consolidate' && (
        <div className="se-learn-phase-wrap">
          <div className="se-learn-card">
            <h3>Consolidate what you learned</h3>
            <p className="se-learn-prompt">
              Summarize the key points from <strong>{session.topics[0]}</strong> in your own words.
            </p>
          </div>

          <div className="se-learn-confidence-row">
            {[1, 2, 3, 4].map(level => (
              <button
                key={level}
                className="se-learn-conf-btn"
                data-active={confidence === level ? 'true' : 'false'}
                data-level={level}
                onClick={() => setConfidence(level)}
              >
                {level === 1 && 'Not confident'}
                {level === 2 && 'Somewhat'}
                {level === 3 && 'Confident'}
                {level === 4 && 'Very confident'}
              </button>
            ))}
          </div>

          <button className="big-btn" onClick={advance}>Complete Learning</button>
        </div>
      )}

      {phase === 'complete' && (
        <div className="se-learn-phase-wrap se-learn-complete">
          <div className="se-learn-complete-emoji" role="img" aria-label="Celebration">🎉</div>
          <h3>Learning Complete!</h3>
          <p>
            You completed Learn Mode for <strong>{session.topics[0]}</strong>. Great momentum — revisit soon to lock it in.
          </p>
          <button className="big-btn" onClick={advance}>Back to Dashboard</button>
        </div>
      )}
    </div>
  );
}
