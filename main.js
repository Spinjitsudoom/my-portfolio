'use strict';

// Scroll fade-in
const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('visible');
    io.unobserve(e.target);
  });
}, { threshold: 0.07 });

document.querySelectorAll('.fade-in').forEach(el => io.observe(el));

// Staggered children
document.querySelectorAll('.stagger-children').forEach(parent => {
  [...parent.children].forEach((child, i) => {
    child.classList.add('fade-in');
    child.style.transitionDelay = `${i * 0.09}s`;
    io.observe(child);
  });
});

// Active nav link on scroll
const pageSections = [...document.querySelectorAll('section[id]')];
const pageNavLinks = [...document.querySelectorAll('nav ul a[href^="#"]')];

if (pageSections.length && pageNavLinks.length) {
  const navIO = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      pageNavLinks.forEach(a =>
        a.classList.toggle('nav-active', a.getAttribute('href') === '#' + e.target.id)
      );
    });
  }, { rootMargin: '-35% 0px -60% 0px' });
  pageSections.forEach(s => navIO.observe(s));
}
