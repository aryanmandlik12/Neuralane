// User dropdown
function toggleDropdown() {
  const dropdown = document.getElementById('userDropdown');
  const trigger  = document.querySelector('.user-trigger');
  if (!dropdown) return;
  const isOpen = dropdown.classList.toggle('open');
  trigger.classList.toggle('open', isOpen);
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  const menu = document.getElementById('userMenu');
  if (menu && !menu.contains(e.target)) {
    document.getElementById('userDropdown')?.classList.remove('open');
    document.querySelector('.user-trigger')?.classList.remove('open');
  }
});

// Toast utility
function showToast(msg, type = 'info') {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = `toast ${type}`;
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => t.classList.remove('show'), 2800);
}
