// Import CSS — Vite inlines these into the single-file build
import './css/base.css';
import './css/dashboard.css';
import './css/session.css';
import './css/sidebar.css';
import './css/modals.css';
import './css/learn.css';

// Import typed logic modules — these replace the old concatenated JS
import { initStateSignals, appState, settings, persistState } from './signals';

// Import specific functions from each module (avoiding duplicates)
import {
  getFsrsDecay, getFsrsFactor, daysBetween as fsrsDaysBetween, clamp as fsrsClamp,
  retrievability, initialDifficulty, updateDifficulty, stabilityAfterSuccess,
  stabilityAfterForget, nextIntervalDays, scheduleFsrs, reweightProfile,
  optimizeFsrsParams, loadOptimizedWeights, getWeights, setWeights
} from './logic/fsrs';

import {
  getCourse, getCourseColor, getCourseExamType, isCourseManual, getEffectiveRetention,
  getEffectiveProfile, getEffectiveBloomBonus, getCramState, normalizeCoursePhase6,
  migrateAssessments, getActiveAssessment, getSubDeck, createSubDeck, isItemInArchivedSubDeck,
  listCourses, getCourseStats, TIER_PROFILES,
  BLOOM_STABILITY_BONUS, CRAM_TIER_MOD
} from './logic/courses';

import {
  detectSupportedTiers as cardsDetectTiers, getTierUnlockMessage as cardsTierUnlockMsg,
  createCard, updateCard, deleteCard, archiveCard
} from './logic/cards';

import {
  detectSupportedTiers as tiersDetectTiers, getTierUnlockMessage as tiersTierUnlockMsg,
  tierLabel, tierColour, tierFullName, renderQuickfireTierHTML, renderExplainTierHTML,
  renderApplyTierHTML, renderDistinguishTierHTML, renderMockTierHTML, renderWorkedTierHTML
} from './logic/tiers';

import {
  uid, esc, toRgba, fmtMMSS, isoNow, isoDate, daysBetween, clamp,
  countWords, toast, renderMd, deepClone, courseKey, generateModuleId, generateAssessmentId
} from './utils/helpers';

// Initialize state from SyncEngine
initStateSignals();

// Make state available globally for the original HTML event handlers
(window as any).state = appState;
(window as any).settings = settings;
(window as any).saveState = persistState;

// Expose FSRS functions
(window as any).getFsrsDecay = getFsrsDecay;
(window as any).getFsrsFactor = getFsrsFactor;
(window as any).fsrsDaysBetween = fsrsDaysBetween;
(window as any).fsrsClamp = fsrsClamp;
(window as any).retrievability = retrievability;
(window as any).initialDifficulty = initialDifficulty;
(window as any).updateDifficulty = updateDifficulty;
(window as any).stabilityAfterSuccess = stabilityAfterSuccess;
(window as any).stabilityAfterForget = stabilityAfterForget;
(window as any).nextIntervalDays = nextIntervalDays;
(window as any).scheduleFsrs = scheduleFsrs;
(window as any).reweightProfile = reweightProfile;
(window as any).optimizeFsrsParams = optimizeFsrsParams;
(window as any).loadOptimizedWeights = loadOptimizedWeights;
(window as any).getWeights = getWeights;
(window as any).setWeights = setWeights;

// Expose courses functions
(window as any).getCourse = getCourse;
(window as any).getCourseColor = getCourseColor;
(window as any).getCourseExamType = getCourseExamType;
(window as any).isCourseManual = isCourseManual;
(window as any).getEffectiveRetention = getEffectiveRetention;
(window as any).getEffectiveProfile = getEffectiveProfile;
(window as any).getEffectiveBloomBonus = getEffectiveBloomBonus;
(window as any).getCramState = getCramState;
(window as any).normalizeCoursePhase6 = normalizeCoursePhase6;
(window as any).migrateAssessments = migrateAssessments;
(window as any).getActiveAssessment = getActiveAssessment;
(window as any).getSubDeck = getSubDeck;
(window as any).createSubDeck = createSubDeck;
(window as any).isItemInArchivedSubDeck = isItemInArchivedSubDeck;
(window as any).listCourses = listCourses;
(window as any).getCourseStats = getCourseStats;
(window as any).TIER_PROFILES = TIER_PROFILES;
(window as any).BLOOM_STABILITY_BONUS = BLOOM_STABILITY_BONUS;
(window as any).CRAM_TIER_MOD = CRAM_TIER_MOD;

// Expose cards functions
(window as any).cardsDetectTiers = cardsDetectTiers;
(window as any).cardsTierUnlockMsg = cardsTierUnlockMsg;
(window as any).createCard = createCard;
(window as any).updateCard = updateCard;
(window as any).deleteCard = deleteCard;
(window as any).archiveCard = archiveCard;

// Expose tiers functions
(window as any).tiersDetectTiers = tiersDetectTiers;
(window as any).tiersTierUnlockMsg = tiersTierUnlockMsg;
(window as any).tierLabel = tierLabel;
(window as any).tierColour = tierColour;
(window as any).tierFullName = tierFullName;
(window as any).renderQuickfireTierHTML = renderQuickfireTierHTML;
(window as any).renderExplainTierHTML = renderExplainTierHTML;
(window as any).renderApplyTierHTML = renderApplyTierHTML;
(window as any).renderDistinguishTierHTML = renderDistinguishTierHTML;
(window as any).renderMockTierHTML = renderMockTierHTML;
(window as any).renderWorkedTierHTML = renderWorkedTierHTML;

// Expose helper functions
(window as any).uid = uid;
(window as any).esc = esc;
(window as any).toRgba = toRgba;
(window as any).fmtMMSS = fmtMMSS;
(window as any).isoNow = isoNow;
(window as any).isoDate = isoDate;
(window as any).daysBetween = daysBetween;
(window as any).clamp = clamp;
(window as any).countWords = countWords;
(window as any).toast = toast;
(window as any).renderMd = renderMd;
(window as any).deepClone = deepClone;
(window as any).courseKey = courseKey;
(window as any).generateModuleId = generateModuleId;
(window as any).generateAssessmentId = generateAssessmentId;
