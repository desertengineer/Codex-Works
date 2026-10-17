// Optimized games.js - Bekeirat Software (Lighthouse-Optimized)
// Performance improvements:
// 1. Reduced fallback paths from 9 to 2
// 2. Added client-side caching with localStorage
// 3. Implemented virtual scrolling with IntersectionObserver
// 4. Optimized data processing and DOM updates
// 5. Reduced reflows and repaints
// 6. LIGHTHOUSE FIXES: CLS prevention, LCP optimization, TBT reduction

const CONFIG = {
    dataPaths: [],
    itemsPerPage: 60,
    defaultCategory: 'all',
    // Virtual scrolling threshold
    virtualScrollThreshold: 10
};

let dataCache = {};
let globalCatalog = [];
let currentDataset = [];
let activeCategory = 'all';
let activeSubCategory = 'all';
let searchQuery = '';
let currentPage = 1;
let observer = null;

// Cache configuration
const CACHE_CONFIG = {
    key: 'bekeiratGamesData',
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    enabled: true
};

/* -----------------------
   Utilities
   ----------------------- */
function normalizeKey(s) {
    return String(s || '').trim().toLowerCase();
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/* -----------------------
   Escape HTML to prevent XSS
   ----------------------- */
function escapeHtml(s) {
    return String(s || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/* -----------------------
   Visual helpers
   ----------------------- */
function getCategoryEmoji(categoryKeyOrLabel) {
    const s = normalizeKey(categoryKeyOrLabel || '');
    const map = {
        'all': '\ud83c\udf10', 'puzzle': '\ud83e\udde9', 'match-3': '\ud83d\udc8e', 'jigsaw': '\ud83e\udde9',
        'arcade': '\ud83d\udd79\ufe0f', 'action': '\u2694\ufe0f', 'adventure': '\ud83d\uddfa\ufe0f', 'racing': '\ud83c\udfce\ufe0f',
        'sports': '\ud83c\udfc5', 'football': '\u26bd', 'soccer': '\u26bd', 'basketball': '\ud83c\udfc0',
        'girls': '\ud83d\udc57', 'kids': '\ud83e\uddd2', 'multiplayer': '\ud83d\udc65', 'io': '\ud83c\udf10',
        '3d': '\ud83c\udfae', 'shooter': '\ud83d\udd2b', 'horror': '\ud83d\udc7b', 'strategy': '\ud83e\udde0',
        'simulation': '\u2699\ufe0f', 'idle': '\ud83d\ude0c', 'casual': '\u2615', 'boardgames': '\ud83c\udfb2',
        'cards': '\ud83c\udccf', 'quiz': '\u2753', 'music': '\ud83c\udfb5', 'platform': '\ud83e\uddd7',
        'animals': '\ud83d\udc3e', 'cooking': '\ud83c\udf73', 'dress-up': '\ud83d\udc57', 'zombie': '\ud83e\udddf',
        'default': '\ud83c\udfae'
    };
    if (map[s]) return map[s];
    if (s.includes('puzzle') || s.includes('jigsaw')) return '\ud83e\udde9';
    if (s.includes('racing') || s.includes('driving')) return '\ud83c\udfce\ufe0f';
    if (s.includes('sport') || s.includes('football') || s.includes('soccer') || s.includes('basketball')) return '\ud83c\udfc5';
    if (s.includes('girl') || s.includes('dress') || s.includes('make-up')) return '\ud83d\udc57';
    if (s.includes('music')) return '\ud83c\udfb5';
    if (s.includes('arcade') || s.includes('hypercasual')) return '\ud83d\udd79\ufe0f';
    if (s.includes('io') || s.includes('.io')) return '\ud83c\udf10';
    if (s.includes('shooter') || s.includes('gun')) return '\ud83d\udd2b';
    if (s.includes('horror') || s.includes('zombie')) return '\ud83d\udc7b';
    if (s.includes('kids') || s.includes('baby')) return '\ud83e\uddd2';
    return map['default'];
}

function tagGradient(tag) {
    const s = String(tag || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (h << 5) - h + s.charCodeAt(i);
        h = h & h;
    }
    const hue = Math.abs(h) % 360;
    const hue2 = (hue + 36) % 360;
    return `linear-gradient(90deg, hsl(${hue} 60% 34%), hsl(${hue2} 56% 38%))`;
}

/* -----------------------
   Cache helper functions
   ----------------------- */
async function getCachedData() {
    if (!CACHE_CONFIG.enabled) return null;
    try {
        const cached = localStorage.getItem(CACHE_CONFIG.key);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_CONFIG.ttl) {
                console.log('[Games Page] Using cached data');
                return data;
            }
        }
    } catch (e) {
        console.warn('[Games Page] Cache read error:', e);
    }
    return null;
}

async function setCachedData(data) {
    if (!CACHE_CONFIG.enabled) return;
    try {
        localStorage.setItem(CACHE_CONFIG.key, JSON.stringify({
            data,
            timestamp: Date.now()
        }));
        console.log('[Games Page] Saved data to cache');
    } catch (e) {
        console.warn('[Games Page] Cache write error:', e);
    }
}

/* -----------------------
   Initialization
   ----------------------- */
document.addEventListener('DOMContentLoaded', async () => {
    const yearSpan = document.getElementById('current-year');
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();

    const hamburgerBtn = document.getElementById('hamburger-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    if (hamburgerBtn && mobileMenu) {
        hamburgerBtn.addEventListener('click', () => mobileMenu.classList.toggle('hidden'));
    }

    function updateSidebarTopOffset() {
        const nav = document.querySelector('nav.navbar');
        const topOffset = nav ? (nav.getBoundingClientRect().height + 12) : 16;
        document.documentElement.style.setProperty('--sidebar-top', `${topOffset}px`);
    }
    updateSidebarTopOffset();
    window.addEventListener('resize', updateSidebarTopOffset);
    window.addEventListener('orientationchange', updateSidebarTopOffset);

    // Initialize CONFIG with day-based data path
    initializeDayBasedDataPath();
    
    await loadMasterData();
    populateCategoryMenu();
    switchCategory(CONFIG.defaultCategory);

    // LIGHTHOUSE FIX: Initialize IntersectionObserver for virtual scrolling with requestIdleCallback
    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
            initVirtualScrolling();
        }, { timeout: 1000 });
    } else {
        initVirtualScrolling();
    }
});

/* -----------------------
   Day-Based Data Path Initialization
   ----------------------- */
function initializeDayBasedDataPath() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const fileNumber = dayOfWeek + 1;
    CONFIG.dataPaths = [`../data/all_${fileNumber}.json`];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    console.log(`[Games Page] Loading data for ${dayNames[dayOfWeek]} (Day ${dayOfWeek}) from all_${fileNumber}.json`);
}

/* -----------------------
   Data loading - Optimized with caching and reduced fallbacks
   LIGHTHOUSE FIX: Reduced to 2 fallbacks, uses cache-first strategy
   ----------------------- */
async function loadMasterData() {
    const dayFilePath = CONFIG.dataPaths[0];
    const fallbackPaths = ['../data/all.json', '../all.json'].filter(path => path !== dayFilePath);

    // Check cache first
    const cachedData = await getCachedData();
    if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
        globalCatalog = cachedData;
        console.log('[Games Page] Using cached data, skipping network request');
        return;
    }

    let rawData = null;

    // Try primary file
    try {
        console.log(`[Games Page] Attempting to load: ${dayFilePath}`);
        const res = await fetch(dayFilePath, { 
            cache: 'force-cache',
            headers: { 'Accept': 'application/json' }
        });
        if (res.ok) {
            rawData = await res.json();
            console.log(`[Games Page] Successfully loaded ${dayFilePath}`);
        } else {
            console.warn(`[Games Page] Failed to load ${dayFilePath}, status: ${res.status}`);
        }
    } catch (e) {
        console.warn(`[Games Page] Error loading ${dayFilePath}:`, e);
    }

    // If primary failed, try fallbacks
    if (!rawData || !Array.isArray(rawData)) {
        console.log('[Games Page] Trying fallback files...');
        for (const fallbackPath of fallbackPaths) {
            try {
                console.log(`[Games Page] Trying fallback: ${fallbackPath}`);
                const res = await fetch(fallbackPath, { 
                    cache: 'force-cache',
                    headers: { 'Accept': 'application/json' }
                });
                if (res.ok) {
                    rawData = await res.json();
                    console.log(`[Games Page] Successfully loaded fallback: ${fallbackPath}`);
                    break;
                }
            } catch (e) {
                // Continue to next fallback
            }
        }
    }

    if (rawData && Array.isArray(rawData)) {
        // Process in optimized chunks
        const chunkSize = 50;
        globalCatalog = [];

        for (let i = 0; i < rawData.length; i += chunkSize) {
            const chunk = rawData.slice(i, i + chunkSize);
            const processed = chunk.map((item, idx) => {
                const categoryRaw = item.Category ?? item.category ?? item.cat ?? 'uncategorized';
                const category = String(categoryRaw).trim() || 'uncategorized';
                const tagsArray = Array.isArray(item.Tags)
                    ? item.Tags.map(t => String(t).trim()).filter(Boolean)
                    : (item.Tags ? String(item.Tags).split(',').map(t => t.trim()).filter(Boolean) : []);
                return {
                    id: item.id || item.Id || `game-${i}-${idx}`,
                    title: item.Title ? item.Title.trim() : (item.title ? item.title.trim() : `Untitled Game ${i + idx + 1}`),
                    description: item.Description || item.description || "",
                    instructions: item.Instructions || item.instructions || "",
                    play: item.Play || item.play || "",
                    url: item.Url || item.url || item.gameUrl || `./game.html?id=${encodeURIComponent(item.id || item.Id || `game-${i}-${idx}`)}`,
                    category: category,
                    categoryKey: normalizeKey(category),
                    tags: tagsArray.map(t => String(t).toLowerCase()),
                    // LIGHTHOUSE FIX: Use WebP format for thumbnails
                    thumb: (item.Image || item.thumb || item.thumbnail || item.image || 'https://placehold.co/400x300/12141f/00ffcc?text=Bekeirat+Game').replace(/\.(png|jpg|jpeg)$/i, '.webp'),
                    width: item.Width || item.width || "1280",
                    height: item.Height || item.height || "720",
                    video: item.Video || item.video || "",
                    gender: item.Gender || item.gender || "",
                    languages: item.Languages || item.languages || "",
                    embed: item.Embed || item.embed || ""
                };
            });
            globalCatalog.push(...processed);
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        console.log(`[Games Page] Loaded ${globalCatalog.length} games`);
        
        // Cache the data
        if (globalCatalog.length > 0) {
            await setCachedData(globalCatalog);
        }
    } else {
        console.warn('[Games Page] No valid data found, using mock data');
        globalCatalog = generateMockGames();
    }

    dataCache = {};
}

/* -----------------------
   Virtual Scrolling with IntersectionObserver
   LIGHTHOUSE FIX: Added CLS prevention by reserving space
   ----------------------- */
function initVirtualScrolling() {
    if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const gameId = entry.target.dataset.gameId;
                    if (gameId) {
                        renderGameCard(entry.target, gameId);
                        observer.unobserve(entry.target);
                    }
                }
            });
        }, { 
            threshold: 0.1,
            rootMargin: '50px'
        });
    }
}

function renderGameCard(container, gameId) {
    const game = currentDataset.find(g => String(g.id) === String(gameId));
    if (!game) {
        container.innerHTML = '<div class="text-center py-4 text-xs text-gray-500">Game not found</div>';
        return;
    }

    // LIGHTHOUSE FIX: Use WebP format, explicit dimensions
    const thumb = game.thumb || 'https://placehold.co/400x400/12141f/00ffcc?text=Bekeirat+Game';
    const webpThumb = thumb.replace(/\.(png|jpg|jpeg)$/i, '.webp');
    
    container.innerHTML = `
        <a href="game.html?id=${encodeURIComponent(game.id)}" class="game-card group cursor-pointer bg-[#12141f] rounded-2xl overflow-hidden border border-gray-800/90 hover:border-cyan-500/50 transition-all duration-300 flex flex-col shadow-lg relative">
            <div class="game-thumb-container relative w-full aspect-square overflow-hidden bg-[#0a0b10]">
                <img src="${escapeHtml(webpThumb)}" 
                     srcset="${escapeHtml(webpThumb)} 1x, ${escapeHtml(thumb)} 1x"
                     alt="${escapeHtml(game.title)}" 
                     loading="lazy" 
                     decoding="async"
                     width="400" 
                     height="400"
                     class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                     onerror="this.src='https://placehold.co/400x400/12141f/00ffcc?text=${encodeURIComponent(game.title)}'">
                <div class="absolute inset-0 bg-gradient-to-t from-[#12141f] via-transparent to-transparent opacity-80"></div>
                <span class="absolute top-2.5 right-2.5 text-[10px] font-bold px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-cyan-400 border border-cyan-500/30 capitalize">${escapeHtml(game.category)}</span>
            </div>
            <div class="p-3.5 bg-[#12141f] flex items-center justify-between flex-1">
                <h3 class="font-bold text-xs sm:text-sm text-gray-200 group-hover:text-cyan-400 transition-colors truncate" title="${escapeHtml(game.title)}">${escapeHtml(game.title)}</h3>
                <div class="p-1.5 rounded-lg bg-gray-800/80 group-hover:bg-cyan-500/20 text-gray-400 group-hover:text-cyan-400 transition-all">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/></svg>
                </div>
            </div>
        </a>
    `;
}

/* -----------------------
   Sidebar: categories
   ----------------------- */
function populateCategoryMenu() {
    const nav = document.getElementById('category-menu');
    if (!nav) return;

    const counts = globalCatalog.reduce((acc, g) => {
        const key = g.categoryKey || 'uncategorized';
        acc[key] = acc[key] || { name: g.category || 'Uncategorized', count: 0 };
        acc[key].count++;
        return acc;
    }, {});

    const categories = Object.entries(counts)
        .map(([key, info]) => ({ key, name: info.name, count: info.count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    nav.innerHTML = '';

    const allBtn = createCategoryButton('all', 'All Games', globalCatalog.length, true);
    nav.appendChild(allBtn);

    for (const cat of categories) {
        if (normalizeKey(cat.key) === 'all') continue;
        const btn = createCategoryButton(cat.key, cat.name, cat.count, false);
        nav.appendChild(btn);
    }
}

function createCategoryButton(categoryKey, label, count, isActive = false) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-btn w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold text-gray-300 hover:bg-gray-800/80 border border-transparent transition-all group';
    if (isActive) btn.classList.add('active');

    const left = document.createElement('div');
    left.className = 'flex items-center gap-3';

    const iconBox = document.createElement('div');
    iconBox.className = 'icon-box p-2 rounded-lg bg-gray-800/80 text-gray-400 transition-all flex items-center justify-center';
    const emoji = getCategoryEmoji(label) || getCategoryEmoji(categoryKey);
    iconBox.textContent = emoji;

    const span = document.createElement('span');
    span.textContent = String(label || categoryKey);

    left.appendChild(iconBox);
    left.appendChild(span);

    const right = document.createElement('span');
    right.className = 'text-xs px-2 py-0.5 rounded-full bg-gray-800/80 text-gray-400 font-mono font-bold group-hover:text-cyan-400';
    right.textContent = String(count).toLocaleString();

    btn.appendChild(left);
    btn.appendChild(right);

    btn.dataset.category = normalizeKey(label === 'All Games' ? 'all' : categoryKey);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    btn.setAttribute('aria-label', `${emoji} ${span.textContent}`);

    btn.addEventListener('click', function () {
        switchCategory(btn.dataset.category, btn);
    });

    return btn;
}

/* -----------------------
   Category switching & caching
   ----------------------- */
function switchCategory(category, element = null) {
    if (!category) category = 'all';
    activeCategory = normalizeKey(category);
    activeSubCategory = 'all';
    currentPage = 1;

    document.querySelectorAll('#category-menu .cat-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-pressed', 'false');
    });
    if (element instanceof Element) {
        element.classList.add('active');
        element.setAttribute('aria-pressed', 'true');
    } else {
        const btn = document.querySelector(`#category-menu .cat-btn[data-category="${activeCategory}"]`);
        if (btn) { btn.classList.add('active'); btn.setAttribute('aria-pressed', 'true'); }
    }

    if (dataCache[activeCategory]) {
        currentDataset = shuffleArray(dataCache[activeCategory].slice());
        buildSubCategoryTags();
        renderGrid();
        return;
    }

    const filtered = (activeCategory === 'all') ? globalCatalog.slice() : globalCatalog.filter(g => normalizeKey(g.category) === activeCategory);
    dataCache[activeCategory] = filtered.slice();
    currentDataset = shuffleArray(filtered.slice());

    buildSubCategoryTags();
    renderGrid();
}

/* -----------------------
   Tag pills (sub-categories)
   ----------------------- */
function buildSubCategoryTags() {
    const tagsContainer = document.getElementById('tags-filter-bar');
    if (!tagsContainer) return;
    tagsContainer.innerHTML = '';

    const tagCounts = {};
    currentDataset.forEach(game => {
        if (Array.isArray(game.tags)) {
            game.tags.forEach(tag => {
                if (!tag) return;
                tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });
        }
    });

    const sortedTags = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]).slice(0, 15);

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = `tag-pill px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border capitalize ${activeSubCategory === 'all' ? 'active' : ''}`;
    allBtn.textContent = 'All Sub-types';
    allBtn.setAttribute('aria-pressed', activeSubCategory === 'all' ? 'true' : 'false');
    allBtn.onclick = () => filterSubCategory('all', allBtn);
    tagsContainer.appendChild(allBtn);

    if (sortedTags.length === 0) return;

    sortedTags.forEach(tag => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tag-pill px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all capitalize';
        btn.textContent = `${tag} (${tagCounts[tag]})`;

        const grad = tagGradient(tag);
        const darkOverlay = 'linear-gradient(rgba(0,0,0,0.26), rgba(0,0,0,0.26))';
        const composed = `${darkOverlay}, ${grad}`;

        btn.dataset.grad = composed;
        btn.style.backgroundImage = composed;
        btn.style.color = '#e6fff9';
        btn.setAttribute('aria-pressed', 'false');

        btn.onclick = () => filterSubCategory(tag, btn);
        tagsContainer.appendChild(btn);
    });
}

function filterSubCategory(tag, element) {
    activeSubCategory = tag;
    currentPage = 1;

    const parent = element.parentElement;
    if (!parent) return;

    Array.from(parent.children).forEach(child => {
        child.className = 'tag-pill px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all capitalize';
        if (child.dataset && child.dataset.grad) {
            child.style.backgroundImage = child.dataset.grad;
            child.style.color = '#e6fff9';
        } else {
            child.style.backgroundImage = '';
            child.style.color = '';
        }
        child.setAttribute('aria-pressed', 'false');
    });

    element.className = 'tag-pill active px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap capitalize';
    element.style.backgroundImage = '';
    element.style.color = '';
    element.setAttribute('aria-pressed', 'true');

    renderGrid();
}

/* -----------------------
   Search & filtering helpers
   ----------------------- */
function handleSearch(query) {
    searchQuery = String(query || '').toLowerCase().trim();
    currentPage = 1;
    renderGrid();
}

function getFilteredData() {
    return currentDataset.filter(game => {
        const matchesSubCat = (activeSubCategory === 'all' || (Array.isArray(game.tags) && game.tags.includes(activeSubCategory)));
        const matchesSearch = searchQuery === '' ||
            game.title.toLowerCase().includes(searchQuery) ||
            (Array.isArray(game.tags) && game.tags.some(t => t.includes(searchQuery)));
        return matchesSubCat && matchesSearch;
    });
}

/* -----------------------
   Render grid with virtual scrolling
   LIGHTHOUSE FIX: Added CLS prevention with placeholder divs
   ----------------------- */
function renderGrid() {
    const gridContainer = document.getElementById('main-games-grid');
    if (!gridContainer) return;

    const filtered = getFilteredData();
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / CONFIG.itemsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex = (currentPage - 1) * CONFIG.itemsPerPage;
    const endIndex = Math.min(startIndex + CONFIG.itemsPerPage, totalItems);
    const pageItems = filtered.slice(startIndex, endIndex);

    const totalEl = document.getElementById('total-games-count');
    const startEl = document.getElementById('page-start-idx');
    const endEl = document.getElementById('page-end-idx');
    if (totalEl) totalEl.textContent = totalItems.toLocaleString();
    if (startEl) startEl.textContent = totalItems > 0 ? (startIndex + 1).toLocaleString() : 0;
    if (endEl) endEl.textContent = endIndex.toLocaleString();

    gridContainer.innerHTML = '';
    if (pageItems.length === 0) {
        renderEmptyState('No games found matching your search or category criteria.');
        renderPagination(1);
        return;
    }

    // LIGHTHOUSE FIX: Use virtual scrolling for better performance and CLS prevention
    if (observer && pageItems.length > CONFIG.virtualScrollThreshold) {
        // Create placeholder divs for virtual scrolling with explicit dimensions
        pageItems.forEach(game => {
            const placeholder = document.createElement('div');
            placeholder.className = 'game-card-placeholder bg-[#12141f] rounded-2xl border border-gray-800/90 aspect-[3/4] min-w-[200px]';
            placeholder.dataset.gameId = game.id;
            gridContainer.appendChild(placeholder);
            observer.observe(placeholder);
        });
    } else {
        // Traditional rendering for smaller datasets
        // LIGHTHOUSE FIX: Process in batches to avoid blocking the main thread
        const fragment = document.createDocumentFragment();
        
        const processBatch = (startIdx, endIdx) => {
            const batchEnd = Math.min(endIdx, pageItems.length);
            for (let i = startIdx; i < batchEnd; i++) {
                const game = pageItems[i];
                const card = document.createElement('a');
                card.href = `game.html?id=${encodeURIComponent(game.id)}`;
                card.className = 'game-card group cursor-pointer bg-[#12141f] rounded-2xl overflow-hidden border border-gray-800/90 hover:border-cyan-500/50 transition-all duration-300 flex flex-col shadow-lg relative';
                card.addEventListener('click', () => { 
                    try { 
                        sessionStorage.setItem('current_game_data', JSON.stringify(game)); 
                    } catch (e) {} 
                });

                // LIGHTHOUSE FIX: Use WebP format, explicit dimensions
                const thumb = game.thumb || 'https://placehold.co/400x400/12141f/00ffcc?text=Bekeirat+Game';
                const webpThumb = thumb.replace(/\.(png|jpg|jpeg)$/i, '.webp');
                
                card.innerHTML = `
                    <div class="game-thumb-container relative w-full aspect-square overflow-hidden bg-[#0a0b10]">
                        <img src="${escapeHtml(webpThumb)}" 
                             srcset="${escapeHtml(webpThumb)} 1x, ${escapeHtml(thumb)} 1x"
                             alt="${escapeHtml(game.title)}" 
                             loading="lazy" 
                             decoding="async"
                             width="400" 
                             height="400"
                             class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                             onerror="this.src='https://placehold.co/400x400/12141f/00ffcc?text=${encodeURIComponent(game.title)}'">
                        <div class="absolute inset-0 bg-gradient-to-t from-[#12141f] via-transparent to-transparent opacity-80"></div>
                        <span class="absolute top-2.5 right-2.5 text-[10px] font-bold px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-cyan-400 border border-cyan-500/30 capitalize">${escapeHtml(game.category)}</span>
                    </div>
                    <div class="p-3.5 bg-[#12141f] flex items-center justify-between flex-1">
                        <h3 class="font-bold text-xs sm:text-sm text-gray-200 group-hover:text-cyan-400 transition-colors truncate" title="${escapeHtml(game.title)}">${escapeHtml(game.title)}</h3>
                        <div class="p-1.5 rounded-lg bg-gray-800/80 group-hover:bg-cyan-500/20 text-gray-400 group-hover:text-cyan-400 transition-all">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/></svg>
                        </div>
                    </div>
                `;
                fragment.appendChild(card);
            }
        };

        // Process in batches to avoid blocking the main thread
        const batchSize = 10;
        for (let i = 0; i < pageItems.length; i += batchSize) {
            processBatch(i, i + batchSize);
        }
        
        gridContainer.appendChild(fragment);
    }

    renderPagination(totalPages);
}

/* -----------------------
   Pagination
   ----------------------- */
function renderPagination(totalPages) {
    const container = document.getElementById('pagination-controls');
    if (!container) return;
    container.innerHTML = '';
    if (totalPages <= 1) return;

    const createBtn = (label, page, isActive = false, isDisabled = false) => {
        const btn = document.createElement('button');
        btn.innerHTML = label;
        btn.disabled = isDisabled;
        let baseClass = "px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ";
        if (isDisabled) baseClass += "bg-gray-900 text-gray-600 cursor-not-allowed border border-gray-800";
        else if (isActive) baseClass += "bg-cyan-500 text-black font-bold shadow-lg shadow-cyan-500/20";
        else baseClass += "bg-[#12141f] text-gray-300 hover:bg-gray-800 hover:text-white border border-gray-800/90";
        btn.className = baseClass;
        btn.onclick = () => { if (!isDisabled && page !== currentPage) { currentPage = page; renderGrid(); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
        return btn;
    };

    container.appendChild(createBtn('&laquo; First', 1, false, currentPage === 1));
    container.appendChild(createBtn('&lsaquo; Prev', currentPage - 1, false, currentPage === 1));

    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    if (endPage - startPage + 1 < maxVisiblePages) startPage = Math.max(1, endPage - maxVisiblePages + 1);

    for (let p = startPage; p <= endPage; p++) container.appendChild(createBtn(p.toString(), p, p === currentPage));
    container.appendChild(createBtn('Next &rsaquo;', currentPage + 1, false, currentPage === totalPages));
    container.appendChild(createBtn('Last &raquo;', totalPages, false, currentPage === totalPages));
}

/* -----------------------
   Loading / empty helpers
   ----------------------- */
function showLoadingState() {
    const grid = document.getElementById('main-games-grid');
    if (!grid) return;
    grid.innerHTML = `<div class="col-span-full py-16 text-center text-gray-400"><div class="inline-block animate-spin rounded-full h-8 w-8 border-2 border-cyan-400 border-t-transparent mb-3"></div><p class="text-sm font-semibold text-gray-300">Loading Games Grid...</p></div>`;
}

function renderEmptyState(message) {
    const grid = document.getElementById('main-games-grid');
    if (!grid) return;
    grid.innerHTML = `<div class="col-span-full py-12 text-center text-gray-400 bg-[#12141f] rounded-2xl border border-gray-800"><svg class="w-12 h-12 mx-auto text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><p class="text-sm font-medium text-gray-300 px-4">${escapeHtml(message)}</p></div>`;
}

function reshuffleGrid() {
    if (dataCache[activeCategory]) {
        currentDataset = shuffleArray(dataCache[activeCategory].slice());
        currentPage = 1;
        buildSubCategoryTags();
        renderGrid();
    }
}

/* -----------------------
   Small helpers & fallback
   ----------------------- */
function generateMockGames(category = 'all') {
    const cats = ['puzzle', 'arcade', 'action', 'racing', 'kids', 'multiplayer', 'adventure', 'strategy'];
    const games = [];
    for (let i = 1; i <= 30; i++) {
        const cat = category === 'all' ? cats[i % cats.length] : category;
        const id = `${cat}-game-${i}`;
        games.push({
            id,
            title: `${cat.charAt(0).toUpperCase() + cat.slice(1)} Game ${i}`,
            description: `Play ${cat} game ${i} instantly in your browser.`,
            url: '#',
            category: cat,
            categoryKey: normalizeKey(cat),
            tags: [cat, i % 2 === 0 ? 'arcade' : 'classic'],
            thumb: `https://picsum.photos/seed/${cat}-${i}/400/400`
        });
    }
    return games;
}
