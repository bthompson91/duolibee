// DUOLIBEE mascot restoration
(function () {
  const style = document.createElement('style');
  style.textContent = `
    .hero-mascot{display:flex;align-items:center;gap:14px}
    .hero-bee,.completion-bee,.feedback-bee{width:86px;height:86px;object-fit:contain;flex:0 0 auto}
    .completion-bee{width:110px;height:110px;margin:0 auto 10px;display:block}
    .feedback-bee{width:52px;height:52px;vertical-align:middle;margin-right:8px}
    @media(max-width:560px){.hero-bee{width:70px;height:70px}.completion-bee{width:92px;height:92px}}
  `;
  document.head.appendChild(style);

  function addMascot(selector, src, className, prepend) {
    const target = document.querySelector(selector);
    if (!target || target.querySelector('img')) return;
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'DUOLIBEE mascot';
    img.className = className;
    if (prepend) target.prepend(img); else target.append(img);
  }

  function refreshMascots() {
    addMascot('.hero-mascot', 'assets/mascot-welcome.png', 'hero-bee', true);
    addMascot('.card.center', 'assets/mascot-celebration.png', 'completion-bee', true);
    const feedback = document.getElementById('feedback');
    if (feedback && feedback.classList.contains('good') && !feedback.querySelector('img')) {
      const img = document.createElement('img');
      img.src = 'assets/mascot-correct.png';
      img.alt = 'Correct answer mascot';
      img.className = 'feedback-bee';
      feedback.prepend(img);
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
