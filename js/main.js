/**
 * Resumx - Navigation & Interactivity
 * Vanilla JS only - no external libraries
 */

(function () {
    'use strict';

    // Data-driven section-to-icon mapping
    const sectionMap = [
        { sectionId: 'intro', navSelector: 'a[href="#intro"]' },
        { sectionId: 'projects', navSelector: 'a[href="#projects"]' },
        { sectionId: 'experience', navSelector: 'a[href="#experience"]' },
        { sectionId: 'education', navSelector: 'a[href="#education"]' },
        { sectionId: 'certifications', navSelector: 'a[href="#certifications"]' },
        { sectionId: 'testimonials', navSelector: 'a[href="#testimonials"]' },
        { sectionId: 'contact', navSelector: 'a[href="#contact"]' }
    ];

    // Inject active state styles dynamically
    const activeStyles = document.createElement('style');
    activeStyles.textContent = `
        .nav-icon.active {
            color: #ffffff !important;
            background: rgba(255, 255, 255, 0.15);
            transform: scale(1.1);
        }
    `;
    document.head.appendChild(activeStyles);

    // Debounce utility using requestAnimationFrame
    function debounceRAF(fn) {
        let rafId = null;
        return function () {
            if (rafId !== null) return;
            rafId = requestAnimationFrame(function () {
                fn();
                rafId = null;
            });
        };
    }

    // Activate a nav icon by section ID
    function setActiveNav(sectionId) {
        sectionMap.forEach(function (entry) {
            var el = document.querySelector(entry.navSelector);
            if (!el) return;
            if (entry.sectionId === sectionId) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
    }

    // --- Smooth scroll on nav click ---
    sectionMap.forEach(function (entry) {
        var navEl = document.querySelector(entry.navSelector);
        if (!navEl) return;

        navEl.addEventListener('click', function (e) {
            e.preventDefault();
            var target = document.getElementById(entry.sectionId);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // --- Intersection Observer for section detection ---
    var observerOptions = {
        root: null,
        rootMargin: '0px 0px -60% 0px',
        threshold: 0.4
    };

    var currentActive = null;

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                var id = entry.target.getAttribute('id');
                if (id && id !== currentActive) {
                    currentActive = id;
                    setActiveNav(id);
                }
            }
        });
    }, observerOptions);

    // Observe all mapped sections
    sectionMap.forEach(function (entry) {
        var section = document.getElementById(entry.sectionId);
        if (section) {
            observer.observe(section);
        }
    });

    // --- Debounced scroll handler for fallback / edge cases ---
    var debouncedScroll = debounceRAF(function () {
        // Fallback: if observer misses (e.g., quick scroll), detect via position
        var scrollPos = window.scrollY + window.innerHeight * 0.4;
        var activeId = null;

        for (var i = 0; i < sectionMap.length; i++) {
            var section = document.getElementById(sectionMap[i].sectionId);
            if (!section) continue;
            var rect = section.getBoundingClientRect();
            var sectionTop = rect.top + window.scrollY;
            var sectionBottom = sectionTop + rect.height;

            if (scrollPos >= sectionTop && scrollPos < sectionBottom) {
                activeId = sectionMap[i].sectionId;
                break;
            }
        }

        if (activeId && activeId !== currentActive) {
            currentActive = activeId;
            setActiveNav(activeId);
        }
    });

    window.addEventListener('scroll', debouncedScroll, { passive: true });

    // --- Set initial active state ---
    function setInitialActive() {
        var scrollPos = window.scrollY + window.innerHeight * 0.4;
        for (var i = 0; i < sectionMap.length; i++) {
            var section = document.getElementById(sectionMap[i].sectionId);
            if (!section) continue;
            var rect = section.getBoundingClientRect();
            var sectionTop = rect.top + window.scrollY;
            var sectionBottom = sectionTop + rect.height;

            if (scrollPos >= sectionTop && scrollPos < sectionBottom) {
                currentActive = sectionMap[i].sectionId;
                setActiveNav(currentActive);
                return;
            }
        }
        // Default to intro
        if (sectionMap.length > 0) {
            currentActive = sectionMap[0].sectionId;
            setActiveNav(currentActive);
        }
    }

    setInitialActive();
})();
