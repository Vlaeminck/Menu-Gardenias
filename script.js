// No Firebase SDK init required - we use the REST API for better performance

// Resolve branch from URL param, fallback to leloir
const SUCURSALES = {
    leloir:   { label: 'Parque Leloir', file: 'data/productos-leloir.json' },
    castelar: { label: 'Castelar',      file: 'data/productos-castelar.json' },
    pinamar:  { label: 'Pinamar',       file: 'data/productos-pinamar.json' }
};

// Orden estricto de categorías para la web
const CATEGORY_ORDER = [
    "DESAYUNOS & MERIENDAS",
    "TOSTADOS",
    "ADICIONALES & RACIONES",
    "DELICIAS DULCES & SALADAS",
    "TARTAS & TORTAS",
    "SCON DE HIERBAS RELLENO",
    "PARA PICOTEAR",
    "TOSTONES",
    "ENSALADAS",
    "PAPA ROSTI",
    "PRINCIPALES",
    "OLLITAS",
    "MENU EJECUTIVO",
    "POSTRES",
    "BEBIDAS SIN ALCOHOL",
    "INFUSIONES",
    "CON ALCOHOL",
    "VINOS"
];

const SHOW_EXTRA_POPUP = false; // Cambiar a true para mostrar el aviso de TACC en todas las sucursales

const _urlParam = new URLSearchParams(window.location.search).get('sucursal') || 'leloir';
const SUCURSAL  = SUCURSALES[_urlParam] || SUCURSALES['leloir'];

const CONFIG = {
    DATA_URL: SUCURSAL.file,
    SELECTORS: {
        CATEGORY_LIST: 'categoryList',
        PRODUCTS_CONTAINER: 'productsContainer',
        SEARCH_INPUT: 'searchInput',
        CLEAR_SEARCH: 'clearSearch',
        CATEGORY_BTNS: '.category-btn'
    }
};

class MenuApp {
    constructor() {
        this.products = {};
        this.categoriesInfo = {
            'todos': { titulo: 'Carta Completa', descripcion: '' },
            'DESAYUNOS & MERIENDAS': {
                titulo: 'Desayunos & Meriendas',
                descripcion: 'Disfrutá nuestros desayunos de 9 a 12hs & meriendas de 16 a 20hs. Incluyen infusión + vasito de soda.'
            },
            'TOSTADOS': { titulo: 'Tostados', descripcion: 'Elaborados con nuestros panes artesanales.' },
            'ADICIONALES & RACIONES': { titulo: 'Adicionales & Raciones', descripcion: 'Complementos perfectos para acompañar tu plato.' },
            'DELICIAS DULCES & SALADAS': { titulo: 'Delicias Dulces & Saladas', descripcion: 'Pastelería y panadería de elaboración diaria.' },
            'TARTAS & TORTAS': { titulo: 'Tartas & Tortas', descripcion: 'Selección fresca de nuestra heladera.' },
            'SCON DE HIERBAS RELLENO': { titulo: 'Scons de Hierbas Rellenos', descripcion: 'Especialidad de la casa recién horneada.' },
            'PARA PICOTEAR': { titulo: 'Para Picotear', descripcion: 'Platos pequeños e ideales para compartir.' },
            'TOSTONES': { titulo: 'Tostones', descripcion: 'Nuestra versión gourmet de las clásicas tostadas.' },
            'ENSALADAS': { titulo: 'Ensaladas', descripcion: 'Opciones frescas, equilibradas y de estación.' },
            'PRINCIPALES': { titulo: 'Almuerzos & Principales', descripcion: 'Cocina de autor abierta de 12 a 16hs.' },
            'POSTRES': { titulo: 'Postres', descripcion: 'Dulce final para tu experiencia.' },
            'BEBIDAS SIN ALCOHOL': { titulo: 'Bebidas Sin Alcohol', descripcion: 'Limonadas caseras, aguas y refrescos.' },
            'INFUSIONES': { titulo: 'Infusiones', descripcion: 'Café de especialidad y selección de tés.' },
            'CON ALCOHOL': { titulo: 'Coctelería', descripcion: 'Tragos clásicos y de autor.' },
            'VINOS': { titulo: 'Carta de Vinos', descripcion: 'Selección boutique especialmente curada.' }
        };

        this.init();
    }

    async init() {
        // Inject branch name into header
        const locEl = document.querySelector('.brand-location');
        if (locEl) locEl.textContent = SUCURSAL.label.toUpperCase();

        await this.loadData();
        this.renderCategories();
        this.renderProducts('todos');
        this.setupEventListeners();
        this.setupIntersectionObserver();
        this.setupPopups();
        this.setupStickyHeaderShadow();
    }

    setupStickyHeaderShadow() {
        const stickyNav = document.querySelector('.sticky-nav-container');
        if (!stickyNav) return;

        window.addEventListener('scroll', () => {
            if (window.scrollY > 20) {
                stickyNav.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.06)';
            } else {
                stickyNav.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.03)';
            }
        }, { passive: true });
    }

    setupPopups() {
        const popupOverlay = document.getElementById('iosOverlay');
        const closeBtn = document.getElementById('closePopup');
        const popupTitle = document.getElementById('dynamic-popup-title');
        const popupBody  = document.getElementById('dynamic-popup-body');

        // Buscar configuración en los datos (clave 'config')
        const config = this.currentData.config || {};
        const popupConfig = config.popup || { enabled: false, title: '', body: '' };

        if (popupOverlay && popupConfig.enabled) {
            if (popupTitle) popupTitle.textContent = popupConfig.title || 'Aviso';
            if (popupBody)  popupBody.innerHTML = popupConfig.body || '';
            
            // Mostrar después de un delay
            setTimeout(() => {
                popupOverlay.classList.remove('hidden');
                requestAnimationFrame(() => {
                    popupOverlay.classList.add('show');
                });
            }, 1500);
        }

        if (closeBtn && popupOverlay) {
            closeBtn.onclick = () => {
                popupOverlay.classList.remove('show');
                setTimeout(() => {
                    popupOverlay.classList.add('hidden');
                }, 300);
            };
        }
    }

    // ─── CACHE CONFIG ──────────────────────────────────────
    static CACHE_KEY_PREFIX = 'gardenias_menu_';
    static CACHE_TTL = 5 * 60 * 1000; // 5 minutos antes de revalidar

    /**
     * Carga datos con estrategia stale-while-revalidate:
     * 1. Si hay datos en localStorage → muestra instantáneamente.
     * 2. Si el TTL expiró o no hay caché → fetch de Firebase en background.
     * 3. Si los datos de red son distintos → actualiza UI silenciosamente.
     */
    async loadData() {
        const cacheKey = MenuApp.CACHE_KEY_PREFIX + _urlParam;
        const cached = this._readCache(cacheKey);

        if (cached) {
            // ① Mostrar datos cacheados instantáneamente
            this.currentData = cached.data;
            this._patchEmptyCategories();
            console.log(`📦 Menú cargado desde caché (${this._timeSince(cached.timestamp)})`);

            // ② Revalidar en background si el TTL expiró
            if (Date.now() - cached.timestamp > MenuApp.CACHE_TTL) {
                this._revalidateInBackground(cacheKey);
            }
            return;
        }

        // Sin caché — carga normal (primera visita)
        await this._fetchAndCache(cacheKey);
    }

    /**
     * Fetch de red (Firebase → fallback local), guarda en caché.
     */
    async _fetchAndCache(cacheKey) {
        try {
            const data = await this._fetchFromNetwork();
            this.currentData = data;
            this._patchEmptyCategories();
            this._writeCache(cacheKey, data);
        } catch (error) {
            console.error('Error loading data:', error);
            // Último recurso: archivo local
            try {
                const response = await fetch(CONFIG.DATA_URL);
                this.currentData = await response.json();
            } catch (e) {
                this.currentData = {};
            }
        }
    }

    /**
     * Fetch de Firebase con cascada: sucursales → menu → local.
     */
    async _fetchFromNetwork() {
        if (typeof firebaseConfig !== 'undefined' && firebaseConfig.databaseURL) {
            const DB_URL = firebaseConfig.databaseURL;

            // 1. Ruta nueva 'sucursales'
            let response = await fetch(`${DB_URL}/sucursales/${_urlParam}.json`);
            let data = await response.json();

            // 2. Ruta vieja 'menu'
            if (!data) {
                response = await fetch(`${DB_URL}/menu/${_urlParam}.json`);
                data = await response.json();
            }

            // 3. Archivos locales
            if (!data) {
                response = await fetch(CONFIG.DATA_URL);
                data = await response.json();
                console.log('Cargado de backup local (Firebase vacío)');
            } else {
                console.log('🌐 Cargado desde Firebase REST API');
            }

            return data || {};
        } else {
            const response = await fetch(CONFIG.DATA_URL);
            return await response.json();
        }
    }

    /**
     * Revalida datos en background sin bloquear la UI.
     * Si los datos cambiaron, re-renderiza silenciosamente.
     */
    async _revalidateInBackground(cacheKey) {
        try {
            const freshData = await this._fetchFromNetwork();
            const freshJSON = JSON.stringify(freshData);
            const cachedJSON = JSON.stringify(this.currentData);

            if (freshJSON !== cachedJSON) {
                console.log('🔄 Datos actualizados detectados, actualizando carta...');
                this.currentData = freshData;
                this._patchEmptyCategories();
                this._writeCache(cacheKey, freshData);

                // Re-renderizar sin recargar la página
                this.renderCategories();
                const activeBtn = document.querySelector('.category-btn.active');
                const activeCategory = activeBtn ? activeBtn.dataset.category : 'todos';
                this.renderProducts(activeCategory);
                this.setupIntersectionObserver();
            } else {
                // Datos iguales, solo actualizar timestamp
                this._writeCache(cacheKey, freshData);
                console.log('✅ Caché revalidado, sin cambios.');
            }
        } catch (error) {
            console.warn('Revalidación en background falló (sin conexión):', error.message);
        }
    }

    /**
     * Reconstruye categorías vacías que Firebase elimina.
     */
    _patchEmptyCategories() {
        if (this.currentData.config && this.currentData.config.categoryOrder) {
            this.currentData.config.categoryOrder.forEach(cat => {
                if (!this.currentData[cat] && cat !== 'config') {
                    this.currentData[cat] = [];
                }
            });
        }
    }

    // ─── HELPERS DE LOCALSTORAGE ────────────────────────────

    _readCache(key) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed.data || !parsed.timestamp) return null;
            return parsed;
        } catch (e) {
            localStorage.removeItem(key);
            return null;
        }
    }

    _writeCache(key, data) {
        try {
            const payload = JSON.stringify({ data, timestamp: Date.now() });
            localStorage.setItem(key, payload);
        } catch (e) {
            // localStorage lleno — limpiar cachés viejos
            this._cleanOldCaches();
            try {
                const payload = JSON.stringify({ data, timestamp: Date.now() });
                localStorage.setItem(key, payload);
            } catch (e2) {
                console.warn('No se pudo guardar en caché:', e2.message);
            }
        }
    }

    _cleanOldCaches() {
        const prefix = MenuApp.CACHE_KEY_PREFIX;
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                localStorage.removeItem(key);
            }
        }
    }

    _timeSince(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return `hace ${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `hace ${minutes}min`;
        const hours = Math.floor(minutes / 60);
        return `hace ${hours}h`;
    }

    renderCategories() {
        const container = document.getElementById(CONFIG.SELECTORS.CATEGORY_LIST);
        
        const config = this.currentData.config || {};
        const disabledCats = config.disabledCategories || [];
        const existingCategories = Object.keys(this.currentData).filter(cat => cat !== 'config' && !disabledCats.includes(cat));
        
        const savedOrder = config.categoryOrder || [];
        let sortedCategories = [];
        if (savedOrder.length > 0) {
            sortedCategories = savedOrder.filter(cat => existingCategories.includes(cat));
        } else {
            sortedCategories = CATEGORY_ORDER.filter(cat => existingCategories.includes(cat));
        }
        
        // Agregar cualquier categoría extra que no esté en el orden definido
        existingCategories.forEach(cat => {
            if (!sortedCategories.includes(cat)) sortedCategories.push(cat);
        });

        const categories = ['todos', ...sortedCategories];

        container.innerHTML = categories.map(cat => `
            <li>
                <button class="category-btn ${cat === 'todos' ? 'active' : ''}" 
                        data-category="${cat}">
                    ${cat === 'todos' ? 'TODOS' : cat.replace(/_/g, ' ')}
                </button>
            </li>
        `).join('');
    }

    createProductCard(product) {
        // Smart tag detection
        const isVegan = (typeof product.vegan === 'boolean') 
            ? product.vegan 
            : (product.descripcion && /\b(vegano|vegan)\b/i.test(product.descripcion));

        const isVeggie = (typeof product.veggie === 'boolean') 
            ? product.veggie 
            : (product.descripcion && /\b(veggie|vegetariano)\b/i.test(product.descripcion));

        const isGlutenFree = (typeof product.glutenFree === 'boolean') 
            ? product.glutenFree 
            : (product.descripcion && /(\bgf\b|gluten free|sin gluten|s\/tacc)/i.test(product.descripcion));

        const veganIcon = isVegan ? `
            <span class="tag vegan" title="Vegano">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-3.5H9.5l3.5-6v3.5h1.5l-3.5 6z"/>
                </svg>
                VEGANO
            </span>` : '';

        const veggieIcon = isVeggie ? `
            <span class="tag veggie" title="Vegetariano">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17,8C8,10 5.9,16.17 3.82,21.34L5.71,22L6.66,19.7C7.14,19.87 7.64,20 8.17,20C12.5,20 16,16.5 16,12.17C16,12.13 16,12.09 16,12.05C16.5,12 17,11.5 17,11C17,10.5 16.5,10 16,10C16,8.67 16.5,7.33 17.5,6.33C18.5,5.33 20,5 21,5C21,4 20,3 19,3C18,3 16.67,3.5 15.67,4.5C14.67,5.5 14,7 14,8C13,8 12,9 12,10C12,10.5 12.5,11 13,11C13.04,11 13.08,11 13.12,11C13.04,11.38 13,11.77 13,12.17C13,14.82 10.82,17 8.17,17C7.84,17 7.5,16.95 7.2,16.86L17,8Z"/>
                </svg>
                VEGETARIANO
            </span>` : '';

        const taccIcon = isGlutenFree ? `
            <span class="tag tacc" title="Sin TACC">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                     <path d="M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z"/>
                </svg>
                SIN TACC
            </span>` : '';

        const formattedPrice = product.precio ? `$${product.precio.toLocaleString('es-AR')}` : '';

        return `
            <article class="product-card">
                <div class="product-header">
                    <h3 class="product-name">${product.nombre}</h3>
                    <div class="dots"></div>
                    <span class="product-price">${formattedPrice}</span>
                </div>
                ${product.descripcion ? `<p class="product-description">${product.descripcion}</p>` : ''}
                ${(veganIcon || veggieIcon || taccIcon) ? `
                    <div class="product-tags">
                        ${veganIcon}
                        ${veggieIcon}
                        ${taccIcon}
                    </div>` : ''
                }
            </article>
        `;
    }

    renderProducts(filterCategory = 'todos', searchTerm = '') {
        const container = document.getElementById(CONFIG.SELECTORS.PRODUCTS_CONTAINER);
        container.innerHTML = '';

        const config = this.currentData.config || {};
        const disabledCats = config.disabledCategories || [];
        const existingCategories = Object.keys(this.currentData).filter(cat => cat !== 'config' && !disabledCats.includes(cat));
        let categoriesToRender = [];

        if (filterCategory === 'todos') {
            const savedOrder = config.categoryOrder || [];
            if (savedOrder.length > 0) {
                categoriesToRender = savedOrder.filter(cat => existingCategories.includes(cat));
            } else {
                categoriesToRender = CATEGORY_ORDER.filter(cat => existingCategories.includes(cat));
            }
            existingCategories.forEach(cat => {
                if (!categoriesToRender.includes(cat)) categoriesToRender.push(cat);
            });
        } else {
            categoriesToRender = [filterCategory];
        }

        let hasProducts = false;

        const renderCategoryChunk = (index) => {
            if (index >= categoriesToRender.length) {
                if (!hasProducts) {
                    container.innerHTML = '<div style="text-align:center; padding: 3rem 1rem; color: #888;"><p>No se encontraron productos que coincidan con tu búsqueda.</p></div>';
                }
                return;
            }

            const cat = categoriesToRender[index];
            const catProducts = this.currentData[cat];

            if (catProducts && catProducts.length > 0) {
                const filteredProducts = catProducts.filter(p => {
                    if (!searchTerm) return true;
                    const normalize = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                    const term = normalize(searchTerm);
                    return normalize(p.nombre).includes(term) ||
                        (p.descripcion && normalize(p.descripcion).includes(term));
                });

                if (filteredProducts.length > 0) {
                    hasProducts = true;
                    const info = this.categoriesInfo[cat] || { titulo: cat, descripcion: '' };

                    const sectionHTML = `
                        <section id="${cat}" class="category-section">
                            <div class="category-header">
                                <h2 class="category-title">${info.titulo}</h2>
                                ${info.descripcion ? `<p class="category-description">${info.descripcion}</p>` : ''}
                            </div>
                            <div class="products-grid">
                                ${filteredProducts.map(p => this.createProductCard(p)).join('')}
                            </div>
                        </section>
                    `;
                    
                    container.insertAdjacentHTML('beforeend', sectionHTML);
                }
            }

            requestAnimationFrame(() => {
                setTimeout(() => renderCategoryChunk(index + 1), 0);
            });
        };

        renderCategoryChunk(0);
    }

    scrollToActiveCategoryBtn(btn) {
        if (!btn) return;
        const nav = document.querySelector('.category-nav');
        if (nav) {
            const navRect = nav.getBoundingClientRect();
            const btnRect = btn.getBoundingClientRect();
            const offset = btnRect.left - navRect.left - (navRect.width / 2) + (btnRect.width / 2);
            nav.scrollBy({ left: offset, behavior: 'smooth' });
        }
    }

    setupEventListeners() {
        // Category Navigation
        const categoryList = document.getElementById(CONFIG.SELECTORS.CATEGORY_LIST);
        if (categoryList) {
            categoryList.addEventListener('click', (e) => {
                const btn = e.target.closest('.category-btn');
                if (btn) {
                    document.querySelectorAll(CONFIG.SELECTORS.CATEGORY_BTNS).forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.scrollToActiveCategoryBtn(btn);

                    const category = btn.dataset.category;

                    if (category === 'todos') {
                        const searchInput = document.getElementById(CONFIG.SELECTORS.SEARCH_INPUT);
                        if (searchInput && searchInput.value) {
                            searchInput.value = '';
                            const clearBtn = document.getElementById(CONFIG.SELECTORS.CLEAR_SEARCH);
                            if (clearBtn) clearBtn.classList.add('hidden');
                        }
                        this.renderProducts('todos');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    } else {
                        const section = document.getElementById(category);
                        if (section) {
                            const headerOffset = 135;
                            const elementPosition = section.getBoundingClientRect().top;
                            const offsetPosition = elementPosition + window.scrollY - headerOffset;

                            window.scrollTo({
                                top: offsetPosition,
                                behavior: "smooth"
                            });
                        } else {
                            this.renderProducts('todos');
                            setTimeout(() => {
                                const newSection = document.getElementById(category);
                                if (newSection) {
                                    const headerOffset = 135;
                                    const elementPosition = newSection.getBoundingClientRect().top;
                                    const offsetPosition = elementPosition + window.scrollY - headerOffset;
                                    window.scrollTo({ top: offsetPosition, behavior: "smooth" });
                                }
                            }, 120);
                        }
                    }
                }
            });
        }

        // Search Input & Clear Button
        const searchInput = document.getElementById(CONFIG.SELECTORS.SEARCH_INPUT);
        const clearBtn = document.getElementById(CONFIG.SELECTORS.CLEAR_SEARCH);

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const term = e.target.value;
                if (clearBtn) {
                    if (term.length > 0) {
                        clearBtn.classList.remove('hidden');
                    } else {
                        clearBtn.classList.add('hidden');
                    }
                }
                this.renderProducts('todos', term);
            });
        }

        if (clearBtn && searchInput) {
            clearBtn.addEventListener('click', () => {
                searchInput.value = '';
                clearBtn.classList.add('hidden');
                searchInput.focus();
                this.renderProducts('todos', '');
            });
        }
    }

    setupIntersectionObserver() {
        let isUserScrolling = true;

        const observerOptions = {
            root: null,
            rootMargin: '-135px 0px -65% 0px',
            threshold: 0
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && isUserScrolling) {
                    const id = entry.target.id;
                    const btn = document.querySelector(`.category-btn[data-category="${id}"]`);
                    if (btn && !btn.classList.contains('active')) {
                        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        this.scrollToActiveCategoryBtn(btn);
                    }
                }
            });
        }, observerOptions);

        const container = document.getElementById(CONFIG.SELECTORS.PRODUCTS_CONTAINER);
        if (container) {
            const mutationObserver = new MutationObserver(() => {
                document.querySelectorAll('.category-section').forEach(section => {
                    observer.observe(section);
                });
            });

            mutationObserver.observe(container, { childList: true, subtree: true });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MenuApp();
});