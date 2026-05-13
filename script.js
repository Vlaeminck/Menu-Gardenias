// Firebase Initialization
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
}
const database = typeof firebase !== 'undefined' ? firebase.database() : null;

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
        CATEGORY_BTNS: '.category-btn'
    }
};

class MenuApp {
    constructor() {
        this.products = {};
        this.categoriesInfo = {
            'todos': { titulo: 'Menu Completo', descripcion: '' },
            'Desayunos & Meriendas': {
                titulo: 'Desayunos & Meriendas',
                descripcion: 'Disfruta nuestros desayunos de 9 a 12hs & Meriendas de 16 a 20hs. Incluyen infusión + vasito de soda.'
            },
            'Adicionales': { titulo: 'Adicionales', descripcion: 'Complementos perfectos.' },
            'Delicias': { titulo: 'Delicias', descripcion: 'Panadería y pastelería artesanal.' },
            'Postres & Tortas': { titulo: 'Postres & Tortas', descripcion: 'Dulces tentaciones.' },
            'Platitos & Picadas': { titulo: 'Platitos & Picadas', descripcion: 'Para compartir.' },
            'Tostones': { titulo: 'Tostones', descripcion: 'Nuestras famosas tostadas.' },
            'Ensaladas': { titulo: 'Ensaladas', descripcion: 'Frescas y saludables.' },
            'Carnes': { titulo: 'Almuerzos', descripcion: 'Cocina abierta de 12 a 16hs.' },
            'Bebidas': { titulo: 'Bebidas', descripcion: 'Refrescantes.' },
            'Tragos': { titulo: 'Tragos', descripcion: 'Coctelería clásica y de autor.' },
            'Vinos': { titulo: 'Vinos', descripcion: 'Selección exclusiva.' }
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

    async loadData() {
        try {
            if (database) {
                // 1. Intentar con la ruta nueva 'sucursales'
                let snapshot = await database.ref(`sucursales/${_urlParam}`).once('value');
                let data = snapshot.val();

                // 2. Si está vacío, intentar con la ruta vieja 'menu'
                if (!data) {
                    snapshot = await database.ref(`menu/${_urlParam}`).once('value');
                    data = snapshot.val();
                }

                // 3. Si sigue vacío, cargar de los archivos locales
                if (!data) {
                    const response = await fetch(CONFIG.DATA_URL);
                    data = await response.json();
                    console.log('Cargado de backup local (Firebase vacío)');
                } else {
                    console.log('Cargado desde Firebase');
                }
                
                this.currentData = data || {};
            } else {
                // Fallback directo si no hay conexión a Firebase
                const response = await fetch(CONFIG.DATA_URL);
                this.currentData = await response.json();
            }
        } catch (error) {
            console.error('Error loading data:', error);
            // Último recurso: intentar cargar local sí o sí
            try {
                const response = await fetch(CONFIG.DATA_URL);
                this.currentData = await response.json();
            } catch(e) {}
        }
    }

    renderCategories() {
        const container = document.getElementById(CONFIG.SELECTORS.CATEGORY_LIST);
        
        // Ordenar categorías según CATEGORY_ORDER (ignorando 'config')
        const existingCategories = Object.keys(this.currentData).filter(cat => cat !== 'config');
        const sortedCategories = CATEGORY_ORDER.filter(cat => existingCategories.includes(cat));
        
        // Agregar cualquier categoría extra que no esté en el orden definido
        existingCategories.forEach(cat => {
            if (!sortedCategories.includes(cat)) sortedCategories.push(cat);
        });

        const categories = ['todos', ...sortedCategories];

        container.innerHTML = categories.map(cat => `
            <li>
                <button class="category-btn ${cat === 'todos' ? 'active' : ''}" 
                        data-category="${cat}">
                    ${cat.replace(/_/g, ' ')}
                </button>
            </li>
        `).join('');
    }

    createProductCard(product) {
        const veggieIcon = product.veggie ? `
            <span class="tag veggie" title="Vegetariano">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="margin-right:4px;">
                    <path d="M17,8C8,10 5.9,16.17 3.82,21.34L5.71,22L6.66,19.7C7.14,19.87 7.64,20 8.17,20C12.5,20 16,16.5 16,12.17C16,12.13 16,12.09 16,12.05C16.5,12 17,11.5 17,11C17,10.5 16.5,10 16,10C16,8.67 16.5,7.33 17.5,6.33C18.5,5.33 20,5 21,5C21,4 20,3 19,3C18,3 16.67,3.5 15.67,4.5C14.67,5.5 14,7 14,8C13,8 12,9 12,10C12,10.5 12.5,11 13,11C13.04,11 13.08,11 13.12,11C13.04,11.38 13,11.77 13,12.17C13,14.82 10.82,17 8.17,17C7.84,17 7.5,16.95 7.2,16.86L17,8Z"/>
                </svg>
                VEGGIE
            </span>` : '';

        const taccIcon = product.glutenFree ? `
            <span class="tag tacc" title="Sin TACC">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="margin-right:4px;">
                     <path d="M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z"/>
                </svg>
                S/TACC
            </span>` : '';

        return `
            <div class="product-card">
                <div class="product-header">
                    <h3 class="product-name">${product.nombre}</h3>
                    <div class="dots"></div>
                    <span class="product-price">$${product.precio.toLocaleString('es-AR')}</span>
                </div>
                ${product.descripcion ? `<p class="product-description">${product.descripcion}</p>` : ''}
                <div class="product-tags">
                    ${veggieIcon}
                    ${taccIcon}
                </div>
            </div>
        `;
    }

    renderProducts(filterCategory = 'todos', searchTerm = '') {
        const container = document.getElementById(CONFIG.SELECTORS.PRODUCTS_CONTAINER);
        let content = '';

        const existingCategories = Object.keys(this.currentData).filter(cat => cat !== 'config');
        let categoriesToRender = [];

        if (filterCategory === 'todos') {
            // Seguir el orden definido en CATEGORY_ORDER
            categoriesToRender = CATEGORY_ORDER.filter(cat => existingCategories.includes(cat));
            // Agregar extras
            existingCategories.forEach(cat => {
                if (!categoriesToRender.includes(cat)) categoriesToRender.push(cat);
            });
        } else {
            categoriesToRender = [filterCategory];
        }

        categoriesToRender.forEach(cat => {
            const catProducts = this.currentData[cat];
            if (!catProducts || catProducts.length === 0) return;

            // Filter by search term
            const filteredProducts = catProducts.filter(p => {
                if (!searchTerm) return true;
                const term = searchTerm.toLowerCase();
                return p.nombre.toLowerCase().includes(term) ||
                    (p.descripcion && p.descripcion.toLowerCase().includes(term));
            });

            if (filteredProducts.length > 0) {
                const info = this.categoriesInfo[cat] || { titulo: cat, descripcion: '' };

                content += `
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
            }
        });

        if (content === '') {
            content = '<div class="no-results"><p>No se encontraron productos.</p></div>';
        }

        container.innerHTML = content;
    }

    setupEventListeners() {
        // Category Navigation
        document.getElementById(CONFIG.SELECTORS.CATEGORY_LIST).addEventListener('click', (e) => {
            if (e.target.classList.contains('category-btn')) {
                // Update active state
                document.querySelectorAll(CONFIG.SELECTORS.CATEGORY_BTNS).forEach(btn =>
                    btn.classList.remove('active'));
                e.target.classList.add('active');

                const category = e.target.dataset.category;

                if (category === 'todos') {
                    this.renderProducts('todos');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                    // If we are in 'todos' view (or filtered view), we might want to just scroll to section
                    // But for simplicity in this version, we will re-render "todos" to ensure all sections exist
                    // and then scroll, OR implement single-category view.
                    // Let's implement Scroll to Section if "todos" is active, otherwise specific view.

                    // Current design choice: One long scroll for "todos", specific list for others?
                    // To keep it simple and premium (like a real menu), let's stick to "All items" view mainly,
                    // and buttons just scroll.

                    const section = document.getElementById(category);
                    if (section) {
                        // Section exists, scroll to it
                        const headerOffset = 180; // Adjust for sticky header
                        const elementPosition = section.getBoundingClientRect().top;
                        const offsetPosition = elementPosition + window.scrollY - headerOffset;

                        window.scrollTo({
                            top: offsetPosition,
                            behavior: "smooth"
                        });
                    } else {
                        // Section doesn't exist (maybe we were in search mode or single cat mode)
                        // Reset to todos and then scroll
                        this.renderProducts('todos');
                        // Allow DOM to update then scroll
                        setTimeout(() => {
                            const newSection = document.getElementById(category);
                            if (newSection) {
                                const headerOffset = 180;
                                const elementPosition = newSection.getBoundingClientRect().top;
                                const offsetPosition = elementPosition + window.scrollY - headerOffset;
                                window.scrollTo({ top: offsetPosition, behavior: "smooth" });
                            }
                        }, 100);
                    }
                }
            }
        });

        // Search
        const searchInput = document.getElementById(CONFIG.SELECTORS.SEARCH_INPUT);
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value;
            this.renderProducts('todos', term);
        });
    }

    setupIntersectionObserver() {
        // Optional: Highlight category button on scroll
        // This is a bit complex with dynamic height content, but good for premium feel
        const observerOptions = {
            root: null,
            rootMargin: '-150px 0px -70% 0px', // Trigger when section is near top
            threshold: 0
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.id;
                    const btn = document.querySelector(`.category-btn[data-category="${id}"]`);
                    if (btn) {
                        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        // Scroll nav to button
                        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                    }
                }
            });
        }, observerOptions);

        // Observe sections (needs to be attached after render)
        // We'll attach this in a MutationObserver or just periodically check/reattach?
        // Simpler: re-attach after renderProducts
        const container = document.getElementById(CONFIG.SELECTORS.PRODUCTS_CONTAINER);
        const mutationObserver = new MutationObserver(() => {
            document.querySelectorAll('.category-section').forEach(section => {
                observer.observe(section);
            });
        });

        mutationObserver.observe(container, { childList: true, subtree: true });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MenuApp();

    // iOS Alert Logic
    const popupOverlay = document.getElementById('iosOverlay');
    const closeBtn = document.getElementById('closePopup');

    if (popupOverlay) {
        // Activate correct branch popup content
        const branchPopup = document.getElementById(`popup-${_urlParam}`);
        if (branchPopup) {
            branchPopup.classList.remove('hidden');
        }

        // Mostrar popup extra si está activado
        if (SHOW_EXTRA_POPUP) {
            const extraPopup = document.getElementById('popup-extra');
            if (extraPopup) extraPopup.classList.remove('hidden');
        }

        // Show after 2 seconds
        setTimeout(() => {
            popupOverlay.classList.remove('hidden');
            // Small delay to trigger transition
            requestAnimationFrame(() => {
                popupOverlay.classList.add('show');
            });
        }, 2000);

        closeBtn.addEventListener('click', () => {
            popupOverlay.classList.remove('show');
            // Wait for transition end to hide display
            setTimeout(() => {
                popupOverlay.classList.add('hidden');
            }, 300);
        });
    }
}); 