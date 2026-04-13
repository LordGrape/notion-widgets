/* Phase 2 extraction: copied from monolith; source-of-truth remains state.js for parity. */

    function buildCourseTree() {
      var tree = {};
      for (var id in state.items) {
        if (!state.items.hasOwnProperty(id)) continue;
        var it = state.items[id];
        if (!it || it.archived) continue;
        if (isItemInArchivedSubDeck(it)) continue;
        if (it.course && state.courses[it.course] && state.courses[it.course].archived) continue;
        var course = it.course || 'Uncategorized';
        var topic = it.topic || 'General';
        if (!tree[course]) tree[course] = { topics: {}, totalCards: 0, dueCards: 0, subDecks: {} };
        if (!tree[course].topics[topic]) tree[course].topics[topic] = { cards: [], dueCards: 0 };
        tree[course].topics[topic].cards.push(id);
        tree[course].totalCards++;
        var sd = it.subDeck || '__ungrouped__';
        if (!tree[course].subDecks[sd]) tree[course].subDecks[sd] = { cards: 0, due: 0 };
        tree[course].subDecks[sd].cards++;
        var f = it.fsrs && it.fsrs.due ? it.fsrs : null;
        if (!f || !f.lastReview) {
          tree[course].dueCards++;
          tree[course].topics[topic].dueCards++;
          tree[course].subDecks[sd].due++;
        } else {
          var dueDate = new Date(f.due);
          if (dueDate <= new Date()) {
            tree[course].dueCards++;
            tree[course].topics[topic].dueCards++;
            tree[course].subDecks[sd].due++;
          }
        }
      }
      return tree;
    }

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
          var subDeckRows = Object.keys(ct.subDecks || {});
          var knownSubDeckMap = {};
          listSubDecks(courseName).forEach(function(meta) {
            if (!meta || !meta.name) return;
            knownSubDeckMap[meta.name] = meta;
            if (subDeckRows.indexOf(meta.name) < 0) subDeckRows.push(meta.name);
          });
          subDeckRows.sort(function(a, b) {
            var ao = knownSubDeckMap[a] ? (knownSubDeckMap[a].order || 0) : Number.MAX_SAFE_INTEGER;
            var bo = knownSubDeckMap[b] ? (knownSubDeckMap[b].order || 0) : Number.MAX_SAFE_INTEGER;
            if (ao !== bo) return ao - bo;
            return String(a).localeCompare(String(b));
          });

          subDeckRows.forEach(function(sdName) {
            var stats = ct.subDecks[sdName] || { cards: 0, due: 0 };
            var isUngrouped = sdName === '__ungrouped__';
            var label = isUngrouped ? 'Ungrouped' : sdName;
            var archivedSd = !isUngrouped && isSubDeckArchived(courseName, sdName);
            var subdeckActive = (sidebarSelection.level === 'subdeck' && sidebarSelection.course === courseName && sidebarSelection.subDeck === sdName) ? ' active' : '';
            html += '<div class="tree-node depth-1 tree-node-hoverable' + subdeckActive + (archivedSd ? ' archived' : '') + '" data-level="subdeck" data-course="' + esc(courseName) + '" data-subdeck="' + esc(sdName) + '">';
            html += '<span class="tree-chevron" style="visibility:hidden;"></span>';
            html += '<span class="subdeck-icon">' + (archivedSd ? '📦' : '📂') + '</span>';
            html += '<span class="tree-label">' + esc(label) + '</span>';
            if (stats.cards > 0) html += '<span class="tree-count">' + stats.cards + '</span>';
            if (stats.due > 0) html += '<span class="tree-badge">' + stats.due + '</span>';
            if (!isUngrouped) {
              html += '<span class="tree-hover-actions">';
              html += '<button class="tree-action-btn" data-action="subdeck-menu" data-course="' + esc(courseName) + '" data-subdeck="' + esc(sdName) + '" title="Options">⋯</button>';
              html += '</span>';
            }
            html += '</div>';
          });

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
          var actionSubdeck = actionBtn.dataset.subdeck;

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
          if (action === 'subdeck-menu') {
            showSubDeckContextMenu(actionCourse, actionSubdeck, actionBtn);
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
        var subDeck = node.dataset.subdeck || null;
        var topic = node.dataset.topic || null;

        if (level === 'ungrouped' || level === 'topics-toggle') return;

        sidebarSelection = { level: level, course: courseName, module: moduleId, subDeck: subDeck, topic: topic };

        if (level === 'course' && courseName && !sidebarExpanded[courseName]) {
          sidebarExpanded[courseName] = true;
        }

        renderSidebar();
        updateBreadcrumb();
        applySidebarFilter();
        try { playClick(); } catch (ex2) {}
      };
    }

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
      if (sidebarSelection.subDeck && sidebarSelection.course) {
        html += '<span class="bc-separator">›</span>';
        html += '<span class="bc-segment" data-level="subdeck" data-course="' + esc(sidebarSelection.course) + '" data-subdeck="' + esc(sidebarSelection.subDeck) + '">' + esc(sidebarSelection.subDeck) + '</span>';
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
        if (level === 'all') sidebarSelection = { level: 'all', course: null, module: null, subDeck: null, topic: null };
        else if (level === 'course') sidebarSelection = { level: 'course', course: seg.dataset.course, module: null, subDeck: null, topic: null };
        else if (level === 'module') sidebarSelection = { level: 'module', course: seg.dataset.course || sidebarSelection.course, module: seg.dataset.module, subDeck: null, topic: null };
        else if (level === 'subdeck') sidebarSelection = { level: 'subdeck', course: seg.dataset.course || sidebarSelection.course, module: null, subDeck: seg.dataset.subdeck || null, topic: null };
        else if (level === 'topic') sidebarSelection = { level: 'topic', course: seg.dataset.course || sidebarSelection.course, module: seg.dataset.module || null, subDeck: null, topic: seg.dataset.topic || sidebarSelection.topic };
        renderSidebar();
        updateBreadcrumb();
        applySidebarFilter();
      };
    }

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

    function applySidebarFilterChipsOnly() {
      try {
        if (sidebarSelection.level === 'all' || !sidebarSelection.course) {
          if (typeof selectedCourse !== 'undefined') selectedCourse = 'All';
        } else if (sidebarSelection.course) {
          if (typeof selectedCourse !== 'undefined') selectedCourse = sidebarSelection.course;
        }
      } catch (e) {}
    }

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
    function dismissInlineSidebarInput() {
      var existing = document.querySelector('.sb-inline-input-wrap');
      if (existing) existing.remove();
    }

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

      function submit() {
        var val = (input && input.value) ? input.value.trim() : '';
        dismissInlineSidebarInput();
        if (val && callback) callback(val);
      }

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

    function dismissCtxMenu() {
      if (_activeCtxMenu) {
        _activeCtxMenu.remove();
        _activeCtxMenu = null;
      }
      document.removeEventListener('click', dismissCtxMenu);
    }

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
      var daysLeft = (typeof getCramState === 'function') ? getCramState(courseName).daysUntil : null;
      var examLine = courseData.examDate
        ? ((daysLeft != null ? daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + ' until exam' : 'Exam scheduled') + ' · ' + courseData.examDate)
        : 'No exam date set · Long-term retention mode';

      /* Learn coverage badge */
      var learnCovHtml = '';
      try {
        var allTopics = getTopicsForCourse(courseName);
        var learnedCount = 0;
        if (state.learnProgress && state.learnProgress[courseName]) {
          allTopics.forEach(function(t) {
            var p = state.learnProgress[courseName][t];
            if (p && p.status === 'learned') learnedCount++;
          });
        }
        if (allTopics.length > 0) {
          var pct = Math.round((learnedCount / allTopics.length) * 100);
          var color = pct === 100 ? 'var(--rate-good)' : pct > 0 ? 'var(--learn-accent, #3b82f6)' : 'var(--text-tertiary)';
          learnCovHtml = '<span style="display:inline-block;margin-left:8px;font-size:0.68rem;font-weight:600;padding:2px 8px;border-radius:4px;background:rgba(' + (pct === 100 ? '34,197,94' : pct > 0 ? '59,130,246' : '107,114,128') + ',0.12);color:' + color + '">📚 ' + learnedCount + '/' + allTopics.length + ' learned</span>';
        }
      } catch(e) {}

      var h = '';
      h += '<div class="ctx-header">';
      h += '<div class="ctx-color-dot" style="background:' + color + ';"></div>';
      h += '<div>';
      h += '<div class="ctx-title">' + esc(courseName) + '</div>';
      h += '<div class="ctx-subtitle">' + esc(stats.total + ' cards' + (stats.due > 0 ? ' · ' + stats.due + ' due' : '') + (courseData.examDate ? ' · Exam: ' + courseData.examDate : '')) + '</div>' + learnCovHtml;
      h += '</div>';
      if (cram && cram.active) h += '<span class="tree-cram-badge">🔥 CRAM</span>';
      h += '<div class="ctx-header-actions"><button class="icon-btn ctx-kebab" id="ctxCourseActions" type="button" title="Course actions" aria-label="Course actions">⋮</button></div>';
      h += '</div>';

      h += '<div class="ctx-hero">';
      h += '<div class="ctx-hero-due">' + stats.due + '</div>';
      h += '<div class="ctx-hero-label">Cards due</div>';
      h += '<div class="ctx-hero-exam">' + esc(examLine) + '</div>';
      h += '<div class="ctx-actions">';
      h += '<button class="ctx-study-btn" id="ctxStudyCourse" style="width:100%;max-width:480px;">▶ Study This Course' + (stats.due > 0 ? ' (' + stats.due + ' due)' : '') + '</button>';
      h += '</div>';
      h += '</div>';

      /* ── Assessment Timeline ── */
      var courseForAssess = getCourse(courseName);
      if (courseForAssess && courseForAssess.assessments && courseForAssess.assessments.length > 0) {
        var upcoming = getUpcomingAssessments(courseName);
        if (upcoming.length > 0) {
          h += '<div style="margin:12px 0">';
          h += '<div style="font-size:0.68rem;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:8px">📅 UPCOMING ASSESSMENTS</div>';
          upcoming.forEach(function(a) {
            var aMid = new Date(a.date + 'T00:00:00');
            var tMid = new Date(); tMid.setHours(0,0,0,0);
            var daysLeft = Math.round((aMid.getTime() - tMid.getTime()) / (1000 * 60 * 60 * 24));
            var urgency = daysLeft <= 2 ? 'var(--rate-again)' : daysLeft <= 7 ? 'var(--rate-hard)' : 'var(--text-secondary)';
            var pCount = (a.prioritySet || []).length;
            h += '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;background:rgba(var(--accent-rgb),0.03);border:1px solid rgba(var(--accent-rgb),0.08);margin-bottom:4px">';
            h += '<span style="font-size:0.78rem;font-weight:700;color:' + urgency + '">' + daysLeft + 'd</span>';
            h += '<span style="font-size:0.78rem;font-weight:600;color:var(--text);flex:1">' + esc(a.name || 'Assessment') + '</span>';
            if (a.weight) h += '<span style="font-size:0.65rem;color:var(--text-tertiary)">' + a.weight + '%</span>';
            if (pCount > 0) h += '<span style="font-size:0.62rem;padding:1px 5px;border-radius:3px;background:rgba(34,197,94,0.12);color:var(--rate-good);font-weight:600">' + pCount + ' priority</span>';
            h += '</div>';
          });
          h += '</div>';
        }
      }

      var duePct = stats.total > 0 ? Math.round((stats.due / stats.total) * 100) : 0;
      var retentionPct = stats.avgRetention == null ? 0 : clamp(stats.avgRetention, 0, 100);
      var stabilityMeta = getStabilityMeta(stats.avgStability || 0);
      h += '<div class="ctx-stats-grid">';
      h += '<div class="stat"><div class="k">TOTAL</div><div class="v">' + stats.total + '</div><div class="s">' + (stats.reviewed || 0) + ' reviewed</div></div>';
      h += '<div class="stat"><div class="k">DUE</div><div class="v">' + stats.due + '</div><div class="stat-bar"><div class="stat-bar-fill" style="width:' + duePct + '%;background:' + getDueBarColor(duePct) + '"></div></div><div class="s">of ' + stats.total + ' total</div></div>';
      h += '<div class="stat"><div class="k">AVG STABILITY</div><div class="v stability-badge" style="color:' + stabilityMeta.color + ';">' + stats.avgStability + 'd</div><div class="s">' + stabilityMeta.label + '</div></div>';
      h += '<div class="stat stat-ring"><div class="k">AVG RETENTION</div><div class="stat-ring-wrap">' + svgRing(retentionPct, 58, 6, getRetentionRingColor(retentionPct)) + '<div class="stat-ring-value">' + (stats.avgRetention == null ? '—' : (retentionPct + '%')) + '</div></div><div class="s">FSRS retrievability</div></div>';
      h += '</div>';

      h += '<details class="dash-details" open>';
      h += '<summary class="dash-details-toggle"><span class="se-icon">📊</span> Tier Breakdown &amp; Materials <span class="dash-details-arrow">▸</span></summary>';
      h += '<div class="dash-details-body ctx-detail-stack">';
      if (modules.length > 0) {
        h += '<div><div class="ctx-section-title">Subdecks</div>';
        h += '<div class="ctx-modules-grid">';
        modules.forEach(function(mod) {
          if (!mod || !mod.id) return;
          var ms = getModuleStats(courseName, mod.id);
          var pct = ms.total > 0 ? Math.round((ms.reviewed / ms.total) * 100) : 0;
          h += '<div class="ctx-module-card" data-module="' + esc(mod.id) + '">';
          h += '<div class="mc-name">' + (mod.lectureImported ? '📖 ' : '📁 ') + esc(mod.name || 'Subdeck') + '</div>';
          h += '<div class="mc-stats"><span>' + ms.total + ' cards</span>';
          if (ms.due > 0) h += '<span style="color:var(--accent);">' + ms.due + ' due</span>';
          h += '<span>' + pct + '% reviewed</span></div>';
          h += '<div class="mc-progress"><div class="mc-progress-fill" style="width:' + pct + '%;"></div></div>';
          h += '</div>';
        });
        h += '</div></div>';
      }
      if (stats.total > 0) {
        h += '<div><div class="ctx-section-title">Tier Distribution</div>';
        h += '<div class="breakdown">';
        ['quickfire', 'explain', 'apply', 'distinguish', 'mock', 'worked'].forEach(function(t) {
          var count = stats.tierDist[t] || 0;
          if (count > 0) h += '<div class="tier-pill"><span class="tier-dot" style="background:' + tierColour(t) + ';"></span>' + esc(tierLabel(t)) + ' ' + count + '</div>';
        });
        h += '</div></div>';
      }
      /* ── Topic Coverage Heatmap ── */
      var allTopicsForHeat = getTopicsForCourse(courseName);
      if (allTopicsForHeat.length > 0) {
        h += '<div class="learn-heatmap-section">';
        h += '<div style="font-size:0.72rem;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:var(--text-secondary);margin-bottom:10px">📚 Learn Coverage</div>';
        h += '<div class="learn-heatmap-grid">';
        allTopicsForHeat.forEach(function(topicName) {
          var topicStatus = 'not-started';
          if (state.learnProgress && state.learnProgress[courseName] && state.learnProgress[courseName][topicName]) {
            var lp = state.learnProgress[courseName][topicName];
            topicStatus = (lp.status === 'learned') ? 'learned' : (lp.status === 'in_progress') ? 'in-progress' : 'not-started';
          }
          var topicCards = getCardsForTopic(courseName, topicName);
          var topicDue = topicCards.filter(isDueNow).length;
          var avgRatingText = '';
          if (state.learnProgress && state.learnProgress[courseName] && state.learnProgress[courseName][topicName]) {
            var r = state.learnProgress[courseName][topicName].consolidationAvgRating;
            if (r) avgRatingText = ' · ' + r.toFixed(1) + '/4';
          }
          h += '<div class="learn-heatmap-cell ' + topicStatus + '" title="' + esc(topicName) + '">';
          h += '<div class="learn-heatmap-name">' + esc(topicName) + '</div>';
          h += '<div class="learn-heatmap-meta">' + topicCards.length + ' cards';
          if (topicDue > 0) h += ' · ' + topicDue + ' due';
          h += avgRatingText;
          h += '</div>';
          h += '</div>';
        });
        h += '</div>';

        /* Legend */
        h += '<div class="learn-heatmap-legend">';
        h += '<span class="learn-heatmap-legend-item"><span class="learn-status-dot not-started"></span> Not started</span>';
        h += '<span class="learn-heatmap-legend-item"><span class="learn-status-dot in-progress"></span> In progress</span>';
        h += '<span class="learn-heatmap-legend-item"><span class="learn-status-dot learned"></span> Learned</span>';
        h += '</div>';
        h += '</div>';
      }
      h += '<div><div class="ctx-section-title">Lecture Materials</div>';
      var importedCount = modules.filter(function(m) { return m && m.lectureImported; }).length;
      if (importedCount > 0) h += '<div class="ctx-lecture-badge">📚 ' + importedCount + ' lecture' + (importedCount !== 1 ? 's' : '') + ' imported · Context active for AI grading</div>';
      else h += '<div style="font-size:11px;color:var(--text-tertiary);margin:4px 0;">No lectures imported yet. Import lectures to improve AI grading accuracy.</div>';
      h += '</div>';
      h += '</div></details>';

      content.innerHTML = h;

      var studyBtn = document.getElementById('ctxStudyCourse');
      if (studyBtn) studyBtn.addEventListener('click', function() {
        sidebarSelection = { level: 'course', course: courseName, module: null, subDeck: null, topic: null };
        applySidebarFilterChipsOnly();
        startSession();
      });

      var actionsBtn = document.getElementById('ctxCourseActions');
      if (actionsBtn) actionsBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        showCourseContextMenu(courseName, actionsBtn);
      });

      content.querySelectorAll('.ctx-module-card').forEach(function(card) {
        card.addEventListener('click', function() {
          var modId = this.dataset.module;
          sidebarSelection = { level: 'module', course: courseName, module: modId, subDeck: null, topic: null };
          renderSidebar();
          updateBreadcrumb();
          showModuleView(courseName, modId);
          try { playClick(); } catch (e) {}
        });
      });

      if (window.gsap) gsap.fromTo(content, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });

      /* Learn Mode toggle */
      try { injectModeToggle(courseName, content); } catch(e) {}
    }

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
        sidebarSelection = { level: 'module', course: courseName, module: moduleId, subDeck: null, topic: null };
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
          sidebarSelection = { level: 'topic', course: courseName, module: moduleId, subDeck: null, topic: t };
          renderSidebar();
          updateBreadcrumb();
          showTopicView(courseName, t);
          try { playClick(); } catch(e) {}
        });
      });

      if (window.gsap) gsap.fromTo(content, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
    }

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
        sidebarSelection = { level: 'topic', course: courseName, module: null, subDeck: null, topic: topic };
        applySidebarFilterChipsOnly();
        startSession();
      });

      if (window.gsap) gsap.fromTo(content, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' });
    }

    function showSubDeckContextMenu(courseName, subDeckName, anchorEl) {
      var sd = getSubDeck(courseName, subDeckName);
      if (!sd) return;
      var items = [
        { label: 'Rename', icon: '✏', action: function() {
          var newName = prompt('Rename sub-deck:', subDeckName);
          if (newName && newName.trim() && newName.trim() !== subDeckName) {
            renameSubDeck(courseName, subDeckName, newName.trim());
            renderSidebar();
            toast('Renamed to ' + newName.trim());
          }
        }},
        { label: sd.archived ? 'Unarchive' : 'Archive', icon: sd.archived ? '↩' : '📦', action: function() {
          if (sd.archived) unarchiveSubDeck(courseName, subDeckName);
          else archiveSubDeck(courseName, subDeckName);
          renderSidebar();
          renderDashboard();
          toast(sd.archived ? 'Unarchived ' + subDeckName : 'Archived ' + subDeckName);
        }},
        { label: 'Move to...', icon: '→', action: function() {
          var courses = listCourses().map(function(c) { return c.name; }).filter(function(n) { return n !== courseName; });
          if (!courses.length) { toast('No other courses'); return; }
          var target = prompt('Move to course:\n' + courses.join('\n'));
          if (target && courses.indexOf(target) >= 0) {
            moveSubDeck(subDeckName, courseName, target);
            renderSidebar();
            renderDashboard();
            toast('Moved ' + subDeckName + ' to ' + target);
          }
        }},
        { divider: true },
        { label: 'Start Session', icon: '▶', action: function() {
          sidebarSelection = { level: 'subdeck', course: courseName, subDeck: subDeckName, module: null, topic: null };
          applySidebarFilterChipsOnly();
          startSession();
        }},
        { divider: true },
        { label: 'Delete (keep cards)', icon: '🗑', danger: true, action: function() {
          if (confirm('Delete sub-deck "' + subDeckName + '"? Cards will become ungrouped.')) {
            deleteSubDeck(courseName, subDeckName, false);
            renderSidebar();
            renderDashboard();
            toast('Deleted ' + subDeckName);
          }
        }},
        { label: 'Delete (and cards)', icon: '🗑', danger: true, action: function() {
          var count = getCardsForSubDeck(courseName, subDeckName).length;
          if (confirm('Delete sub-deck "' + subDeckName + '" AND its ' + count + ' cards? This cannot be undone.')) {
            deleteSubDeck(courseName, subDeckName, true);
            renderSidebar();
            renderDashboard();
            toast('Deleted ' + subDeckName + ' and ' + count + ' cards');
          }
        }}
      ];
      showCtxMenuAt(anchorEl, items);
    }

    function showCourseContextMenu(courseName, anchor) {
      showCtxMenuAt(anchor, [
        {
          icon: '⚙',
          label: 'Edit Details',
          action: function() {
            try { window.openEditCourseTab(courseName, 'details'); } catch (e1) {}
          }
        },
        {
          icon: '📥',
          label: 'Import Cards',
          action: function() {
            openModal('import', courseName);
          }
        },
        {
          icon: '📖',
          label: 'Import Lecture',
          action: function() {
            try { window.openEditCourseTab(courseName, 'syllabus'); } catch (e1) {}
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
        { divider: true },
        {
          icon: '📦',
          label: 'Archive Course',
          action: function() {
            archiveCourse(courseName);
          }
        },
        {
          icon: '🗑',
          label: 'Delete Course',
          danger: true,
          action: function() {
            openDeleteCoursePrompt(courseName);
          }
        }
      ]);
    }

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
                  sidebarSelection = { level: 'course', course: courseName, module: null, subDeck: null, topic: null };
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
