// Apply browser theme before CSS, without inline scripts (compatible with CSP).
// Apply the saved appearance before CSS loads to avoid flashing the wrong theme.
    try {
      const savedTheme = localStorage.getItem('cloudvault-theme');
      document.documentElement.dataset.theme = savedTheme === 'dark' ? 'dark' : 'light';
    } catch (_) {
      document.documentElement.dataset.theme = 'light';
    }
