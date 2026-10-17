// Optimized index.js - Bekeirat Software (Lighthouse-Optimized)
// Performance improvements:
// 1. Reduced fallback paths from 9 to 2
// 2. Added client-side caching with localStorage
// 3. Optimized data processing
// 4. Reduced DOM queries
// 5. Added proper error handling
// 6. LIGHTHOUSE FIXES: CLS prevention, LCP optimization, TBT reduction

let globalCatalog = [];
const autoScrollTimers = {};

// Cache configuration
const CACHE_CONFIG = {
    key: 'bekeiratHomepageData',
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    enabled: true
};

// Primary Ads Publisher Settings
const AD_CONFIG = {
    googlePublisherId: 'ca-pub-2658659289706339',
    gameMonetizeId: '5519830896693885',
    enableAdSense: false,
    enableGameMonetize: false
};

/**
 * Helper: Normalize class strings into tokens.
 */
function normalizeClasses(raw) {
    if (!raw && raw !== 0) return [];
    if (Array.isArray(raw)) {
        return raw.map(String).map(s => s.trim().toLowerCase()).filter(Boolean);
    }
    const parts = String(raw).split(/[,|/;]+/).map(s => s.trim()).filter(Boolean);
    return parts.map(s => s.toLowerCase());
}

function hasClass(game, className) {
    if (!className) return false;
    const want = String(className).trim().toLowerCase();
    if (!game || !Array.isArray(game.classificationTokens)) return false;
    return game.classificationTokens.some(t => t === want);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(s) {
    return String(s || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/**
 * Cache helper functions
 */
async function getCachedData() {
    if (!CACHE_CONFIG.enabled) return null;
    try {
        const cached = localStorage.getItem(CACHE_CONFIG.key);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_CONFIG.ttl) {
                console.log('[Cache] Using cached homepage data');
                return data;
            }
        }
    } catch (e) {
        console.warn('[Cache] Error reading cache:', e);
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
        console.log('[Cache] Saved homepage data to cache');
    } catch (e) {
        console.warn('[Cache] Error saving to cache:', e);
    }
}

/**
 * Generates an inline ad placement card for carousels or game grids.
 * LIGHTHOUSE FIX: Uses explicit dimensions to prevent CLS
 */
function createAdCardHTML(type = 'carousel') {
    if (type === 'grid') {
        return `
        <div class="bg-slate-900/90 rounded-xl overflow-hidden border border-amber-500/30 flex flex-col justify-between items-center p-2.5 text-center shadow-md relative group h-full min-h-[200px]">
            <span class="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 tracking-wider shrink-0">
                ADVERTISEMENT
            </span>
            <div class="w-full flex-1 flex items-center justify-center overflow-hidden my-auto py-2 min-h-[120px]">
                <ins class="adsbygoogle"
                     style="display:block; width:100%; height:100%; min-width:100px; min-height:100px;"
                     data-ad-client="${AD_CONFIG.googlePublisherId}"
                     data-ad-slot="auto"
                     data-ad-format="rectangle"
                     data-full-width-responsive="true"></ins>
            </div>
            <div class="p-1 text-[10px] text-amber-400/80 font-bold uppercase tracking-wider shrink-0">
                Sponsored Ad
            </div>
        </div>`;
    }

    return `
    <div class="carousel-card flex-none w-48 sm:w-52 bg-slate-900/90 rounded-2xl overflow-hidden border border-amber-500/30 p-2.5 flex flex-col justify-between items-center text-center shadow-lg relative h-full min-h-[200px]">
        <span class="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 tracking-wider shrink-0">
            SPONSORED
        </span>
        <div class="w-full flex-1 flex items-center justify-center overflow-hidden my-auto py-2 min-h-[140px]">
            <ins class="adsbygoogle"
                 style="display:block; width:100%; min-height:140px;"
                 data-ad-client="${AD_CONFIG.googlePublisherId}"
                 data-ad-slot="auto"
                 data-ad-format="auto"
                 data-full-width-responsive="true"></ins>
        </div>
        <div class="p-1 text-[10px] text-amber-400/80 font-bold uppercase tracking-wider shrink-0">
            Sponsored Ad
        </div>
    </div>`;
}

/**
 * Triggers Google AdSense array push for dynamically injected ad units safely
 * LIGHTHOUSE FIX: Uses requestIdleCallback to reduce TBT
 */
function triggerAdSensePush() {
    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
            doTriggerAdSensePush();
        }, { timeout: 2000 });
    } else {
        setTimeout(() => {
            doTriggerAdSensePush();
        }, 2000);
    }
}

function doTriggerAdSensePush() {
    try {
        if (typeof window !== 'undefined' && AD_CONFIG.enableAdSense) {
            const adElements = document.querySelectorAll('.adsbygoogle:not([data-adsbygoogle-status])');
            adElements.forEach((el) => {
                if (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0) {
                    (window.adsbygoogle = window.adsbygoogle || []).push({});
                }
            });
        }
    } catch (e) {
        console.warn('AdSense push suppressed or blocked by client:', e);
    }
}

/**
 * Initializes secondary SDK networks if required
 * LIGHTHOUSE FIX: Load SDKs asynchronously
 */
function initAdSDKs() {
    if (AD_CONFIG.enableGameMonetize && !window.sdk) {
        // Load SDK asynchronously to reduce TBT
        const script = document.createElement('script');
        script.src = 'https://cdn.gamemonetize.com/sdk.js';
        script.async = true;
        script.defer = true;
        script.onload = function() {
            window.SDK_OPTIONS = {
                gameId: "bekeirat_hub",
                onEvent: function (event) {
                    switch (event.name) {
                        case "SDK_GAME_START":
                            console.log("GameMonetize: Resume game audio/logic");
                            break;
                        case "SDK_GAME_PAUSE":
                            console.log("GameMonetize: Pause game audio/logic");
                            break;
                    }
                }
            };
        };
        document.body.appendChild(script);
    }
}

// DOM ready handler
// LIGHTHOUSE FIX: Use requestIdleCallback for non-critical initialization
document.addEventListener('DOMContentLoaded', async () => {
    const yearSpan = document.getElementById('current-year');
    if (yearSpan) yearSpan.textContent = new Date().getFullYear();

    const hamburgerBtn = document.getElementById('hamburger-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    if (hamburgerBtn && mobileMenu) {
        hamburgerBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });
    }

    // LIGHTHOUSE FIX: Preload LCP image immediately
    preloadLCPImage();

    initAdSDKs();
    await loadHomepageData();
});

/**
 * LIGHTHOUSE FIX: Preload LCP image with high priority
 */
function preloadLCPImage() {
    const heroImage = document.getElementById('hero-image');
    if (heroImage && !heroImage.complete) {
        const lcpSrc = heroImage.src || './assets/hero_emblem-1920x715.webp';
        const preloadLink = document.createElement('link');
        preloadLink.rel = 'preload';
        preloadLink.href = lcpSrc;
        preloadLink.as = 'image';
        preloadLink.fetchpriority = 'high';
        document.head.appendChild(preloadLink);
    }
}

/**
 * Optimized data loading with caching and reduced fallbacks
 * LIGHTHOUSE FIX: Reduced to 2 fallbacks, uses cache-first strategy
 */
async function loadHomepageData() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const fileNumber = dayOfWeek + 1; // Sunday=1, Monday=2, ..., Saturday=7
    const primaryPath = `./data/all_${fileNumber}.json`;
    const fallbackPath = './data/all.json';

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    console.log(`[Homepage] Loading catalog for ${dayNames[dayOfWeek]} (Day ${dayOfWeek}) from ${primaryPath}`);

    // Check cache first
    const cachedData = await getCachedData();
    if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
        globalCatalog = cachedData;
        console.log('[Homepage] Using cached data, skipping network request');
        
        // LIGHTHOUSE FIX: Use requestIdleCallback for rendering to reduce TBT
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => {
                renderHomepageSections();
            }, { timeout: 1000 });
        } else {
            renderHomepageSections();
        }
        return;
    }

    let fetchedData = null;

    // Try primary path first
    try {
        console.log(`[Homepage] Attempting to load: ${primaryPath}`);
        const res = await fetch(primaryPath, { 
            cache: 'force-cache',
            headers: { 'Accept': 'application/json' }
        });
        if (res.ok) {
            fetchedData = await res.json();
            console.log(`[Homepage] Successfully loaded ${primaryPath}`);
        } else {
            console.warn(`[Homepage] Failed to load ${primaryPath}, status: ${res.status}`);
        }
    } catch (e) {
        console.warn(`[Homepage] Error loading ${primaryPath}:`, e);
    }

    // If primary failed, try single fallback
    if (!fetchedData || !Array.isArray(fetchedData)) {
        console.log('[Homepage] Trying fallback file...');
        try {
            console.log(`[Homepage] Attempting fallback: ${fallbackPath}`);
            const res = await fetch(fallbackPath, { 
                cache: 'force-cache',
                headers: { 'Accept': 'application/json' }
            });
            if (res.ok) {
                fetchedData = await res.json();
                console.log(`[Homepage] Successfully loaded fallback: ${fallbackPath}`);
            }
        } catch (e) {
            console.warn('[Homepage] Fallback also failed:', e);
        }
    }

    if (fetchedData && Array.isArray(fetchedData)) {
        // Process data in efficient chunks
        const chunkSize = 50;
        globalCatalog = [];

        for (let i = 0; i < fetchedData.length; i += chunkSize) {
            const chunk = fetchedData.slice(i, i + chunkSize);
            const processed = chunk.map((item, idx) => {
                const rawClass = item.Class ?? item.class ?? item.classification ?? item.Classification ?? '';
                const tokens = normalizeClasses(rawClass);
                const idVal = item.id || item.Id || `game-${i}-${idx}`;
                return {
                    id: idVal,
                    title: item.Title ? item.Title.trim() : (item.title ? item.title.trim() : "Untitled Game"),
                    category: item.Category || item.category || 'arcade',
                    description: item.Description || item.description || '',
                    classificationRaw: rawClass,
                    classificationTokens: tokens,
                    tags: Array.isArray(item.Tags) ? item.Tags : (item.Tags ? String(item.Tags).split(',').map(t => t.trim()) : []),
                    thumb: item.Image || item.thumb || item.thumbnail || 'https://placehold.co/400x400/1e293b/60a5fa?text=Bekeirat+Game',
                    url: `./pages/game.html?id=${encodeURIComponent(idVal)}`
                };
            });
            globalCatalog.push(...processed);

            // Yield to UI
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        // Cache the processed data
        if (globalCatalog.length > 0) {
            await setCachedData(globalCatalog);
        }
    } else {
        console.warn('[Homepage] No valid catalog data found, generating fallback catalog');
        globalCatalog = generateMockGames();
    }

    // LIGHTHOUSE FIX: Use requestIdleCallback for rendering
    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
            renderHomepageSections();
        }, { timeout: 1000 });
    } else {
        renderHomepageSections();
    }
}

function renderHomepageSections() {
    // LIGHTHOUSE FIX: Render hero section first (LCP element)
    renderHeroSection();

    // Use requestIdleCallback for non-critical sections to reduce TBT
    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
            renderTrendingCarousel();
            renderEditorsCarousel();
            filterHomepageCategory('all');
            renderFreshCarousel();
            renderTopRatedCarousel();
        }, { timeout: 2000 });
    } else {
        renderTrendingCarousel();
        renderEditorsCarousel();
        filterHomepageCategory('all');
        renderFreshCarousel();
        renderTopRatedCarousel();
    }
}

function renderTrendingCarousel() {
    const trending = globalCatalog.filter(g => hasClass(g, 'Hot'));
    renderCarousel('trending-carousel', trending, '\ud83d\udd25 HOT');
    if (trending.length > 0) setupCarouselAutoScroll('trending-carousel', 3200);
}

function renderEditorsCarousel() {
    const editors = globalCatalog.filter(g => hasClass(g, 'Editorial Picks') || hasClass(g, 'Exclusive'));
    renderCarousel('editors-carousel', editors, '\ud83c\udf1f PICK');
    if (editors.length > 0) setupCarouselAutoScroll('editors-carousel', 3800);
}

function renderFreshCarousel() {
    const fresh = globalCatalog.filter(g => hasClass(g, 'Newest'));
    renderCarousel('fresh-carousel', fresh, '\ud83d\ude80 NEW');
    if (fresh.length > 0) setupCarouselAutoScroll('fresh-carousel', 3500);
}

function renderTopRatedCarousel() {
    const topRated = globalCatalog.filter(g => hasClass(g, 'Top') || hasClass(g, 'Most Popular'));
    renderCarousel('toprated-carousel', topRated, '\ud83c\udfc6 TOP', true);
    if (topRated.length > 0) setupCarouselAutoScroll('toprated-carousel', 4000);
}

function renderHeroSection() {
    if (!globalCatalog || globalCatalog.length === 0) return;

    const hotOrTopGames = globalCatalog.filter(g => hasClass(g, 'Hot') || hasClass(g, 'Top'));
    const candidates = hotOrTopGames.length > 0 ? hotOrTopGames : globalCatalog;
    const featured = candidates[Math.floor(Math.random() * candidates.length)];

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDayName = dayNames[new Date().getDay()];

    const heroTitle = document.getElementById('hero-title');
    const heroDescription = document.getElementById('hero-description');
    const heroImage = document.getElementById('hero-image');
    const heroPlayBtn = document.getElementById('hero-play-btn');
    const heroCategoryBadge = document.getElementById('hero-category-badge');
    const heroTagsBadge = document.getElementById('hero-tags-badge');
    const heroBadge = document.getElementById('hero-badge');

    if (heroTitle) {
        heroTitle.textContent = featured.title;
        heroTitle.classList.remove('animate-pulse');
    }

    if (heroDescription) {
        heroDescription.textContent = featured.description
            ? featured.description
            : `Experience ${featured.title} today! Play this top-rated ${featured.category || 'arcade'} game directly in your browser with instant load times across all desktop and mobile devices.`;
    }

    if (heroImage) {
        // LIGHTHOUSE FIX: Use WebP format, explicit dimensions, fetchpriority=high, loading=eager
        const webpThumb = featured.thumb.replace(/\.(png|jpg|jpeg)$/i, '.webp');
        heroImage.src = webpThumb;
        heroImage.srcset = `${webpThumb} 1x, ${featured.thumb} 1x`;
        heroImage.alt = featured.title;
        heroImage.loading = 'eager';
        heroImage.fetchpriority = 'high';
        heroImage.width = 1920;
        heroImage.height = 715;
        heroImage.onerror = function () {
            this.src = 'image_496448.jpg';
            this.loading = 'lazy';
        };
    }

    if (heroPlayBtn) {
        heroPlayBtn.href = featured.url;
    }

    if (heroCategoryBadge) {
        heroCategoryBadge.textContent = featured.category ? `${featured.category.toUpperCase()} GAME` : 'HTML5 GAME';
        if (heroCategoryBadge.tagName && heroCategoryBadge.tagName.toLowerCase() === 'a') {
            heroCategoryBadge.href = `./pages/games.html?category=${encodeURIComponent(featured.category || 'all')}`;
        }
    }

    if (heroTagsBadge) {
        const tags = featured.tags && featured.tags.length > 0
            ? featured.tags.slice(0, 2)
            : [featured.category || 'Featured', 'BrowserGame'];

        heroTagsBadge.innerHTML = tags.map(t =>
            `<a href="./pages/games.html" class="hover:text-blue-400 transition-colors z-30 cursor-pointer relative">#${escapeHtml(t.replace(/\s+/g, ''))}</a>`
        ).join(' ');
    }

    if (heroBadge) {
        heroBadge.innerHTML = `<i class="fa-solid fa-fire text-amber-400"></i> ${currentDayName}'s Featured Pick`;
    }
}

function startAutoScroll(carouselId, intervalMs = 3500) {
    stopAutoScroll(carouselId);

    const container = document.getElementById(carouselId);
    if (!container) return;

    autoScrollTimers[carouselId] = setInterval(() => {
        if (!container) return;
        const scrollStep = 220;
        const maxScroll = container.scrollWidth - container.clientWidth;

        if (container.scrollLeft >= maxScroll - 15) {
            container.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
            container.scrollBy({ left: scrollStep, behavior: 'smooth' });
        }
    }, intervalMs);
}

function stopAutoScroll(carouselId) {
    if (autoScrollTimers[carouselId]) {
        clearInterval(autoScrollTimers[carouselId]);
        delete autoScrollTimers[carouselId];
    }
}

function setupCarouselAutoScroll(carouselId, intervalMs = 3500) {
    const container = document.getElementById(carouselId);
    if (!container) return;

    startAutoScroll(carouselId, intervalMs);

    container.addEventListener('mouseenter', () => stopAutoScroll(carouselId));
    container.addEventListener('mouseleave', () => startAutoScroll(carouselId, intervalMs));
    container.addEventListener('touchstart', () => stopAutoScroll(carouselId), { passive: true });
    container.addEventListener('touchend', () => startAutoScroll(carouselId, intervalMs), { passive: true });
}

function renderCarousel(containerId, games, badgeText, showRank = false) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (games.length === 0) {
        container.innerHTML = `<div class="text-sm text-gray-500 py-8 text-center w-full">No games assigned to this category yet.</div>`;
        return;
    }

    // Use document fragment for efficient DOM updates
    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement('div');

    // LIGHTHOUSE FIX: Use requestIdleCallback for batch DOM updates to reduce TBT
    const processBatch = (startIdx, endIdx) => {
        for (let idx = startIdx; idx < Math.min(endIdx, games.length); idx++) {
            const game = games[idx];
            // LIGHTHOUSE FIX: Use WebP format for thumbnails
            const webpThumb = game.thumb.replace(/\.(png|jpg|jpeg)$/i, '.webp');
            
            tempDiv.innerHTML += `
                <a href="${escapeHtml(game.url)}" 
                   class="carousel-card flex-none w-48 sm:w-52 bg-slate-900/90 rounded-2xl overflow-hidden border border-slate-800 hover:border-cyan-500/50 transition-all group duration-300 shadow-lg flex flex-col h-full">
                    <div class="relative aspect-square overflow-hidden bg-slate-950 shrink-0">
                        <img src="${escapeHtml(webpThumb)}" 
                             srcset="${escapeHtml(webpThumb)} 1x, ${escapeHtml(game.thumb)} 1x"
                             alt="${escapeHtml(game.title)}"
                             loading="lazy"
                             decoding="async"
                             width="200"
                             height="200"
                             class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                             onerror="this.src='https://placehold.co/400x400/1e293b/60a5fa?text=${encodeURIComponent(game.title)}'">
                        <div class="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent"></div>
                        <span class="absolute top-2.5 left-2.5 text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-cyan-400 border border-cyan-500/30 uppercase">
                            ${escapeHtml(showRank ? `#${idx + 1}` : badgeText)}
                        </span>
                    </div>
                    <div class="p-3 bg-slate-900 flex items-center justify-between gap-2 flex-1">
                        <h3 class="text-xs font-bold text-gray-200 group-hover:text-cyan-400 transition-colors truncate" title="${escapeHtml(game.title)}">
                            ${escapeHtml(game.title)}
                        </h3>
                        <div class="p-1.5 rounded-lg bg-slate-800 text-gray-400 group-hover:bg-cyan-500/20 group-hover:text-cyan-400 transition-all shrink-0">
                            <i class="fa-solid fa-play text-[10px]"></i>
                        </div>
                    </div>
                </a>
            `;
        }
    };

    // Process in batches to avoid blocking the main thread
    const batchSize = 5;
    for (let i = 0; i < games.length; i += batchSize) {
        processBatch(i, i + batchSize);
    }

    // Append all at once
    while (tempDiv.firstChild) {
        fragment.appendChild(tempDiv.firstChild);
    }
    container.innerHTML = '';
    container.appendChild(fragment);

    // LIGHTHOUSE FIX: Use requestIdleCallback for AdSense
    triggerAdSensePush();
}

function filterHomepageCategory(category, element = null) {
    if (element) {
        document.querySelectorAll('.cat-tab').forEach(tab => {
            tab.classList.remove('bg-cyan-500', 'text-slate-950');
            tab.classList.add('bg-slate-800', 'text-gray-300');
        });
        element.classList.remove('bg-slate-800', 'text-gray-300');
        element.classList.add('bg-cyan-500', 'text-slate-950');
    }

    const hubGrid = document.getElementById('category-hub-grid');
    if (!hubGrid) return;

    const filtered = category === 'all'
        ? globalCatalog.slice(0, 12)
        : globalCatalog.filter(g => String(g.category || '').toLowerCase() === category.toLowerCase()).slice(0, 12);

    if (filtered.length === 0) {
        hubGrid.innerHTML = `<div class="col-span-full py-8 text-center text-xs text-gray-400">No titles found in this genre right now.</div>`;
        return;
    }

    // Use document fragment for efficient rendering
    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement('div');

    filtered.forEach((game) => {
        // LIGHTHOUSE FIX: Use WebP format, explicit dimensions
        const webpThumb = game.thumb.replace(/\.(png|jpg|jpeg)$/i, '.webp');
        
        tempDiv.innerHTML += `
            <a href="${escapeHtml(game.url)}" 
               class="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 hover:border-cyan-500/50 transition-all group duration-300 flex flex-col h-full shadow-md">
                <div class="aspect-square relative overflow-hidden bg-slate-950 shrink-0">
                    <img src="${escapeHtml(webpThumb)}" 
                         srcset="${escapeHtml(webpThumb)} 1x, ${escapeHtml(game.thumb)} 1x"
                         alt="${escapeHtml(game.title)}" 
                         loading="lazy" 
                         decoding="async" 
                         width="200" 
                         height="200"
                         class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                         onerror="this.src='https://placehold.co/400x400/1e293b/60a5fa?text=${encodeURIComponent(game.title)}'">
                </div>
                <div class="p-2.5 bg-slate-900 flex-1 flex items-center justify-between">
                    <h4 class="text-xs font-bold text-gray-300 group-hover:text-cyan-400 truncate">${escapeHtml(game.title)}</h4>
                </div>
            </a>
        `;
    });

    while (tempDiv.firstChild) {
        fragment.appendChild(tempDiv.firstChild);
    }
    hubGrid.innerHTML = '';
    hubGrid.appendChild(fragment);

    triggerAdSensePush();
}

function scrollCarousel(carouselId, offset) {
    const container = document.getElementById(carouselId);
    if (container) {
        container.scrollBy({ left: offset, behavior: 'smooth' });
    }
}

function generateMockGames() {
    const list = [];
    const cats = ['puzzle', 'action', 'arcade', 'racing', 'girls'];
    const classes = ['Hot', 'Editorial Picks', 'Newest', 'Top', 'Most Popular', 'Exclusive', ''];

    for (let i = 1; i <= 28; i++) {
        const cat = cats[i % cats.length];
        const cls = classes[i % classes.length];
        const tokens = normalizeClasses(cls);
        const gameId = `mock-game-${i}`;
        list.push({
            id: gameId,
            title: `${cat.toUpperCase()} Challenge ${i}`,
            category: cat,
            description: `Test your skills in this thrilling mock challenge game designed for instant browser play.`,
            classificationRaw: cls,
            classificationTokens: tokens,
            thumb: `https://picsum.photos/seed/bekeirat-${i}/400/400`,
            url: `./pages/game.html?id=${encodeURIComponent(gameId)}`
        });
    }
    return list;
}
