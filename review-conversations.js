/* v0.18.0: public placeholder only. No provider requests or credentials. */
(() => {
  function labelReview() {
    const tab = document.getElementById('tab-practice');
    if (tab && tab.textContent !== '🔁 Review') tab.textContent = '🔁 Review';
  }
  const previousTabs = renderTabs;
  renderTabs = function() { previousTabs(); labelReview(); };
  const previousPractice = renderPractice;
  renderPractice = function() {
    previousPractice();
    const heading = app.querySelector('h2');
    if (heading) heading.textContent = '🔁 Review';
    if (document.getElementById('bee-conversations')) return;
    const card = document.createElement('section');
    card.id = 'bee-conversations';
    card.className = 'card';
    const title = document.createElement('h2');
    title.textContent = '🐝 Conversations';
    const description = document.createElement('p');
    description.textContent = 'Practise written Tagalog with the bee. Midpoint and end-of-topic conversations are planned for each topic, separate from lessons.';
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = 'Not available yet — the chat service is being prepared and tested.';
    const button = document.createElement('button');
    button.className = 'primary';
    button.disabled = true;
    button.textContent = 'Chat coming soon';
    card.append(title, description, status, button);
    app.append(card);
    labelReview();
  };
  labelReview();
  if (view === 'practice') renderPractice();
})();
