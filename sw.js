/*
 * Gardenias — Service Worker v1
 * Estrategia:
 *   - Cache-first para assets estáticos (CSS, JS, fuentes, imágenes)
 *   - Network-first para HTML (siempre intenta la versión fresca)
 *   - Los datos del menú se manejan por localStorage en script.js
 */

const CACHE_NAME = 'gardenias-v1';

// Assets estáticos que se cachean en install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/menu.html',
    '/styles.css',
    '/landing.css',
    '/script.js',
    '/firebase-config.js',
    '/src/fonts/Logo - BlissfulThinking.otf',
    '/src/fonts/centurygothic.ttf',
    '/src/fonts/centurygothic_bold.ttf',
    '/src/img/logo-floral.png',
    '/src/img/logo-floral-nobackground.png',
];

// Extensiones que siempre van por cache-first
const CACHE_FIRST_EXT = ['.css', '.js', '.otf', '.ttf', '.woff', '.woff2', '.png', '.jpg', '.svg', '.ico'];

// ─── INSTALL ───────────────────────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting()) // Activa el SW inmediatamente
    );
});

// ─── ACTIVATE ──────────────────────────────────────────
// Limpia cachés viejos cuando cambia CACHE_NAME
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim()) // Toma control de todas las páginas abiertas
    );
});

// ─── FETCH ─────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Solo interceptar requests del mismo origen
    if (url.origin !== location.origin) return;

    // No cachear el admin panel ni las APIs de Firebase
    if (url.pathname.startsWith('/src/auth/')) return;
    if (url.pathname.startsWith('/api/')) return;

    // Determinar estrategia según tipo de archivo
    if (isStaticAsset(url.pathname)) {
        // Cache-first: intenta caché, fallback a red, y actualiza caché en background
        event.respondWith(cacheFirst(request));
    } else {
        // Network-first: intenta red, fallback a caché (para HTML y otros)
        event.respondWith(networkFirst(request));
    }
});

// ─── ESTRATEGIAS ───────────────────────────────────────

/**
 * Cache-first con actualización en background.
 * Devuelve la versión cacheada instantáneamente.
 * Luego actualiza el caché con la versión de red para la próxima visita.
 */
async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    if (cached) {
        // Actualizar en background (stale-while-revalidate)
        updateCache(request, cache);
        return cached;
    }

    // No está en caché, ir a red
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        // Offline y sin caché — devolver fallback genérico
        return new Response('Offline', { status: 503 });
    }
}

/**
 * Network-first con fallback a caché.
 * Ideal para HTML que puede cambiar pero queremos disponible offline.
 */
async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);

    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        const cached = await cache.match(request);
        if (cached) return cached;
        return new Response('Offline', { status: 503 });
    }
}

/**
 * Actualiza el caché en background sin bloquear la respuesta.
 */
function updateCache(request, cache) {
    fetch(request)
        .then(response => {
            if (response.ok) {
                cache.put(request, response);
            }
        })
        .catch(() => { /* Red no disponible, no pasa nada */ });
}

/**
 * Determina si una URL corresponde a un asset estático.
 */
function isStaticAsset(pathname) {
    return CACHE_FIRST_EXT.some(ext => pathname.toLowerCase().endsWith(ext));
}
