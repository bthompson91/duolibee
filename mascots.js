(() => {
  function mascotImage(file, alt, className) {
    const image = document.createElement('img');
    image.src = 'assets/' + file;
    image.alt = alt;
    image.className = className || 'mascot';
    image.style.cssText = 'display:block;width:120px;max-width:35%;height:auto;object-fit:contain;margin:10px auto 0';
    return image;
  }
  function mascotPopup(file, message) {
    let layer = document.getElementById('mascot-popup-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'mascot-popup-layer';
      layer.style.cssText = 'position:fixed;left:0;right:0;top:72px;display:flex;flex-direction:column;align-items:center;gap:8px;z-index:9999;pointer-events:none';
      document.body.appendChild(layer);
    }
    const popup = document.createElement('div');
    popup.className = 'mascot-popup';
    popup.style.cssText = 'display:flex;align-items:center;gap:8px;background:#fff;border:2px solid #58cc02;border-radius:16px;padding:8px 12px;box-shadow:0 6px 18px rgba(0,0,0,.15);animation:mascot-pop 2.2s ease forwards';
    const image = mascotImage(file, 'DUOLIBEE mascot', 'mascot-popup-image');
    image.style.cssText = 'width:64px;height:64px;object-fit:contain;margin:0';
    const bubble = document.createElement('div');
    bubble.textContent = message;
    bubble.style.cssText = 'font-weight:700;font-size:14px;color:#3c3c3c;max-width:240px';
    popup.appendChild(image);
    popup.appendChild(bubble);
    layer.appendChild(popup);
    setTimeout(() => popup.remove(), 2300);
  }
  const style = document.createElement('style');
  style.textContent = '@keyframes mascot-pop{0%{opacity:0;transform:scale(.6) rotate(-6deg)}12%{opacity:1;transform:scale(1.08) rotate(4deg)}22%{transform:scale(1) rotate(-3deg)}32%{transform:scale(1.03) rotate(2deg)}42%{transform:scale(1) rotate(-1deg)}75%{opacity:1;transform:scale(1) rotate(0)}100%{opacity:0;transform:scale(.94) translateY(-10px)}}';
  document.head.appendChild(style);
  const originalRenderHome = renderHome;
  renderHome = function() {
    originalRenderHome();
    const hero = app.querySelector('.hero');
    if (hero && !hero.querySelector('img[src*="mascot-welcome"]')) {
      hero.appendChild(mascotImage('mascot-welcome.png', 'DUOLIBEE welcome mascot'));
    }
  };
  const originalRenderPractice = renderPractice;
  renderPractice = function() {
    originalRenderPractice();
    const card = app.querySelector('section.card');
    if (card && !card.querySelector('img[src*="mascot-"]')) {
      const file = state.streak === 0 ? 'mascot-sad.png' : 'mascot-keep-going.png';
      const alt = state.streak === 0 ? 'DUOLIBEE sad mascot' : 'DUOLIBEE keep-going mascot';
      card.appendChild(mascotImage(file, alt));
    }
  };
  const originalFeedback = feedback;
  feedback = function(ok, msg) {
    originalFeedback(ok, msg);
    mascotPopup(ok ? 'mascot-correct.png' : 'mascot-sad.png', ok ? 'Tama!' : (msg || 'Try again!'));
  };
  const originalNext = next;
  next = function() {
    const wasComplete = index + 1 >= session.exercises.length;
    const correctBefore = correct;
    originalNext();
    if (wasComplete && correctBefore > 0) {
      const completeCard = app.querySelector('section.card.center');
      if (completeCard && !completeCard.querySelector('img[src*="mascot-celebration"]')) {
        completeCard.appendChild(mascotImage('mascot-celebration.png', 'DUOLIBEE celebration mascot'));
      }
    }
  };
  function hookQueueFunction() {
    ['sendLessonToBack', 'moveLessonToBack', 'sendToBack', 'retryLesson'].forEach(name => {
      const original = window[name];
      if (typeof original === 'function' && !original.__mascotHooked) {
        const wrapped = function() {
          const result = original.apply(this, arguments);
          mascotPopup('mascot-sad.png', 'Added to the end of the queue.');
          return result;
        };
        wrapped.__mascotHooked = true;
        window[name] = wrapped;
      }
    });
  }
  hookQueueFunction();
  window.addEventListener('load', hookQueueFunction);
})();