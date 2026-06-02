// AI Forge — UFO cursor follower
(function () {
  // Only run on devices with a real pointer (skip touch-only)
  if (window.matchMedia('(hover: none)').matches) return;

  /* ── Create elements ── */
  const ufo = document.createElement('div');
  ufo.id = 'ufo';
  ufo.textContent = '🛸';
  document.body.appendChild(ufo);

  const beam = document.createElement('div');
  beam.id = 'ufo-beam';
  document.body.appendChild(beam);

  /* ── State ── */
  let curX = -300, curY = -300;   // raw cursor
  let ufoX = -300, ufoY = -300;   // smoothed UFO position
  let landing  = false;
  let landTX   = 0, landTY = 0;   // landing target
  let visible  = false;

  /* ── Track cursor ── */
  document.addEventListener('mousemove', e => {
    if (!visible) {
      visible = true;
      ufo.style.opacity  = '1';
    }
    curX = e.clientX;
    curY = e.clientY;
  });

  /* ── Animation loop ── */
  function tick() {
    const ease = landing ? 0.07 : 0.10;
    const tx   = landing ? landTX : curX;
    const ty   = landing ? landTY : curY;

    ufoX += (tx - ufoX) * ease;
    ufoY += (ty - ufoY) * ease;

    ufo.style.left = ufoX + 'px';
    ufo.style.top  = ufoY + 'px';

    // Beam trails just below the UFO centre
    if (landing) {
      beam.style.left = ufoX + 'px';
      beam.style.top  = (ufoY + 15) + 'px';
    }

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ── Skill card hover ── */
  function attach() {
    document.querySelectorAll('.skill-card').forEach(card => {
      card.addEventListener('mouseenter', () => {
        const r = card.getBoundingClientRect();
        // Hover ~45px above the card's top edge, horizontally centred
        landTX = r.left + r.width  / 2;
        landTY = r.top  - 48 + window.scrollY * 0;  // fixed coords

        landing = true;
        ufo.classList.add('ufo-landing');
        beam.classList.add('beam-on');

        // Beam height = gap between UFO bottom and card top (approx)
        beam.style.height = '52px';
      });

      card.addEventListener('mouseleave', () => {
        landing = false;
        ufo.classList.remove('ufo-landing');
        beam.classList.remove('beam-on');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();
