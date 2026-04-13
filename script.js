// Resolve branch from URL param, fallback to leloir
const SUCURSALES = {
    leloir:   { label: 'Parque Leloir', file: 'data/productos-leloir.json' },
    castelar: { label: 'Castelar',      file: 'data/productos-castelar.json' },
    pinamar:  { label: 'Pinamar',       file: 'data/productos-pinamar.json' }
};

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
    }

    async loadData() {
        try {
            const response = await fetch(CONFIG.DATA_URL);
            this.products = await response.json();
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    renderCategories() {
        const container = document.getElementById(CONFIG.SELECTORS.CATEGORY_LIST);
        const categories = ['todos', ...Object.keys(this.products)];

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
        const veggieIcon = product.esVegano ? `
            <span class="tag veggie">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="margin-right:4px;">
                    <path d="M17,8C8,10 5.9,16.17 3.82,21.34L5.71,22L6.66,19.7C7.14,19.87 7.64,20 8,20C19,20 22,3 22,3C21,5 14,5.25 9,6.25C4,7.25 2,11.5 2,13.5C2,15.5 3.75,17.25 3.75,17.25C7,8 17,8 17,8Z"/>
                </svg>
                VEGGIE
            </span>` : '';

        const taccIcon = product.sinTacc ? `
            <span class="tag gluten-free">
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

        const categoriesToRender = filterCategory === 'todos'
            ? Object.keys(this.products)
            : [filterCategory];

        categoriesToRender.forEach(cat => {
            const catProducts = this.products[cat];
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