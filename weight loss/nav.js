(function () {
    if (!document.getElementById('skip-main')) {
        const skip = document.createElement('a');
        skip.id = 'skip-main';
        skip.className = 'skip-link';
        skip.href = '#main-content';
        skip.textContent = 'Skip to main content';
        document.body.prepend(skip);
    }

    const NAV_ITEMS = [
        { page: 'daily', href: 'daily.html', icon: 'items/daily.png', label: 'Daily' },
        { page: 'maxes', href: 'maxes.html', icon: 'items/max.png', label: 'Maxes' },
        { page: 'history', href: 'history.html', icon: 'items/history.png', label: 'History' },
        { page: 'plan', href: 'plan.html', icon: 'items/plan.svg', label: 'Plan' },
        { page: 'science', href: 'guide.html', icon: 'items/science.png', label: 'Science' }
    ];

    function renderNavIcon(icon) {
        if (typeof icon === 'string' && (icon.endsWith('.png') || icon.endsWith('.svg'))) {
            return `<img class="nav-icon-img" src="${icon}" alt="" width="24" height="24" decoding="async">`;
        }
        return `<span class="nav-icon" aria-hidden="true">${icon}</span>`;
    }

    const sidebar = document.getElementById('app-sidebar');
    if (!sidebar) return;

    const currentPage = document.body.dataset.page || '';
    const homeActive = currentPage === 'home' ? ' active' : '';
    const homeCurrent = currentPage === 'home' ? ' aria-current="page"' : '';
    const links = NAV_ITEMS.map(item => {
        const active = item.page === currentPage ? ' active' : '';
        const current = item.page === currentPage ? ' aria-current="page"' : '';
        return `<a href="${item.href}" class="nav-item${active}" title="${item.label}"${current}>${renderNavIcon(item.icon)}<span class="nav-label">${item.label}</span></a>`;
    }).join('');

    sidebar.innerHTML = `
        <a href="index.html" class="sidebar-logo${homeActive}" title="Home" aria-label="The Cut — Home"${homeCurrent}>
            <img class="sidebar-logo-img" src="items/home.png" alt="" width="28" height="28" decoding="async">
        </a>
        <nav class="sidebar-nav" aria-label="Main navigation">${links}</nav>
    `;
})();
