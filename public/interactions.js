(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const root = document.documentElement;
  const header = document.querySelector('.site-header');
  const hero = document.querySelector('.brand-banner-image-wrap');
  const revealTargets = [
    ...document.querySelectorAll('.mascot-guide, .home-section, .launch-note, .section-heading, .audience-card, .featured-card, .post-card')
  ];

  root.classList.add('effects-ready');

  revealTargets.forEach((element, index) => {
    element.classList.add('reveal-target');
    element.style.setProperty('--reveal-delay', `${Math.min((index % 5) * 55, 220)}ms`);
  });

  if (reducedMotion || !('IntersectionObserver' in window)) {
    revealTargets.forEach((element) => element.classList.add('is-revealed'));
  } else {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    revealTargets.forEach((element) => observer.observe(element));
  }

  if (header) {
    const updateHeader = () => header.classList.toggle('is-scrolled', window.scrollY > 12);
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
  }

  if (hero && finePointer && !reducedMotion) {
    hero.addEventListener('pointermove', (event) => {
      const bounds = hero.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width) * 100;
      const y = ((event.clientY - bounds.top) / bounds.height) * 100;
      hero.style.setProperty('--pointer-x', `${x.toFixed(1)}%`);
      hero.style.setProperty('--pointer-y', `${y.toFixed(1)}%`);
    }, { passive: true });
    hero.addEventListener('pointerleave', () => {
      hero.style.setProperty('--pointer-x', '50%');
      hero.style.setProperty('--pointer-y', '50%');
    });
  }
})();
