(() => {
  const ENDPOINT = 'https://158-179-30-201.sslip.io/duolibee/translate';
  const CACHE_PREFIX = 'duolibee-translation-';
  let pending = false;
  let lastTranslatedKey = '';

  function area() {
    return document.getElementById('translation-result');
  }

  function setStatus(text) {
    const el = area();
    if (el) el.textContent = text;
  }

  function setHighlightedStatus(english, meaning) {
    const el = area();
    if (!el) return;

    const safeEnglish = String(english)
      .split('&').join('&')
      .split('<').join('<')
      .split('>').join('>');

    el.innerHTML = highlightMeaning(safeEnglish, meaning);
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

  function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightMeaning(english, meaning) {
    if (!english || !meaning) return english;

    const terms = String(meaning)
      .split('/')
      .map(term => term.trim())
      .filter(Boolean);

    for (const term of terms) {
      const pattern = new RegExp(
        '\\b(' + escapeRegExp(term) + ')(?:s|es|ies|ed|ing|d)?\\b',
        'i'
      );

      if (pattern.test(english)) {
        return english.replace(pattern, '<mark>$1</mark>');
      }
    }

    return english;
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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

      if (response.status === 429) {
        setStatus('Too many translations right now. Try again shortly.');
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

      const answered = currentAnsweredChallenge();
      if (answered && answered.sentence === sentence) {
        setHighlightedStatus(result, answered.meaning);
      } else {
        setStatus(result);
      }
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

  function currentAnsweredChallenge() {
    const challenge = state && state.dailyChallenge;
    if (!challenge || !Array.isArray(challenge.questions) || !Array.isArray(challenge.answers)) return null;

    let answeredIndex = -1;
    for (let i = 0; i < challenge.answers.length; i++) {
      if (challenge.answers[i] !== null) answeredIndex = i;
    }

    if (answeredIndex < 0) return null;
    const question = challenge.questions[answeredIndex];

    return {
      index: answeredIndex,
      sentence: question && question.sentence,
      word: question && question.word,
      meaning: question && question.meaning
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

    translate(answered.sentence);
  }

  new MutationObserver(() => {
    if (!view || view !== 'daily') return;
    handleDailyChallenge();
  }).observe(app, { childList: true, subtree: true });
})();
