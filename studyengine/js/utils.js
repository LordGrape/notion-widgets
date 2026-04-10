/* Phase 2 extraction: copied from monolith; source-of-truth remains state.js for parity. */

    function uid() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }

    function esc(s){
      return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    /* ── Sidebar State (Standalone) ── */
    var sidebarSelection = { level: 'all', course: null, module: null, topic: null };
    var sidebarExpanded = {}; // keys: course names or module ids, values: booleans

    /* ═══ SECTION: Build Course Tree | Functions: buildCourseTree ═══ */
    function buildCourseTree() {
      var tree = {};
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.archived) continue;
        if (it.course && state.courses[it.course] && state.courses[it.course].archived) continue;
        var course = it.course || 'Uncategorized';
        var topic = it.topic || 'General';
        if (!tree[course]) tree[course] = { topics: {}, totalCards: 0, dueCards: 0 };
        if (!tree[course].topics[topic]) tree[course].topics[topic] = { cards: [], dueCards: 0 };
        tree[course].topics[topic].cards.push(id);
        tree[course].totalCards++;
        var f = it.fsrs && it.fsrs.due ? it.fsrs : null;
        if (!f || !f.lastReview) {
          tree[course].dueCards++;
          tree[course].topics[topic].dueCards++;
        } else {
          var dueDate = new Date(f.due);
          if (dueDate <= new Date()) {
            tree[course].dueCards++;
            tree[course].topics[topic].dueCards++;
          }
        }
      }
      return tree;
    }

    /* ═══ SECTION: Render Sidebar | Functions: renderSidebar ═══ */
    function renderSidebar() {
      if (isEmbedded) return;
      var container = document.getElementById('sidebarTree');
      if (!container) return;
      var archivedCourses = listCourses(true).filter(function(c) { return c && c.archived; });
      var archivedBtn = document.getElementById('sbArchivedBtn');
      var archivedCount = document.getElementById('sbArchivedCount');
      if (archivedBtn) archivedBtn.style.display = archivedCourses.length > 0 ? 'flex' : 'none';
      if (archivedCount) archivedCount.textContent = String(archivedCourses.length);

      var tree = buildCourseTree();
      var html = '';

      // Total counts
      var totalCards = 0, totalDue = 0;
      for (var c in tree) { totalCards += tree[c].totalCards; totalDue += tree[c].dueCards; }

      // "All Courses" row
      var allActive = sidebarSelection.level === 'all' ? ' active' : '';
      html += '<div class="tree-node depth-0 tree-node-hoverable tree-node-root-actions' + allActive + '" data-level="all">';
      html += '<span class="tree-icon">📚</span>';
      html += '<span class="tree-label">All Courses</span>';
      if (totalDue > 0) html += '<span class="tree-badge">' + totalDue + '</span>';
      html += '<span class="tree-hover-actions">';
      html += '<button class="tree-action-btn" data-action="create-course" title="Add deck" aria-label="Add deck">＋</button>';
      html += '</span>';
      html += '</div>';
      html += '<div class="tree-section-divider"></div>';

      // Courses — collapsed by default
      var courseNames = Object.keys(tree).sort();

      courseNames.forEach(function(courseName) {
        var courseData = state.courses[courseName] || {};
        ensureCourseModules(courseName);
        var ct = tree[courseName];
        var color = courseData.color || '#8b5cf6';
        var isExpanded = sidebarExpanded[courseName] === true; // default collapsed
        var courseActive = (sidebarSelection.course === courseName) ? ' active' : '';
        var cram = getCramState(courseName);
        var modules = (courseData.modules || []);

        // Course row with hover actions
        html += '<div class="tree-node depth-0 tree-node-hoverable' + courseActive + '" data-level="course" data-course="' + esc(courseName) + '">';
        html += '<span class="tree-chevron' + (isExpanded ? ' expanded' : '') + '" data-toggle="' + esc(courseName) + '"></span>';
        html += '<span class="tree-icon" style="color:' + color + ';">●</span>';
        html += '<span class="tree-label">' + esc(courseName) + '</span>';
        if (ct.dueCards > 0) html += '<span class="tree-badge">' + ct.dueCards + '</span>';
        // Hover actions
        html += '<span class="tree-hover-actions">';
        html += '<button class="tree-action-btn" data-action="add-module" data-course="' + esc(courseName) + '" title="Add subdeck">＋</button>';
        html += '<button class="tree-action-btn" data-action="course-menu" data-course="' + esc(courseName) + '" title="More options">⋯</button>';
        html += '</span>';
        html += '</div>';

        // Cram badge (inline)
        if (cram.active) {
          html += '<div class="tree-inline-badge" style="padding-left:42px;' + (isExpanded ? '' : 'display:none;') + '" data-parent="' + esc(courseName) + '">';
          html += '<span class="tree-cram-badge">🔥 ' + (cram.daysUntil != null ? cram.daysUntil + 'd to exam' : 'Cram') + '</span>';
          html += '</div>';
        }

        // Expanded content: modules then ungrouped topics
        if (isExpanded) {
          var assignedTopics = {};

          // Modules
          modules.forEach(function(mod) {
            if (!mod || !mod.id) return;
            var modExpanded = sidebarExpanded[mod.id] === true;
            var modActive = (sidebarSelection.module === mod.id) ? ' active' : '';
            var modCards = 0, modDue = 0;
            (mod.topics || []).forEach(function(t) {
              if (ct.topics[t]) { modCards += ct.topics[t].cards.length; modDue += ct.topics[t].dueCards; }
              assignedTopics[t] = true;
            });

            html += '<div class="tree-node depth-1 tree-node-hoverable' + modActive + '" data-level="module" data-course="' + esc(courseName) + '" data-module="' + esc(mod.id) + '">';
            if (mod.topics && mod.topics.length > 0) {
              html += '<span class="tree-chevron' + (modExpanded ? ' expanded' : '') + '" data-toggle="' + esc(mod.id) + '"></span>';
            } else {
              html += '<span class="tree-chevron" style="visibility:hidden;"></span>';
            }
            html += '<span class="tree-icon">' + (mod.lectureImported ? '📖' : '📁') + '</span>';
            html += '<span class="tree-label">' + esc(mod.name || 'Subdeck') + '</span>';
            if (modCards > 0) html += '<span class="tree-count">' + modCards + '</span>';
            if (modDue > 0) html += '<span class="tree-badge">' + modDue + '</span>';
            html += '<span class="tree-hover-actions">';
            html += '<button class="tree-action-btn" data-action="module-menu" data-course="' + esc(courseName) + '" data-module="' + esc(mod.id) + '" title="Options">⋯</button>';
            html += '</span>';
            html += '</div>';

            // Topics under module (expanded)
            if (modExpanded && mod.topics) {
              mod.topics.forEach(function(t) {
                if (!ct.topics[t]) return;
                var topicActive = (sidebarSelection.topic === t && sidebarSelection.course === courseName) ? ' active' : '';
                html += '<div class="tree-node depth-2' + topicActive + '" data-level="topic" data-course="' + esc(courseName) + '" data-topic="' + esc(t) + '">';
                html += '<span class="tree-label">' + esc(t) + '</span>';
                html += '<span class="tree-count">' + ct.topics[t].cards.length + '</span>';
                if (ct.topics[t].dueCards > 0) html += '<span class="tree-badge">' + ct.topics[t].dueCards + '</span>';
                html += '</div>';
              });
            }
          });

          // Ungrouped topics
          var ungrouped = Object.keys(ct.topics).filter(function(t) { return !assignedTopics[t]; }).sort();
          if (ungrouped.length > 0) {
            if (modules.length > 0) {
              var ugKey = '_ungrouped_' + courseName;
              var ugExpanded = sidebarExpanded[ugKey] === true;
              html += '<div class="tree-node depth-1" data-level="ungrouped" data-course="' + esc(courseName) + '" style="opacity:0.65;">';
              html += '<span class="tree-chevron' + (ugExpanded ? ' expanded' : '') + '" data-toggle="' + esc(ugKey) + '"></span>';
              html += '<span class="tree-icon">📦</span>';
              html += '<span class="tree-label">Ungrouped</span>';
              html += '<span class="tree-count">' + ungrouped.reduce(function(s, t) { return s + ct.topics[t].cards.length; }, 0) + '</span>';
              html += '</div>';
              if (ugExpanded) {
                ungrouped.forEach(function(t) {
                  var topicActive = (sidebarSelection.topic === t && sidebarSelection.course === courseName) ? ' active' : '';
                  html += '<div class="tree-node depth-2' + topicActive + '" data-level="topic" data-course="' + esc(courseName) + '" data-topic="' + esc(t) + '">';
                  html += '<span class="tree-label">' + esc(t) + '</span>';
                  html += '<span class="tree-count">' + ct.topics[t].cards.length + '</span>';
                  if (ct.topics[t].dueCards > 0) html += '<span class="tree-badge">' + ct.topics[t].dueCards + '</span>';
                  html += '</div>';
                });
              }
            } else {
              var tKey = '_topics_' + courseName;
              var topicsExpanded = sidebarExpanded[tKey] === true;
              html += '<div class="tree-node depth-1" data-level="topics-toggle" data-course="' + esc(courseName) + '" style="opacity:0.7;">';
              html += '<span class="tree-chevron' + (topicsExpanded ? ' expanded' : '') + '" data-toggle="' + esc(tKey) + '"></span>';
              html += '<span class="tree-icon">🏷</span>';
              html += '<span class="tree-label">Topics (' + ungrouped.length + ')</span>';
              html += '</div>';
              if (topicsExpanded) {
                ungrouped.forEach(function(t) {
                  var topicActive = (sidebarSelection.topic === t && sidebarSelection.course === courseName) ? ' active' : '';
                  html += '<div class="tree-node depth-2' + topicActive + '" data-level="topic" data-course="' + esc(courseName) + '" data-topic="' + esc(t) + '">';
                  html += '<span class="tree-label">' + esc(t) + '</span>';
                  html += '<span class="tree-count">' + ct.topics[t].cards.length + '</span>';
                  if (ct.topics[t].dueCards > 0) html += '<span class="tree-badge">' + ct.topics[t].dueCards + '</span>';
                  html += '</div>';
                });
              }
            }
          }
        }
      });

      container.innerHTML = html;

      // Event delegation
      container.onclick = function(e) {
        // Chevron toggles
        var chevron = e.target.closest && e.target.closest('.tree-chevron[data-toggle]');
        if (chevron) {
          var key = chevron.dataset.toggle;
          sidebarExpanded[key] = !sidebarExpanded[key];
          renderSidebar();
          try { playClick(); } catch (ex) {}
          return;
        }

        // Hover action buttons
        var actionBtn = e.target.closest && e.target.closest('.tree-action-btn');
        if (actionBtn) {
          e.stopPropagation();
          var action = actionBtn.dataset.action;
          var actionCourse = actionBtn.dataset.course;
          var actionModule = actionBtn.dataset.module;

          if (action === 'add-module') {
            sidebarExpanded[actionCourse] = true;
            renderSidebar();
            var freshNode = document.getElementById('sidebarTree')
              ? document.getElementById('sidebarTree').querySelector('.tree-node[data-level="course"][data-course="' + esc(actionCourse) + '"]')
              : null;
            showInlineSidebarInput(freshNode, 'Subdeck name...', function(name) {
              addModuleToCourse(actionCourse, { name: name, topics: [], lectureImported: false });
              renderSidebar();
              toast('Created subdeck: ' + name);
            });
            return;
          }

          if (action === 'create-course') {
            openCreateCourseFlow();
            return;
          }

          if (action === 'course-menu') {
            showCourseContextMenu(actionCourse, actionBtn);
            return;
          }

          if (action === 'module-menu') {
            showModuleContextMenu(actionCourse, actionModule, actionBtn);
            return;
          }
          return;
        }

        // Node clicks
        var node = e.target.closest && e.target.closest('.tree-node');
        if (!node) return;
        var level = node.dataset.level;
        var courseName = node.dataset.course || null;
        var moduleId = node.dataset.module || null;
        var topic = node.dataset.topic || null;

        if (level === 'ungrouped' || level === 'topics-toggle') return;

        sidebarSelection = { level: level, course: courseName, module: moduleId, topic: topic };

        if (level === 'course' && courseName && !sidebarExpanded[courseName]) {
          sidebarExpanded[courseName] = true;
        }

        renderSidebar();
        updateBreadcrumb();
        applySidebarFilter();
        try { playClick(); } catch (ex2) {}
      };
    }

    /* ═══ SECTION: Update Breadcrumb | Functions: updateBreadcrumb ═══ */
    function updateBreadcrumb() {
      if (isEmbedded) return;
      var bc = document.getElementById('mainBreadcrumb');
      if (!bc) return;
      var html = '<span class="bc-segment bc-root" data-level="all">All Courses</span>';
      if (sidebarSelection.course) {
        html += '<span class="bc-separator">›</span>';
        html += '<span class="bc-segment" data-level="course" data-course="' + esc(sidebarSelection.course) + '">' + esc(sidebarSelection.course) + '</span>';
      }
      if (sidebarSelection.module && sidebarSelection.course) {
        var mod = getModuleById(sidebarSelection.course, sidebarSelection.module);
        if (mod) {
          html += '<span class="bc-separator">›</span>';
          html += '<span class="bc-segment" data-level="module" data-course="' + esc(sidebarSelection.course) + '" data-module="' + esc(mod.id) + '">' + esc(mod.name || 'Subdeck') + '</span>';
        }
      }
      if (sidebarSelection.topic) {
        html += '<span class="bc-separator">›</span>';
        html += '<span class="bc-segment" data-level="topic" data-course="' + esc(sidebarSelection.course || '') + '" data-module="' + esc(sidebarSelection.module || '') + '" data-topic="' + esc(sidebarSelection.topic) + '">' + esc(sidebarSelection.topic) + '</span>';
      }
      bc.innerHTML = html;

      bc.onclick = function(e) {
        var seg = e.target && e.target.closest ? e.target.closest('.bc-segment') : null;
        if (!seg) return;
        var level = seg.dataset.level;
        if (level === 'all') sidebarSelection = { level: 'all', course: null, module: null, topic: null };
        else if (level === 'course') sidebarSelection = { level: 'course', course: seg.dataset.course, module: null, topic: null };
        else if (level === 'module') sidebarSelection = { level: 'module', course: seg.dataset.course || sidebarSelection.course, module: seg.dataset.module, topic: null };
        else if (level === 'topic') sidebarSelection = { level: 'topic', course: seg.dataset.course || sidebarSelection.course, module: seg.dataset.module || null, topic: seg.dataset.topic || sidebarSelection.topic };
        renderSidebar();
        updateBreadcrumb();
        applySidebarFilter();
      };
    }

    /* ═══ SECTION: Apply Sidebar Filter | Functions: applySidebarFilter ═══ */
    function applySidebarFilter() {
      // 1) Bridge to existing course filter
      applySidebarFilterChipsOnly();

      // Ensure we're on the dashboard view in standalone so context views can render
      if (!isEmbedded) {
        try { showView('viewDash'); } catch (e0) {}
        try { switchNav('home'); } catch (e1) {}
      }

      // 2) Context views
      if (!isEmbedded) {
        if (sidebarSelection.level === 'course' && sidebarSelection.course) {
          showCourseDashboard(sidebarSelection.course);
          return;
        } else if (sidebarSelection.level === 'module' && sidebarSelection.course && sidebarSelection.module) {
          showModuleView(sidebarSelection.course, sidebarSelection.module);
          return;
        } else if (sidebarSelection.level === 'topic' && sidebarSelection.course && sidebarSelection.topic) {
          showTopicView(sidebarSelection.course, sidebarSelection.topic);
          return;
        } else {
          hideContextViews();
        }
      }

      try { renderDashboard(); } catch (e2) {}
    }

    /* ═══ SECTION: Hide Context Views | Functions: hideContextViews ═══ */
    function hideContextViews() {
      var cv = document.getElementById('courseDashView');
      var mv = document.getElementById('moduleDetailView');
      var tv = document.getElementById('topicDetailView');
      if (cv) cv.style.display = 'none';
      if (mv) mv.style.display = 'none';
      if (tv) tv.style.display = 'none';
      var normalDash = document.getElementById('viewDash');
      if (normalDash) normalDash.style.display = '';
    }

    /* ═══ SECTION: Apply Sidebar Filter Chips Only | Functions: applySidebarFilterChipsOnly ═══ */
    function applySidebarFilterChipsOnly() {
      try {
        if (sidebarSelection.level === 'all' || !sidebarSelection.course) {
          if (typeof selectedCourse !== 'undefined') selectedCourse = 'All';
        } else if (sidebarSelection.course) {
          if (typeof selectedCourse !== 'undefined') selectedCourse = sidebarSelection.course;
        }
      } catch (e) {}
    }

    /* ═══ SECTION: Render Card List | Functions: renderCardList ═══ */
    function renderCardList(cards) {
      cards = (cards || []).slice();
      cards.sort(function(a, b) {
        var aDue = isDueNow(a) ? 0 : 1;
        var bDue = isDueNow(b) ? 0 : 1;
        if (aDue !== bDue) return aDue - bDue;
        var aStab = (a.fsrs && a.fsrs.stability) || 0;
        var bStab = (b.fsrs && b.fsrs.stability) || 0;
        return aStab - bStab;
      });

      var h = '<div class="ctx-card-list">';
      cards.forEach(function(card) {
        var tier = card.tier || 'quickfire';
        var tColor = tierColour(tier);
        var prompt = (card.prompt || '').substring(0, 120);
        var due = isDueNow(card);
        var stability = (card.fsrs && card.fsrs.stability) ? (Math.round(card.fsrs.stability) + 'd') : 'new';
        var reps = (card.fsrs && card.fsrs.reps) || 0;

        h += '<div class="ctx-card-row">';
        h += '<span class="cr-tier" style="background:' + tColor + '22;color:' + tColor + ';">' + esc(String(tierLabel(tier) || '').substring(0, 2).toUpperCase()) + '</span>';
        h += '<span class="cr-prompt">' + esc(prompt) + '</span>';
        h += '<span class="cr-meta">' + esc(stability) + ' · ' + reps + ' reps</span>';
        if (due) h += '<span class="cr-due-badge">DUE</span>';
        h += '</div>';
      });
      h += '</div>';
      return h;
    }

    /* ── Inline Sidebar Input ── */
    /* ═══ SECTION: Dismiss Inline Sidebar Input | Functions: dismissInlineSidebarInput ═══ */
    function dismissInlineSidebarInput() {
      var existing = document.querySelector('.sb-inline-input-wrap');
      if (existing) existing.remove();
    }

    /* ═══ SECTION: Show Inline Sidebar Input | Functions: showInlineSidebarInput ═══ */
    function showInlineSidebarInput(parentNode, placeholder, callback) {
      dismissInlineSidebarInput();

      var wrapper = document.createElement('div');
      wrapper.className = 'sb-inline-input-wrap';
      wrapper.innerHTML =
        '<input type="text" class="se-input sb-inline-input" placeholder="' + esc(placeholder || '') + '">' +
        '<div class="sb-inline-input-actions">' +
          '<button type="button" class="sb-inline-confirm">✓</button>' +
          '<button type="button" class="sb-inline-cancel">✕</button>' +
        '</div>';

      if (parentNode && parentNode.parentNode) {
        if (parentNode.nextSibling) parentNode.parentNode.insertBefore(wrapper, parentNode.nextSibling);
        else parentNode.parentNode.appendChild(wrapper);
      } else {
        var tree = document.getElementById('sidebarTree');
        if (tree) tree.appendChild(wrapper);
      }

      var input = wrapper.querySelector('input');
      var confirmBtn = wrapper.querySelector('.sb-inline-confirm');
      var cancelBtn = wrapper.querySelector('.sb-inline-cancel');

      /* ═══ SECTION: Submit | Functions: submit ═══ */
      function submit() {
        var val = (input && input.value) ? input.value.trim() : '';
        dismissInlineSidebarInput();
        if (val && callback) callback(val);
      }

      /* ═══ SECTION: Cancel | Functions: cancel ═══ */
      function cancel() {
        dismissInlineSidebarInput();
      }

      if (input) {
        input.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
          e.stopPropagation();
        });
        requestAnimationFrame(function() { try { input.focus(); } catch (eF) {} });
      }

      if (confirmBtn) confirmBtn.addEventListener('click', function(e) { e.stopPropagation(); submit(); });
      if (cancelBtn) cancelBtn.addEventListener('click', function(e) { e.stopPropagation(); cancel(); });
    }

    /* ── Sidebar Context Menus ── */
    var _activeCtxMenu = null;

    /* ═══ SECTION: Dismiss Ctx Menu | Functions: dismissCtxMenu ═══ */
    function dismissCtxMenu() {
      if (_activeCtxMenu) {
        _activeCtxMenu.remove();
        _activeCtxMenu = null;
      }
      document.removeEventListener('click', dismissCtxMenu);
    }

    /* ═══ SECTION: Show Ctx Menu At | Functions: showCtxMenuAt ═══ */
    function showCtxMenuAt(anchorEl, items) {
      dismissCtxMenu();
      var menu = document.createElement('div');
      menu.className = 'tree-ctx-menu';

      items.forEach(function(item) {
        if (item.divider) {
          var div = document.createElement('div');
          div.className = 'tree-ctx-menu-divider';
          menu.appendChild(div);
          return;
        }
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tree-ctx-menu-item' + (item.danger ? ' danger' : '');
        btn.innerHTML = (item.icon ? '<span>' + item.icon + '</span>' : '') + '<span>' + esc(item.label) + '</span>';
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          dismissCtxMenu();
          if (item.action) item.action();
        });
        menu.appendChild(btn);
      });

      document.body.appendChild(menu);
      _activeCtxMenu = menu;

      var rect = anchorEl.getBoundingClientRect();
      var left = Math.min(rect.right, window.innerWidth - menu.offsetWidth - 8);
      var top = Math.min(rect.bottom + 4, window.innerHeight - menu.offsetHeight - 8);
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';

      setTimeout(function() {
        document.addEventListener('click', dismissCtxMenu);
      }, 10);
    }

    /* ═══ SECTION: Show Course Context Menu | Functions: showCourseContextMenu ═══ */
    function showCourseContextMenu(courseName, anchor) {
      showCtxMenuAt(anchor, [
        {
          icon: '📖',
          label: 'Import Lecture',
          action: function() {
            try { openCourseModal && openCourseModal(); } catch (e1) {}
            setTimeout(function() {
              try { window.openEditCourse && window.openEditCourse(courseName); } catch (e2) {}
            }, 120);
          }
        },
        {
          icon: '📁',
          label: 'Add Subdeck',
          action: function() {
            sidebarExpanded[courseName] = true;
            renderSidebar();
            var freshNode = document.getElementById('sidebarTree')
              ? document.getElementById('sidebarTree').querySelector('.tree-node[data-level="course"][data-course="' + esc(courseName) + '"]')
              : null;
            showInlineSidebarInput(freshNode, 'Subdeck name...', function(name) {
              addModuleToCourse(courseName, { name: name, topics: [], lectureImported: false });
              renderSidebar();
              toast('Created subdeck: ' + name);
            });
          }
        },
        {
          icon: '⚙',
          label: 'Manage Course',
          action: function() {
            try { openEditCourse && openEditCourse(courseName); } catch (e) {}
          }
        },
        { divider: true },
        {
          icon: '📥',
          label: 'Archive Course',
          danger: false,
          action: function() {
            showCtxMenuAt(anchor, [
              {
                icon: '⚠',
                label: 'Confirm: Archive all cards in ' + courseName + '?',
                danger: true,
                action: function() {
                  var count = 0;
                  for (var id in state.items) {
                    if (!state.items.hasOwnProperty(id)) continue;
                    var it = state.items[id];
                    if (it && it.course === courseName && !it.archived) {
                      it.archived = true;
                      count++;
                    }
                  }
                  saveState();
                  renderSidebar();
                  renderDashboard();
                  toast('Archived ' + count + ' cards');
                }
              },
              { icon: '✕', label: 'Cancel', action: function() {} }
            ]);
          }
        }
      ]);
    }

    /* ═══ SECTION: Show Module Context Menu | Functions: showModuleContextMenu ═══ */
    function showModuleContextMenu(courseName, moduleId, anchor) {
      var mod = getModuleById(courseName, moduleId);
      if (!mod) return;

      showCtxMenuAt(anchor, [
        {
          icon: '✏',
          label: 'Rename',
          action: function() {
            var modNode = document.getElementById('sidebarTree')
              ? document.getElementById('sidebarTree').querySelector('.tree-node[data-level="module"][data-module="' + esc(moduleId) + '"]')
              : null;
            showInlineSidebarInput(modNode, mod.name || 'Subdeck name...', function(newName) {
              renameModule(courseName, moduleId, newName);
              renderSidebar();
              toast('Renamed to: ' + newName);
            });
          }
        },
        {
          icon: '📖',
          label: 'Import Lecture Here',
          action: function() {
            try { openCourseModal && openCourseModal(); } catch (e1) {}
            setTimeout(function() {
              try { window.openEditCourse && window.openEditCourse(courseName); } catch (e2) {}
            }, 120);
          }
        },
        { divider: true },
        {
          icon: '🗑',
          label: 'Delete Subdeck',
          danger: true,
          action: function() {
            showCtxMenuAt(anchor, [
              {
                icon: '⚠',
                label: 'Confirm: Delete "' + (mod.name || '') + '"?',
                danger: true,
                action: function() {
                  removeModuleFromCourse(courseName, moduleId);
                  sidebarSelection = { level: 'course', course: courseName, module: null, topic: null };
                  renderSidebar();
                  updateBreadcrumb();
                  applySidebarFilter();
                  toast('Deleted subdeck');
                }
              },
              { icon: '✕', label: 'Cancel', action: function() {} }
            ]);
          }
        }
      ]);
    }

    /* ═══ SECTION: Show Course Dashboard | Functions: showCourseDashboard ═══ */
    function showCourseDashboard(courseName) {
      hideContextViews();
      var view = document.getElementById('courseDashView');
      var content = document.getElementById('courseDashContent');
      if (!view || !content) return;

      var normalDash = document.getElementById('viewDash');
      if (normalDash) normalDash.style.display = 'none';
      view.style.display = 'block';

      var courseData = state.courses && state.courses[courseName] ? state.courses[courseName] : {};
      ensureCourseModules(courseName);
      var stats = getCourseStats(courseName);
      var color = courseData.color || '#8b5cf6';
      var cram = (typeof getCramState === 'function') ? getCramState(courseName) : { active: false };
      var modules = courseData.modules || [];

      var h = '';
      h += '<div class="ctx-header">';
      h += '<div class="ctx-color-dot" style="background:' + color + ';"></div>';
      h += '<div>';
      h += '<div class="ctx-title">' + esc(courseName) + '</div>';
      var subtitleParts = [];
      subtitleParts.push(stats.total + ' cards');
      if (stats.due > 0) subtitleParts.push(stats.due + ' due');
      if (courseData.examDate) {
        var daysLeft = (typeof getCramState === 'function') ? getCramState(courseName).daysUntil : null;
        subtitleParts.push('Exam: ' + courseData.examDate + (daysLeft != null ? ' (' + daysLeft + 'd)' : ''));
      }
      h += '<div class="ctx-subtitle">' + esc(subtitleParts.join(' · ')) + '</div>';
      h += '</div>';
      if (cram && cram.active) h += '<span class="tree-cram-badge">🔥 CRAM</span>';
      h += '</div>';

      h += '<div class="ctx-actions">';
      h += '<button class="ctx-study-btn" id="ctxStudyCourse">▶ Study This Course' + (stats.due > 0 ? ' (' + stats.due + ' due)' : '') + '</button>';
      h += '<button class="ghost-btn" id="ctxManageCourse">⚙ Manage</button>';
      h += '<button class="ghost-btn" id="ctxImportLecture">📖 Import Lecture</button>';
      h += '</div>';

      h += '<div class="stats-row">';
      h += '<div class="stat"><div class="k">TOTAL</div><div class="v">' + stats.total + '</div></div>';
      h += '<div class="stat"><div class="k">DUE</div><div class="v">' + stats.due + '</div></div>';
      h += '<div class="stat"><div class="k">AVG STABILITY</div><div class="v">' + stats.avgStability + 'd</div></div>';
      h += '</div>';

      if (stats.total > 0) {
        h += '<div class="ctx-section-title">Tier Distribution</div>';
        h += '<div class="breakdown">';
        var tiers = ['quickfire', 'explain', 'apply', 'distinguish', 'mock', 'worked'];
        tiers.forEach(function(t) {
          var count = stats.tierDist[t] || 0;
          if (count > 0) {
            h += '<div class="tier-pill"><span class="tier-dot" style="background:' + tierColour(t) + ';"></span>' + esc(tierLabel(t)) + ' ' + count + '</div>';
          }
        });
        h += '</div>';
      }

      if (modules.length > 0) {
        h += '<div class="ctx-section-title">Modules</div>';
        h += '<div class="ctx-modules-grid">';
        modules.forEach(function(mod) {
          if (!mod || !mod.id) return;
          var ms = getModuleStats(courseName, mod.id);
          var pct = ms.total > 0 ? Math.round((ms.reviewed / ms.total) * 100) : 0;
          h += '<div class="ctx-module-card" data-module="' + esc(mod.id) + '">';
          h += '<div class="mc-name">' + (mod.lectureImported ? '📖 ' : '📁 ') + esc(mod.name || 'Module') + '</div>';
          h += '<div class="mc-stats"><span>' + ms.total + ' cards</span>';
          if (ms.due > 0) h += '<span style="color:var(--accent);">' + ms.due + ' due</span>';
          h += '<span>' + pct + '% reviewed</span></div>';
          h += '<div class="mc-progress"><div class="mc-progress-fill" style="width:' + pct + '%;"></div></div>';
          h += '</div>';
        });
        h += '</div>';
      }

      h += '<div class="ctx-section-title">Lecture Materials</div>';
      var importedCount = modules.filter(function(m) { return m && m.lectureImported; }).length;
      if (importedCount > 0) {
        h += '<div class="ctx-lecture-badge">📚 ' + importedCount + ' lecture' + (importedCount !== 1 ? 's' : '') + ' imported · Context active for AI grading</div>';
      } else {
        h += '<div style="font-size:11px;color:var(--text-tertiary);margin:4px 0;">No lectures imported yet. Import lectures to improve AI grading accuracy.</div>';
      }

      content.innerHTML = h;

      var studyBtn = document.getElementById('ctxStudyCourse');
      if (studyBtn) studyBtn.addEventListener('click', function() {
        sidebarSelection = { level: 'course', course: courseName, module: null, topic: null };
        applySidebarFilterChipsOnly();
        startSession();
      });

      var manageBtn = document.getElementById('ctxManageCourse');
      if (manageBtn) manageBtn.addEventListener('click', function() {
        openCourseModal();
        try { window.openEditCourse && window.openEditCourse(courseName); } catch(e) {}
      });

      var importBtn = document.getElementById('ctxImportLecture');
      if (importBtn) importBtn.addEventListener('click', function() {
        openCourseModal();
        try { window.openEditCourse && window.openEditCourse(courseName); } catch(e) {}
      });

      content.querySelectorAll('.ctx-module-card').forEach(function(card) {
        card.addEventListener('click', function() {
          var modId = this.dataset.module;
          sidebarSelection = { level: 'module', course: courseName, module: modId, topic: null };
          renderSidebar();
          updateBreadcrumb();
          showModuleView(courseName, modId);
          try { playClick(); } catch(e) {}
        });
      });

      animateProgressRings(content);
      if (window.gsap) {
        gsap.fromTo(content, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
        gsap.fromTo(content.querySelectorAll('.ctx-stats-grid .stat'),
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.35, stagger: 0.08, ease: 'power2.out' }
        );
      }
    }

    /* ═══ SECTION: Show Module View | Functions: showModuleView ═══ */
    function showModuleView(courseName, moduleId) {
      hideContextViews();
      var view = document.getElementById('moduleDetailView');
      var content = document.getElementById('moduleDetailContent');
      if (!view || !content) return;

      var normalDash = document.getElementById('viewDash');
      if (normalDash) normalDash.style.display = 'none';
      view.style.display = 'block';

      var mod = getModuleById(courseName, moduleId);
      if (!mod) { content.innerHTML = '<div class="ctx-empty">Subdeck not found.</div>'; return; }

      var cards = getCardsForModule(courseName, moduleId);
      var due = cards.filter(isDueNow);
      var courseData = state.courses && state.courses[courseName] ? state.courses[courseName] : {};
      var color = courseData.color || '#8b5cf6';

      var h = '';
      h += '<div class="ctx-header">';
      h += '<div class="ctx-color-dot" style="background:' + color + ';"></div>';
      h += '<div>';
      h += '<div class="ctx-title">' + (mod.lectureImported ? '📖 ' : '📁 ') + esc(mod.name || 'Subdeck') + '</div>';
      h += '<div class="ctx-subtitle">' + cards.length + ' cards · ' + due.length + ' due · ' + ((mod.topics || []).length) + ' topics</div>';
      h += '</div>';
      if (mod.lectureImported) h += '<span class="ctx-lecture-badge">📖 Lecture context active</span>';
      h += '</div>';

      h += '<div class="ctx-actions">';
      h += '<button class="ctx-study-btn" id="ctxStudyModule">▶ Study This Subdeck' + (due.length > 0 ? ' (' + due.length + ' due)' : '') + '</button>';
      h += '<button class="ghost-btn" id="ctxRenameModule">✏ Rename</button>';
      h += '</div>';

      if (mod.topics && mod.topics.length > 0) {
        h += '<div class="ctx-section-title">Topics</div>';
        h += '<div class="breakdown">';
        mod.topics.forEach(function(t) {
          var topicCards = getCardsForTopic(courseName, t);
          var topicDue = topicCards.filter(isDueNow).length;
          h += '<div class="tier-pill" style="cursor:pointer;" data-nav-topic="' + esc(t) + '">';
          h += esc(t) + ' <span style="opacity:0.6;">' + topicCards.length + '</span>';
          if (topicDue > 0) h += ' <span style="color:var(--accent);">' + topicDue + '</span>';
          h += '</div>';
        });
        h += '</div>';
      }

      h += '<div class="ctx-section-title">Cards (' + cards.length + ')</div>';
      if (cards.length === 0) h += '<div class="ctx-empty">No cards in this subdeck yet.</div>';
      else h += renderCardList(cards);

      content.innerHTML = h;

      var studyBtn = document.getElementById('ctxStudyModule');
      if (studyBtn) studyBtn.addEventListener('click', function() {
        sidebarSelection = { level: 'module', course: courseName, module: moduleId, topic: null };
        applySidebarFilterChipsOnly();
        startSession();
      });

      var renameBtn = document.getElementById('ctxRenameModule');
      if (renameBtn) renameBtn.addEventListener('click', function() {
        var modNode = document.getElementById('sidebarTree')
          ? document.getElementById('sidebarTree').querySelector('.tree-node[data-level="module"][data-module="' + esc(moduleId) + '"]')
          : null;
        showInlineSidebarInput(modNode, mod.name || 'Subdeck name...', function(newName) {
          renameModule(courseName, moduleId, newName);
          renderSidebar();
          showModuleView(courseName, moduleId);
        });
      });

      content.querySelectorAll('[data-nav-topic]').forEach(function(pill) {
        pill.addEventListener('click', function() {
          var t = this.dataset.navTopic;
          sidebarSelection = { level: 'topic', course: courseName, module: moduleId, topic: t };
          renderSidebar();
          updateBreadcrumb();
          showTopicView(courseName, t);
          try { playClick(); } catch(e) {}
        });
      });

      if (window.gsap) gsap.fromTo(content, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
    }

    /* ═══ SECTION: Show Topic View | Functions: showTopicView ═══ */
    function showTopicView(courseName, topic) {
      hideContextViews();
      var view = document.getElementById('topicDetailView');
      var content = document.getElementById('topicDetailContent');
      if (!view || !content) return;

      var normalDash = document.getElementById('viewDash');
      if (normalDash) normalDash.style.display = 'none';
      view.style.display = 'block';

      var cards = getCardsForTopic(courseName, topic);
      var due = cards.filter(isDueNow);
      var courseData = state.courses && state.courses[courseName] ? state.courses[courseName] : {};
      var color = courseData.color || '#8b5cf6';
      var mod = getModuleForTopic(courseName, topic);

      var h = '';
      h += '<div class="ctx-header">';
      h += '<div class="ctx-color-dot" style="background:' + color + ';"></div>';
      h += '<div>';
      h += '<div class="ctx-title">' + esc(topic) + '</div>';
      h += '<div class="ctx-subtitle">' + cards.length + ' cards · ' + due.length + ' due' + (mod ? (' · in ' + esc(mod.name || 'Subdeck')) : '') + '</div>';
      h += '</div>';
      h += '</div>';

      h += '<div class="ctx-actions">';
      h += '<button class="ctx-study-btn" id="ctxStudyTopic">▶ Study This Topic' + (due.length > 0 ? ' (' + due.length + ' due)' : '') + '</button>';
      h += '</div>';

      h += '<div class="ctx-section-title">Cards (' + cards.length + ')</div>';
      if (cards.length === 0) h += '<div class="ctx-empty">No cards with this topic.</div>';
      else h += renderCardList(cards);

      content.innerHTML = h;

      var studyBtn = document.getElementById('ctxStudyTopic');
      if (studyBtn) studyBtn.addEventListener('click', function() {
        sidebarSelection = { level: 'topic', course: courseName, module: null, topic: topic };
        applySidebarFilterChipsOnly();
        startSession();
      });

      if (window.gsap) gsap.fromTo(content, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
    }

    /* ── Dual Coding: Visual Generation ── */
    var VISUAL_WORKER_URL = 'https://widget-sync.lordgrape-widgets.workers.dev/studyengine/visual';
    var TTS_WORKER_URL = 'https://widget-sync.lordgrape-widgets.workers.dev/studyengine/tts';
    var ttsAudioCtx = null;
    var ttsCurrentSource = null;

    /* ═══ SECTION: Get Widget Key | Functions: getWidgetKey ═══ */
    function getWidgetKey() {
      try {
        if (typeof SyncEngine !== 'undefined') {
          if (SyncEngine._key) return SyncEngine._key;
          if (SyncEngine.key) return SyncEngine.key;
          if (SyncEngine.passphrase) return SyncEngine.passphrase;
        }
      } catch (e) {}
      try { if (window.WIDGET_KEY) return window.WIDGET_KEY; } catch (e2) {}
      try { return localStorage.getItem('WIDGET_KEY') || localStorage.getItem('widgetKey') || ''; } catch (e3) {}
      return '';
    }

    /* ═══ SECTION: Play Tts | Functions: playTTS ═══ */
    function playTTS(text) {
      return new Promise(function(resolve) {
        if (!text || text.length < 3) { resolve(); return; }
        var voiceName = settings.ttsVoice || 'en-US-Studio-O';
        fetch(TTS_WORKER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Widget-Key': getWidgetKey()
          },
          body: JSON.stringify({
            text: String(text).slice(0, 2000),
            voiceName: voiceName
          })
        })
        .then(function(r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .then(function(d) {
          if (!d || !d.audioContent) { resolve(); return null; }
          var binary = atob(d.audioContent);
          var len = binary.length;
          var bytes = new Uint8Array(len);
          for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
          if (!ttsAudioCtx) ttsAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
          if (ttsAudioCtx.state === 'suspended') {
            return ttsAudioCtx.resume().then(function() {
              return ttsAudioCtx.decodeAudioData(bytes.buffer);
            });
          }
          return ttsAudioCtx.decodeAudioData(bytes.buffer);
        })
        .then(function(buffer) {
          if (!buffer || !ttsAudioCtx) { resolve(); return; }
          if (ttsCurrentSource) {
            try { ttsCurrentSource.stop(); } catch (e) {}
          }
          var source = ttsAudioCtx.createBufferSource();
          source.buffer = buffer;
          source.connect(ttsAudioCtx.destination);
          source.onended = function() {
            if (ttsCurrentSource === source) ttsCurrentSource = null;
            resolve();
          };
          ttsCurrentSource = source;
          source.start(0);
        })
        .catch(function(err) {
          console.warn('TTS playback failed:', err);
          resolve();
        });
      });
    }

    /* ═══ SECTION: Stop Tts | Functions: stopTTS ═══ */
    function stopTTS() {
      if (ttsCurrentSource) {
        try { ttsCurrentSource.stop(); } catch (e) {}
        ttsCurrentSource = null;
      }
      document.querySelectorAll('.listen-tts-btn.playing').forEach(function(btn) {
        btn.classList.remove('playing');
        btn.innerHTML = '🔊 Listen';
      });
    }

    /* ═══ SECTION: Insert Listen Button | Functions: insertListenButton ═══ */
    function insertListenButton(targetEl, text) {
      if (!targetEl || !text || text.length < 10) return;
      if (!targetEl.parentElement) return;
      if (targetEl.parentElement.querySelector('.listen-tts-btn')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'listen-tts-btn';
      btn.setAttribute('aria-label', 'Listen to answer');
      btn.innerHTML = '🔊 Listen';
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (btn.classList.contains('playing')) {
          stopTTS();
          return;
        }
        stopTTS();
        btn.classList.add('playing');
        btn.innerHTML = '⏹ Stop';
        playTTS(text).then(function() {
          if (!btn.isConnected) return;
          btn.classList.remove('playing');
          btn.innerHTML = '🔊 Listen';
        });
      });
      targetEl.insertAdjacentElement('afterend', btn);
      if (window.gsap) {
        gsap.fromTo(btn, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' });
      }
    }

    document.addEventListener('visibilitychange', function() {
      if (document.hidden) stopTTS();
    });

    async function generateVisual(item) {
      if (!item || !item.prompt || !item.modelAnswer) return null;
      try {
        var res = await fetch(VISUAL_WORKER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Widget-Key': getWidgetKey()
          },
          body: JSON.stringify({
            prompt: item.prompt,
            modelAnswer: item.modelAnswer,
            tier: item.tier || item._presentTier || 'explain',
            course: item.course || '',
            topic: item.topic || '',
            conceptA: item.conceptA || '',
            conceptB: item.conceptB || ''
          })
        });
        if (!res.ok) return null;
        var data = await res.json();
        return data.visual || null;
      } catch (e) {
        console.error('[StudyEngine] Visual generation failed for item:', item && item.id, e);
        return null;
      }
    }

    var mermaidIdCounter = 0;
    var visualGenerationPending = {};

    /* ── Visual Lightbox (click-to-expand) ── */
    var lightboxZoom = 1;
    var lightboxPanX = 0;
    var lightboxPanY = 0;
    var lightboxDragging = false;
    var lightboxLastX = 0;
    var lightboxLastY = 0;

    /* ═══ SECTION: Apply Lightbox Transform | Functions: applyLightboxTransform ═══ */
    function applyLightboxTransform(body) {
      var svg = body && body.querySelector('svg');
      if (!svg) return;
      svg.style.transform = 'translate(' + lightboxPanX + 'px,' + lightboxPanY + 'px) scale(' + lightboxZoom + ')';
      svg.style.transformOrigin = 'center center';
    }

    /* ═══ SECTION: Open Visual Lightbox | Functions: openVisualLightbox ═══ */
    function openVisualLightbox(svgHTML) {
      var ov = el('visualLightbox');
      var body = el('visualLightboxBody');
      if (!ov || !body) return;
      body.innerHTML = svgHTML;
      lightboxZoom = 1;
      lightboxPanX = 0;
      lightboxPanY = 0;
      applyLightboxTransform(body);
      ov.classList.add('show');
      ov.setAttribute('aria-hidden', 'false');
      try { playOpen(); } catch (e) {}
    }

    /* ═══ SECTION: Close Visual Lightbox | Functions: closeVisualLightbox ═══ */
    function closeVisualLightbox() {
      var ov = el('visualLightbox');
      if (!ov) return;
      ov.classList.remove('show');
      ov.setAttribute('aria-hidden', 'true');
      try { playClose(); } catch (e) {}
    }

    (function wireVisualLightbox() {
      document.addEventListener('click', function(e) {
        if (e.target.closest('button, input, textarea, select, .rate, [data-rate], .conf-pill, .listen-tts-btn')) return;
        var closeBtn = e.target.closest('#visualLightboxClose');
        if (closeBtn) {
          e.preventDefault();
          closeVisualLightbox();
          return;
        }
        var ov = el('visualLightbox');
        if (ov && e.target === ov) {
          closeVisualLightbox();
          return;
        }
        var vc = e.target.closest('.visual-container');
        if (!vc) return;
        var svg = vc.querySelector('.mermaid-render svg');
        if (!svg) return;
        e.preventDefault();
        openVisualLightbox(svg.outerHTML);
      });

      document.addEventListener('wheel', function(e) {
        var body = el('visualLightboxBody');
        var ov = el('visualLightbox');
        if (!body || !ov || !ov.classList.contains('show')) return;
        if (!body.contains(e.target)) return;
        e.preventDefault();
        var delta = e.deltaY > 0 ? -0.1 : 0.1;
        lightboxZoom = Math.max(0.5, Math.min(4, lightboxZoom + delta));
        applyLightboxTransform(body);
      }, { passive: false });

      document.addEventListener('mousedown', function(e) {
        var body = el('visualLightboxBody');
        var ov = el('visualLightbox');
        if (!body || !ov || !ov.classList.contains('show')) return;
        if (!body.contains(e.target)) return;
        lightboxDragging = true;
        lightboxLastX = e.clientX;
        lightboxLastY = e.clientY;
      });

      document.addEventListener('mousemove', function(e) {
        if (!lightboxDragging) return;
        var body = el('visualLightboxBody');
        if (!body) return;
        var dx = (e.clientX - lightboxLastX);
        var dy = (e.clientY - lightboxLastY);
        lightboxPanX += dx;
        lightboxPanY += dy;
        lightboxLastX = e.clientX;
        lightboxLastY = e.clientY;
        applyLightboxTransform(body);
      });

      document.addEventListener('mouseup', function() {
        lightboxDragging = false;
      });

      document.addEventListener('keydown', function(e) {
        var ov = el('visualLightbox');
        if (e.key === 'Escape' && ov && ov.classList.contains('show')) {
          closeVisualLightbox();
          e.stopPropagation();
        }
      }, true);
    })();

    /* ═══ SECTION: Render Mermaid Block | Functions: renderMermaidBlock ═══ */
    function renderMermaidBlock(mermaidCode, placement, itemId) {
      if (!mermaidCode) return '';
      var id = 'mermaid-' + (++mermaidIdCounter);
      var label = (placement === 'prompt') ? 'Visual Cue' : 'Visual Summary';
      var idAttr = itemId ? ' data-item-id="' + esc(itemId) + '"' : '';
      return '' +
        '<div class="visual-container"' + idAttr + ' data-visual-placement="' + esc(placement) + '">' +
          '<div class="visual-label">' + label + '</div>' +
          '<div class="mermaid-render" id="' + id + '" data-mermaid="' + esc(mermaidCode) + '"></div>' +
        '</div>';
    }

    /** Same heuristics as worker: truncated mid-edge → Mermaid parse fails → raw fallback */
    /* ═══ SECTION: Looks Incomplete Mermaid | Functions: looksIncompleteMermaid ═══ */
    function looksIncompleteMermaid(s) {
      if (!s || typeof s !== 'string') return true;
      var t = s.trim().replace(/^```mermaid\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      var graphIdx = t.search(/\bgraph\s+(TD|LR)\b/i);
      if (graphIdx === -1) return true;
      t = t.slice(graphIdx).trim();
      var lines = t.split(/\n/).map(function(l) { return l.trim(); }).filter(function(l) { return l.length > 0; });
      if (lines.length < 2) return true;
      var last = lines[lines.length - 1];
      /* Truncated mid-edge: ends with arrow or arrow+partial label */
      var l = String(last || '').trim();
      if (l.endsWith('-->') || l.endsWith('--o') || l.endsWith('==>')) return true;
      if (l.endsWith('--')) return true;
      /* Unclosed pipe label: has opening | after arrow but no closing | */
      var arrowPos = Math.max(l.lastIndexOf('-->'), l.lastIndexOf('--o'), l.lastIndexOf('==>'));
      if (arrowPos >= 0) {
        var after = l.slice(arrowPos + 3);
        var firstPipe = after.indexOf('|');
        if (firstPipe >= 0) {
          var secondPipe = after.indexOf('|', firstPipe + 1);
          if (secondPipe < 0) return true;
        }
      }
      /* Truncated node definition: opening paren/bracket never closed */
      if (/\([^)]*$/.test(last) || /\[[^\]]*$/.test(last) || /\{[^}]*$/.test(last)) return true;
      /* Truncated quoted string: odd number of double quotes */
      var quoteCount = (last.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) return true;
      return false;
    }

    function tierLabel(tier) {
      return ({
        quickfire: 'QF',
        explain: 'EI',
        apply: 'AI',
        distinguish: 'DI',
        mock: 'ME',
        worked: 'WE'
      })[tier] || '—';
    }

    function tierColour(tier) {
      return ({
        quickfire: getComputedStyle(document.documentElement).getPropertyValue('--tier-qf').trim(),
        explain: getComputedStyle(document.documentElement).getPropertyValue('--tier-ex').trim(),
        apply: getComputedStyle(document.documentElement).getPropertyValue('--tier-ap').trim(),
        distinguish: getComputedStyle(document.documentElement).getPropertyValue('--tier-di').trim(),
        mock: getComputedStyle(document.documentElement).getPropertyValue('--tier-mk').trim(),
        worked: getComputedStyle(document.documentElement).getPropertyValue('--tier-we').trim()
      })[tier] || getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    }

    function setTierBadge(tier) {
      var b = el('tierBadge');
      var t = el('tierBadgeText');
      var dot = b.querySelector('.tiny');
      var c = tierColour(tier);
      b.style.background = c;
      dot.style.opacity = '0.92';
      t.textContent = tierLabel(tier);
    }

    function showView(nextId) {
      var views = [viewDash, viewSession, viewDone];
      var next = el(nextId);
      // Clean up any stale calendar heatmap tooltips
      document.querySelectorAll('.cal-heatmap-tooltip').forEach(function(t) { t.remove(); });
      views.forEach(function(v){ v.classList.remove('active'); });
      next.classList.add('active');

      /* Standalone: session mode collapses sidebar */
      if (!isEmbedded) {
        if (nextId === 'viewSession' || nextId === 'viewDone') document.body.classList.add('in-session');
        else if (nextId === 'viewDash') document.body.classList.remove('in-session');
      }

      /* Standalone: avoid context views "sticking" outside dashboard */
      if (!isEmbedded) {
        if (nextId !== 'viewDash') {
          try { hideContextViews(); } catch (eCtx) {}
        }
      }

      /* Hide/show nav tabs during session */
      var navTabs = document.querySelector('.nav-tabs');
      if (navTabs) {
        if (nextId === 'viewSession' || nextId === 'viewDone') {
          navTabs.style.display = 'none';
        } else {
          navTabs.style.display = 'flex';
        }
      }

      /* When returning to dashboard, restore the active tab */
      if (nextId === 'viewDash') {
        switchNav(activeNav);
      }

      if (window.gsap) {
        gsap.fromTo(next, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
      }
    }

    function countDue(itemsById, course, topic) {
      var now = Date.now();
      var out = { total: 0, byTier: { quickfire:0, explain:0, apply:0, distinguish:0, mock:0, worked:0 } };
      for (var id in itemsById) {
        if (!itemsById.hasOwnProperty(id)) continue;
        var it = itemsById[id];
        if (!it || it.archived) continue;
        if (it.course && state.courses[it.course] && state.courses[it.course].archived) continue;
        if (course && course !== 'All' && it.course !== course) continue;
        if (topic && topic !== 'All' && (it.topic || '') !== topic) continue;
        var f = it.fsrs || null;
        var due = f && f.due ? new Date(f.due).getTime() : 0;
        var isDue = (!f || !f.lastReview) ? true : (due <= now);
        if (isDue) {
          out.total++;
          var hasMockField = it.timeLimitMins && it.timeLimitMins > 0;
          var hasDistinguish = it.conceptA && it.conceptB;
          var hasApply = it.task || it.scenario;
          var paraCount = (it.modelAnswer || '').split('\n\n').filter(function(s) { return String(s).trim(); }).length;
          var dt = 'quickfire';
          if (hasMockField) {
            dt = 'mock';
          } else if (hasDistinguish) {
            dt = 'distinguish';
          } else if (hasApply) {
            dt = 'apply';
          } else if (paraCount >= 2) {
            dt = 'worked';
          }
          if (out.byTier[dt] != null) out.byTier[dt]++;
        }
      }
      return out;
    }

    function avgRetention(itemsById) {
      var now = Date.now();
      var sum = 0, n = 0;
      for (var id in itemsById) {
        if (!itemsById.hasOwnProperty(id)) continue;
        var it = itemsById[id];
        if (!it || !it.fsrs || it.archived) continue;
        if (it.course && state.courses[it.course] && state.courses[it.course].archived) continue;
        sum += retrievability(it.fsrs, now);
        n++;
      }
      if (!n) return null;
      return sum / n;
    }

    function calibrationPct(cal) {
      if (!cal || !cal.totalSelfRatings) return null;
      var p = (cal.totalActualCorrect || 0) / Math.max(1, cal.totalSelfRatings);
      return clamp(p, 0, 1);
    }

    function icon(name, size) {
      var svg = ICONS[name] || '';
      if (size) {
        svg = svg.replace(/width="\d+"/, 'width="' + size + '"').replace(/height="\d+"/, 'height="' + size + '"');
      }
      return '<span class="se-icon" aria-hidden="true">' + svg + '</span>';
    }

    function fmtMMSS(totalSec) {
      totalSec = Math.max(0, totalSec|0);
      var m = Math.floor(totalSec / 60);
      var s = totalSec % 60;
      return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    }

    function toast(msg) {
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
      toastTimer = setTimeout(function() {
        if (window.gsap) gsap.to(toastEl, { opacity: 0, y: 0, duration: 0.22, ease: 'power2.inOut' });
        else toastEl.style.opacity = '0';
      }, 1400);
    }

    function isoNow(){ return new Date().toISOString(); }

    function isoDate() {
      var d = new Date();
      var pad = function(n) { return String(n).padStart(2, '0'); };
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function daysBetween(a, b){ return (b - a) / (1000 * 60 * 60 * 24); }

    function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

    function renderMd(text) {
      if (!text) return '';
      if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
        return '<span style="white-space:pre-wrap;">' + esc(text) + '</span>';
      }
      try {
        var raw = marked.parse(String(text), { breaks: true, gfm: true });
        return DOMPurify.sanitize(raw, {
          ALLOWED_TAGS: ['p','br','strong','b','em','i','u','s','del',
            'ul','ol','li','h1','h2','h3','h4','h5','h6',
            'blockquote','code','pre','span','a','table',
            'thead','tbody','tr','th','td','hr','sup','sub'],
          ALLOWED_ATTR: ['href','target','rel','class','style'],
          ADD_ATTR: ['target']
        });
      } catch (e) {
        return '<span style="white-space:pre-wrap;">' + esc(text) + '</span>';
      }
    }
