// ==UserScript==
// @license MIT
// @name         Youtube Save/Resume Progress
// @namespace    http://tampermonkey.net/
// @version      1.4.5
// @description  Have you ever closed a YouTube video by accident, or have you gone to another one and when you come back the video starts from 0? With this extension it won't happen anymore
// @author       Costin Alexandru Sandu
// @match        https://www.youtube.com/watch*
// @icon         https://tse4.mm.bing.net/th/id/OIG3.UOFNuEtdysdoeX0tMsVU?pid=ImgGn
// @grant        none
// @downloadURL https://update.greasyfork.org/scripts/487305/YoutubePlayBack.user.js
// @updateURL https://update.greasyfork.org/scripts/487305/YoutubePlayBack.meta.js
// ==/UserScript==

(function () {
  'strict'
  var configData = {
    savedProgressAlreadySet: false,
    savingInterval: 1500,
    currentVideoId: null,
    lastSaveTime: 0
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

  function executeFnInPageContext(fn) {
    const fnStringified = fn.toString()
    return window.eval('(' + fnStringified + ')' + '()')
  }

  function getVideoCurrentTime() {
    const currentTime = executeFnInPageContext(() => {
      const player = document.querySelector('#movie_player')
      return player.getCurrentTime()
    })
    return currentTime
  }

  function getVideoName() {
    const videoName = executeFnInPageContext(() => {
      const player = document.querySelector('#movie_player')
      return player.getVideoData().title
    })
    return videoName
  }

  function getVideoId() {
    if (configData.currentVideoId) {
      return configData.currentVideoId
    }
    const id = executeFnInPageContext(() => {
      const player = document.querySelector('#movie_player')
      return player.getVideoData().video_id
    })
    return id
  }

  function playerExists() {
    const exists = executeFnInPageContext(() => {
      const player = document.querySelector('#movie_player')
      return Boolean(player)
    })
    return exists
  }

  function setVideoProgress(progress) {
    window.eval('var progress =' + progress)
    executeFnInPageContext(() => {
      const player = document.querySelector('#movie_player')
      player.seekTo(window.progress)
    })
    window.eval('delete progress')
  }

  function updateLastSaved(videoProgress) {
    const lastSaveEl = document.querySelector('.last-save-info-text')
    if (lastSaveEl) {
      lastSaveEl.innerHTML = "Last save at " + fancyTimeFormat(videoProgress)
    }
  }

  function saveVideoProgress() {
    const videoProgress = getVideoCurrentTime()
    const videoId = getVideoId()

    configData.currentVideoId = videoId
    configData.lastSaveTime = Date.now()
    updateLastSaved(videoProgress)
    const idToStore = 'Youtube_SaveResume_Progress-' + videoId
    const progressData = {
      videoProgress,
      saveDate: Date.now(),
      videoName: getVideoName()
    }
    
    window.localStorage.setItem(idToStore, JSON.stringify(progressData))
  }
  function getSavedVideoList() {
    const savedVideoList = Object.keys(window.localStorage).filter(key => key.includes('Youtube_SaveResume_Progress-'))
    return savedVideoList
  }

  function getSavedVideoProgress() {
    const videoId = getVideoId()
    const idToStore = 'Youtube_SaveResume_Progress-' + videoId
    const savedVideoData = window.localStorage.getItem(idToStore)
    const { videoProgress } = JSON.parse(savedVideoData) || {}

    return videoProgress
  }

  function videoHasChapters() {
    const chaptersSection = document.querySelector('.ytp-chapter-container[style=""]')
    const chaptersSectionDisplay = getComputedStyle(chaptersSection).display 
    return chaptersSectionDisplay !== 'none'
  }

  function setSavedProgress() {
    const savedProgress = getSavedVideoProgress();
    setVideoProgress(savedProgress)
    configData.savedProgressAlreadySet = true
  }

  // code ref: https://stackoverflow.com/questions/5525071/how-to-wait-until-an-element-exists
  function waitForElm(selector) {
    return new Promise(resolve => {
      if (document.querySelector(selector)) {
        return resolve(document.querySelector(selector));
      }

      const observer = new MutationObserver(mutations => {
        if (document.querySelector(selector)) {
          observer.disconnect();
          resolve(document.querySelector(selector));
        }
      });

      // If you get "parameter 1 is not of type 'Node'" error, see https://stackoverflow.com/a/77855838/492336
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    });
  }

  async function onPlayerElementExist(callback) {
    await waitForElm('#movie_player')
    callback()
  }

  function isReadyToSetSavedProgress() {
    return !configData.savedProgressAlreadySet && playerExists() && getSavedVideoProgress()
  }
  function insertInfoElement(element) {
    const leftControls = document.querySelector('.ytp-left-controls')
    leftControls.appendChild(element)
  }
  function insertInfoElementInChaptersContainer(element) {
    const chaptersContainer = document.querySelector('.ytp-chapter-container[style=""]')
    chaptersContainer.style.display = 'flex'
    chaptersContainer.appendChild(element)
  }
  function updateFloatingSettingsUi() {
    const settingsButton = document.querySelector('.ysrp-settings-button')
    const settingsContainer = document.querySelector('.settings-container')
    const { flip, computePosition } = window.FloatingUIDOM
    computePosition(settingsButton, settingsContainer, { 
      placement: 'bottom',
      middleware: [flip()]
    }).then(({x, y}) => {
      Object.assign(settingsContainer.style, {
        left: `${x}px`,
        top: `${y}px`,
      });
    });

  }


  function setFloatingSettingsUi() {
    const settingsButton = document.querySelector('.ysrp-settings-button')
    const settingsContainer = document.querySelector('.settings-container')

    executeFnInPageContext(updateFloatingSettingsUi)

    settingsButton.addEventListener('click', () => {
      settingsContainer.style.display = settingsContainer.style.display === 'none' ? 'block' : 'none'
      if (settingsContainer.style.display === 'block') {
        executeFnInPageContext(updateFloatingSettingsUi)
      }
    })
  }

  function createSettingsUI() {
    const infoElContainer = document.querySelector('.last-save-info-container')
    const infoElContainerPosition = infoElContainer.getBoundingClientRect()
    const settingsContainer = document.createElement('div')
    settingsContainer.classList.add('settings-container')

    settingsContainer.style.position = 'absolute'
    settingsContainer.style.top = '0'
    settingsContainer.style.display = 'none'
    settingsContainer.style.top = infoElContainerPosition.bottom + 'px'
    settingsContainer.style.left = infoElContainerPosition.left + 'px'
    settingsContainer.style.width = infoElContainerPosition.width + 'px'
    settingsContainer.style.height = '20rem'
    settingsContainer.style.background = 'white'
    settingsContainer.style.zIndex = '3000'
    document.body.appendChild(settingsContainer)

    const savedVideos = getSavedVideoList()
    const savedVideosList = document.createElement('ul')
    

  }

  function createInfoUI() {

    const infoElContainer = document.createElement('div')
    infoElContainer.classList.add('last-save-info-container')
    const infoElText = document.createElement('span')
    const settingsButton = document.createElement('button')
    settingsButton.classList.add('ysrp-settings-button')

    settingsButton.style.background = 'white'
    settingsButton.style.border = 'rgba(0, 0, 0, 0.3) 1px solid'
    settingsButton.style.borderRadius = '.5rem'
    settingsButton.style.marginLeft = '1rem'

    const infoEl = document.createElement('div')
    infoEl.classList.add('last-save-info')
    infoElText.textContent = "Last save at :"
    infoElText.classList.add('last-save-info-text')
    infoEl.appendChild(infoElText)
    infoEl.appendChild(settingsButton)



    infoElContainer.style.all = 'initial'
    infoElContainer.style.fontFamily = 'inherit'
    infoElContainer.style.fontSize = '1.3rem'
    infoElContainer.style.marginLeft = '0.5rem'
    infoElContainer.style.display = 'flex'
    infoElContainer.style.alignItems = 'center'

    infoEl.style.textShadow = 'none'
    infoEl.style.background = 'white'
    infoEl.style.color = 'black'
    infoEl.style.padding = '.5rem'
    infoEl.style.borderRadius = '.5rem'
    
    infoElContainer.appendChild(infoEl)
    
    return infoElContainer
  }
  
  async function onChaptersReadyToMount(callback) {
    await waitForElm('.ytp-chapter-container[style=""]')
    callback()
  }
  
  function initializeUI() {
    const infoEl = createInfoUI()
    insertInfoElement(infoEl)
    createSettingsUI()

    let head = document.getElementsByTagName('HEAD')[0];
    let iconsUi = document.createElement('link');
    iconsUi.rel = 'stylesheet';
    iconsUi.type = 'text/css';
    iconsUi.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
    head.appendChild(iconsUi);
    
    const floatingUiCore = document.createElement('script')
    const floatingUiDom = document.createElement('script')
    floatingUiCore.src = 'https://cdn.jsdelivr.net/npm/@floating-ui/core@1.6.0'
    floatingUiDom.src = 'https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.6.3'
    document.body.appendChild(floatingUiCore)
    document.body.appendChild(floatingUiDom)
    let floatingUiCoreLoaded = false
    let floatingUiDomLoaded = false
		
    iconsUi.addEventListener('load', () => {
      const icon = document.createElement('span')
      
      const settingsButton = document.querySelector('.ysrp-settings-button')
      settingsButton.appendChild(icon)
      icon.classList.add('fa-solid')
      icon.classList.add('fa-gear')
      
    })
    
    floatingUiCore.addEventListener('load', () => {
      floatingUiCoreLoaded = true
      if (floatingUiCoreLoaded && floatingUiDomLoaded) {
        setFloatingSettingsUi()
      }
    })
    floatingUiDom.addEventListener('load', () => {
      floatingUiDomLoaded = true
      if (floatingUiCoreLoaded && floatingUiDomLoaded) {
        setFloatingSettingsUi()
      }
    })

    onChaptersReadyToMount(() => {
      insertInfoElementInChaptersContainer(infoEl)
      createSettingsUI()
    })
  }

  

  function initialize() {
    onPlayerElementExist(() => {
      initializeUI()
      if (isReadyToSetSavedProgress()) {
        setSavedProgress()
      }
    })

    setInterval(saveVideoProgress, configData.savingInterval)
  }

  initialize()
})();