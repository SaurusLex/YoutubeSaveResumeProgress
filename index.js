// ==UserScript==
// @license MIT
// @name         Youtube Save/Resume Progress
// @namespace    http://tampermonkey.net/
// @version      1.9.4
// @description  Have you ever closed a YouTube video by accident, or have you gone to another one and when you come back the video starts from 0? With this extension it won't happen anymore
// @author       Costin Alexandru Sandu
// @match        https://www.youtube.com/watch*
// @icon         https://raw.githubusercontent.com/SaurusLex/YoutubeSaveResumeProgress/refs/heads/master/youtube_save_resume_progress_icon.jpg
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @require      https://cdn.jsdelivr.net/npm/@floating-ui/core@1.6.0/dist/floating-ui.core.umd.min.js
// @require      https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.6.3/dist/floating-ui.dom.umd.min.js
// @require      https://cdn.jsdelivr.net/npm/lucide@0.542.0/dist/umd/lucide.min.js
// @downloadURL https://update.greasyfork.org/scripts/487305/Youtube%20SaveResume%20Progress.user.js
// @updateURL https://update.greasyfork.org/scripts/487305/Youtube%20SaveResume%20Progress.meta.js
// ==/UserScript==

(function () {
  "strict";

  // ── Immutable constants ──────────────────────────────────────────────
  const CONSTANTS = {
    STORAGE: {
      CONFIG_KEY: "Youtube_SaveResume_Progress_Config",
      ITEM_PREFIX: "Youtube_SaveResume_Progress-",
    },
    SELECTORS: {
      MOVIE_PLAYER: "#movie_player",
      VIDEO_ELEMENT: "#movie_player video",
      CHAPTER_CONTAINER: '.ytp-chapter-container[style=""]',
    },
    ENUMS: {
      PlayerState: {
        UNSTARTED: -1,
        ENDED: 0,
        PLAYING: 1,
        PAUSED: 2,
        BUFFERING: 3,
        CUED: 5,
      },
      LucideIcons: {
        trash: "trash-2",
        xmark: "x",
        video: "clapperboard",
        gear: "settings",
        currentVideo: "circle-play",
      },
    },
    URLS: {
      INTER_FONT:
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap",
    },
    DEFAULT_SETTINGS: {
      minDuration: 0,
      enableMinDuration: false,
      blacklistedVideos: [],
      savingInterval: 2,
      uiVisible: true,
    },
  };

  // ── Mutable application state ────────────────────────────────────────
  const APP_STATE = {
    sanitizer: null,
    debugMode: false,
    savedProgressAlreadySet: false,
    currentVideoId: null,
    lastSaveTime: 0,
    userSettings: { ...CONSTANTS.DEFAULT_SETTINGS },
    floatingUi: { cleanUpFn: null, dashboardContainer: null },
    moviePlayer: null,
    timers: { save: null },
    ui: { menuCommandId: null },
    performanceT0: performance.now(),
  };

  const CSS_STYLES = `
    .last-save-info-container {
      all: initial;
      font-family: 'Inter', sans-serif;
      font-variant-numeric: tabular-nums;
      font-size: 1.3rem;
      margin-left: 0.5rem;
      display: flex;
      align-items: center;
    }
    .last-save-info {
      text-shadow: none;
      background: rgba(0, 0, 0, 0.3);
      color: white;
      display: flex;
      align-items: center;
      gap: 0.9rem;
      height: 40px;
      padding: 0 1rem;
      box-sizing: border-box;
      border-radius: 2rem;
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      letter-spacing: 0.01em;
    }
    .last-save-info-text {
      white-space: nowrap;
    }
    .lucide {
      width: 16px;
      height: 16px;
      stroke: currentColor;
      fill: none;
      flex-shrink: 0;
    }
    .ysrp-dashboard-button {
      background: transparent;
      border: none;
      margin-left: 0;
      width: 1.25rem;
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      cursor: pointer;
    }
    .ysrp-dashboard-button .lucide {
      color: rgba(255, 255, 255, 0.85);
      width: 1.7rem;
      height: 1.7rem;
    }
    .dashboard-container {
      all: initial;
      position: absolute;
      font-family: 'Inter', sans-serif;
      box-shadow: rgba(0, 0, 0, 0.24) 0px 3px 8px;
      border: 1px solid #d5d5d5;
      width: 50rem;
      height: 25rem;
      border-radius: .5rem;
      background: white;
      z-index: 3000;
      display: flex;
      flex-direction: row;
      overflow: hidden;
    }
    .ysrp-sidebar {
      background-color: #f9f9f9;
      border-right: 1px solid #ddd;
      display: flex;
      flex-direction: column;
      padding: 1rem 0;
    }

    .ysrp-menu-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 15px;
      cursor: pointer;
      color: #333;
      font-size: 14px;
    }
    .ysrp-main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 1.5rem;
      min-width: 0;
    }
    .ysrp-menu-item:hover {
      background: #eaeaea;
    }
    .ysrp-menu-item.active {
      background: #e0e0e0;
      font-weight: bold;
    }
    .ysrp-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 1rem;
      align-items: center;
      border-bottom: 1px solid #eee;
      padding-bottom: 0.5rem;
    }
    .ysrp-dashboard-title {
      margin: 0;
    }
    .ysrp-close-button {
      background: transparent;
      border: none;
      cursor: pointer;
    }
    .ysrp-view-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .ysrp-videos-list-container {
      flex: 1;
      overflow: auto;
      overscroll-behavior: contain;
    }
    .ysrp-videos-list {
      display: flex;
      flex-direction: column;
      row-gap: 1rem;
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .ysrp-video-item {
      display: flex;
      align-items: flex-start;
      background: #fff;
      padding: 0.8rem;
      border-bottom: 1px solid #f0f0f0;
      gap: 1rem;
    }
    .ysrp-video-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow: hidden;
    }
    .ysrp-video-name {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 500;
      color: #333;
      text-decoration: none;
    }
    .ysrp-video-name:hover {
      text-decoration: underline;
      color: #000;
    }
    .ysrp-video-meta {
      font-size: 12px;
      color: #777;
      display: flex;
      gap: 15px;
    }
    .ysrp-delete-button {
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
      padding: 4px 8px;
    }
    .ysrp-config-container {
      flex: 1;
      overflow: auto;
      overscroll-behavior: contain;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .ysrp-config-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .ysrp-button-group {
      display: flex;
      gap: 0.5rem;
      background: #f1f1f1;
      padding: 4px;
      border-radius: 8px;
    }
    .ysrp-toggle-btn {
      padding: 6px 12px;
      border: none;
      border-radius: 6px;
      background: transparent;
      cursor: pointer;
      font-size: 1.25rem;
      color: #666;
      transition: all 0.2s;
    }
    .ysrp-toggle-btn.active {
      background: white;
      color: #333;
      font-weight: bold;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .ysrp-current-video-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      padding: 1rem;
    }
    .ysrp-current-video-title {
      font-size: 1.2rem;
      font-weight: bold;
      color: #333;
      margin: 0;
    }
    .ysrp-current-video-progress {
      font-size: 2rem;
      color: #333;
      font-family: monospace;
      text-align: center;
      background: #f1f1f1;
      padding: 1rem;
      border-radius: 0.5rem;
    }
    .ysrp-toggle-button {
      padding: 0.8rem;
      border-radius: 0.5rem;
      cursor: pointer;
      font-weight: bold;
      border: 1px solid #ddd;
      transition: background 0.3s;
      text-align: center;
    }
    .ysrp-toggle-button.enabled {
      background: #4caf50;
      color: white;
      border-color: #388e3c;
    }
    .ysrp-toggle-button.disabled {
      background: #9e9e9e;
      color: white;
      border-color: #757575;
    }
    .ysrp-hidden {
      display: none !important;
    }
  `;

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = CSS_STYLES;
    document.head.appendChild(style);
  }

  function getUserConfig() {
    try {
      const saved = JSON.parse(
        window.localStorage.getItem(CONSTANTS.STORAGE.CONFIG_KEY),
      );
      return saved || {};
    } catch {
      return {};
    }
  }

  function setUserConfig(newConfig) {
    const current = getUserConfig();
    const merged = { ...current, ...newConfig };
    window.localStorage.setItem(
      CONSTANTS.STORAGE.CONFIG_KEY,
      JSON.stringify(merged),
    );
    const previousInterval = APP_STATE.userSettings.savingInterval;
    Object.assign(APP_STATE.userSettings, merged);

    if (
      newConfig.savingInterval &&
      newConfig.savingInterval !== previousInterval
    ) {
      startSavingTimer();
    }
  }

  // Load initial settings
  Object.assign(APP_STATE.userSettings, getUserConfig());

  function getMoviePlayer() {
    if (!APP_STATE.moviePlayer || !document.contains(APP_STATE.moviePlayer)) {
      APP_STATE.moviePlayer = document.querySelector(
        CONSTANTS.SELECTORS.MOVIE_PLAYER,
      );
    }
    return APP_STATE.moviePlayer;
  }

  function startSavingTimer() {
    if (APP_STATE.timers.save) {
      clearInterval(APP_STATE.timers.save);
    }
    const intervalMs = APP_STATE.userSettings.savingInterval * 1000;
    APP_STATE.timers.save = setInterval(saveVideoProgress, intervalMs);
  }

  function createIcon(iconName, color) {
    const icon = document.createElement("span");
    icon.setAttribute("data-lucide", CONSTANTS.ENUMS.LucideIcons[iconName]);
    icon.setAttribute("aria-hidden", "true");
    icon.style.color = color;
    icon.style.display = "inline-flex";

    return icon;
  }

  function renderLucideIcons() {
    if (!window.lucide || typeof window.lucide.createIcons !== "function") {
      return;
    }

    window.lucide.createIcons({
      icons: window.lucide.icons,
      nameAttr: "data-lucide",
      attrs: {
        "stroke-width": 2,
      },
    });
  }

  // ref: https://stackoverflow.com/questions/3733227/javascript-seconds-to-minutes-and-seconds
  function fancyTimeFormat(duration) {
    // Hours, minutes and seconds
    const hrs = ~~(duration / 3600);
    const mins = ~~((duration % 3600) / 60);
    const secs = ~~duration % 60;

    // Output like "1:01" or "4:03:59" or "123:03:59"
    let ret = "";

    if (hrs > 0) {
      ret += "" + hrs + ":" + (mins < 10 ? "0" : "");
    }

    ret += "" + mins + ":" + (secs < 10 ? "0" : "");
    ret += "" + secs;

    return ret;
  }

  function getVideoCurrentTime() {
    const player = getMoviePlayer();
    const currentTime = player ? player.getCurrentTime() : 0;

    return currentTime;
  }

  function getVideoDuration() {
    const player = getMoviePlayer();
    return player ? player.getDuration() : 0;
  }

  function getVideoName() {
    const player = getMoviePlayer();
    const videoData = player ? player.getVideoData() : null;
    const videoName = videoData ? videoData.title : "";

    return videoName;
  }

  function getVideoId() {
    if (APP_STATE.currentVideoId) {
      return APP_STATE.currentVideoId;
    }
    const player = getMoviePlayer();
    const videoData = player ? player.getVideoData() : null;
    const id = videoData ? videoData.video_id : null;

    return id;
  }

  function playerExists() {
    const player = getMoviePlayer();
    const exists = Boolean(player);

    return exists;
  }

  function setVideoProgress(progress) {
    const player = getMoviePlayer();

    if (player) {
      player.seekTo(progress);
    }
  }

  function updateInfoText(text) {
    const lastSaveEl = document.querySelector(".last-save-info-text");

    // This is for browsers that support Trusted Types
    const innerHtml = APP_STATE.sanitizer
      ? APP_STATE.sanitizer.createHTML(text)
      : text;

    if (lastSaveEl) {
      lastSaveEl.innerHTML = innerHtml;
    }
  }

  function saveVideoProgress() {
    const videoProgress = getVideoCurrentTime();
    const videoId = getVideoId();

    // Don't overwrite the stored progress before it has been applied to the player.
    // If savedProgressAlreadySet is still false it means seekTo() hasn't run yet,
    // so saving now would overwrite the real saved position with currentTime ≈ 0.
    if (!APP_STATE.savedProgressAlreadySet && getSavedVideoProgress()) {
      const saved = getSavedVideoProgress();
      ysrpLog(
        "saveVideoProgress: seek not applied yet, skipping save —",
        "savedTarget =",
        fancyTimeFormat(saved),
        `(${saved}s)`,
        "| currentTime =",
        getVideoCurrentTime().toFixed(2) + "s",
        "| playerState =",
        playerStateName(getMoviePlayer()?.getPlayerState()),
      );
      updateInfoText(`Restoring: ${fancyTimeFormat(saved)}...`);
      return;
    }

    const isBlacklisted =
      APP_STATE.userSettings.blacklistedVideos.includes(videoId);
    if (isBlacklisted) {
      updateInfoText("Saving: Disabled (Manual)");
      return;
    }

    // Check configuration constraints
    if (
      APP_STATE.userSettings.enableMinDuration &&
      APP_STATE.userSettings.minDuration > 0
    ) {
      const duration = getVideoDuration();
      const minDurationSec = APP_STATE.userSettings.minDuration * 60;

      if (duration < minDurationSec) {
        updateInfoText("Not saving (Too short)");
        return;
      }
    }

    updateInfoText(`Last save: ${fancyTimeFormat(videoProgress)}`);

    APP_STATE.currentVideoId = videoId;
    APP_STATE.lastSaveTime = Date.now();
    const idToStore = CONSTANTS.STORAGE.ITEM_PREFIX + videoId;
    const progressData = {
      videoProgress,
      saveDate: Date.now(),
      videoName: getVideoName(),
    };

    window.localStorage.setItem(idToStore, JSON.stringify(progressData));
  }
  function getSavedVideoList() {
    const savedVideoList = Object.entries(window.localStorage).filter(
      ([key, value]) => key.includes(CONSTANTS.STORAGE.ITEM_PREFIX),
    );
    return savedVideoList;
  }

  function getSavedVideoProgress() {
    const videoId = getVideoId();
    const idToStore = CONSTANTS.STORAGE.ITEM_PREFIX + videoId;
    const savedVideoData = window.localStorage.getItem(idToStore);
    const { videoProgress } = JSON.parse(savedVideoData) || {};

    return videoProgress;
  }

  function videoHasChapters() {
    const chaptersSection = document.querySelector(
      CONSTANTS.SELECTORS.CHAPTER_CONTAINER,
    );
    const chaptersSectionDisplay = getComputedStyle(chaptersSection).display;
    return chaptersSectionDisplay !== "none";
  }

  function setSavedProgress() {
    const savedProgress = getSavedVideoProgress();
    const player = getMoviePlayer();
    const stateBeforeSeek = player?.getPlayerState();
    ysrpLog(
      "setSavedProgress: seeking to",
      fancyTimeFormat(savedProgress),
      `(${savedProgress}s)`,
      "| player state before seek =",
      playerStateName(stateBeforeSeek),
    );
    setVideoProgress(savedProgress);
    APP_STATE.savedProgressAlreadySet = true;
    ysrpLog("setSavedProgress: seekTo called, savedProgressAlreadySet = true");
    updateInfoText(`Last save: ${fancyTimeFormat(savedProgress)}`);
  }

  // code ref: https://stackoverflow.com/questions/5525071/how-to-wait-until-an-element-exists
  function waitForElm(selector) {
    return new Promise((resolve) => {
      if (document.querySelector(selector)) {
        return resolve(document.querySelector(selector));
      }

      const observer = new MutationObserver((mutations) => {
        if (document.querySelector(selector)) {
          observer.disconnect();
          resolve(document.querySelector(selector));
        }
      });

      // If you get "parameter 1 is not of type 'Node'" error, see https://stackoverflow.com/a/77855838/492336
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    });
  }

  async function onPlayerElementExist(callback) {
    await waitForElm(CONSTANTS.SELECTORS.MOVIE_PLAYER);
    callback();
  }

  function ysrpLog(...args) {
    if (!APP_STATE.debugMode) return;
    const ms = (performance.now() - APP_STATE.performanceT0).toFixed(0);
    console.log(`[YSRP +${ms}ms]`, ...args);
  }
  function playerStateName(s) {
    const names = {
      [-1]: "UNSTARTED",
      [0]: "ENDED",
      [1]: "PLAYING",
      [2]: "PAUSED",
      [3]: "BUFFERING",
      [5]: "CUED",
    };
    return s === undefined ? "undefined" : `${names[s] ?? "UNKNOWN"}(${s})`;
  }

  async function waitForVideoReady() {
    ysrpLog("waitForVideoReady: waiting for player element...");
    const player = await waitForElm(CONSTANTS.SELECTORS.MOVIE_PLAYER);
    const playerState = player.getPlayerState();
    const duration = player.getDuration();
    ysrpLog(
      "waitForVideoReady: player found —",
      "state =",
      playerStateName(playerState),
      "| duration =",
      duration.toFixed(2) + "s",
    );

    // duration > 0 means the video metadata is loaded and seekTo will work,
    // even if state is still UNSTARTED (e.g. autoplay blocked, browser restart).
    // As a secondary check, accept any explicit "ready" state from the API.
    const readyReason = (d, s) => {
      if (d > 0) return `duration > 0 (${d.toFixed(2)}s)`;
      if (s === CONSTANTS.ENUMS.PlayerState.CUED) return "state = CUED";
      if (s === CONSTANTS.ENUMS.PlayerState.PLAYING) return "state = PLAYING";
      if (s === CONSTANTS.ENUMS.PlayerState.PAUSED) return "state = PAUSED";
      if (s === CONSTANTS.ENUMS.PlayerState.BUFFERING)
        return "state = BUFFERING";
      return null;
    };

    const initialReason = readyReason(duration, playerState);
    if (initialReason) {
      ysrpLog("waitForVideoReady: already ready —", initialReason);
      return;
    }

    // player.addEventListener("onStateChange") does not work in userscript sandboxes
    // because the player's event system runs in the page context. Poll instead.
    ysrpLog(
      "waitForVideoReady: not ready yet (state =",
      playerStateName(playerState),
      ", duration = 0), polling every 200ms...",
    );
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        const s = player.getPlayerState();
        const d = player.getDuration();
        ysrpLog(
          "waitForVideoReady: poll —",
          "state =",
          playerStateName(s),
          "| duration =",
          d.toFixed(2) + "s",
        );
        const reason = readyReason(d, s);
        if (reason) {
          clearInterval(interval);
          ysrpLog("waitForVideoReady: ready —", reason);
          resolve();
        }
      }, 200);

      // Fallback: give up after 10 s and try seekTo anyway.
      setTimeout(() => {
        clearInterval(interval);
        const s = player.getPlayerState();
        const d = player.getDuration();
        ysrpLog(
          "waitForVideoReady: 10s timeout hit, forcing seek anyway —",
          "state =",
          playerStateName(s),
          "| duration =",
          d.toFixed(2) + "s",
        );
        resolve();
      }, 10000);
    });
  }

  function isReadyToSetSavedProgress() {
    return (
      !APP_STATE.savedProgressAlreadySet &&
      playerExists() &&
      getSavedVideoProgress()
    );
  }

  function setupSeekListener() {
    const videoEl = document.querySelector(CONSTANTS.SELECTORS.VIDEO_ELEMENT);
    if (!videoEl) {
      ysrpLog("setupSeekListener: no <video> element found, skipping");
      return;
    }
    videoEl.addEventListener("seeked", () => {
      if (!APP_STATE.savedProgressAlreadySet) {
        ysrpLog(
          "setupSeekListener: seeked fired but savedProgressAlreadySet is false, skipping",
        );
        return;
      }
      ysrpLog(
        "setupSeekListener: seeked — saving progress at",
        fancyTimeFormat(getVideoCurrentTime()),
      );
      saveVideoProgress();
    });
    ysrpLog("setupSeekListener: listener attached to <video>");
  }
  function insertInfoElement(element) {
    const leftControls = document.querySelector(".ytp-left-controls");
    leftControls.appendChild(element);
    const chaptersContainerElelement = document.querySelector(
      ".ytp-chapter-container",
    );
    chaptersContainerElelement.style.flexBasis = "auto";
  }
  function insertInfoElementInChaptersContainer(element) {
    const chaptersContainer = document.querySelector(
      CONSTANTS.SELECTORS.CHAPTER_CONTAINER,
    );
    chaptersContainer.style.display = "flex";
    chaptersContainer.appendChild(element);
  }
  function updateFloatingDashboardUi() {
    const dashboardButton = document.querySelector(".ysrp-dashboard-button");
    const dashboardContainer = document.querySelector(".dashboard-container");
    const { flip, computePosition } = window.FloatingUIDOM;
    computePosition(dashboardButton, dashboardContainer, {
      placement: "top",
      middleware: [flip()],
    }).then(({ x, y }) => {
      Object.assign(dashboardContainer.style, {
        left: `${x}px`,
        top: `${y}px`,
      });
    });
  }

  function setFloatingDashboardUi() {
    const dashboardButton = document.querySelector(".ysrp-dashboard-button");
    const dashboardContainer = APP_STATE.floatingUi.dashboardContainer;
    const { autoUpdate } = window.FloatingUIDOM;

    dashboardButton.addEventListener("click", () => {
      const exists = document.body.contains(dashboardContainer);
      if (exists) {
        closeFloatingDashboardUi();
      } else {
        document.body.appendChild(dashboardContainer);
        renderLucideIcons();
        updateFloatingDashboardUi();
        APP_STATE.floatingUi.cleanUpFn = autoUpdate(
          dashboardButton,
          dashboardContainer,
          updateFloatingDashboardUi,
        );
        document.addEventListener(
          "click",
          closeFloatingDashboardUiOnClickOutside,
        );
      }
    });
  }

  function closeFloatingDashboardUiOnClickOutside(event) {
    const dashboardButton = document.querySelector(".ysrp-dashboard-button");
    const dashboardContainer = APP_STATE.floatingUi.dashboardContainer;
    if (
      dashboardContainer &&
      !dashboardContainer.contains(event.target) &&
      !dashboardButton.contains(event.target)
    ) {
      closeFloatingDashboardUi();
      document.removeEventListener(
        "click",
        closeFloatingDashboardUiOnClickOutside,
      );
    }
  }

  function closeFloatingDashboardUi() {
    const dashboardContainer = APP_STATE.floatingUi.dashboardContainer;
    dashboardContainer.remove();
    APP_STATE.floatingUi.cleanUpFn();
    APP_STATE.floatingUi.cleanUpFn = null;
  }

  function createDashboard() {
    const infoElContainer = document.querySelector(".last-save-info-container");
    const infoElContainerPosition = infoElContainer.getBoundingClientRect();
    const dashboardContainer = document.createElement("div");
    dashboardContainer.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    APP_STATE.floatingUi.dashboardContainer = dashboardContainer;
    dashboardContainer.classList.add("dashboard-container");

    dashboardContainer.classList.add("dashboard-container");

    // Sidebar
    const sidebar = document.createElement("div");
    sidebar.classList.add("ysrp-sidebar");

    // Main Content
    const mainContent = document.createElement("div");
    mainContent.classList.add("ysrp-main-content");

    dashboardContainer.appendChild(sidebar);
    dashboardContainer.appendChild(mainContent);

    function renderCurrentVideoView() {
      const body = document.createElement("div");
      body.classList.add("ysrp-current-video-container");

      const titleLabel = document.createElement("h4");
      titleLabel.textContent = getVideoName();
      titleLabel.classList.add("ysrp-current-video-title");

      const progressDisplay = document.createElement("div");
      progressDisplay.classList.add("ysrp-current-video-progress");

      const updateProgress = () => {
        const videoId = getVideoId();
        const isBlacklisted =
          APP_STATE.userSettings.blacklistedVideos.includes(videoId);
        const duration = getVideoDuration();

        if (isBlacklisted) {
          progressDisplay.textContent = `- / ${fancyTimeFormat(duration)}`;
          return;
        }

        const currentTime = getVideoCurrentTime();
        progressDisplay.textContent = `${fancyTimeFormat(
          currentTime,
        )} / ${fancyTimeFormat(duration)}`;
      };

      updateProgress();
      const intervalId = setInterval(updateProgress, 1000);
      body.dataset.intervalId = intervalId; // Store to clear later

      body.appendChild(titleLabel);
      body.appendChild(progressDisplay);

      const toggleButton = document.createElement("div");
      toggleButton.classList.add("ysrp-toggle-button");

      const updateToggleButton = () => {
        const videoId = getVideoId();
        const isBlacklisted =
          APP_STATE.userSettings.blacklistedVideos.includes(videoId);

        if (isBlacklisted) {
          toggleButton.textContent = "Enable auto-save";
          toggleButton.classList.remove("enabled");
          toggleButton.classList.add("disabled");
        } else {
          toggleButton.textContent = "Disable auto-save";
          toggleButton.classList.remove("disabled");
          toggleButton.classList.add("enabled");
        }
      };

      toggleButton.addEventListener("click", () => {
        const videoId = getVideoId();
        let blacklisted = [...APP_STATE.userSettings.blacklistedVideos];

        if (blacklisted.includes(videoId)) {
          blacklisted = blacklisted.filter((id) => id !== videoId);
        } else {
          blacklisted.push(videoId);
        }

        setUserConfig({ blacklistedVideos: blacklisted });
        updateToggleButton();
      });

      updateToggleButton();
      body.appendChild(toggleButton);

      return body;
    }

    function renderSavedVideosView(onTitleUpdate) {
      const videos = getSavedVideoList();

      // Sort videos by most recent save date
      const sortedVideos = videos
        .map(([key, value]) => ({ key, data: JSON.parse(value) }))
        .sort((a, b) => (b.data.saveDate || 0) - (a.data.saveDate || 0));

      const body = document.createElement("div");
      body.classList.add("ysrp-videos-list-container");

      const videosList = document.createElement("ul");
      videosList.classList.add("ysrp-videos-list");

      const updateTitle = () => {
        onTitleUpdate(`Saved Videos - (${videosList.children.length})`);
      };

      sortedVideos.forEach(({ key, data }) => {
        const { videoName, videoProgress, saveDate } = data;
        const videoId = key.replace(CONSTANTS.STORAGE.ITEM_PREFIX, "");

        const videoEl = document.createElement("li");
        videoEl.classList.add("ysrp-video-item");

        const infoContainer = document.createElement("div");
        infoContainer.classList.add("ysrp-video-info");

        const videoLink = document.createElement("a");
        videoLink.textContent = videoName;
        videoLink.classList.add("ysrp-video-name");
        videoLink.href = `https://www.youtube.com/watch?v=${videoId}`;
        videoLink.target = "_blank";
        videoLink.rel = "noopener noreferrer";

        const metaContainer = document.createElement("div");
        metaContainer.classList.add("ysrp-video-meta");

        const progressSpan = document.createElement("span");
        progressSpan.textContent = `Progress: ${fancyTimeFormat(videoProgress)}`;

        const dateSpan = document.createElement("span");
        const dateObj = new Date(saveDate);
        dateSpan.textContent = `Saved: ${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

        metaContainer.append(progressSpan, dateSpan);
        infoContainer.append(videoLink, metaContainer);

        const deleteButton = document.createElement("button");
        deleteButton.classList.add("ysrp-delete-button");
        const trashIcon = createIcon("trash", "#e74c3c");

        deleteButton.addEventListener("click", () => {
          window.localStorage.removeItem(key);
          videosList.removeChild(videoEl);
          updateTitle();
        });

        deleteButton.appendChild(trashIcon);
        videoEl.append(infoContainer, deleteButton);
        videosList.appendChild(videoEl);
      });

      body.appendChild(videosList);
      updateTitle();

      return body;
    }

    function renderConfigurationView() {
      const body = document.createElement("div");
      body.classList.add("ysrp-config-container");

      const configContainer = document.createElement("div");
      configContainer.classList.add("ysrp-config-container");

      // Minimum Duration Section
      const minDurationSection = document.createElement("div");
      minDurationSection.style.display = "flex";
      minDurationSection.style.flexDirection = "column";
      minDurationSection.style.gap = "0.8rem";

      const label = document.createElement("label");
      label.textContent = "Minimum video duration to save";
      label.style.fontWeight = "normal";
      label.style.fontSize = "14px";
      label.style.color = "#555";

      const controlsRow = document.createElement("div");
      controlsRow.classList.add("ysrp-config-row");

      const buttonGroup = document.createElement("div");
      buttonGroup.classList.add("ysrp-button-group");

      const alwaysBtn = document.createElement("button");
      alwaysBtn.textContent = "Always";
      alwaysBtn.classList.add("ysrp-toggle-btn");

      const customBtn = document.createElement("button");
      customBtn.textContent = "Custom";
      customBtn.classList.add("ysrp-toggle-btn");

      const customInputRow = document.createElement("div");
      customInputRow.classList.add("ysrp-config-row");
      customInputRow.style.marginLeft = "1rem";

      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.value = APP_STATE.userSettings.minDuration;
      input.style.width = "60px";

      const suffix = document.createElement("span");
      suffix.textContent = "minutes";

      customInputRow.append(input, suffix);

      const updateUIStates = () => {
        const isCustom = APP_STATE.userSettings.enableMinDuration;
        if (isCustom) {
          customBtn.classList.add("active");
          alwaysBtn.classList.remove("active");
          customInputRow.style.display = "flex";
        } else {
          alwaysBtn.classList.add("active");
          customBtn.classList.remove("active");
          customInputRow.style.display = "none";
        }
      };

      alwaysBtn.addEventListener("click", () => {
        setUserConfig({ enableMinDuration: false });
        updateUIStates();
      });

      customBtn.addEventListener("click", () => {
        setUserConfig({ enableMinDuration: true });
        updateUIStates();
        input.focus();
      });

      input.addEventListener("change", (e) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val)) {
          setUserConfig({ minDuration: val });
        }
      });

      updateUIStates();

      buttonGroup.append(alwaysBtn, customBtn);
      controlsRow.append(buttonGroup, customInputRow);
      minDurationSection.append(label, controlsRow);

      // Saving Interval Section
      const intervalSection = document.createElement("div");
      intervalSection.style.display = "flex";
      intervalSection.style.flexDirection = "column";
      intervalSection.style.gap = "0.8rem";

      const intervalLabel = document.createElement("label");
      intervalLabel.textContent = "Save progress every";
      intervalLabel.style.fontWeight = "normal";
      intervalLabel.style.fontSize = "14px";
      intervalLabel.style.color = "#555";

      const intervalInputContainer = document.createElement("div");
      intervalInputContainer.classList.add("ysrp-config-row");

      const intervalInput = document.createElement("input");
      intervalInput.type = "number";
      intervalInput.min = "1";
      intervalInput.max = "60";
      intervalInput.value = APP_STATE.userSettings.savingInterval;
      intervalInput.style.width = "60px";

      const intervalSuffix = document.createElement("span");
      intervalSuffix.textContent = "seconds";

      intervalInput.addEventListener("change", (e) => {
        const val = parseInt(e.target.value, 10);
        if (!isNaN(val) && val >= 1) {
          setUserConfig({ savingInterval: val });
        }
      });

      intervalInputContainer.append(intervalInput, intervalSuffix);
      intervalSection.append(intervalLabel, intervalInputContainer);

      // Visibility Section
      const visibilitySection = document.createElement("div");
      visibilitySection.style.display = "flex";
      visibilitySection.style.flexDirection = "column";
      visibilitySection.style.gap = "0.8rem";

      const visibilityLabel = document.createElement("label");
      visibilityLabel.textContent = "Visibility";
      visibilityLabel.style.fontWeight = "normal";
      visibilityLabel.style.fontSize = "14px";
      visibilityLabel.style.color = "#555";

      const hideButton = document.createElement("button");
      hideButton.textContent = "Hide extension";
      hideButton.classList.add("ysrp-toggle-button", "enabled");
      hideButton.style.width = "fit-content";
      hideButton.style.padding = "0.5rem 1rem";
      hideButton.style.fontSize = "12px";

      hideButton.addEventListener("click", () => {
        toggleUiVisibility();
        // Since we are hiding it, we should also close the dashboard
        closeFloatingDashboardUi();
      });

      const visibilityInfo = document.createElement("p");
      visibilityInfo.textContent =
        "You can always show it again from the Userscript manager menu (e.g. Tampermonkey icon).";
      visibilityInfo.style.fontSize = "11px";
      visibilityInfo.style.color = "#888";
      visibilityInfo.style.margin = "0";
      visibilityInfo.style.lineHeight = "1.4";

      visibilitySection.append(visibilityLabel, hideButton, visibilityInfo);

      const createDivider = () => {
        const hr = document.createElement("hr");
        hr.style.border = "none";
        hr.style.borderTop = "1px solid #eee";
        hr.style.margin = "0.5rem 0";
        return hr;
      };

      configContainer.style.gap = "1rem";

      configContainer.appendChild(minDurationSection);
      configContainer.appendChild(createDivider());
      configContainer.appendChild(intervalSection);
      configContainer.appendChild(createDivider());
      configContainer.appendChild(visibilitySection);
      body.appendChild(configContainer);

      return body;
    }

    function renderContent(viewId) {
      if (viewBody.children[0]?.dataset?.intervalId) {
        clearInterval(viewBody.children[0].dataset.intervalId);
      }
      viewBody.innerHTML = "";

      const views = {
        currentVideo: () => {
          title.textContent = "Current Video";
          viewBody.appendChild(renderCurrentVideoView());
        },
        savedVideos: () =>
          viewBody.appendChild(
            renderSavedVideosView((newTitle) => (title.textContent = newTitle)),
          ),
        configuration: () => {
          title.textContent = "Configuration";
          viewBody.appendChild(renderConfigurationView());
        },
      };

      views[viewId]?.();
      renderLucideIcons();
    }

    // Header structure
    const header = document.createElement("div");
    header.classList.add("ysrp-header");

    const title = document.createElement("h3");
    title.classList.add("ysrp-dashboard-title");

    const closeButton = document.createElement("button");
    closeButton.classList.add("ysrp-close-button");
    closeButton.appendChild(createIcon("xmark", "#e74c3c"));
    closeButton.addEventListener("click", closeFloatingDashboardUi);

    header.append(title, closeButton);

    const viewBody = document.createElement("div");
    viewBody.classList.add("ysrp-view-body");

    mainContent.append(header, viewBody);

    const menuItems = [
      { id: "currentVideo", label: "Current Video", icon: "currentVideo" },
      { id: "savedVideos", label: "Saved Videos", icon: "video" },
      { id: "configuration", label: "Configuration", icon: "gear" },
    ];

    let activeItem = null;

    menuItems.forEach((item) => {
      const itemEl = document.createElement("div");
      itemEl.classList.add("ysrp-menu-item");

      const icon = createIcon(item.icon, "inherit");
      const label = document.createElement("span");
      label.textContent = item.label;

      itemEl.append(icon, label);

      itemEl.addEventListener("click", () => {
        if (activeItem) {
          activeItem.classList.remove("active");
        }
        activeItem = itemEl;
        activeItem.classList.add("active");
        renderContent(item.id);
      });

      sidebar.appendChild(itemEl);

      if (item.id === "currentVideo") {
        activeItem = itemEl;
        activeItem.classList.add("active");
      }
    });

    renderContent("currentVideo");
    renderLucideIcons();
  }
  function applyUiVisibility() {
    const infoElContainers = document.querySelectorAll(
      ".last-save-info-container",
    );
    infoElContainers.forEach((container) => {
      if (APP_STATE.userSettings.uiVisible) {
        container.classList.remove("ysrp-hidden");
      } else {
        container.classList.add("ysrp-hidden");
      }
    });
  }

  function toggleUiVisibility() {
    const newValue = !APP_STATE.userSettings.uiVisible;
    setUserConfig({ uiVisible: newValue });
    applyUiVisibility();
    registerMenuCommands();
  }

  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand !== "undefined") {
      if (
        APP_STATE.ui.menuCommandId !== null &&
        typeof GM_unregisterMenuCommand !== "undefined"
      ) {
        GM_unregisterMenuCommand(APP_STATE.ui.menuCommandId);
      }

      const isVisible = APP_STATE.userSettings.uiVisible;
      const label = isVisible ? "🚫 Hide Extension UI" : "👁️ Show Extension UI";

      APP_STATE.ui.menuCommandId = GM_registerMenuCommand(label, () => {
        toggleUiVisibility();
      });
    }
  }

  function createInfoUI() {
    const infoElContainer = document.createElement("div");
    const infoEl = document.createElement("div");
    const infoElText = document.createElement("span");
    const dashboardButton = document.createElement("button");

    infoElContainer.classList.add("last-save-info-container");
    infoEl.classList.add("last-save-info");
    infoElText.classList.add("last-save-info-text");
    infoElText.textContent = "Last save: Loading...";
    dashboardButton.classList.add("ysrp-dashboard-button");
    dashboardButton.appendChild(createIcon("gear", "white"));

    infoEl.append(infoElText, dashboardButton);
    infoElContainer.appendChild(infoEl);

    return infoElContainer;
  }

  async function onChaptersReadyToMount(callback) {
    await waitForElm(CONSTANTS.SELECTORS.CHAPTER_CONTAINER);
    callback();
  }

  function addInterFont() {
    const head = document.getElementsByTagName("HEAD")[0];
    const fontLink = document.createElement("link");
    Object.assign(fontLink, {
      rel: "stylesheet",
      href: CONSTANTS.URLS.INTER_FONT,
    });
    head.appendChild(fontLink);
  }

  function initializeDependencies() {
    injectStyles();
    addInterFont();
    renderLucideIcons();
    setFloatingDashboardUi();
  }

  function initializeUI() {
    const infoEl = createInfoUI();
    insertInfoElement(infoEl);
    createDashboard();

    initializeDependencies();
    applyUiVisibility();

    onChaptersReadyToMount(() => {
      insertInfoElementInChaptersContainer(infoEl);
      createDashboard();
      applyUiVisibility();
    });
  }

  function initialize() {
    if (
      window.trustedTypes &&
      window.trustedTypes.createPolicy &&
      !window.trustedTypes.defaultPolicy
    ) {
      const sanitizer = window.trustedTypes.createPolicy("default", {
        createHTML: (string, sink) => string,
        createScript: (string, sink) => string,
        createScriptURL: (string, sink) => string,
      });

      APP_STATE.sanitizer = sanitizer;
    }

    onPlayerElementExist(async () => {
      initializeUI();
      await waitForVideoReady();
      setupSeekListener();
      if (isReadyToSetSavedProgress()) {
        setSavedProgress();
      } else {
        // No saved progress to restore (or it was already applied).
        // Mark the flag so the saving timer can operate normally and
        // doesn't get stuck in the "Restoring" guard forever.
        APP_STATE.savedProgressAlreadySet = true;
        ysrpLog(
          "initialize: no saved progress to restore, savedProgressAlreadySet = true",
        );
      }
    });

    registerMenuCommands();
    startSavingTimer();
  }

  initialize();
})();
