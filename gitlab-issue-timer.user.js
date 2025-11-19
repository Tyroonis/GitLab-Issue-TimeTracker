// ==UserScript==
// @name         GitLab Issue TimeTracker
// @namespace    https://raw.githubusercontent.com/Tyroonis/GitLab-Issue-TimeTracker
// @version      1.0.0
// @description  Adds a Start/Stop timer to GitLab issues and automatically logs spent time via the GitLab API. Works on issue pages and Quick View panels.
// @author       Tyroonis
//
// @match        https://gitlab.example.com/*/-/issues*
// @grant        GM_getValue
// @grant        GM_setValue
//
// @downloadURL  https://raw.githubusercontent.com/Tyroonis/GitLab-Issue-TimeTracker/main/gitlab-issue-timer.user.js
// @updateURL    https://raw.githubusercontent.com/Tyroonis/GitLab-Issue-TimeTracker/main/gitlab-issue-timer.user.js
// ==/UserScript==

(function() {
  'use strict';
  const GITLAB_BASE_URL = 'https://gitlab.example.com';
  const TOKEN_STORAGE_KEY = 'gitlab_issue_timer_token';
  const STORAGE_PREFIX = 'gitlab_issue_timer:';
  const WRAP_ID = 'gitlab-issue-timer-container';
  const BUTTON_ID = 'gitlab-issue-timer-btn';
  const SESSION_ID = 'gitlab-issue-timer-session';
  let interval = null;

  async function getToken() {
    let token = await GM_getValue(TOKEN_STORAGE_KEY, null);
    if (!token) {
      token = prompt('Enter your GitLab API Token (scope: api):');
      if (token) await GM_setValue(TOKEN_STORAGE_KEY, token);
    }
    return token;
  }

  function getIssueContext() {
    const url = new URL(window.location.href);
    const path = url.pathname;
    if (path.includes('/-/issues/')) {
      const [project, rest] = path.split('/-/issues/');
      const iid = rest.split('/')[0];
      return { projectPath: project.replace(/^\//, ''), issueIid: iid };
    }
    const show = url.searchParams.get('show');
    if (!show) return null;
    try {
      const obj = JSON.parse(atob(decodeURIComponent(show)));
      return { projectPath: obj.full_path, issueIid: obj.iid.toString() };
    } catch { return null; }
  }

  function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    if (h + m === 0) return '1m';
    return `${h ? h + 'h' : ''}${m ? m + 'm' : ''}`;
  }

  function formatSession(seconds) {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  async function addSpentTime(ctx, seconds) {
    const token = await getToken();
    if (!token) return alert('No API token set.');
    const projectID = encodeURIComponent(ctx.projectPath);
    const url = `${GITLAB_BASE_URL}/api/v4/projects/${projectID}/issues/${ctx.issueIid}/add_spent_time`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ duration: formatDuration(seconds) }),
    });
    if (!res.ok) alert('Failed to log time.');
  }

  function findPanel() {
    return (document.querySelector('[data-testid="work-item-time-tracking"]') ||
            document.querySelector('#work-item-time-tracking'));
  }

  function createUI(panel, ctx) {
    const old = document.getElementById(WRAP_ID);
    if (old) old.remove();

    const wrap = document.createElement('div');
    wrap.id = WRAP_ID;
    wrap.className = 'gl-mt-3 gl-pt-3 gl-border-t gl-border-gray-200 gl-flex gl-flex-col gl-gap-2';

    const title = document.createElement('div');
    title.textContent = 'Timer';
    title.className = 'gl-font-bold gl-text-sm';

    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.className = 'gl-button btn btn-default gl-w-full gl-text-sm';
    btn.textContent = '⏱ Start Timer';

    const session = document.createElement('div');
    session.id = SESSION_ID;
    session.textContent = 'Session: 00:00:00';
    session.className = 'gl-text-gray-500 gl-text-sm';

    wrap.append(title, btn, session);
    panel.appendChild(wrap);
    setupLogic(btn, ctx);
  }

  function setupLogic(btn, ctx) {
    const key = `${STORAGE_PREFIX}${ctx.projectPath}#${ctx.issueIid}`;
    let state = JSON.parse(localStorage.getItem(key) || '{"running":false,"start":0}');

    function save() {
      localStorage.setItem(key, JSON.stringify(state));
    }

    function updateSession() {
      const lbl = document.getElementById(SESSION_ID);
      if (!lbl) return;
      if (!state.running) {
        lbl.textContent = 'Session: 00:00:00';
        return;
      }
      const sec = Math.floor((Date.now() - state.start) / 1000);
      lbl.textContent = `Session: ${formatSession(sec)}`;
    }

    function startInterval() {
      clearInterval(interval);
      interval = setInterval(updateSession, 1000);
      updateSession();
    }

    function updateBtn() {
      btn.textContent = state.running ? '⏱ Stop Timer' : '⏱ Start Timer';
    }

    updateBtn();
    startInterval();

    btn.addEventListener('click', async () => {
      if (!state.running) {
        state.running = true;
        state.start = Date.now();
        save();
        updateBtn();
        startInterval();
      } else {
        const seconds = Math.floor((Date.now() - state.start) / 1000);
        state.running = false;
        state.start = 0;
        save();
        updateBtn();
        clearInterval(interval);
        updateSession();
        if (seconds > 30) await addSpentTime(ctx, seconds);
      }
    });
  }

  function ensureTimer() {
    const ctx = getIssueContext();
    if (!ctx) return;
    const panel = findPanel();
    if (!panel) return;
    if (!document.getElementById(WRAP_ID)) createUI(panel, ctx);
  }

  function init() {
    ensureTimer();
    const obs = new MutationObserver(() => requestAnimationFrame(ensureTimer));
    obs.observe(document.body, { childList: true, subtree: true });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
