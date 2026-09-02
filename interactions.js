(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
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

  const setupAnimatedHeroBanner = async () => {
    if (!hero || !heroImage || reducedMotion) return;

    const chunkUrls = Array.from(
      { length: 6 },
      (_, index) => `./assets/brand/hero-video/part-${String(index + 1).padStart(2, '0')}.txt?v=1`
    );

    try {
      const chunks = await Promise.all(chunkUrls.map(async (url) => {
        const response = await fetch(url, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`Hero animation asset failed: ${response.status}`);
        return response.text();
      }));

      const encoded = chunks.join('').replace(/\s+/g, '');
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
      const style = document.createElement('style');
      style.id = 'animated-hero-banner-style';
      style.textContent = `
        .brand-banner-motion-layer{position:absolute;inset:0 0 0 52.083333%;z-index:2;overflow:hidden;pointer-events:none;opacity:0;transform-origin:center;transition:opacity .34s ease,transform .5s cubic-bezier(.2,.7,.2,1);-webkit-mask-image:linear-gradient(to right,transparent 0,rgba(0,0,0,.18) 3%,rgba(0,0,0,.76) 8%,#000 12%,#000 100%);mask-image:linear-gradient(to right,transparent 0,rgba(0,0,0,.18) 3%,rgba(0,0,0,.76) 8%,#000 12%,#000 100%)}
        .brand-banner-motion-layer.is-ready{opacity:1}
        .brand-banner-motion-video{display:block;width:100%;height:100%;object-fit:fill;background:transparent}
        .brand-banner-image-wrap:hover .brand-banner-motion-layer{transform:scale(1.004)}
        @media(max-width:800px){.brand-banner-image-wrap:hover .brand-banner-motion-layer{transform:none}}
        @media(prefers-reduced-motion:reduce){.brand-banner-motion-layer{display:none!important}}
      `;
      document.head.appendChild(style);

      const layer = document.createElement('div');
      layer.className = 'brand-banner-motion-layer';
      layer.setAttribute('aria-hidden', 'true');

      const video = document.createElement('video');
      video.className = 'brand-banner-motion-video';
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.disablePictureInPicture = true;
      video.setAttribute('aria-hidden', 'true');
      video.setAttribute('tabindex', '-1');
      video.src = blobUrl;
      layer.appendChild(video);
      hero.appendChild(layer);

      const revealVideo = () => layer.classList.add('is-ready');
      video.addEventListener('playing', revealVideo, { once: true });
      video.addEventListener('canplay', () => {
        video.play().catch(() => undefined);
      }, { once: true });

      await video.play().then(revealVideo).catch(() => undefined);

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          video.pause();
        } else {
          video.play().catch(() => undefined);
        }
      });

      window.addEventListener('pagehide', () => URL.revokeObjectURL(blobUrl), { once: true });
    } catch (error) {
      console.warn('Animated hero banner fallback active.', error);
    }
  };

  setupAnimatedHeroBanner();

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
    () => playSequence([['ears', 300], ['blink', 130], ['ears', 260]]),
    () => playSequence([['blink', 130]]),
    () => playSequence([['left', 620]]),
    () => playSequence([['right', 620]])
  ];

  const scheduleAction = () => {
    window.clearTimeout(mascotTimer);
    if (document.hidden || mascotHovering) return;
    const delay = 1400 + Math.random() * 2600;
    mascotTimer = window.setTimeout(async () => {
      if (document.hidden || mascotHovering) return;
      const action = actions[Math.floor(Math.random() * actions.length)];
      await action();
      scheduleAction();
    }, delay);
  };

  const playGreeting = () => playSequence([
    ['ears', 240],
    ['left', 330],
    ['right', 330],
    ['blink', 125],
    ['idle', 80]
  ]);

  if (mascotLink && finePointer) {
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
