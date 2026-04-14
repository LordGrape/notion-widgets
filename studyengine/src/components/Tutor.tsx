/*
 * Tutor Component
 * AI tutor dialogue panel
 */

import { Fragment, useEffect, useRef, useCallback, useState } from 'react';
import {
  tutorMessages,
  tutorLoading,
  tutorOpen,
  tutorCurrentItem,
  tutorCurrentMode,
  settings,
  items,
  courses
} from '../signals';
import { TUTOR_ENDPOINT, LECTURE_CTX_ENDPOINT } from '../constants';
import type { StudyItem } from '../types';

// Tutor conversation entry (internal tracking uses 'tutor' for assistant)
type TutorConversation = { role: 'user' | 'tutor'; text: string };

// Worker endpoints imported from constants

// Get widget key from Core
function getWidgetKey(): string {
  return (window as unknown as { Core?: { apiKey?: string } }).Core?.apiKey || '';
}

// Get tutor user name from settings
function getTutorUserName(): string {
  return settings.value.userName || '';
}

// Select model based on item complexity
function selectModel(item: StudyItem | null): string {
  if (!item) return 'flash';
  const tier = item.tier || 'explain';
  // Higher tiers use pro model
  if (tier === 'mock' || tier === 'worked') return 'pro';
  return 'flash';
}

// Build context for tutor
function tutorContextForItem(item: StudyItem | null): Record<string, unknown> {
  if (!item) return {};
  return {
    tier: item.tier,
    course: item.course,
    topic: item.topic,
    priority: item.priority
  };
}

// Call tutor API
async function callTutor(
  mode: string,
  model: string,
  item: StudyItem | null,
  userResponse: string,
  conversation: TutorConversation[],
  context: Record<string, unknown>
): Promise<{
  tutorMessage?: string;
  error?: string;
  followUpQuestion?: string;
  isComplete?: boolean;
  suggestedRating?: number;
  acknowledgment?: string;
  correct?: string;
  insight?: string;
  extensionQuestion?: string;
  reconstructionPrompt?: string;
  annotations?: unknown[];
  diagnosisType?: string;
}> {
  if (!item) return { error: 'No item' };

  const payload = {
    mode,
    model: model || 'flash',
    item: {
      prompt: item.prompt || '',
      modelAnswer: item.modelAnswer || '',
      tier: item.tier || 'explain',
      course: item.course || '',
      topic: item.topic || ''
    },
    userName: getTutorUserName(),
    tutorVoice: settings.value.tutorVoice === 'supportive' ? 'supportive' : 'rigorous',
    userResponse,
    conversation,
    context
  };

  // Add concept/task fields if present
  if ((item as unknown as { conceptA?: string }).conceptA) {
    (payload.item as unknown as { conceptA?: string }).conceptA = (item as unknown as { conceptA?: string }).conceptA;
  }
  if ((item as unknown as { conceptB?: string }).conceptB) {
    (payload.item as unknown as { conceptB?: string }).conceptB = (item as unknown as { conceptB?: string }).conceptB;
  }
  if ((item as unknown as { task?: string }).task) {
    (payload.item as unknown as { task?: string }).task = (item as unknown as { task?: string }).task;
  }

  // Fetch lecture context
  let lectureContext: { courseDigest?: string; topicChunk?: string } = {};
  
  // Get course digest
  const courseName = item.course;
  if (courseName && courses.value[courseName]) {
    const courseData = courses.value[courseName];
    if ((courseData as unknown as { syllabusContext?: string }).syllabusContext) {
      lectureContext.courseDigest = (courseData as unknown as { syllabusContext?: string }).syllabusContext;
    }
  }

  // Get topic chunk
  if (item.topic && courseName) {
    try {
      const ctxResponse = await fetch(LECTURE_CTX_ENDPOINT, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Widget-Key': getWidgetKey()
        },
        body: JSON.stringify({ courseName, topic: item.topic })
      });
      const ctxData = await ctxResponse.json();
      if (ctxData?.topicChunk?.content) {
        lectureContext.topicChunk = ctxData.topicChunk.content;
      }
    } catch {
      // Ignore errors
    }
  }

  if (lectureContext.courseDigest || lectureContext.topicChunk) {
    (payload as unknown as { lectureContext?: typeof lectureContext }).lectureContext = lectureContext;
  }

  const response = await fetch(TUTOR_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Widget-Key': getWidgetKey()
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    return { error: 'Request failed' };
  }

  return response.json();
}

// Escaping HTML
function esc(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function Tutor() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const [inputText, setInputText] = useState('');
  const [turnCount, setTurnCount] = useState(1);
  const [isRelearning, setIsRelearning] = useState(false);
  const conversationRef = useRef<TutorConversation[]>([]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [tutorMessages.value]);

  // Auto-resize textarea
  const handleInput = (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    target.style.height = 'auto';
    target.style.height = Math.min(120, Math.max(42, target.scrollHeight)) + 'px';
    setInputText(target.value);
  };

  // Handle Enter key
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitResponse();
    }
  };

  // Submit response to tutor
  const submitResponse = useCallback(async () => {
    const text = inputText.trim();
    if (!text || tutorLoading.value) return;

    // Add user message
    tutorMessages.value = [
      ...tutorMessages.value,
      { role: 'user', content: text, timestamp: Date.now() }
    ];

    // Add to conversation tracking
    conversationRef.current.push({ role: 'user', text });
    setTurnCount(c => c + 1);

    // Clear input
    setInputText('');
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.style.height = '42px';
      inputRef.current.disabled = true;
    }

    tutorLoading.value = true;

    try {
      const item = tutorCurrentItem.value;
      const mode = tutorCurrentMode.value;
      const model = selectModel(item);

      const data = await callTutor(
        mode,
        model,
        item,
        text,
        conversationRef.current,
        tutorContextForItem(item)
      );

      if (data.error) {
        tutorMessages.value = [
          ...tutorMessages.value,
          { role: 'assistant', content: '⚠ ' + esc(data.error), timestamp: Date.now() }
        ];
      } else {
        // Build response text
        let responseText = data.tutorMessage || data.acknowledgment || data.correct || data.insight || '';
        const question = data.followUpQuestion || data.extensionQuestion || '';
        const alreadyIncluded = question && responseText.trim().endsWith(question.trim());
        
        if (!alreadyIncluded && question) {
          responseText += '\n\n' + question;
        }
        
        if (data.reconstructionPrompt) {
          responseText += (responseText ? '\n\n' : '') + data.reconstructionPrompt;
        }

        // Add assistant message
        tutorMessages.value = [
          ...tutorMessages.value,
          { role: 'assistant', content: responseText, timestamp: Date.now() }
        ];

        // Add to conversation tracking (use 'tutor' internally)
        conversationRef.current.push({ role: 'tutor', text: responseText });

        // Store AI rating if available
        if (data.suggestedRating != null) {
          // This would update session state - for now just log
          console.log('AI suggested rating:', data.suggestedRating);
        }

        // Persist diagnosis if available
        if (data.diagnosisType && item) {
          const updatedItem = { ...item } as StudyItem & { diagnosisHistory?: unknown[] };
          if (!updatedItem.diagnosisHistory) updatedItem.diagnosisHistory = [];
          updatedItem.diagnosisHistory.push({
            type: data.diagnosisType,
            timestamp: new Date().toISOString(),
            tier: item.tier || 'explain',
            mode: tutorCurrentMode.value
          });
          // Cap at 20 entries
          if (updatedItem.diagnosisHistory.length > 20) {
            updatedItem.diagnosisHistory = updatedItem.diagnosisHistory.slice(-20);
          }
          // Update items signal
          items.value = { ...items.value, [item.id]: updatedItem };
        }

        // Check if complete
        if (data.isComplete || turnCount >= 3) {
          // Conversation complete
          console.log('Tutor conversation complete');
        }
      }
    } catch {
      tutorMessages.value = [
        ...tutorMessages.value,
        { role: 'assistant', content: '⚠ Could not reach the tutor. Please try again.', timestamp: Date.now() }
      ];
    } finally {
      tutorLoading.value = false;
      if (inputRef.current) {
        inputRef.current.disabled = false;
        inputRef.current.focus();
      }
    }
  }, [inputText, turnCount]);

  // Close tutor
  const handleClose = () => {
    tutorOpen.value = false;
  };

  if (!tutorOpen.value) return null;

  return (
    <div className="tutor-overlay">
      <div className="tutor-panel">
        {/* Header */}
        <div className="tutor-header">
          <h3>🎓 AI Tutor</h3>
          <button className="close-btn" onClick={handleClose}>×</button>
        </div>

        {/* Relearning banner */}
        {isRelearning && (
          <div className="tutor-relearn-banner">
            <span aria-hidden="true">🔁</span> Re-encoding — Active Recall
          </div>
        )}

        {/* Messages */}
        <div className="tutor-messages" ref={messagesRef}>
          {tutorMessages.value.map((msg, i) => (
            <div key={i} className={`tutor-message ${msg.role}`}>
              <div className="message-content">{msg.content}</div>
            </div>
          ))}
          {tutorLoading.value && (
            <div className="tutor-message assistant loading">
              <span className="typing-indicator">...</span>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="tutor-input-row">
          <textarea
            ref={inputRef}
            placeholder="Type your response..."
            rows={1}
            value={inputText}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            disabled={tutorLoading.value}
          />
          <button 
            type="button" 
            className="send-btn"
            onClick={submitResponse}
            disabled={tutorLoading.value || !inputText.trim()}
            aria-label="Send"
          >
            →
          </button>
        </div>

        {/* Footer */}
        <div className="tutor-footer">
          <span className="turn-counter">Turn {turnCount} of 3</span>
        </div>
      </div>
    </div>
  );
}
