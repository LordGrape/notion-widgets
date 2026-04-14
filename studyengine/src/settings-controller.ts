import { items, courses, settings, stats, calibration, saveState } from './signals';
import { esc, toast } from './utils';

type Win = Window & typeof globalThis & {
  openSettings?: () => void;
  closeSettings?: () => void;
  saveSettingsFromForm?: () => void;
};

function renderSettingsModal(): void {
  const body = document.getElementById('settingsTabGeneral');
  if (!body) return;
  const s = settings.value;
  body.innerHTML =
    '<div class="form-row"><label class="form-label">Session Limit (cards per session)</label>' +
      '<input id="s_sessionLimit" class="modal-input" type="number" min="1" max="100" value="' + (s.sessionLimit || 12) + '"></div>' +
    '<div class="form-row"><label class="form-label">Desired Retention (%)</label>' +
      '<input id="s_retention" class="modal-input" type="number" min="70" max="99" value="' + Math.round((s.desiredRetention || 0.9) * 100) + '"></div>' +
    '<div class="form-row"><label class="form-label">Feedback Mode</label>' +
      '<select id="s_feedback" class="modal-input">' +
        '<option value="adaptive"' + (s.feedbackMode === 'adaptive' ? ' selected' : '') + '>Adaptive</option>' +
        '<option value="immediate"' + (s.feedbackMode === 'immediate' ? ' selected' : '') + '>Immediate feedback</option>' +
        '<option value="delayed"' + (s.feedbackMode === 'delayed' ? ' selected' : '') + '>Delayed feedback</option>' +
      '</select></div>' +
    '<div class="form-row"><label class="form-label">Gamification</label>' +
      '<select id="s_gamification" class="modal-input">' +
        '<option value="clean"' + (s.gamificationMode === 'clean' ? ' selected' : '') + '>Clean</option>' +
        '<option value="motivated"' + (s.gamificationMode === 'motivated' ? ' selected' : '') + '>Motivated (XP + Dragon)</option>' +
        '<option value="off"' + (s.gamificationMode === 'off' ? ' selected' : '') + '>Off</option>' +
      '</select></div>' +
    '<div class="form-row"><label class="form-label">Your Name (for tutor)</label>' +
      '<input id="s_userName" class="modal-input" type="text" value="' + esc(s.userName || '') + '" placeholder="Optional"></div>' +
    '<div style="margin-top:14px;">' +
      '<button type="button" class="big-btn" id="settingsSaveBtn">Save Settings</button>' +
    '</div>';

  body.querySelector('#settingsSaveBtn')?.addEventListener('click', () => saveSettingsFromForm());
}

export function openSettings(): void {
  const ov = document.getElementById('settingsOv');
  if (ov) {
    ov.classList.add('show');
    ov.setAttribute('aria-hidden', 'false');
  }
  renderSettingsModal();
}

export function closeSettings(): void {
  const ov = document.getElementById('settingsOv');
  if (ov) {
    ov.classList.remove('show');
    ov.setAttribute('aria-hidden', 'true');
  }
}

export function saveSettingsFromForm(): void {
  const s = { ...settings.value };
  const limit = parseInt((document.getElementById('s_sessionLimit') as HTMLInputElement | null)?.value || '12', 10);
  const ret = parseInt((document.getElementById('s_retention') as HTMLInputElement | null)?.value || '90', 10);
  const feedback = (document.getElementById('s_feedback') as HTMLSelectElement | null)?.value || 'adaptive';
  const gamification = (document.getElementById('s_gamification') as HTMLSelectElement | null)?.value || 'clean';
  const userName = (document.getElementById('s_userName') as HTMLInputElement | null)?.value.trim() || '';

  if (!Number.isNaN(limit) && limit >= 1) s.sessionLimit = limit;
  if (!Number.isNaN(ret) && ret >= 70 && ret <= 99) s.desiredRetention = ret / 100;
  if (['adaptive', 'immediate', 'delayed'].includes(feedback)) s.feedbackMode = feedback as typeof s.feedbackMode;
  if (['clean', 'motivated', 'off'].includes(gamification)) s.gamificationMode = gamification as typeof s.gamificationMode;
  s.userName = userName;

  settings.value = s;
  saveState();
  closeSettings();
  toast('Settings saved');
}

export function initSettingsController(): void {
  const w = window as Win;
  w.openSettings = openSettings;
  w.closeSettings = closeSettings;
  w.saveSettingsFromForm = saveSettingsFromForm;

  document.getElementById('settingsClose')?.addEventListener('click', closeSettings);
  document.getElementById('settingsSave')?.addEventListener('click', saveSettingsFromForm);

  document.querySelectorAll('.settings-tab[data-settings-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const t = tab.getAttribute('data-settings-tab');
      document.querySelectorAll('.settings-tab').forEach((tt) => {
        tt.classList.remove('active');
        (tt as HTMLElement).style.background = 'transparent';
        (tt as HTMLElement).style.color = 'var(--text-secondary)';
      });
      tab.classList.add('active');
      (tab as HTMLElement).style.background = 'rgba(var(--accent-rgb),0.18)';
      (tab as HTMLElement).style.color = 'var(--text)';
      document.querySelectorAll('.settings-tab-panel').forEach((p) => ((p as HTMLElement).style.display = 'none'));
      if (t === 'general') document.getElementById('settingsTabGeneral')?.style.setProperty('display', '');
      if (t === 'data') document.getElementById('settingsTabData')?.style.setProperty('display', '');
    });
  });

  document.getElementById('showDataBtn')?.addEventListener('click', () => {
    const area = document.getElementById('showDataArea');
    const ta = document.getElementById('showDataText') as HTMLTextAreaElement | null;
    if (!area || !ta) return;
    area.style.display = area.style.display === 'none' ? '' : 'none';
    ta.value = JSON.stringify({
      items: items.value,
      courses: courses.value,
      calibration: calibration.value,
      stats: stats.value,
      settings: settings.value,
    }, null, 2);
  });

  document.getElementById('restoreDataBtn')?.addEventListener('click', () => {
    const ta = document.getElementById('pasteDataText') as HTMLTextAreaElement | null;
    const status = document.getElementById('restoreStatus');
    if (!ta) return;
    try {
      const data = JSON.parse(ta.value);
      if (data.items && typeof data.items === 'object') items.value = data.items;
      if (data.courses && typeof data.courses === 'object') courses.value = data.courses;
      if (data.calibration && typeof data.calibration === 'object') calibration.value = data.calibration;
      if (data.stats && typeof data.stats === 'object') stats.value = data.stats;
      if (data.settings && typeof data.settings === 'object') settings.value = data.settings;
      saveState();
      if (status) status.textContent = 'Data restored. Reload recommended.';
      toast('Data restored — reload page');
    } catch (_err) {
      if (status) status.textContent = 'Invalid JSON';
    }
  });
}
