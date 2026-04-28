import { profileLabel } from './courses/visibility';

type Nullable<T> = T | null;

declare const Core: any;
declare const gsap: any;

export interface SelectOption {
  v: string;
  t: string;
}

export interface ModalBridge {
  el: (id: string) => HTMLElement;
  listCourses: () => Array<{ name: string }>;
  toastFallback: (msg: string) => void;
  openCourseModal: () => void;
  getCourseColor: (courseName: Nullable<string>) => string;
  esc: (value: unknown) => string;
  state: { items: Record<string, any> };
  settings: { mockDefaultMins?: number };
  renderTopicSuggestions: (inputId: string, course: Nullable<string>, hostId: string) => void;
  playOpen: () => void;
  playClose: () => void;
  playClick: () => void;
  closeSettings: () => void;
  closeCourseModal: () => void;
  closeDeleteCoursePrompt: () => void;
  closeArchivedCoursesOverlay: () => void;
  getPendingImport: () => any;
  setPendingImport: (pending: any) => void;
}

export function isFeatureEnabled(features: Record<string, boolean | undefined> | undefined, key: string): boolean {
  if (!features) return true;
  if (typeof features[key] === 'undefined') return true;
  return !!features[key];
}

export function planProfileOptionsHtml(features: Record<string, boolean | undefined> | undefined): string {
  // A1: profile display labels come from the Course Details visibility helper.
  const options = [
    '<option value="">Use sub-deck default</option>',
    `<option value="theory">${profileLabel('theory')}</option>`,
    `<option value="factual">${profileLabel('factual')}</option>`,
    isFeatureEnabled(features, 'run5Language') ? `<option value="language">${profileLabel('language')}</option>` : '',
    `<option value="procedural">${profileLabel('procedural')}</option>`,
  ];
  return options.filter(Boolean).join('');
}

export interface ModalSystem {
  openModal: (tab?: string, courseName?: string) => void;
  closeModal: () => void;
  closeModals: () => void;
  renderModal: () => void;
  toast: (msg: string) => void;
  getActiveTab: () => string;
  getModalCourse: () => Nullable<string>;
  getModalFormEl: () => HTMLElement;
  getModalOvEl: () => HTMLElement;
  getModalShowingPicker: () => boolean;
  setModalShowingPicker: (value: boolean) => void;
}

export function setupModalSystem(bridge: ModalBridge): ModalSystem {
  const modalOv = bridge.el('modalOv');
  const modalForm = bridge.el('modalForm');
  let activeTab = 'add';
  let advancedOpen = false;
  let modalCourse: Nullable<string> = null;
  let modalShowingPicker = false;

  let toastEl: Nullable<HTMLDivElement> = null;
  let toastTimer: Nullable<number> = null;

  function tailFields(): string {
    return '' +
      '<div class="field">' +
      '<label>Plan profile</label>' +
      '<select id="m_planProfile" class="input">' +
      planProfileOptionsHtml((bridge as any).state?.studyEngineFeatures) +
      '</select>' +
      '</div>' +
      '<div class="field">' +
      '<label>Target language</label>' +
      '<select id="m_targetLanguage" class="input">' +
      '<option value="">Use parent default</option>' +
      '<option value="es-ES">Spanish (es-ES)</option>' +
      '<option value="fr-FR">French (fr-FR)</option>' +
      '<option value="de-DE">German (de-DE)</option>' +
      '<option value="ja-JP">Japanese (ja-JP)</option>' +
      '<option value="zh-CN">Chinese (zh-CN)</option>' +
      '<option value="__other__">Other (manual)</option>' +
      '</select>' +
      '<input id="m_targetLanguageOther" class="input" placeholder="e.g. it-IT" style="margin-top:6px;" />' +
      '</div>' +
      '<div class="field">' +
      '<label>Language level</label>' +
      '<select id="m_languageLevel" class="input">' +
      '<option value=\"\">Use parent default</option>' +
      '<option value=\"1\">1</option><option value=\"2\">2</option><option value=\"3\">3</option><option value=\"4\">4</option><option value=\"5\">5</option><option value=\"6\">6</option>' +
      '</select>' +
      '</div>';
  }

  function textField(label: string, id: string, ph: string): string {
    return '' +
      '<div class="field">' +
        '<label>' + bridge.esc(label) + '</label>' +
        '<input class="input" id="' + bridge.esc(id) + '" placeholder="' + bridge.esc(ph) + '" />' +
      '</div>';
  }

  function areaField(label: string, id: string, ph: string): string {
    return '' +
      '<div class="field">' +
        '<label>' + bridge.esc(label) + '</label>' +
        '<textarea id="' + bridge.esc(id) + '" rows="4" placeholder="' + bridge.esc(ph) + '"></textarea>' +
      '</div>';
  }

  function selectField(label: string, id: string, opts: SelectOption[], defV: string): string {
    let h = '<div class="field"><label>' + bridge.esc(label) + '</label><select id="' + bridge.esc(id) + '">';
    opts.forEach((o) => {
      h += '<option value="' + bridge.esc(o.v) + '"' + (String(o.v) === String(defV) ? ' selected' : '') + '>' + bridge.esc(o.t) + '</option>';
    });
    h += '</select></div>';
    return h;
  }

  function openModal(tab?: string, courseName?: string): void {
    activeTab = tab || 'add';

    if (courseName) {
      modalCourse = courseName;
      modalShowingPicker = false;
    } else {
      const courses = bridge.listCourses();
      if (courses.length === 0) {
        toast('Create a course first');
        bridge.openCourseModal();
        return;
      }
      if (courses.length === 1) {
        modalCourse = courses[0].name;
        modalShowingPicker = false;
      } else {
        modalCourse = null;
        modalShowingPicker = true;
      }
    }

    modalOv.classList.add('show');
    modalOv.setAttribute('aria-hidden', 'false');
    renderModal();
    if (Core && Core.a11y && Core.a11y.trap) Core.a11y.trap(modalOv);
    bridge.playOpen();
  }

  function closeModal(): void {
    modalOv.classList.remove('show');
    modalOv.setAttribute('aria-hidden', 'true');
    bridge.setPendingImport(null);
    const previewArea = document.getElementById('importPreviewArea');
    if (previewArea) previewArea.innerHTML = '';
    bridge.playClose();
  }

  function closeModals(): void {
    closeModal();
    bridge.closeSettings();
    bridge.closeCourseModal();
    bridge.closeDeleteCoursePrompt();
    bridge.closeArchivedCoursesOverlay();
  }

  function renderModal(): void {
    const tabsRoot = bridge.el('modalTabs');
    tabsRoot && tabsRoot.querySelectorAll('.tab').forEach((t) => {
      const tab = t as HTMLElement;
      const on = tab.getAttribute('data-tab') === activeTab;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    if (activeTab !== 'import' && bridge.getPendingImport()) {
      bridge.setPendingImport(null);
      const previewArea = document.getElementById('importPreviewArea');
      if (previewArea) previewArea.innerHTML = '';
    }

    const showAdd = activeTab === 'add';
    bridge.el('addNextBtn').style.display = showAdd ? 'inline-flex' : 'none';

    if (modalShowingPicker) {
      const courses = bridge.listCourses();
      let h = '<div class="section-header">Select a course</div>';
      h += '<div class="course-picker-list">';
      courses.forEach((c) => {
        const col = (c as any).color || '#8b5cf6';
        let itemCount = 0;
        for (const id in bridge.state.items) {
          if (!Object.prototype.hasOwnProperty.call(bridge.state.items, id) || !bridge.state.items[id] || bridge.state.items[id].course !== c.name) continue;
          if (!bridge.state.items[id].archived) itemCount++;
        }
        h += '<div class="course-picker-item" data-pick-course="' + bridge.esc(c.name) + '">' +
            '<div class="cpi-dot" style="background:' + bridge.esc(col) + '"></div>' +
            '<span class="cpi-name">' + bridge.esc(c.name) + '</span>' +
            '<span class="cpi-count">' + itemCount + ' cards</span>' +
            '</div>';
      });
      h += '</div>';
      modalForm.innerHTML = h;

      modalForm.querySelectorAll('.course-picker-item').forEach((item) => {
        item.addEventListener('click', function onPickerClick(this: Element) {
          modalCourse = this.getAttribute('data-pick-course');
          modalShowingPicker = false;
          renderModal();
          bridge.playClick();
        });
      });

      bridge.el('addNextBtn').style.display = 'none';
      bridge.el('doneBtn').style.display = 'none';
      return;
    }

    bridge.el('doneBtn').style.display = 'inline-flex';

    if (activeTab === 'add') {
      const courseCol = bridge.getCourseColor(modalCourse);
      const courseBadge = '<div class="modal-course-badge">' +
          '<div class="mcb-dot" style="background:' + bridge.esc(courseCol) + '"></div>' +
          '<span class="mcb-name">' + bridge.esc(modalCourse || 'Unknown') + '</span>' +
          '<span class="mcb-change" onclick="modalShowingPicker=true;renderModal();">Change</span>' +
          '</div>';

      modalForm.innerHTML = courseBadge +
        '<div class="field">' +
        '<label>Topic <span style="font-weight:500;letter-spacing:0.5px;text-transform:lowercase;opacity:0.7">(optional)</span></label>' +
        '<input class="input" id="m_topic" placeholder="e.g., WTO Dispute Settlement">' +
        '<div class="chips topic-suggestions" id="topicSuggestions"></div>' +
        '</div>' +
        '<div class="field">' +
        '  <label>Priority</label>' +
        '  <select id="m_priority" class="input">' +
        '    <option value="critical">🔴 Critical — almost certainly on exam</option>' +
        '    <option value="high">🟡 High — very likely tested</option>' +
        '    <option value="medium" selected>🟣 Medium — default</option>' +
        '    <option value="low">⚪ Low — peripheral context</option>' +
        '  </select>' +
        '</div>' +
        areaField('Prompt', 'm_prompt', 'Question, cue, or concept to recall') +
        areaField('Model Answer', 'm_answer', 'Ideal response to compare against') +
        '<div class="adv-toggle" id="advToggle">' +
        '<span class="adv-arrow">▶</span>' +
        '<span class="adv-text">Advanced fields (scenario, concepts, timer)</span>' +
        '</div>' +
        '<div class="adv-fields" id="advFields">' +
        areaField('Scenario', 'm_scenario', 'Fact pattern or context for application (enables Apply It tier)') +
        textField('Task', 'm_task', 'Instruction for the scenario (optional)') +
        '<div class="course-form-row">' +
        textField('Concept A', 'm_conceptA', 'e.g., Trade creation') +
        textField('Concept B', 'm_conceptB', 'e.g., Trade diversion') +
        '</div>' +
        '<p class="help">Filling Concept A + B enables the Distinguish tier.</p>' +
        selectField('Mock time limit', 'm_time', [{ v: '5', t: '5 min' }, { v: '10', t: '10 min' }, { v: '15', t: '15 min' }, { v: '30', t: '30 min' }], String((bridge.settings && bridge.settings.mockDefaultMins) || 10)) +
        '<p class="help">Setting a time limit enables the Mock Exam tier.</p>' +
        '</div>' +
        tailFields() +
        '<div id="tierBadgeArea"></div>';

      setTimeout(() => {
        const tog = bridge.el('advToggle');
        if (tog) {
          tog.addEventListener('click', () => {
            advancedOpen = !advancedOpen;
            tog.classList.toggle('open', advancedOpen);
            bridge.el('advFields').classList.toggle('show', advancedOpen);
          });
        }
        if (advancedOpen) {
          tog && tog.classList.add('open');
          bridge.el('advFields') && bridge.el('advFields').classList.add('show');
        }
      }, 0);

      setTimeout(() => {
        bridge.renderTopicSuggestions('m_topic', modalCourse, 'topicSuggestions');
      }, 10);
    } else if (activeTab === 'import') {
      const courseCol2 = bridge.getCourseColor(modalCourse);
      const courseBadge2 = '<div class="modal-course-badge">' +
          '<div class="mcb-dot" style="background:' + bridge.esc(courseCol2) + '"></div>' +
          '<span class="mcb-name">' + bridge.esc(modalCourse || 'Unknown') + '</span>' +
          '<span class="mcb-change" onclick="modalShowingPicker=true;renderModal();">Change</span>' +
          '</div>';

      modalForm.innerHTML = courseBadge2 +
        '<div class="field">' +
        '<label>Paste JSON array</label>' +
        '<textarea class="input" id="m_import" rows="6" placeholder=\'[{"prompt":"...","modelAnswer":"..."}]\'></textarea>' +
        '<p class="help">Each object needs at minimum: <b>prompt</b>, <b>modelAnswer</b>. Optional: topic, task, scenario, conceptA, conceptB, timeLimitMins. The course is set automatically to <b>' + bridge.esc(modalCourse) + '</b>.</p>' +
        '</div>';
    }

    setTimeout(() => {
      const first = modalForm.querySelector('textarea, input, select') as Nullable<HTMLElement>;
      if (first) first.focus();
    }, 0);
  }

  function toast(msg: string): void {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText =
        'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);' +
        'z-index:99;padding:10px 12px;border-radius:14px;' +
        'background:rgba(var(--accent-rgb),0.16);border:1px solid rgba(var(--accent-rgb),0.22);' +
        'backdrop-filter:var(--blur);-webkit-backdrop-filter:var(--blur);' +
        'color:var(--text);font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;' +
        'box-shadow:var(--shadow-soft);opacity:0;pointer-events:none;';
      document.body.appendChild(toastEl);
    }

    toastEl.textContent = msg;
    if (toastTimer) clearTimeout(toastTimer);
    if (window.gsap) {
      gsap.to(toastEl, { opacity: 1, y: -4, duration: 0.18, ease: 'power2.out' });
    } else {
      toastEl.style.opacity = '1';
    }

    toastTimer = window.setTimeout(() => {
      if (window.gsap) gsap.to(toastEl, { opacity: 0, y: 0, duration: 0.22, ease: 'power2.inOut' });
      else toastEl!.style.opacity = '0';
    }, 1400);
  }

  bridge.el('addBtn').addEventListener('click', () => { openModal('add'); });
  bridge.el('importBtn').addEventListener('click', () => { openModal('import'); });
  bridge.el('modalClose').addEventListener('click', () => { closeModal(); });
  modalOv.addEventListener('click', (e) => {
    if (e.target === modalOv) closeModal();
  });

  const modalTabsEl = bridge.el('modalTabs') || bridge.el('tierTabs');
  if (modalTabsEl) {
    modalTabsEl.querySelectorAll('.tab').forEach((t) => {
      t.addEventListener('click', function onTabClick(this: Element) {
        activeTab = this.getAttribute('data-tab') || activeTab;
        renderModal();
      });
    });
  }

  return {
    openModal,
    closeModal,
    closeModals,
    renderModal,
    toast,
    getActiveTab: () => activeTab,
    getModalCourse: () => modalCourse,
    getModalFormEl: () => modalForm,
    getModalOvEl: () => modalOv,
    getModalShowingPicker: () => modalShowingPicker,
    setModalShowingPicker: (value: boolean) => {
      modalShowingPicker = value;
    }
  };
}
