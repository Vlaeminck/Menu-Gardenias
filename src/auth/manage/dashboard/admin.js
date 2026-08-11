/**
 * Admin Panel — Gardenias Price Manager
 * Loads product JSON per branch, provides inline editing,
 * bulk % adjustment, and exports updated JSON.
 */

// Firebase Initialization
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
}
const database = typeof firebase !== 'undefined' ? firebase.database() : null;

const BRANCHES = {
    leloir:   { label: 'Parque Leloir', file: '/data/productos-leloir.json' },
    castelar: { label: 'Castelar',      file: '/data/productos-castelar.json' },
    pinamar:  { label: 'Pinamar',       file: '/data/productos-pinamar.json' }
};

// Orden maestro de categorías (mismo que en script.js)
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

class AdminApp {
    constructor() {
        // State
        this.activeBranch = 'leloir';
        this.branchData   = {};       // { leloir: {...}, castelar: {...}, pinamar: {...} }
        this.originalData = {};       // deep clone for change detection
        this.openCategories = new Set();

        // DOM refs
        this.contentEl     = document.getElementById('adminContent');
        this.loadingEl     = document.getElementById('loadingState');
        this.searchInput   = document.getElementById('adminSearch');
        this.changesLabel  = document.getElementById('changesLabel');
        this.btnSave       = document.getElementById('btnSave');
        this.btnRevert     = document.getElementById('btnRevert');
        this.btnBulkAdjust = document.getElementById('btnBulkAdjust');
        this.btnSyncLocal  = document.getElementById('btnSyncLocal');
        this.btnChanges    = document.getElementById('btnChangesCount');
        this.changesBadge  = document.getElementById('changesCountBadge');

        this.configTitle   = document.getElementById('configPopupTitle');
        this.configBody    = document.getElementById('configPopupBody');
        this.configEnabled = document.getElementById('configPopupEnabled');



        this.checkAuth();
    }

    checkAuth() {
        if (!firebase.auth) {
            console.error('Firebase Auth no cargado');
            return;
        }

        firebase.auth().onAuthStateChanged((user) => {
            if (!user) {
                // No logueado -> Redirigir al login (que estará 2 niveles arriba)
                window.location.href = '../../login.html';
            } else {
                // Logueado -> Quitar escudo y cargar datos
                const shield = document.getElementById('authShield');
                if (shield) {
                    shield.style.opacity = '0';
                    setTimeout(() => shield.remove(), 400);
                }
                this.init();
            }
        });
    }

    async init() {
        await this.loadAllBranches();
        this.render();
        this.bindEvents();
    }

    /* ──────────────────────────────────────────────
       DATA
    ────────────────────────────────────────────── */

    async loadAllBranches() {
        const entries = Object.entries(BRANCHES);
        await Promise.all(entries.map(async ([key, branch]) => {
            try {
                let data = null;

                if (database) {
                    // Intentar leer de Firebase (ruta nueva)
                    let snapshot = await database.ref(`sucursales/${key}`).once('value');
                    data = snapshot.val();

                    // Si no hay datos, intentar ruta vieja para migrar
                    if (!data) {
                        snapshot = await database.ref(`menu/${key}`).once('value');
                        data = snapshot.val();
                    }
                }

                // Si no hay datos en Firebase o no hay DB, cargar local como fallback/base
                if (!data) {
                    const res = await fetch(branch.file);
                    data = await res.json();
                    console.log(`Cargado local para ${key} (Firebase vacío o desconectado)`);
                    
                    // Si tenemos Firebase pero estaba vacío, podemos ofrecer migrar o hacerlo auto
                    if (database) {
                        this._migrateToFirebase(key, data);
                    }
                } else {
                    console.log(`Cargado desde Firebase para ${key}`);
                }

                // Firebase elimina arrays vacíos. Reconstruimos las categorías vacías.
                if (data && data.config && data.config.categoryOrder) {
                    data.config.categoryOrder.forEach(cat => {
                        if (!data[cat] && cat !== 'config') {
                            data[cat] = [];
                        }
                    });
                }

                this.branchData[key] = data;
                this.originalData[key] = JSON.parse(JSON.stringify(data));
            } catch (err) {
                console.error(`Error loading ${key}:`, err);
                this.branchData[key] = {};
                this.originalData[key] = {};
            }
        }));
    }

    async _migrateToFirebase(branch, data) {
        try {
            await database.ref(`sucursales/${branch}`).set(data);
            console.log(`Migración exitosa: ${branch} subido a Firebase.`);
        } catch (e) {
            console.error(`Error migrando ${branch}:`, e);
        }
    }

    /**
     * Forzar la recarga de datos desde los archivos JSON locales
     * y subirlos a Firebase sobreescribiendo lo que haya.
     */
    async forceSyncFromLocal() {
        if (!confirm('¿Sobreescribir Firebase con los datos de los archivos JSON locales?')) return;

        this.loadingEl.classList.remove('hidden');
        this.contentEl.innerHTML = '';

        try {
            const entries = Object.entries(BRANCHES);
            for (const [key, branch] of entries) {
                console.log(`Sincronizando ${key}...`);
                const res = await fetch(branch.file + '?t=' + Date.now()); // Bypass cache
                const data = await res.json();
                
                if (database) {
                    await database.ref(`sucursales/${key}`).set(data);
                }
                
                this.branchData[key] = data;
                this.originalData[key] = JSON.parse(JSON.stringify(data));
            }
            
            this.showToast('✅ Firebase sincronizado con archivos locales');
            this.render(this.searchInput.value);
        } catch (err) {
            console.error('Error en sincronización:', err);
            this.showToast('❌ Error al sincronizar');
        } finally {
            this.loadingEl.classList.add('hidden');
        }
    }

    getCurrentData() {
        return this.branchData[this.activeBranch] || {};
    }

    getOriginalData() {
        return this.originalData[this.activeBranch] || {};
    }

    /* ──────────────────────────────────────────────
       RENDER
    ────────────────────────────────────────────── */

    render(searchTerm = '') {
        this.loadingEl.classList.add('hidden');
        const data = this.getCurrentData();
        const categories = Object.keys(data);

        if (categories.length === 0) {
            this.contentEl.innerHTML = `
                <div class="no-results-admin">
                    <p>No se encontraron productos para esta sucursal.</p>
                </div>`;
            return;
        }

        // Update Branch Config UI
        const config = data.config || {};
        const popup  = config.popup || { title: '', body: '', enabled: false };
        this.configTitle.value = popup.title || '';
        this.configBody.value  = popup.body || '';
        this.configEnabled.checked = !!popup.enabled;

        const savedOrder = config.categoryOrder || [];
        let sortedCats = [];
        if (savedOrder.length > 0) {
            sortedCats = savedOrder.filter(c => categories.includes(c));
            categories.forEach(c => {
                if (c !== 'config' && !sortedCats.includes(c)) sortedCats.push(c);
            });
        } else {
            sortedCats = CATEGORY_ORDER.filter(c => categories.includes(c));
            categories.forEach(c => {
                if (c !== 'config' && !sortedCats.includes(c)) sortedCats.push(c);
            });
        }

        let html = '';
        let anyResults = false;
        const term = searchTerm.toLowerCase().trim();

        for (const cat of sortedCats) {
            const products = data[cat] || [];
            
            const filtered = term
                ? products.filter(p =>
                    p.nombre.toLowerCase().includes(term) ||
                    (p.descripcion && p.descripcion.toLowerCase().includes(term))
                  )
                : products;

            if (term && filtered.length === 0) continue;
            anyResults = true;

            const isOpen = this.openCategories.has(cat) || !!term;
            const disabledCategories = config.disabledCategories || [];
            const isDisabled = disabledCategories.includes(cat);

            html += `
                <div class="admin-category ${isOpen ? 'open' : ''} ${isDisabled ? 'category-disabled' : ''}" data-category="${cat}" draggable="true">
                    <div class="category-header-wrap">
                        <div class="drag-handle" title="Arrastrar para reordenar">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="9" cy="12" r="1"></circle>
                                <circle cx="9" cy="5" r="1"></circle>
                                <circle cx="9" cy="19" r="1"></circle>
                                <circle cx="15" cy="12" r="1"></circle>
                                <circle cx="15" cy="5" r="1"></circle>
                                <circle cx="15" cy="19" r="1"></circle>
                            </svg>
                        </div>
                        <button class="category-toggle" data-cat="${cat}">
                            <span class="toggle-left" style="display: flex; align-items: center; gap: 0.5rem;">
                                <span>${cat}</span>
                                <span class="cat-count">${filtered.length} item${filtered.length !== 1 ? 's' : ''}</span>
                            </span>
                            <svg class="toggle-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none"
                                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <div class="category-visibility-toggle">
                            <button class="btn-options btn-add-product" data-cat="${cat}" title="Agregar producto a esta sección" style="margin-right: 0.5rem; color: #34c759;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                            </button>
                            <button class="btn-options btn-rename-cat" data-cat="${cat}" title="Renombrar categoría" style="margin-right: 0.5rem;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M12 20h9"></path>
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                </svg>
                            </button>
                            <button class="btn-options btn-delete-cat" data-cat="${cat}" title="Eliminar sección" style="margin-right: 0.5rem; color: #e74c3c;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                            <button class="btn-options btn-transfer-cat" data-cat="${cat}" title="Copiar categoría a otra sucursal">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                            </button>
                            <label class="switch" style="margin-left: 0.5rem;" title="${isDisabled ? 'Categoría oculta' : 'Categoría visible'}">
                                <input type="checkbox" class="cat-visibility-input" data-cat="${cat}" ${!isDisabled ? 'checked' : ''}>
                                <span class="slider round"></span>
                            </label>
                        </div>
                    </div>
                    <div class="category-products">
                        <div class="product-list">
                            ${filtered.map(p => this.renderProductRow(p, cat)).join('')}
                            ${filtered.length === 0 ? '<p style="padding: 1rem; color: #999; text-align: center; font-size: 0.85rem; margin: 0;">Esta sección está vacía.</p>' : ''}
                        </div>
                    </div>
                </div>`;
        }

        if (!anyResults) {
            html = `<div class="no-results-admin"><p>No se encontraron productos con "${searchTerm}".</p></div>`;
        }

        this.contentEl.innerHTML = html;
        this.updateChangesUI();
    }

    renderProductRow(product, category) {
        const original = this.getOriginalProduct(product.id, category);
        
        const hasPriceChange = original && original.precio !== product.precio;
        const hasDietChange  = original && (original.vegan !== product.vegan || original.veggie !== product.veggie || original.glutenFree !== product.glutenFree);
        const hasTextChange  = original && (original.nombre !== product.nombre || original.descripcion !== product.descripcion);
        const changed = hasPriceChange || hasDietChange || hasTextChange;

        return `
            <div class="product-row ${changed ? 'changed' : ''}" data-id="${product.id}" data-category="${category}">
                <div class="row-info">
                    <div class="row-name" title="${product.nombre}">${product.nombre}</div>
                    ${product.descripcion ? `<div class="row-desc" title="${product.descripcion}">${product.descripcion}</div>` : ''}
                </div>
                
                <div class="row-diet-toggles">
                    <label class="diet-toggle vegan" title="Vegano">
                        <input type="checkbox" class="diet-input" data-type="vegan" 
                               data-id="${product.id}" data-category="${category}"
                               ${product.vegan ? 'checked' : ''}>
                        <div class="diet-switch"></div>
                        <span class="diet-label">VGN</span>
                    </label>
                    <label class="diet-toggle veggie" title="Vegetariano">
                        <input type="checkbox" class="diet-input" data-type="veggie" 
                               data-id="${product.id}" data-category="${category}"
                               ${product.veggie ? 'checked' : ''}>
                        <div class="diet-switch"></div>
                        <span class="diet-label">VEG</span>
                    </label>
                    <label class="diet-toggle gf" title="Sin TACC">
                        <input type="checkbox" class="diet-input" data-type="glutenFree" 
                               data-id="${product.id}" data-category="${category}"
                               ${product.glutenFree ? 'checked' : ''}>
                        <div class="diet-switch"></div>
                        <span class="diet-label">GF</span>
                    </label>
                </div>

                <div class="row-price">
                    <span class="price-original"${hasPriceChange ? '' : ' style="display:none"'}>$${original ? original.precio.toLocaleString('es-AR') : ''}</span>
                    <div class="price-input-wrap">
                        <span class="price-prefix">$</span>
                        <input type="number" class="price-input ${hasPriceChange ? 'modified' : ''}"
                               value="${product.precio}"
                               data-id="${product.id}"
                               data-category="${category}"
                               min="0" step="100">
                    </div>
                </div>

                <button class="btn-options" data-id="${product.id}" data-category="${category}" title="Editar nombre y descripción">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="12" cy="5" r="1"></circle>
                        <circle cx="12" cy="19" r="1"></circle>
                    </svg>
                </button>
            </div>`;
    }

    getOriginalProduct(productId, category) {
        const origCat = this.getOriginalData()[category];
        if (!origCat) return null;
        return origCat.find(p => p.id === productId) || null;
    }

    /* ──────────────────────────────────────────────
       CHANGE TRACKING
    ────────────────────────────────────────────── */

    countChanges() {
        let count = 0;
        const currentData  = this.getCurrentData();
        const originalData = this.getOriginalData();

        if (!currentData || !originalData) return 0;

        // Check product changes
        for (const cat of Object.keys(currentData)) {
            if (cat === 'config') continue;
            const curProds  = currentData[cat] || [];
            const origProds = originalData[cat] || [];
            curProds.forEach(p => {
                const orig = origProds.find(op => op.id === p.id);
                if (this.isProductChanged(p, orig)) count++;
            });
        }

        // Check Config changes
        const curConfig  = this._getUIConfig();
        const origConfig = originalData.config || { popup: { title: '', body: '', enabled: false }, disabledCategories: [], categoryOrder: [] };
        if (!origConfig.disabledCategories) origConfig.disabledCategories = [];
        if (!origConfig.categoryOrder) origConfig.categoryOrder = [];
        if (JSON.stringify(curConfig) !== JSON.stringify(origConfig)) {
            count++;
        }

        return count;
    }

    _getUIConfig() {
        const data = this.getCurrentData();
        return {
            popup: {
                title: this.configTitle.value,
                body: this.configBody.value,
                enabled: this.configEnabled.checked
            },
            disabledCategories: data.config?.disabledCategories || [],
            categoryOrder: data.config?.categoryOrder || []
        };
    }

    updateChangesUI() {
        const count = this.countChanges();
        const hasChanges = count > 0;

        this.changesLabel.textContent = hasChanges
            ? `${count} cambio${count !== 1 ? 's' : ''} pendiente${count !== 1 ? 's' : ''}`
            : 'Sin cambios';
        this.changesLabel.classList.toggle('has-changes', hasChanges);

        this.btnSave.disabled   = !hasChanges;
        this.btnRevert.disabled = !hasChanges;

        if (hasChanges) {
            this.btnChanges.classList.remove('hidden');
            this.changesBadge.textContent = count;
        } else {
            this.btnChanges.classList.add('hidden');
        }
    }

    /* ──────────────────────────────────────────────
       EVENTS
    ────────────────────────────────────────────── */

    bindEvents() {
        // Branch tabs
        document.getElementById('branchTabs').addEventListener('click', (e) => {
            const tab = e.target.closest('.branch-tab');
            if (!tab) return;

            document.querySelectorAll('.branch-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            this.activeBranch = tab.dataset.branch;
            this.openCategories.clear();
            this.searchInput.value = '';
            this.render();
        });

        // Delegate content events
        this.contentEl.addEventListener('click', (e) => {
            // Add Product to Category
            const addProductBtn = e.target.closest('.btn-add-product');
            if (addProductBtn) {
                this.addProductToCategory(addProductBtn.dataset.cat);
                return;
            }

            // Rename Category
            const renameBtn = e.target.closest('.btn-rename-cat');
            if (renameBtn) {
                this.renameCategory(renameBtn.dataset.cat);
                return;
            }

            // Delete Category
            const deleteCatBtn = e.target.closest('.btn-delete-cat');
            if (deleteCatBtn) {
                this.deleteCategory(deleteCatBtn.dataset.cat);
                return;
            }

            // Transfer Category
            const transferBtn = e.target.closest('.btn-transfer-cat');
            if (transferBtn) {
                this.openTransferCategoryModal(transferBtn.dataset.cat);
                return;
            }

            // Category Toggle
            const toggle = e.target.closest('.category-toggle');
            if (toggle) {
                const cat = toggle.dataset.cat;
                const section = toggle.closest('.admin-category');
                if (this.openCategories.has(cat)) {
                    this.openCategories.delete(cat);
                    section.classList.remove('open');
                } else {
                    this.openCategories.add(cat);
                    section.classList.add('open');
                }
                return;
            }

            // Options Button
            const optBtn = e.target.closest('.btn-options');
            if (optBtn) {
                this.openEditProductModal(parseInt(optBtn.dataset.id, 10), optBtn.dataset.category);
            }
        });

        this.contentEl.addEventListener('input', (e) => {
            if (e.target.classList.contains('price-input')) {
                const id = parseInt(e.target.dataset.id, 10);
                const category = e.target.dataset.category;
                const newPrice = parseInt(e.target.value, 10) || 0;
                this.updateProductProperty(id, category, 'precio', newPrice);
            }
        });

        this.contentEl.addEventListener('change', (e) => {
            if (e.target.classList.contains('diet-input')) {
                const id = parseInt(e.target.dataset.id, 10);
                const category = e.target.dataset.category;
                const prop = e.target.dataset.type; // 'veggie' or 'glutenFree'
                this.updateProductProperty(id, category, prop, e.target.checked);
            }
            if (e.target.classList.contains('cat-visibility-input')) {
                const cat = e.target.dataset.cat;
                this.toggleCategoryVisibility(cat, e.target.checked);
            }
        });

        // Search
        this.searchInput.addEventListener('input', (e) => {
            this.render(e.target.value);
        });

        // Save directly to server
        this.btnSave.addEventListener('click', (e) => {
            if (e.shiftKey) {
                this.downloadAllChangedJSON();
            } else {
                this.saveAllChanges();
            }
        });

        // Revert
        this.btnRevert.addEventListener('click', () => this.revertAll());

        // Bulk adjust
        this.btnBulkAdjust.addEventListener('click', () => this.openBulkModal());
        document.getElementById('btnBulkCancel').addEventListener('click', () => this.closeBulkModal());
        document.getElementById('btnBulkApply').addEventListener('click', () => this.applyBulkAdjust());

        // Setup events for Branch Config
        [this.configTitle, this.configBody].forEach(el => {
            el.addEventListener('input', () => this.updateChangesUI());
        });
        this.configEnabled.addEventListener('change', () => this.updateChangesUI());

        // Force Sync from Local JSON
        this.btnSyncLocal.addEventListener('click', () => this.forceSyncFromLocal());

        // Export JSON
        const btnExportJSON = document.getElementById('btnExportJSON');
        if (btnExportJSON) {
            btnExportJSON.addEventListener('click', () => {
                const json = JSON.stringify(this.branchData[this.activeBranch], null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href     = url;
                a.download = `productos-${this.activeBranch}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                this.showToast(`📥 Archivo JSON descargado`);
            });
        }

        // New Category
        const btnNewCat = document.getElementById('btnNewCategory');
        if (btnNewCat) {
            btnNewCat.addEventListener('click', () => this.createNewCategory());
        }

        // Drag and Drop for Categories
        this.contentEl.addEventListener('dragstart', (e) => {
            const catEl = e.target.closest('.admin-category');
            if (catEl) {
                catEl.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            }
        });

        this.contentEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            const dragging = this.contentEl.querySelector('.dragging');
            if (!dragging) return;
            const catEl = e.target.closest('.admin-category');
            if (catEl && catEl !== dragging) {
                const rect = catEl.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                if (e.clientY < mid) {
                    catEl.parentNode.insertBefore(dragging, catEl);
                } else {
                    catEl.parentNode.insertBefore(dragging, catEl.nextSibling);
                }
            }
        });

        this.contentEl.addEventListener('dragend', (e) => {
            const catEl = e.target.closest('.admin-category');
            if (catEl) {
                catEl.classList.remove('dragging');
                this.saveNewCategoryOrder();
            }
        });

        // Edit Modal Actions
        document.getElementById('btnEditCancel').addEventListener('click', () => this.closeEditProductModal());
        document.getElementById('btnEditApply').addEventListener('click', () => this.applyProductEdit());

        // Transfer Modal Actions
        document.getElementById('btnTransferCancel').addEventListener('click', () => this.closeTransferCategoryModal());
        document.getElementById('btnTransferApply').addEventListener('click', () => this.applyTransferCategory());

        // Close Modals on click outsideal
        const btnConfigPopup = document.getElementById('btnConfigPopup');
        const modalConfig = document.getElementById('popupConfigModal');
        const btnConfigCancel = document.getElementById('btnConfigCancel');
        const btnConfigApply = document.getElementById('btnConfigApply');

        btnConfigPopup.onclick = () => {
            // Sincronizar campos con los datos actuales antes de abrir
            const data = this.getCurrentData();
            const popup = (data.config && data.config.popup) || { title: '', body: '', enabled: false };
            this.configTitle.value = popup.title || '';
            this.configBody.value = popup.body || '';
            this.configEnabled.checked = !!popup.enabled;

            modalConfig.classList.remove('hidden');
            setTimeout(() => modalConfig.classList.add('show'), 10);
        };

        btnConfigCancel.onclick = () => {
            modalConfig.classList.remove('show');
            setTimeout(() => modalConfig.classList.add('hidden'), 250);
        };

        btnConfigApply.onclick = () => {
            this.updateChangesUI();
            btnConfigCancel.click();
            this.showToast('✅ Configuración de popup lista para guardar');
        };

        // Close modals on overlay click
        [document.getElementById('bulkModal'), document.getElementById('editProductModal'), modalConfig].forEach(modal => {
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === e.currentTarget) {
                        this.closeBulkModal();
                        this.closeEditProductModal();
                    }
                });
            }
        });

        // Keyboard: Escape closes modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeBulkModal();
                this.closeEditProductModal();
                this.closeTransferCategoryModal();
            }
        });
    }

    addProductToCategory(catName) {
        const data = this.getCurrentData();
        if (!data[catName]) data[catName] = [];

        const newProduct = {
            id: Date.now(),
            nombre: "Nuevo producto",
            descripcion: "",
            precio: 0,
            vegan: false,
            veggie: false,
            glutenFree: false
        };

        data[catName].unshift(newProduct);
        this.openCategories.add(catName);
        this.updateChangesUI();
        this.render();
        this.showToast(`✨ Producto agregado a "${catName}"`);
    }

    createNewCategory() {
        let catName = prompt('Introduce el nombre de la nueva categoría (preferiblemente en mayúsculas):');
        if (!catName || !catName.trim()) return;
        
        catName = catName.trim().toUpperCase();
        const data = this.getCurrentData();
        
        if (data[catName]) {
            alert('Esta categoría ya existe en esta sucursal.');
            return;
        }

        // Create category with a dummy product so it doesn't get dropped by Firebase
        data[catName] = [{
            id: Date.now(),
            nombre: "NUEVO PRODUCTO",
            descripcion: "Editar nombre y precio",
            precio: 0,
            veggie: false,
            glutenFree: false
        }];
        
        // Add to categoryOrder
        if (!data.config) data.config = {};
        if (!data.config.categoryOrder) {
            const existingCategories = Object.keys(data).filter(c => c !== 'config');
            data.config.categoryOrder = CATEGORY_ORDER.filter(c => existingCategories.includes(c));
            existingCategories.forEach(c => {
                if (!data.config.categoryOrder.includes(c)) data.config.categoryOrder.push(c);
            });
        }
        
        if (!data.config.categoryOrder.includes(catName)) {
            data.config.categoryOrder.push(catName);
        }

        this.openCategories.add(catName);
        this.updateChangesUI();
        this.render();
        this.showToast(`✅ Categoría "${catName}" creada`);

        // Scroll to the new category and highlight it
        setTimeout(() => {
            const newCatEl = document.querySelector(`.admin-category[data-category="${catName}"]`);
            if (newCatEl) {
                newCatEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                newCatEl.style.transition = 'box-shadow 0.3s ease, border-color 0.3s ease';
                newCatEl.style.boxShadow = '0 0 0 3px rgba(52, 199, 89, 0.4)';
                newCatEl.style.borderColor = '#34c759';
                setTimeout(() => {
                    newCatEl.style.boxShadow = '';
                    newCatEl.style.borderColor = '';
                }, 2000);
            }
        }, 100);
    }

    renameCategory(oldName) {
        const name = prompt('Introduce el nuevo nombre para la categoría:', oldName);
        if (!name) return;
        const newName = name.trim().toUpperCase();
        if (!newName || newName === oldName) return;

        const data = this.getCurrentData();
        if (data[newName]) {
            alert('Ya existe una categoría con ese nombre.');
            return;
        }

        // Move data
        data[newName] = data[oldName];
        delete data[oldName];

        // Update category order
        if (data.config && data.config.categoryOrder) {
            const index = data.config.categoryOrder.indexOf(oldName);
            if (index !== -1) {
                data.config.categoryOrder[index] = newName;
            }
        }

        // Update disabled categories
        if (data.config && data.config.disabledCategories) {
            const index = data.config.disabledCategories.indexOf(oldName);
            if (index !== -1) {
                data.config.disabledCategories[index] = newName;
            }
        }

        // Update openCategories state
        if (this.openCategories.has(oldName)) {
            this.openCategories.delete(oldName);
            this.openCategories.add(newName);
        }

        this.updateChangesUI();
        this.render();
        this.showToast(`✅ Categoría renombrada a "${newName}"`);
    }

    deleteCategory(catName) {
        if (!confirm(`¿Estás seguro de que deseas eliminar la sección "${catName}" y todos sus productos? Esta acción no se puede deshacer.`)) {
            return;
        }

        const data = this.getCurrentData();
        
        // Remove from data
        delete data[catName];

        // Remove from categoryOrder
        if (data.config && data.config.categoryOrder) {
            data.config.categoryOrder = data.config.categoryOrder.filter(c => c !== catName);
        }

        // Remove from disabledCategories
        if (data.config && data.config.disabledCategories) {
            data.config.disabledCategories = data.config.disabledCategories.filter(c => c !== catName);
        }

        // Remove from openCategories
        this.openCategories.delete(catName);

        this.updateChangesUI();
        this.render();
        this.showToast(`🗑️ Sección "${catName}" eliminada`);
    }

    openTransferCategoryModal(catName) {
        document.getElementById('transferCatName').value = catName;
        const select = document.getElementById('transferTargetBranch');
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value === this.activeBranch) {
                select.options[i].style.display = 'none';
            } else {
                select.options[i].style.display = 'block';
            }
        }
        select.value = select.options[0].value === this.activeBranch ? select.options[1].value : select.options[0].value;
        
        const modal = document.getElementById('transferCategoryModal');
        modal.classList.remove('hidden');
        void modal.offsetWidth;
        modal.classList.add('show');
    }

    closeTransferCategoryModal() {
        const modal = document.getElementById('transferCategoryModal');
        modal.classList.remove('show');
        setTimeout(() => modal.classList.add('hidden'), 200);
    }

    applyTransferCategory() {
        const catName = document.getElementById('transferCatName').value;
        const targetBranch = document.getElementById('transferTargetBranch').value;
        if (!catName || !targetBranch || targetBranch === this.activeBranch) return;

        const sourceData = this.branchData[this.activeBranch];
        const targetData = this.branchData[targetBranch];
        
        targetData[catName] = JSON.parse(JSON.stringify(sourceData[catName] || []));
        
        if (!targetData.config) targetData.config = {};
        if (!targetData.config.categoryOrder) {
            const existingCategories = Object.keys(targetData).filter(c => c !== 'config');
            targetData.config.categoryOrder = CATEGORY_ORDER.filter(c => existingCategories.includes(c));
            existingCategories.forEach(c => {
                if (!targetData.config.categoryOrder.includes(c)) targetData.config.categoryOrder.push(c);
            });
        }
        if (!targetData.config.categoryOrder.includes(catName)) {
            targetData.config.categoryOrder.push(catName);
        }

        this.closeTransferCategoryModal();
        this.updateChangesUI();
        this.showToast(`✅ Categoría copiada a ${targetBranch}`);
    }

    saveNewCategoryOrder() {
        const categories = [...this.contentEl.querySelectorAll('.admin-category')].map(el => el.dataset.category);
        const data = this.getCurrentData();
        if (!data.config) data.config = {};
        data.config.categoryOrder = categories;
        this.updateChangesUI();
    }

    toggleCategoryVisibility(cat, isEnabled) {
        const data = this.getCurrentData();
        if (!data.config) data.config = {};
        if (!data.config.disabledCategories) data.config.disabledCategories = [];
        
        const disabled = data.config.disabledCategories;
        if (isEnabled) {
            data.config.disabledCategories = disabled.filter(c => c !== cat);
        } else {
            if (!disabled.includes(cat)) {
                disabled.push(cat);
            }
        }
        
        this.render(this.searchInput.value);
    }

    updateProductProperty(productId, category, prop, value) {
        const products = this.getCurrentData()[category];
        if (!products) return;

        const product = products.find(p => p.id === productId);
        if (product) {
            product[prop] = value;
            
            // Si el cambio es el precio, solo actualizamos la clase visual de la fila
            // para NO perder el foco (render() borraría el input activo).
            if (prop === 'precio') {
                const row = document.querySelector(`.product-row[data-id="${productId}"][data-category="${category}"]`);
                if (row) {
                    const original = this.getOriginalProduct(productId, category);
                    const hasPriceChange = original && original.precio !== product.precio;
                    
                    row.classList.toggle('changed', this.isProductChanged(product, original));
                    const input = row.querySelector('.price-input');
                    if (input) input.classList.toggle('modified', hasPriceChange);
                    
                    const origSpan = row.querySelector('.price-original');
                    if (origSpan) {
                        origSpan.style.display = hasPriceChange ? 'inline' : 'none';
                        if (original) origSpan.textContent = `$${original.precio.toLocaleString('es-AR')}`;
                    }
                }
            } else {
                // Para cambios de texto o dietas, re-renderizamos para que se vea el cambio visual (chips, etc)
                this.render(this.searchInput.value);
            }
            
            this.updateChangesUI();
        }
    }

    isProductChanged(p, orig) {
        if (!orig) return true;
        return orig.precio !== p.precio || 
               orig.vegan !== p.vegan ||
               orig.veggie !== p.veggie || 
               orig.glutenFree !== p.glutenFree ||
               orig.nombre !== p.nombre ||
               orig.descripcion !== p.descripcion;
    }

    /* ──────────────────────────────────────────────
       ACTIONS
    ────────────────────────────────────────────── */

    /**
     * Save changes directly to the server via POST /api/save-prices.
     * Each changed branch is saved individually.
     */
    async saveAllChanges() {
        const changedBranches = this._getChangedBranches();

        if (changedBranches.length === 0) return;

        this.btnSave.disabled = true;
        this.btnSave.innerHTML = `
            <div class="spinner" style="width:14px;height:14px;border-width:2px;"></div>
            Guardando…`;

        let savedCount = 0;
        let errors = [];

        for (const branch of changedBranches) {
            try {
                if (database) {
                    const data = this.branchData[branch];
                    // Update config from UI if it's the active branch
                    if (branch === this.activeBranch) {
                        data.config = this._getUIConfig();
                    }
                    // Guardar en Firebase
                    await database.ref(`sucursales/${branch}`).set(data);
                    savedCount++;
                } else {
                    // Fallback al servidor Python local si no hay Firebase
                    const res = await fetch('/api/save-prices', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            branch: branch,
                            data: this.branchData[branch]
                        })
                    });

                    const result = await res.json();
                    if (res.ok && result.status === 'success') {
                        savedCount++;
                    } else {
                        errors.push(`${branch}: ${result.message}`);
                    }
                }
            } catch (err) {
                errors.push(`${branch}: ${err.message}`);
            }
        }

        // Restore button
        this.btnSave.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            Guardar`;

        if (errors.length > 0) {
            this.showToast(`❌ Error: ${errors.join(', ')}`);
            this.btnSave.disabled = false;
        } else {
            this.showToast(`✅ ${savedCount} sucursal${savedCount > 1 ? 'es' : ''} guardada${savedCount > 1 ? 's' : ''}`);

            // Update original data to match current (mark as saved)
            for (const branch of Object.keys(BRANCHES)) {
                this.originalData[branch] = JSON.parse(JSON.stringify(this.branchData[branch]));
            }
            this.render(this.searchInput.value);
        }
    }

    /**
     * Fallback: Download changed JSON files (Shift+click on save button).
     */
    downloadAllChangedJSON() {
        const changedBranches = this._getChangedBranches();
        let count = 0;

        for (const branch of changedBranches) {
            const json = JSON.stringify(this.branchData[branch], null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `productos-${branch}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            count++;
        }

        if (count > 0) {
            this.showToast(`📥 ${count} archivo${count > 1 ? 's' : ''} descargado${count > 1 ? 's' : ''}`);
            for (const branch of Object.keys(BRANCHES)) {
                this.originalData[branch] = JSON.parse(JSON.stringify(this.branchData[branch]));
            }
            this.render(this.searchInput.value);
        }
    }

    _getChangedBranches() {
        const changed = [];
        for (const branch of Object.keys(BRANCHES)) {
            const current  = this.branchData[branch] || {};
            const original = this.originalData[branch] || {};
            let hasChanges = false;

            for (const cat of Object.keys(current)) {
                if (cat === 'config') continue;
                const curProds  = current[cat] || [];
                const origProds = original[cat] || [];
                for (const p of curProds) {
                    const orig = origProds.find(op => op.id === p.id);
                    if (this.isProductChanged(p, orig)) {
                        hasChanges = true;
                        break;
                    }
                }
                if (hasChanges) break;
            }

            if (hasChanges) {
                changed.push(branch);
                continue;
            }

            // Check Config change for this branch
            const curData  = this.branchData[branch];
            const origData = this.originalData[branch];
            const curConfig = (branch === this.activeBranch) 
                ? this._getUIConfig() 
                : (curData.config || { popup: { title: '', body: '', enabled: false }, disabledCategories: [], categoryOrder: [] });
            if (!curConfig.disabledCategories) curConfig.disabledCategories = [];
            if (!curConfig.categoryOrder) curConfig.categoryOrder = [];
            
            const origConfig = origData.config || { popup: { title: '', body: '', enabled: false }, disabledCategories: [], categoryOrder: [] };
            if (!origConfig.disabledCategories) origConfig.disabledCategories = [];
            if (!origConfig.categoryOrder) origConfig.categoryOrder = [];
            
            if (JSON.stringify(curConfig) !== JSON.stringify(origConfig)) {
                changed.push(branch);
            }
        }
        return changed;
    }

    revertAll() {
        if (!confirm('¿Deshacer todos los cambios de todas las sucursales?')) return;

        for (const branch of Object.keys(BRANCHES)) {
            this.branchData[branch] = JSON.parse(JSON.stringify(this.originalData[branch]));
        }
        this.render(this.searchInput.value);
        this.showToast('↩️ Todos los cambios revertidos');
    }

    /* ──────────────────────────────────────────────
       BULK ADJUSTMENT
    ────────────────────────────────────────────── */

    openBulkModal() {
        const modal = document.getElementById('bulkModal');
        const select = document.getElementById('bulkCategory');

        // Populate categories
        const categories = Object.keys(this.getCurrentData());
        select.innerHTML = `<option value="__all__">Todas las categorías</option>` +
            categories.map(c => `<option value="${c}">${c}</option>`).join('');

        // Reset
        document.getElementById('bulkPercent').value = '';

        modal.classList.remove('hidden');
        requestAnimationFrame(() => modal.classList.add('show'));
        document.getElementById('bulkPercent').focus();
    }

    closeBulkModal() {
        const modal = document.getElementById('bulkModal');
        modal.classList.remove('show');
        setTimeout(() => modal.classList.add('hidden'), 250);
    }

    applyBulkAdjust() {
        const percent  = parseFloat(document.getElementById('bulkPercent').value);
        const category = document.getElementById('bulkCategory').value;
        const rounding = parseInt(document.querySelector('input[name="rounding"]:checked').value, 10);

        if (isNaN(percent) || percent === 0) {
            this.showToast('⚠️ Ingresá un porcentaje válido');
            return;
        }

        const data = this.getCurrentData();
        const cats = category === '__all__' ? Object.keys(data) : [category];
        let count  = 0;

        cats.forEach(cat => {
            const products = data[cat];
            if (!products) return;
            products.forEach(p => {
                const newPrice = p.precio * (1 + percent / 100);
                p.precio = rounding > 0
                    ? Math.round(newPrice / rounding) * rounding
                    : Math.round(newPrice);
                count++;
            });
        });

        this.closeBulkModal();
        this.render(this.searchInput.value);
        const sign = percent > 0 ? '+' : '';
        this.showToast(`💰 ${sign}${percent}% aplicado a ${count} producto${count !== 1 ? 's' : ''}`);
    }

    /* ──────────────────────────────────────────────
       EDIT PRODUCT MODAL
    ────────────────────────────────────────────── */

    openEditProductModal(productId, category) {
        const products = this.getCurrentData()[category];
        if (!products) return;
        const product = products.find(p => p.id === productId);
        if (!product) return;

        document.getElementById('editProdId').value = productId;
        document.getElementById('editProdCat').value = category;
        document.getElementById('editProdName').value = product.nombre || '';
        document.getElementById('editProdDesc').value = product.descripcion || '';

        const modal = document.getElementById('editProductModal');
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.add('show'), 10);
    }

    closeEditProductModal() {
        const modal = document.getElementById('editProductModal');
        modal.classList.remove('show');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }

    applyProductEdit() {
        const id = parseInt(document.getElementById('editProdId').value, 10);
        const cat = document.getElementById('editProdCat').value;
        const newName = document.getElementById('editProdName').value.trim();
        const newDesc = document.getElementById('editProdDesc').value.trim();

        if (!newName) {
            this.showToast('⚠️ El nombre es obligatorio');
            return;
        }

        const products = this.getCurrentData()[cat];
        const product = products.find(p => p.id === id);
        if (product) {
            product.nombre = newName;
            product.descripcion = newDesc;
            
            this.render(this.searchInput.value);
            this.updateChangesUI();
            this.closeEditProductModal();
            this.showToast('✅ Producto actualizado');
        }
    }

    /* ──────────────────────────────────────────────
       TOAST
    ────────────────────────────────────────────── */

    showToast(msg) {
        const toast = document.getElementById('toast');
        const msgEl = document.getElementById('toastMsg');
        msgEl.textContent = msg;
        toast.classList.remove('hidden');
        requestAnimationFrame(() => toast.classList.add('show'));

        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, 2500);
    }
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
    new AdminApp();
});
