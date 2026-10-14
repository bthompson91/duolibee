// DUOLIBEE mascot restoration — matches the earlier .mascot-frame design
(function () {
  function mascot(src, className) {
    const frame = document.createElement('div');
    frame.className = 'mascot-frame';
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'DUOLIBEE mascot';
    img.className = className;
    frame.appendChild(img);
    return frame;
  }

  function addMascot(selector, src, className, prepend) {
    const target = document.querySelector(selector);
    if (!target || target.querySelector('.mascot-frame')) return;
    const node = mascot(src, className);
    if (prepend) target.prepend(node); else target.append(node);
  }

  function refreshMascots() {
    addMascot('.hero-mascot', 'assets/mascot-welcome.png', 'hero-bee', true);
    addMascot('.card.center', 'assets/mascot-celebration.png', 'completion-bee', true);

    const feedback = document.getElementById('feedback');
    if (feedback && feedback.classList.contains('good') && !feedback.querySelector('.mascot-frame')) {
      feedback.prepend(mascot('assets/mascot-correct.png', 'feedback-bee'));
    }
  }

  const originalRenderHome = renderHome;
  renderHome = function () {
    originalRenderHome();
    refreshMascots();
  };

  const observer = new MutationObserver(refreshMascots);
  observer.observe(document.getElementById('app'), { childList: true, subtree: true });
})();
