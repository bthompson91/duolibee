(() => {
  const ENDPOINT = 'https://158-179-30-201.sslip.io/duolibee/translate';
  const CLIENT_ID = '953505436719-p73hfncc6p39481s6jaedj975l2a9rul.apps.googleusercontent.com';
  const CACHE_PREFIX = 'duolibee-translation-';
  let idToken = '';
  let idTokenExpires = 0;
  let pending = false;

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

  function requestIdToken() {
    return new Promise((resolve, reject) => {
      if (!window.google?.accounts?.oauth2) {
        reject(new Error('Google sign-in is still loading. Try again shortly.'));
        return;
      }

      google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: 'openid',
        callback: response => {
          if (response.error) {
            reject(new Error('Google sign-in was cancelled.'));
            return;
          }
          if (!response.id_token) {
            reject(new Error('Google did not return a sign-in token.'));
            return;
          }
          idToken = response.id_token;
          idTokenExpires = Date.now() + 55 * 60 * 1000;
          resolve(idToken);
        },
        error_callback: () => reject(new Error('Google sign-in was cancelled or blocked.'))
      }).requestAccessToken({ prompt: '' });
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
    }
  }

  function sentenceForExercise() {
    if (!session || !session.exercises || !session.exercises[index]) return '';
    const exercise = session.exercises[index];

    if (exercise.type === 'choice' || exercise.type === 'audio') {
      const item = exercise.item || (session.items && session.items[index]);
      return item?.t || '';
    }

    if (exercise.type === 'translate') return exercise.item?.t || '';
    if (exercise.type === 'match') return exercise.pairs?.[0]?.t || '';
    if (exercise.type === 'build') return exercise.answer || '';
    if (exercise.type === 'learn') return exercise.items?.[0]?.t || '';

    return '';
  }

  const originalFeedback = feedback;
  feedback = function(ok, message) {
    originalFeedback(ok, message);

    const sentence = sentenceForExercise();
    if (!sentence) return;

    const cached = cachedTranslation(sentence);
    if (cached) {
      setStatus(cached);
      return;
    }

    setStatus('Sign in with Google to see English.');
    translate(sentence);
  };

  const originalRender = renderExercise;
  renderExercise = function() {
    originalRender();
    const card = app.querySelector('section.card');
    if (!card || document.getElementById('translation-result')) return;

    const result = document.createElement('div');
    result.id = 'translation-result';
    result.className = 'translation-result';
    result.setAttribute('role', 'status');
    result.style.cssText = 'margin-top:10px;font-size:14px;opacity:.8;min-height:18px';

    const feedback = document.getElementById('feedback');
    if (feedback) feedback.after(result); else card.append(result);
  };
})();
