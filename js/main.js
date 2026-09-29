(function () {
  var toastEl = document.getElementById('toast');
  var toastTimer;
  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-visible'); }, 2200);
  }

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

  // 더보기 (접힌 높이보다 내용이 짧으면 버튼 숨김)
  document.querySelectorAll('[data-more]').forEach(function (more) {
    var wrapper = more.querySelector('.more__wrapper');
    var button = more.querySelector('.more__btn');
    var label = more.querySelector('.more__label');
    var closedText = label.textContent;

    if (wrapper.scrollHeight <= wrapper.clientHeight) {
      more.classList.add('is-static');
      return;
    }

    button.addEventListener('click', function () {
      var open = more.classList.toggle('is-open');
      button.setAttribute('aria-expanded', String(open));
      label.textContent = open ? '접기' : closedText;
      if (!open) more.scrollIntoView({ block: 'start' });
    });
  });

  // 앵커 탭 스크롤스파이 (현재 보고 있는 섹션의 탭을 활성화)
  var tabs = document.querySelectorAll('.pm-tab__link');
  if (tabs.length && 'IntersectionObserver' in window) {
    var tabsBySectionId = {};
    tabs.forEach(function (tab) {
      tabsBySectionId[tab.getAttribute('href').slice(1)] = tab;
    });

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var active = tabsBySectionId[entry.target.id];
        tabs.forEach(function (tab) { tab.classList.toggle('is-active', tab === active); });
        // 모바일에서 가로 스크롤되는 탭바 안에서 활성 탭이 보이도록
        var bar = active.closest('ul');
        bar.scrollTo({ left: active.parentNode.offsetLeft - (bar.clientWidth - active.offsetWidth) / 2, behavior: 'smooth' });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });

    Object.keys(tabsBySectionId).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) spy.observe(section);
    });
  }

  // 웰컴 쿠폰 다운로드 (데모: 실제 발급 API 연동 전까지 토스트만 노출)
  var couponBtn = document.getElementById('couponBtn');
  if (couponBtn) {
    couponBtn.addEventListener('click', function () {
      toast('15% 웰컴 쿠폰이 발급되었어요 🎟️');
    });
  }

  // 공유하기 (Web Share API 미지원 시 링크 복사)
  var shareBtn = document.getElementById('shareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', function () {
      var data = { title: document.title, text: '모든 혜택 한 번에 끝!', url: location.href };
      if (navigator.share) {
        navigator.share(data).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(location.href).then(function () { toast('링크가 복사되었어요'); });
      }
    });
  }

  // 히어로 영상: 동작 줄이기 설정 시 정지, 화면 밖으로 나가면 일시정지
  var heroVideo = document.getElementById('heroVideo');
  if (heroVideo) {
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      heroVideo.removeAttribute('autoplay');
      heroVideo.pause();
    } else if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) heroVideo.play().catch(function () {});
        else heroVideo.pause();
      }).observe(heroVideo);
    }
  }

  // 히어로를 벗어나면 TOP 버튼 노출
  var hero = document.getElementById('hero');
  var topBtn = document.getElementById('topBtn');
  if (hero && topBtn) {
    topBtn.addEventListener('click', function () { window.scrollTo({ top: 0 }); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        topBtn.classList.toggle('is-visible', !entries[0].isIntersecting);
      }).observe(hero);
    }
  }

  // 통계 숫자 카운트업 애니메이션 (proof 박스 노출 시 1회)
  var statNums = document.querySelectorAll('[data-count]');
  var proof = document.getElementById('proof');
  if (statNums.length && proof && 'IntersectionObserver' in window) {
    var statsObserver = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      statsObserver.disconnect();
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
    }, { threshold: 0.5 });
    statsObserver.observe(proof);
  }
})();
