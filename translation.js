(() => {
  const ENDPOINT = 'https://158-179-30-201.sslip.io/duolibee/translate';
  const CLIENT_ID = '953505436719-p73hfncc6p39481s6jaedj975l2a9rul.apps.googleusercontent.com';
  const CACHE_PREFIX = 'duolibee-translation-';
  let idToken = '';
  let idTokenExpires = 0;
  let pending = false;
  let pendingResolve = null;
  let pendingReject = null;
  let lastTranslatedKey = '';

  function area() {
    return document.getElementById('translation-result');
  }

  function setStatus(text) {
    const el = area();
    if (el) el.textContent = text;
  }

  function cacheKey(sentence) {
    return CACHE_PREFIX + sentence;
  }

  function cachedTranslation(sentence) {
    try {
      return sessionStorage.getItem(cacheKey(sentence));
    } catch (e) {
      return null;
    }
  }

  function storeTranslation(sentence, english) {
    try {
      sessionStorage.setItem(cacheKey(sentence), english);
    } catch (e) {}
  }

  function handleCredentialResponse(response) {
    const credential = response && response.credential;

    if (!credential) {
      if (pendingReject) pendingReject(new Error('Google did not return a sign-in token.'));
      return;
    }

    idToken = credential;
    idTokenExpires = Date.now() + 55 * 60 * 1000;

    if (pendingResolve) pendingResolve(credential);
  }

  function requestIdToken() {
    return new Promise((resolve, reject) => {
      if (!window.google || !window.google.accounts || !window.google.accounts.id) {
        reject(new Error('Google sign-in is still loading. Try again shortly.'));
        return;
      }

      pendingResolve = resolve;
      pendingReject = reject;

      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: handleCredentialResponse
      });

      google.accounts.id.prompt();

      setTimeout(() => {
        if (pendingReject === reject) {
          pendingReject(new Error('Google sign-in prompt was dismissed or unavailable.'));
          pendingResolve = null;
          pendingReject = null;
        }
      }, 120000);
    });
  }

  async function getIdToken() {
    if (idToken && Date.now() < idTokenExpires) return idToken;
    return requestIdToken();
  }

  async function translate(sentence) {
    const english = cachedTranslation(sentence);
    if (english) {
      setStatus(english);
      return;
    }

    if (!navigator.onLine) {
      setStatus('Translation is unavailable while offline.');
      return;
    }

    if (pending) {
      setStatus('Translation request already in progress.');
      return;
    }

    pending = true;
    setStatus('Translating…');

    try {
      const token = await getIdToken();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({
          q: sentence,
          source: 'tl',
          target: 'en',
          format: 'text'
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (response.status === 401) {
        idToken = '';
        idTokenExpires = 0;
        setStatus('Sign in with Google to see English.');
        return;
      }

      if (response.status === 429) {
        setStatus('Daily translation limit reached. Resets at midnight UTC.');
        return;
      }

      if (!response.ok) {
        setStatus('Translation is unavailable right now.');
        return;
      }

      const data = await response.json();
      const result = typeof data.translatedText === 'string' ? data.translatedText.trim() : '';

      if (!result) {
        setStatus('Translation is unavailable right now.');
        return;
      }

      storeTranslation(sentence, result);
      setStatus(result);
    } catch (error) {
      if (error.name === 'AbortError') {
        setStatus('Translation request timed out.');
      } else {
        setStatus(error.message || 'Translation is unavailable right now.');
      }
    } finally {
      pending = false;
      pendingResolve = null;
      pendingReject = null;
    }
  }

  function currentAnsweredChallenge() {
    const challenge = state && state.dailyChallenge;
    if (!challenge || !Array.isArray(challenge.questions) || !Array.isArray(challenge.answers)) return null;

    let answeredIndex = -1;
    for (let i = 0; i < challenge.answers.length; i++) {
      if (challenge.answers[i] !== null) answeredIndex = i;
    }

    if (answeredIndex < 0) return null;
    return {
      index: answeredIndex,
      sentence: challenge.questions[answeredIndex] && challenge.questions[answeredIndex].sentence
    };
  }

  function addTranslationArea(card) {
    if (!card || document.getElementById('translation-result')) return;

    const result = document.createElement('div');
    result.id = 'translation-result';
    result.className = 'translation-result';
    result.setAttribute('role', 'status');

    const feedback = card.querySelector('.feedback');
    if (feedback) feedback.after(result); else card.append(result);
  }

  function handleDailyChallenge() {
    const card = app.querySelector('section.card');
    if (!card || !card.querySelector('.feedback')) return;

    const answered = currentAnsweredChallenge();
    if (!answered || !answered.sentence) return;

    const key = cacheKey(answered.sentence);
    if (lastTranslatedKey === key && area()) return;

    lastTranslatedKey = key;
    addTranslationArea(card);

    const cached = cachedTranslation(answered.sentence);
    if (cached) {
      setStatus(cached);
      return;
    }

    setStatus('Sign in with Google to see English.');
    translate(answered.sentence);
  }

  new MutationObserver(() => {
    if (!view || view !== 'daily') return;
    handleDailyChallenge();
  }).observe(app, { childList: true, subtree: true });
})();
