(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const root = document.documentElement;
  const header = document.querySelector('.site-header');
  const hero = document.querySelector('.brand-banner-image-wrap');
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

  if (mascotImage && !reducedMotion && typeof mascotImage.animate === 'function') {
    const base = 'scale(1.92)';
    let mascotTimer = 0;
    let activeAnimation = null;
    let mascotHovering = false;

    const playAction = (frames, duration, easing = 'ease-in-out') => {
      activeAnimation?.cancel();
      activeAnimation = mascotImage.animate(frames, {
        duration,
        easing,
        iterations: 1,
        fill: 'none'
      });
      return activeAnimation.finished.catch(() => undefined);
    };

    const actions = [
      // Single blink: a very short vertical facial squash, then immediately open again.
      () => playAction([
        { transform: base, offset: 0 },
        { transform: `${base} scaleY(.93)`, offset: .44 },
        { transform: `${base} scaleY(.93)`, offset: .56 },
        { transform: base, offset: 1 }
      ], 240, 'cubic-bezier(.4,0,.2,1)'),

      // Double blink: two quick blinks with a tiny pause between them.
      () => playAction([
        { transform: base, offset: 0 },
        { transform: `${base} scaleY(.92)`, offset: .16 },
        { transform: base, offset: .31 },
        { transform: `${base} scaleY(.94)`, offset: .55 },
        { transform: base, offset: .72 },
        { transform: base, offset: 1 }
      ], 520, 'cubic-bezier(.4,0,.2,1)'),

      // Look toward the page, hold for a moment, then return to center.
      () => playAction([
        { transform: base, offset: 0 },
        { transform: `${base} translate3d(-3px,0,0) rotate(-1.8deg)`, offset: .28 },
        { transform: `${base} translate3d(-3px,0,0) rotate(-1.8deg)`, offset: .7 },
        { transform: base, offset: 1 }
      ], 1100, 'cubic-bezier(.2,.75,.2,1)'),

      // Look outside the screen edge, as if checking what is behind it.
      () => playAction([
        { transform: base, offset: 0 },
        { transform: `${base} translate3d(3px,0,0) rotate(1.7deg)`, offset: .3 },
        { transform: `${base} translate3d(3px,0,0) rotate(1.7deg)`, offset: .68 },
        { transform: base, offset: 1 }
      ], 1050, 'cubic-bezier(.2,.75,.2,1)'),

      // Ears-perk/listening reaction: lift and stretch the head upward, then settle.
      () => playAction([
        { transform: base, offset: 0 },
        { transform: `${base} translate3d(0,-3px,0) scaleY(1.035) rotate(-.8deg)`, offset: .24 },
        { transform: `${base} translate3d(0,-3px,0) scaleY(1.035) rotate(.9deg)`, offset: .52 },
        { transform: `${base} translate3d(0,-1px,0) scaleY(1.012)`, offset: .76 },
        { transform: base, offset: 1 }
      ], 900, 'cubic-bezier(.2,.8,.2,1)'),

      // Curious head tilt, like the cat is trying to understand what it sees.
      () => playAction([
        { transform: base, offset: 0 },
        { transform: `${base} translate3d(-1px,-1px,0) rotate(-3deg)`, offset: .32 },
        { transform: `${base} translate3d(-1px,-1px,0) rotate(-3deg)`, offset: .68 },
        { transform: base, offset: 1 }
      ], 1150, 'cubic-bezier(.2,.75,.2,1)'),

      // Small sniff/nod motion to keep idle behavior from feeling repetitive.
      () => playAction([
        { transform: base, offset: 0 },
        { transform: `${base} translate3d(0,2px,0) rotate(.6deg)`, offset: .25 },
        { transform: `${base} translate3d(0,-1.5px,0) rotate(-.5deg)`, offset: .52 },
        { transform: `${base} translate3d(0,1px,0)`, offset: .74 },
        { transform: base, offset: 1 }
      ], 820, 'cubic-bezier(.25,.7,.25,1)')
    ];

    const scheduleAction = () => {
      window.clearTimeout(mascotTimer);
      if (document.hidden || mascotHovering) return;
      const delay = 2400 + Math.random() * 3600;
      mascotTimer = window.setTimeout(async () => {
        if (document.hidden || mascotHovering) {
          scheduleAction();
          return;
        }
        const action = actions[Math.floor(Math.random() * actions.length)];
        await action();
        scheduleAction();
      }, delay);
    };

    if (mascotLink && finePointer) {
      mascotLink.addEventListener('pointerenter', () => {
        mascotHovering = true;
        window.clearTimeout(mascotTimer);
        playAction([
          { transform: base, offset: 0 },
          { transform: `${base} translate3d(-4px,-2px,0) rotate(-2.8deg) scale(1.025)`, offset: .24 },
          { transform: `${base} translate3d(-1px,1px,0) rotate(1.4deg) scale(.995)`, offset: .48 },
          { transform: `${base} translate3d(-3px,-1px,0) rotate(-1deg) scale(1.015)`, offset: .7 },
          { transform: base, offset: 1 }
        ], 760, 'cubic-bezier(.2,.8,.2,1)');
      });

      mascotLink.addEventListener('pointerleave', () => {
        mascotHovering = false;
        activeAnimation?.cancel();
        scheduleAction();
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        window.clearTimeout(mascotTimer);
        activeAnimation?.cancel();
      } else if (!mascotHovering) {
        scheduleAction();
      }
    });

    scheduleAction();
  }
})();
