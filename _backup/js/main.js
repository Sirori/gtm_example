(function () {
  // FAQ 아코디언
  document.querySelectorAll('.accordion__trigger').forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      var expanded = trigger.getAttribute('aria-expanded') === 'true';
      var panel = trigger.nextElementSibling;

      trigger.setAttribute('aria-expanded', String(!expanded));
      panel.style.maxHeight = expanded ? '0px' : panel.scrollHeight + 'px';

      if (window.trackGTMEvent) {
        window.trackGTMEvent('faq_toggle', {
          faq_question: trigger.textContent.trim(),
          faq_state: expanded ? 'close' : 'open'
        });
      }
    });
  });

  // 성분 더보기 인라인 토글
  document.querySelectorAll('.feature__toggle').forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      var expanded = trigger.getAttribute('aria-expanded') === 'true';
      var panel = trigger.nextElementSibling;

      trigger.setAttribute('aria-expanded', String(!expanded));
      panel.style.maxHeight = expanded ? '0px' : panel.scrollHeight + 'px';
    });
  });

  // 히어로를 벗어나면 모바일 하단 고정 CTA 노출
  var hero = document.getElementById('hero');
  var stickyCta = document.getElementById('stickyCta');

  if (hero && stickyCta && 'IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        stickyCta.classList.toggle('is-visible', !entry.isIntersecting);
      });
    }, { threshold: 0 });

    observer.observe(hero);
  }

  // 퀵 네비게이션 스크롤스파이 (현재 보고 있는 섹션의 탭을 활성화)
  var quickNavTabs = document.querySelectorAll('.quick-nav__tab');
  if (quickNavTabs.length && 'IntersectionObserver' in window) {
    var tabsBySectionId = {};
    quickNavTabs.forEach(function (tab) {
      var id = tab.getAttribute('href').slice(1);
      tabsBySectionId[id] = tab;
    });

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        quickNavTabs.forEach(function (tab) { tab.classList.remove('is-active'); });
        tabsBySectionId[entry.target.id].classList.add('is-active');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    Object.keys(tabsBySectionId).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) spy.observe(section);
    });
  }

  // 상품 슬라이더 (Swiper)
  if (window.Swiper && document.querySelector('.product-swiper')) {
    new Swiper('.product-swiper', {
      slidesPerView: 1.3,
      spaceBetween: 16,
      navigation: {
        prevEl: '.slider__arrow--prev',
        nextEl: '.slider__arrow--next'
      },
      pagination: {
        el: '.product-swiper-pagination',
        clickable: true
      },
      breakpoints: {
        640: { slidesPerView: 2.2 },
        900: { slidesPerView: 3.2 },
        1200: { slidesPerView: 4 }
      }
    });
  }

  // 통계 숫자 카운트업 애니메이션 (proof 섹션 노출 시 1회)
  var statNums = document.querySelectorAll('.stat__num');
  if (statNums.length && 'IntersectionObserver' in window) {
    var animated = false;
    var statsObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && !animated) {
          animated = true;
          statNums.forEach(function (el) {
            var target = parseInt(el.getAttribute('data-count'), 10) || 0;
            var current = 0;
            var step = Math.max(1, Math.round(target / 40));
            var timer = setInterval(function () {
              current += step;
              if (current >= target) {
                current = target;
                clearInterval(timer);
              }
              el.textContent = current;
            }, 20);
          });
        }
      });
    }, { threshold: 0.5 });

    var proofSection = document.getElementById('proof');
    if (proofSection) statsObserver.observe(proofSection);
  }
})();
