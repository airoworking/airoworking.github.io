(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  const header = document.querySelector('.site-header');
  const hero = document.querySelector('.brand-banner-image-wrap');
  const heroImage = hero?.querySelector('.brand-banner-image');
  const mascot = document.querySelector('.mascot-float');
  const mascotLink = mascot?.querySelector('.mascot-float-link');
  const mascotImage = mascot?.querySelector('.mascot-float-avatar img');
  const revealTargets = [
    ...document.querySelectorAll('.home-section, .launch-note, .section-heading, .audience-card, .featured-card, .post-card')
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

  if (hero && heroImage) {
    const style = document.createElement('style');
    style.id = 'static-hero-banner-style';
    style.textContent = `
      .brand-banner-image-wrap::after{display:none!important}
      .brand-banner-image{transition:none!important;transform:none!important;filter:none!important}
      .brand-banner-image-wrap:hover .brand-banner-image{transform:none!important;filter:none!important}
      .brand-banner-motion-layer{display:none!important}
    `;
    document.head.appendChild(style);

    const picture = heroImage.closest('picture');
    picture?.querySelectorAll('source').forEach((source) => source.remove());
    heroImage.removeAttribute('srcset');
    heroImage.removeAttribute('sizes');
    heroImage.src = './assets/brand/hero-static-hq.webp?v=5';
    heroImage.width = 2048;
    heroImage.height = 682;
    heroImage.decoding = 'async';
    heroImage.dataset.staticHero = 'ready';
  }

  if (!mascotImage) return;

  const currentMascotUrl = new URL(mascotImage.getAttribute('src') || './assets/brand/mascot-character.webp', document.baseURI);
  const mascotAssetDir = new URL('./', currentMascotUrl);
  const frameUrl = (name) => new URL(`mascot-frame-${name}.webp?v=3`, mascotAssetDir).href;
  const frames = {
    idle: frameUrl('idle'),
    blink: frameUrl('blink'),
    left: frameUrl('look-left'),
    right: frameUrl('look-right'),
    ears: frameUrl('ears')
  };

  for (const src of Object.values(frames)) {
    const preloader = new Image();
    preloader.decoding = 'async';
    preloader.src = src;
  }

  const setMascotFrame = (name) => {
    const src = frames[name] || frames.idle;
    if (mascotImage.dataset.mascotFrame === name && mascotImage.src === src) return;
    mascotImage.dataset.mascotFrame = name;
    mascotImage.src = src;
  };

  setMascotFrame('idle');
  if (reducedMotion) return;

  let mascotTimer = 0;
  let actionToken = 0;
  let mascotHovering = false;
  const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

  const playSequence = async (steps) => {
    const token = ++actionToken;
    for (const [frame, duration] of steps) {
      if (token !== actionToken || document.hidden) return;
      setMascotFrame(frame);
      await wait(duration);
    }
    if (token === actionToken && !document.hidden) setMascotFrame('idle');
  };

  const actions = [
    () => playSequence([['blink', 135]]),
    () => playSequence([['blink', 110], ['idle', 115], ['blink', 125]]),
    () => playSequence([['left', 720]]),
    () => playSequence([['right', 720]]),
    () => playSequence([['ears', 560]]),
    () => playSequence([['left', 420], ['idle', 90], ['right', 480]]),
    () => playSequence([['ears', 300], ['blink', 130], ['ears', 260]])
  ];

  const scheduleAction = () => {
    window.clearTimeout(mascotTimer);
    if (document.hidden || mascotHovering) return;
    mascotTimer = window.setTimeout(async () => {
      if (document.hidden || mascotHovering) return;
      await actions[Math.floor(Math.random() * actions.length)]();
      scheduleAction();
    }, 1400 + Math.random() * 2600);
  };

  const playGreeting = () => playSequence([
    ['ears', 240], ['left', 330], ['right', 330], ['blink', 125], ['idle', 80]
  ]);

  if (mascotLink && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const startGreeting = () => {
      mascotHovering = true;
      window.clearTimeout(mascotTimer);
      actionToken += 1;
      playGreeting();
    };
    const stopGreeting = () => {
      mascotHovering = false;
      actionToken += 1;
      setMascotFrame('idle');
      scheduleAction();
    };
    mascotLink.addEventListener('pointerenter', startGreeting);
    mascotLink.addEventListener('pointerleave', stopGreeting);
    mascotLink.addEventListener('focus', startGreeting);
    mascotLink.addEventListener('blur', stopGreeting);
  }

  document.addEventListener('visibilitychange', () => {
    actionToken += 1;
    window.clearTimeout(mascotTimer);
    setMascotFrame('idle');
    if (!document.hidden && !mascotHovering) scheduleAction();
  });

  scheduleAction();
})();