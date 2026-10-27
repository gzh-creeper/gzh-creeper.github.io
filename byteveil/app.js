(function () {
  'use strict';

  var V = window.ByteVeil;
  var $ = function (id) { return document.getElementById(id); };

  var el = {
    modeBtns: Array.prototype.slice.call(document.querySelectorAll('.mode-btn')),
    dropzone: $('dropzone'),
    fileInput: $('fileInput'),
    fileCard: $('fileCard'),
    fileIcon: $('fileIcon'),
    fileExt: $('fileExt'),
    fileName: $('fileName'),
    fileSize: $('fileSize'),
    fileType: $('fileType'),
    fileExtra: $('fileExtra'),
    changeFileBtn: $('changeFileBtn'),
    removeFileBtn: $('removeFileBtn'),
    panelKicker: $('panelKicker'),
    workbenchTitle: $('workbench-title'),
    dropTitle: $('dropTitle'),
    dropHint: $('dropHint'),
    dropBadge: $('dropBadge'),
    keyInput: $('keyInput'),
    confirmGroup: $('confirmGroup'),
    confirmInput: $('confirmInput'),
    toggleKey: $('toggleKey'),
    toggleConfirm: $('toggleConfirm'),
    keyHint: $('keyHint'),
    strength: $('strength'),
    strengthText: $('strengthText'),
    keyError: $('keyError'),
    confirmError: $('confirmError'),
    keyNoteText: $('keyNoteText'),
    generateKeyBtn: $('generateKeyBtn'),
    copyKeyBtn: $('copyKeyBtn'),
    actionBtn: $('actionBtn'),
    actionLabel: $('actionLabel'),
    actionNote: $('actionNote'),
    progressPanel: $('progressPanel'),
    progressLabel: $('progressLabel'),
    progressPct: $('progressPct'),
    progressTrack: $('progressTrack'),
    progressBar: $('progressBar'),
    progressDetail: $('progressDetail'),
    cancelBtn: $('cancelBtn'),
    errorBanner: $('errorBanner'),
    errorText: $('errorText'),
    errorClose: $('errorClose'),
    resultCard: $('resultCard'),
    resultEyebrow: $('resultEyebrow'),
    resultName: $('resultName'),
    resultMeta: $('resultMeta'),
    resultNote: $('resultNote'),
    downloadBtn: $('downloadBtn'),
    downloadLabel: $('downloadLabel'),
    clearResultBtn: $('clearResultBtn'),
    toast: $('toast'),
    srStatus: $('srStatus')
  };

  var COPY = {
    seal: {
      kicker: 'WORKBENCH / SEAL',
      title: '封包工作台',
      dropTitle: '把文件拖到这里',
      dropHint: '或点击浏览 <i>·</i> 支持任意格式',
      dropBadge: 'ANY FILE',
      dropAria: '选择要打乱并封包的文件',
      keyHint: '建议至少 12 位',
      placeholder: '输入一段只有你知道的密钥',
      action: '打乱并封包',
      actionNote: '本地处理 · AES-256-GCM 认证加密',
      keyNote: '密钥不会被保存或上传。忘记密钥，文件将无法恢复。'
    },
    open: {
      kicker: 'WORKBENCH / OPEN',
      title: '解包工作台',
      dropTitle: '把 .bveil 封包拖到这里',
      dropHint: '或点击浏览 <i>·</i> 按内容识别，扩展名可改',
      dropBadge: 'BVEIL',
      dropAria: '选择要还原的 ByteVeil 封包',
      keyHint: '输入封包时使用的密钥',
      placeholder: '输入这段封包的密钥',
      action: '还原文件',
      actionNote: '本地处理 · 认证通过后才会输出文件',
      keyNote: '密钥不正确时不会产生任何文件。所有过程都在本机完成。'
    }
  };

  var state = {
    mode: 'seal',
    file: null,
    packageInfo: null,
    result: null,
    resultUrl: null,
    busy: false,
    selecting: false,
    reveal: false,
    unavailable: false,
    abortController: null,
    toastTimer: null,
    dragDepth: 0
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  function init() {
    scheduleBootRemoval();
    bindEvents();

    if (!V) {
      state.unavailable = true;
      disableEverything('核心脚本没有加载成功。请确认 veil.js 与 index.html 在同一个文件夹中。');
    } else if (!window.crypto || !window.crypto.subtle) {
      state.unavailable = true;
      disableEverything('当前浏览器不支持 Web Crypto，无法安全处理文件。请使用较新的 Chrome、Edge、Firefox 或 Safari，并直接打开本地文件。');
    }

    applyModeCopy();
    setReveal(false);
    updateStrength();
    updateAction();
  }

  function bindEvents() {
    el.modeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = btn.getAttribute('data-mode');
        if (mode && mode !== state.mode) switchMode(mode);
      });
    });

    el.dropzone.addEventListener('click', openFilePicker);
    el.dropzone.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openFilePicker();
      }
    });

    el.fileInput.addEventListener('change', function () {
      var file = el.fileInput.files && el.fileInput.files[0];
      el.fileInput.value = '';
      if (file) selectFile(file);
    });

    el.changeFileBtn.addEventListener('click', openFilePicker);
    el.removeFileBtn.addEventListener('click', removeFile);

    el.keyInput.addEventListener('input', handleKeyInput);
    el.confirmInput.addEventListener('input', handleConfirmInput);
    el.keyInput.addEventListener('keydown', onSecretKeydown);
    el.confirmInput.addEventListener('keydown', onSecretKeydown);

    el.toggleKey.addEventListener('click', function () { setReveal(!state.reveal); });
    el.toggleConfirm.addEventListener('click', function () { setReveal(!state.reveal); });
    el.generateKeyBtn.addEventListener('click', generateKey);
    el.copyKeyBtn.addEventListener('click', copyKey);
    el.actionBtn.addEventListener('click', requestAction);
    el.cancelBtn.addEventListener('click', cancelOperation);
    el.errorClose.addEventListener('click', clearError);

    el.downloadBtn.addEventListener('click', downloadResult);
    el.clearResultBtn.addEventListener('click', function () {
      if (state.busy) return;
      clearResult();
      updateAction();
      showToast('已清除结果');
      window.requestAnimationFrame(function () {
        if (!el.actionBtn.hidden) el.actionBtn.focus();
      });
    });

    var securityLink = document.querySelector('.top-link');
    if (securityLink) {
      securityLink.addEventListener('click', function () {
        var details = document.getElementById('details');
        if (details) details.open = true;
      });
    }

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('blur', resetDrag);
    window.addEventListener('beforeunload', onBeforeUnload);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && !state.busy) setReveal(false);
    });
  }

  function scheduleBootRemoval() {
    var bootScreen = $('bootScreen');
    if (!bootScreen) return;
    var delay = prefersReducedMotion() ? 1300 : 2800;
    window.setTimeout(function () {
      if (bootScreen.parentNode) bootScreen.remove();
    }, delay);
  }

  function disableEverything(message) {
    el.actionBtn.disabled = true;
    el.generateKeyBtn.disabled = true;
    el.copyKeyBtn.disabled = true;
    el.dropzone.setAttribute('aria-disabled', 'true');
    el.dropzone.tabIndex = -1;
    showError(message, { scroll: false });
  }

  /* ------------------------------------------------------------------ */
  /* Mode and copy                                                       */
  /* ------------------------------------------------------------------ */

  function switchMode(mode, options) {
    options = options || {};
    if ((mode !== 'seal' && mode !== 'open') || mode === state.mode) return;
    if (state.busy) return;

    state.mode = mode;
    clearFileState();
    clearResult();
    clearError();
    clearFieldErrors();
    setReveal(false);
    applyModeCopy();
    updateStrength();
    updateAction();
    announce(mode === 'seal' ? '已切换到打乱文件模式' : '已切换到还原文件模式');
    if (!options.silent) showToast(mode === 'seal' ? '模式：打乱文件' : '模式：还原文件');
  }

  function applyModeCopy() {
    var copy = COPY[state.mode];

    el.panelKicker.textContent = copy.kicker;
    el.workbenchTitle.textContent = copy.title;
    el.dropTitle.textContent = copy.dropTitle;
    el.dropHint.innerHTML = copy.dropHint;
    el.dropBadge.textContent = copy.dropBadge;
    el.dropzone.setAttribute('aria-label', copy.dropAria);

    el.keyHint.textContent = copy.keyHint;
    el.keyInput.placeholder = copy.placeholder;
    el.keyInput.autocomplete = state.mode === 'seal' ? 'new-password' : 'current-password';
    el.confirmInput.autocomplete = 'new-password';
    el.keyNoteText.textContent = copy.keyNote;
    el.actionNote.textContent = copy.actionNote;
    if (!state.busy) el.actionLabel.textContent = copy.action;

    el.confirmGroup.hidden = state.mode !== 'seal';
    el.generateKeyBtn.hidden = state.mode !== 'seal';
    el.strength.hidden = state.mode !== 'seal';

    el.modeBtns.forEach(function (btn) {
      var active = btn.getAttribute('data-mode') === state.mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    document.body.setAttribute('data-mode', state.mode);
  }

  /* ------------------------------------------------------------------ */
  /* File selection                                                      */
  /* ------------------------------------------------------------------ */

  function openFilePicker() {
    if (state.busy || state.selecting || state.unavailable) return;
    el.fileInput.value = '';
    el.fileInput.click();
  }

  async function selectFile(file) {
    if (!file || state.busy || state.selecting || state.unavailable) return;

    if (file.size > V.constants.MAX_FILE_SIZE) {
      showError('文件超过 1 TiB，当前封包格式无法处理。');
      return;
    }

    state.selecting = true;
    clearError();
    clearFieldErrors();
    updateAction();

    var switched = false;

    try {
      var head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      var isPackage = V.hasMagic(head);

      if (isPackage) {
        if (state.mode !== 'open') {
          switchMode('open', { silent: true });
          switched = true;
        }

        var info = await V.inspectBlob(file);
        state.packageInfo = info;
        state.file = file;
        clearResult();
        renderFileCard();
        clearError();
        announce('已载入封包：' + info.originalName);
        if (switched) showToast('检测到 ByteVeil 封包，已切换到还原模式');
        if (file.size > 512 * 1024 * 1024) showToast('文件较大，处理时请保持此页面打开');
      } else {
        if (state.mode === 'open') {
          showError('这不是有效的 ByteVeil 封包。请选择由本工具生成、且未被改动的 .bveil 文件。');
          return;
        }
        if (/\.bveil$/i.test(file.name || '')) {
          showError('这个文件的扩展名是 .bveil，但封包标记已损坏。为避免重复加密，已拒绝载入。');
          return;
        }

        state.packageInfo = null;
        state.file = file;
        clearResult();
        renderFileCard();
        clearError();
        announce('已选择文件：' + (file.name || '未命名文件'));
        if (file.size > 512 * 1024 * 1024) showToast('文件较大，处理时请保持此页面打开');
      }
    } catch (err) {
      state.packageInfo = null;
      if (switched) {
        state.file = null;
        el.fileCard.hidden = true;
        el.dropzone.hidden = false;
      }
      showError(describeError(err, 'select'));
    } finally {
      state.selecting = false;
      updateAction();
    }
  }

  function removeFile() {
    if (state.busy || state.selecting) return;
    clearFileState();
    clearResult();
    clearError();
    clearFieldErrors();
    updateAction();
    showToast('已移除文件');
    el.dropzone.focus();
  }

  function clearFileState() {
    state.file = null;
    state.packageInfo = null;
    el.fileInput.value = '';
    el.fileCard.hidden = true;
    el.dropzone.hidden = false;
    el.fileName.textContent = '';
    el.fileName.removeAttribute('title');
    el.fileSize.textContent = '';
    el.fileType.textContent = '';
    el.fileExtra.hidden = true;
    el.fileExtra.textContent = '';
    el.fileExtra.removeAttribute('title');
  }

  function renderFileCard() {
    var file = state.file;
    if (!file) return;

    var isPackage = state.mode === 'open' && state.packageInfo;
    var name = file.name || '未命名文件';
    el.fileName.textContent = name;
    el.fileName.title = name;
    el.fileSize.textContent = formatBytes(file.size);

    if (isPackage) {
      var info = state.packageInfo;
      el.fileIcon.className = 'file-icon tone-archive';
      el.fileExt.textContent = 'BVL';
      el.fileType.textContent = 'ByteVeil 封包';

      var extra = '原始：' + info.originalName + ' · ' + formatBytes(info.originalSize);
      var date = formatDate(info.createdAt);
      if (date) extra += ' · ' + date;
      el.fileExtra.textContent = extra;
      el.fileExtra.title = extra;
      el.fileExtra.hidden = false;
    } else {
      var ext = getExtension(name);
      var category = classifyFile(name, file.type);
      var label = ext && /^[a-z0-9]{1,5}$/i.test(ext) ? ext.toUpperCase() : 'FILE';
      var type = prettyFileType(file.type, ext);

      el.fileIcon.className = 'file-icon tone-' + category;
      el.fileExt.textContent = label;
      el.fileType.textContent = type;
      el.fileExtra.hidden = true;
      el.fileExtra.textContent = '';
      el.fileExtra.removeAttribute('title');
    }

    el.fileCard.hidden = false;
    el.dropzone.hidden = true;
  }

  /* ------------------------------------------------------------------ */
  /* Key handling                                                        */
  /* ------------------------------------------------------------------ */

  function handleKeyInput() {
    clearError();
    setFieldError(el.keyInput, el.keyError, '');
    refreshConfirmError();
    updateStrength();
    updateAction();
  }

  function handleConfirmInput() {
    clearError();
    setFieldError(el.confirmInput, el.confirmError, '');
    refreshConfirmError();
    updateAction();
  }

  function onSecretKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      requestAction();
    }
  }

  function setReveal(reveal) {
    state.reveal = !!reveal;
    var type = state.reveal ? 'text' : 'password';
    el.keyInput.type = type;
    el.confirmInput.type = type;

    [el.toggleKey, el.toggleConfirm].forEach(function (btn) {
      btn.setAttribute('aria-pressed', state.reveal ? 'true' : 'false');
      btn.setAttribute('aria-label', state.reveal ? '隐藏密钥' : '显示密钥');
    });
  }

  function generateKey() {
    if (state.busy || state.mode !== 'seal' || state.unavailable) return;
    var key = V.randomKey(28);
    el.keyInput.value = key;
    el.confirmInput.value = key;
    setReveal(true);
    clearError();
    clearFieldErrors();
    updateStrength();
    updateAction();
    showToast('已生成 28 位随机密钥，请先保存好');
    el.keyInput.focus();
    el.keyInput.select();
  }

  async function copyKey() {
    var key = el.keyInput.value;
    if (!key) return;
    var ok = await copyText(key);
    showToast(ok ? '密钥已复制到剪贴板' : '复制失败，请手动选择密钥');
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {
        /* file:// often blocks the async clipboard API; fall through. */
      }
    }

    var area = document.createElement('textarea');
    area.value = text;
    area.className = 'visually-hidden';
    area.setAttribute('readonly', '');
    document.body.appendChild(area);
    area.focus();
    area.select();
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (_) {
      ok = false;
    }
    area.remove();
    return ok;
  }

  function updateStrength() {
    var password = el.keyInput.value;
    var measured = measurePassword(password);
    el.strength.dataset.score = String(measured.score);
    el.strengthText.textContent = measured.label;
  }

  function measurePassword(password) {
    if (!password) return { score: 0, label: '尚未输入' };

    var chars = Array.from(password);
    var pool = 0;
    if (/[a-z]/.test(password)) pool += 26;
    if (/[A-Z]/.test(password)) pool += 26;
    if (/[0-9]/.test(password)) pool += 10;
    if (/[^A-Za-z0-9]/.test(password)) {
      pool += /[^\x00-\x7f]/.test(password) ? 100 : 33;
    }
    if (pool === 0) pool = 1;

    var unique = new Set(chars).size;
    var effectiveLength = chars.length;
    if (chars.length > 1) {
      effectiveLength = chars.length * (0.62 + 0.38 * (unique / chars.length));
    }

    var entropy = effectiveLength * Math.log2(pool);
    var score;
    if (entropy >= 90) score = 4;
    else if (entropy >= 65) score = 3;
    else if (entropy >= 43) score = 2;
    else score = 1;

    if (chars.length < 8) score = 1;
    else if (chars.length < 12) score = Math.min(score, 2);

    var labels = { 1: '偏弱', 2: '一般', 3: '较强', 4: '很强' };
    return { score: score, label: labels[score] || '偏弱' };
  }

  /* ------------------------------------------------------------------ */
  /* Validation and action                                               */
  /* ------------------------------------------------------------------ */

  function refreshConfirmError() {
    if (state.mode !== 'seal') {
      setFieldError(el.confirmInput, el.confirmError, '');
      return;
    }
    var key = el.keyInput.value;
    var confirm = el.confirmInput.value;
    if (key && confirm && key !== confirm) {
      setFieldError(el.confirmInput, el.confirmError, '两次输入的密钥不一致。');
    } else {
      setFieldError(el.confirmInput, el.confirmError, '');
    }
  }

  function validateForm() {
    clearFieldErrors();
    var key = el.keyInput.value;

    if (!state.file) {
      showError('请先选择一个文件。');
      el.dropzone.focus();
      return false;
    }

    if (!key) {
      setFieldError(el.keyInput, el.keyError, '请输入密钥。');
      el.keyInput.focus();
      return false;
    }

    if (state.mode === 'seal') {
      if (!el.confirmInput.value) {
        setFieldError(el.confirmInput, el.confirmError, '请再输入一次密钥。');
        el.confirmInput.focus();
        return false;
      }
      if (key !== el.confirmInput.value) {
        setFieldError(el.confirmInput, el.confirmError, '两次输入的密钥不一致。');
        el.confirmInput.focus();
        return false;
      }
    }

    return true;
  }

  async function requestAction() {
    if (state.busy || state.selecting || state.unavailable) return;
    if (state.result) {
      showToast('请先清除上次结果，或更换文件后再处理');
      return;
    }
    if (!validateForm()) return;

    await performAction();
  }

  async function performAction() {
    var operationMode = state.mode;
    var file = state.file;
    clearError();
    clearFieldErrors();
    state.busy = true;
    state.abortController = new AbortController();

    showProgress(operationMode);
    updateAction();

    await new Promise(function (resolve) {
      window.requestAnimationFrame(function () { resolve(); });
    });

    try {
      var operation = operationMode === 'seal' ? V.sealBlob : V.openBlob;
      var result = await operation(file, el.keyInput.value, {
        signal: state.abortController.signal,
        onProgress: handleProgress
      });

      hideProgress();
      showResult(result, operationMode);
      announce(operationMode === 'seal' ? '封包完成，可以下载了' : '还原完成，可以下载了');
    } catch (err) {
      hideProgress();
      if (err && err.code === 'ABORTED') {
        showToast('已取消，没有生成文件');
      } else {
        showError(describeError(err, 'process'));
      }
    } finally {
      state.busy = false;
      state.abortController = null;
      el.cancelBtn.disabled = false;
      el.cancelBtn.textContent = '取消';
      updateAction();
    }
  }

  function updateAction() {
    var key = el.keyInput.value;
    var confirm = el.confirmInput.value;
    var needsConfirm = state.mode === 'seal';
    var formReady = key.length > 0 && (!needsConfirm || (confirm.length > 0 && confirm === key));
    var canRun = !state.busy && !state.selecting && !state.unavailable && !state.result && !!state.file && formReady;

    el.actionBtn.disabled = !canRun;
    el.actionBtn.classList.toggle('is-busy', state.busy);
    el.actionBtn.hidden = !!state.result;
    el.actionNote.hidden = !!state.result;

    if (state.busy) {
      el.actionLabel.textContent = state.mode === 'seal' ? '正在封包…' : '正在还原…';
    } else {
      el.actionLabel.textContent = COPY[state.mode].action;
    }

    if (!canRun && !state.busy) {
      if (!state.file) el.actionBtn.title = '请先选择文件';
      else if (!key) el.actionBtn.title = '请输入密钥';
      else if (needsConfirm && !confirm) el.actionBtn.title = '请再输入一次密钥';
      else if (needsConfirm && confirm !== key) el.actionBtn.title = '两次输入的密钥不一致';
      else el.actionBtn.title = '';
    } else {
      el.actionBtn.title = '';
    }

    el.modeBtns.forEach(function (btn) {
      btn.disabled = state.busy || state.selecting;
    });

    el.changeFileBtn.disabled = state.busy || state.selecting;
    el.removeFileBtn.disabled = state.busy || state.selecting;
    el.keyInput.disabled = state.busy;
    el.confirmInput.disabled = state.busy;
    el.toggleKey.disabled = state.busy;
    el.toggleConfirm.disabled = state.busy;
    el.generateKeyBtn.disabled = state.busy || state.selecting || state.unavailable;
    el.copyKeyBtn.disabled = state.busy || key.length === 0;
    el.fileInput.disabled = state.busy || state.selecting;

    var dropDisabled = state.busy || state.selecting || state.unavailable;
    el.dropzone.classList.toggle('is-disabled', dropDisabled);
    el.dropzone.setAttribute('aria-disabled', dropDisabled ? 'true' : 'false');
    el.dropzone.tabIndex = dropDisabled ? -1 : 0;

    if (!state.result) {
      el.actionNote.hidden = false;
    }
  }

  function setFieldError(input, errorEl, message) {
    errorEl.textContent = message || '';
    errorEl.hidden = !message;
    var wrap = input.closest('.input-wrap');
    if (wrap) wrap.classList.toggle('is-invalid', !!message);
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function clearFieldErrors() {
    setFieldError(el.keyInput, el.keyError, '');
    setFieldError(el.confirmInput, el.confirmError, '');
  }

  /* ------------------------------------------------------------------ */
  /* Progress                                                            */
  /* ------------------------------------------------------------------ */

  function showProgress(mode) {
    el.progressPanel.hidden = false;
    el.progressPanel.classList.add('is-indeterminate');
    el.progressBar.style.width = '0%';
    el.progressPct.textContent = '···';
    el.progressLabel.textContent = mode === 'seal' ? '正在准备加密…' : '正在读取封包…';
    el.progressDetail.textContent = '文件不会离开这台设备';
    el.progressTrack.setAttribute('aria-valuenow', '0');
    el.progressTrack.removeAttribute('aria-valuetext');
    el.cancelBtn.disabled = false;
    el.cancelBtn.textContent = '取消';
  }

  function handleProgress(event) {
    if (!event || !state.busy) return;

    if (event.phase === 'derive') {
      el.progressPanel.classList.add('is-indeterminate');
      el.progressLabel.textContent = '正在从密钥派生加密钥匙…';
      el.progressPct.textContent = 'PBKDF2';
      el.progressDetail.textContent = '310,000 次迭代 · 只在本机计算';
      el.progressTrack.removeAttribute('aria-valuenow');
      el.progressTrack.setAttribute('aria-valuetext', '正在派生密钥');
      return;
    }

    var pct = Math.max(0, Math.min(100, Math.round((event.progress || 0) * 100)));
    el.progressPanel.classList.remove('is-indeterminate');
    el.progressBar.style.width = pct + '%';
    el.progressPct.textContent = pct + '%';
    el.progressTrack.setAttribute('aria-valuenow', String(pct));
    el.progressTrack.removeAttribute('aria-valuetext');

    if (event.phase === 'done') {
      el.progressLabel.textContent = state.mode === 'seal' ? '封包完成' : '还原完成';
      el.progressDetail.textContent = '正在生成下载文件…';
      return;
    }

    var verb = state.mode === 'seal' ? '打乱' : '还原';
    if (!event.done) {
      el.progressLabel.textContent = '正在准备分块…';
    } else {
      el.progressLabel.textContent = '正在' + verb + '分块 ' + event.done + ' / ' + event.total + '…';
    }
    el.progressDetail.textContent = formatBytes(state.file ? state.file.size : 0) + ' · AES-256-GCM';
  }

  function hideProgress() {
    el.progressPanel.hidden = true;
    el.progressPanel.classList.remove('is-indeterminate');
    el.progressBar.style.width = '0%';
    el.progressPct.textContent = '0%';
    el.progressTrack.setAttribute('aria-valuenow', '0');
    el.cancelBtn.disabled = false;
    el.cancelBtn.textContent = '取消';
  }

  function cancelOperation() {
    if (!state.abortController) return;
    el.cancelBtn.disabled = true;
    el.cancelBtn.textContent = '正在取消…';
    state.abortController.abort();
  }

  /* ------------------------------------------------------------------ */
  /* Result                                                              */
  /* ------------------------------------------------------------------ */

  function showResult(result, mode) {
    clearResult();

    var displayName = safeDownloadName(result.filename);
    state.result = {
      blob: result.blob,
      filename: result.filename,
      displayName: displayName,
      info: result.info,
      mode: mode
    };
    state.resultUrl = URL.createObjectURL(result.blob);

    el.resultEyebrow.textContent = mode === 'seal' ? '封包完成' : '还原完成';
    el.resultName.textContent = displayName;
    el.resultName.title = displayName;

    if (mode === 'seal') {
      el.resultMeta.textContent =
        formatBytes(result.info.originalSize) + ' → ' + formatBytes(result.blob.size) +
        ' · ' + result.info.totalChunks + ' 个分块 · AES-256-GCM';
      el.resultNote.textContent = '请先单独保存密钥。丢失密钥后，这个封包没有找回方式。';
      el.downloadLabel.textContent = '下载乱码封包';
    } else {
      el.resultMeta.textContent =
        formatBytes(result.blob.size) + ' · 完整性认证通过 · ' + result.info.totalChunks + ' 个分块';
      el.resultNote.textContent = '文件名、大小和内容均已恢复。整个过程没有请求任何服务器。';
      el.downloadLabel.textContent = '下载还原文件';
    }

    el.resultCard.hidden = false;
    updateAction();

    window.requestAnimationFrame(function () {
      el.resultCard.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
    });
  }

  function clearResult() {
    if (state.resultUrl) {
      URL.revokeObjectURL(state.resultUrl);
      state.resultUrl = null;
    }
    state.result = null;
    el.resultCard.hidden = true;
    el.resultEyebrow.textContent = '';
    el.resultName.textContent = '';
    el.resultMeta.textContent = '';
    el.resultNote.textContent = '';
  }

  function downloadResult() {
    if (!state.result || !state.resultUrl) return;
    var anchor = document.createElement('a');
    anchor.href = state.resultUrl;
    anchor.download = safeDownloadName(state.result.displayName);
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    showToast('已开始下载');
  }

  function safeDownloadName(name) {
    var safe = String(name || 'download.bin')
      .normalize('NFC')
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_')
      .replace(/[. ]+$/g, '')
      .trim();

    if (!safe) safe = 'download.bin';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(safe)) safe = '_' + safe;

    if (safe.length > 200) {
      var dot = safe.lastIndexOf('.');
      var ext = dot > 0 && safe.length - dot <= 17 ? safe.slice(dot) : '';
      safe = safe.slice(0, 200 - ext.length) + ext;
    }
    return safe;
  }

  /* ------------------------------------------------------------------ */
  /* Errors, toast, drag                                                */
  /* ------------------------------------------------------------------ */

  function showError(message, options) {
    options = options || {};
    el.errorText.textContent = message;
    el.errorBanner.hidden = false;
    announce(message);
    if (options.scroll !== false) {
      window.requestAnimationFrame(function () {
        el.errorBanner.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          block: 'nearest'
        });
      });
    }
  }

  function clearError() {
    if (el.errorBanner.hidden) return;
    el.errorBanner.hidden = true;
    el.errorText.textContent = '';
  }

  function describeError(err, context) {
    var code = err && err.code;
    if (code === 'WRONG_KEY') return '密钥不正确，或封包已经损坏。请检查密钥后重试。';
    if (code === 'UNSUPPORTED_VERSION') return '这个封包由更新版本的 ByteVeil 生成，当前版本无法打开。';
    if (code === 'UNSUPPORTED_FORMAT') return '封包使用了不受支持的加密参数。';
    if (code === 'INVALID_FORMAT') {
      if (context === 'select') return '无法读取这个封包：文件头、大小或分块结构不完整，可能已损坏或被修改。';
      return '封包结构异常或已损坏，无法还原。';
    }
    if (code === 'CRYPTO_UNAVAILABLE') return '当前浏览器不支持所需的加密能力。请换用较新的浏览器并以本地文件方式打开。';
    if (code === 'FILE_TOO_LARGE') return '文件超过 1 TiB，当前封包格式无法处理。';
    if (code === 'DATA_CHANGED') return '读取过程中文件发生了变化，请重新选择文件。';
    if (code === 'PASSWORD_REQUIRED') return '请输入密钥。';
    if (code === 'PASSWORD_TOO_LONG') return '密钥过长，请控制在 1024 个字符以内。';
    if (code === 'ABORTED') return '操作已取消。';
    if (code === 'ENCRYPT_FAILED') return '加密失败，请重试。如果问题持续出现，请换一个较小的文件。';

    console.error(err);
    if (err && (err.name === 'QuotaExceededError' || err.name === 'RangeError')) {
      return '浏览器内存不足。请关闭其他标签页，或换一个较小的文件后重试。';
    }
    return '处理失败，请重试。如果文件较大，请关闭其他标签页以释放内存。';
  }

  function showToast(message) {
    window.clearTimeout(state.toastTimer);
    el.toast.textContent = message;
    el.toast.classList.add('is-visible');
    state.toastTimer = window.setTimeout(function () {
      el.toast.classList.remove('is-visible');
    }, 2600);
  }

  function announce(message) {
    el.srStatus.textContent = '';
    window.setTimeout(function () {
      el.srStatus.textContent = message;
    }, 30);
  }

  function isFileDrag(event) {
    var types = event.dataTransfer && event.dataTransfer.types;
    if (!types) return false;
    return Array.prototype.indexOf.call(types, 'Files') !== -1;
  }

  function onDragEnter(event) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    state.dragDepth += 1;
    document.body.classList.add('is-dragging');
  }

  function onDragOver(event) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = state.busy ? 'none' : 'copy';
  }

  function onDragLeave(event) {
    if (state.dragDepth === 0) return;
    state.dragDepth = Math.max(0, state.dragDepth - 1);
    if (state.dragDepth === 0) document.body.classList.remove('is-dragging');
  }

  function onDrop(event) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    resetDrag();

    if (state.busy || state.selecting) {
      showToast('正在处理，请稍后再选择文件');
      return;
    }
    if (state.unavailable) return;

    var files = event.dataTransfer && event.dataTransfer.files;
    if (!files || !files.length) return;
    if (files.length > 1) showToast('一次处理一个文件，已选择第一个');
    selectFile(files[0]);
  }

  function resetDrag() {
    state.dragDepth = 0;
    document.body.classList.remove('is-dragging');
  }

  function onBeforeUnload(event) {
    if (state.busy) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */

  function getExtension(name) {
    var base = String(name || '').replace(/^.*[\\/]/, '');
    var dot = base.lastIndexOf('.');
    if (dot <= 0 || dot === base.length - 1) return '';
    return base.slice(dot + 1);
  }

  function classifyFile(name, mime) {
    var ext = getExtension(name).toLowerCase();
    var type = String(mime || '').toLowerCase();

    if (type.indexOf('image/') === 0 || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic', 'avif', 'tif', 'tiff', 'ico'].indexOf(ext) !== -1) return 'image';
    if (type.indexOf('video/') === 0 || type.indexOf('audio/') === 0 || ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'mp4', 'mov', 'mkv', 'webm', 'avi', 'wmv'].indexOf(ext) !== -1) return 'media';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst', 'tgz', 'bveil'].indexOf(ext) !== -1) return 'archive';
    if (['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'html', 'htm', 'css', 'scss', 'json', 'py', 'java', 'c', 'h', 'cpp', 'hpp', 'go', 'rs', 'rb', 'php', 'sh', 'bash', 'ps1', 'yml', 'yaml', 'xml', 'sql', 'toml', 'ini', 'conf'].indexOf(ext) !== -1) return 'code';
    if (type.indexOf('text/') === 0 || ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'rtf', 'csv', 'epub', 'pages', 'numbers', 'key'].indexOf(ext) !== -1) return 'doc';
    return 'other';
  }

  function prettyFileType(mime, ext) {
    var type = String(mime || '').split(';')[0].trim();
    if (!type && ext) type = ext.toUpperCase() + ' 文件';
    if (!type) type = '二进制文件';
    if (type.length > 30) type = type.slice(0, 29) + '…';
    return type;
  }

  function formatBytes(value) {
    var bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return Math.round(bytes) + ' B';

    var units = ['KB', 'MB', 'GB', 'TB'];
    var index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length);
    var number = bytes / Math.pow(1024, index);
    var digits = number >= 100 ? 0 : number >= 10 ? 1 : 2;
    return number.toFixed(digits).replace(/\.0+$/, '') + ' ' + units[index - 1];
  }

  function formatDate(timestamp) {
    if (!timestamp) return '';
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date(timestamp));
    } catch (_) {
      return '';
    }
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
})();
