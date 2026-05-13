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
        const config = categories.config || {};
        const popup  = config.popup || { title: '', body: '', enabled: false };
        this.configTitle.value = popup.title || '';
        this.configBody.value  = popup.body || '';
        this.configEnabled.checked = !!popup.enabled;

        const sortedCats = CATEGORY_ORDER.filter(c => categories.includes(c));

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

            if (filtered.length === 0) continue;
            anyResults = true;

            const isOpen = this.openCategories.has(cat) || !!term;

            html += `
                <div class="admin-category ${isOpen ? 'open' : ''}" data-category="${cat}">
                    <button class="category-toggle" data-cat="${cat}">
                        <span class="toggle-left">
                            <span>${cat}</span>
                            <span class="cat-count">${filtered.length} item${filtered.length !== 1 ? 's' : ''}</span>
                        </span>
                        <svg class="toggle-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none"
                             stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>
                    <div class="category-products">
                        <div class="product-list">
                            ${filtered.map(p => this.renderProductRow(p, cat)).join('')}
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
        const hasDietChange  = original && (original.veggie !== product.veggie || original.glutenFree !== product.glutenFree);
        const hasTextChange  = original && (original.nombre !== product.nombre || original.descripcion !== product.descripcion);
        const changed = hasPriceChange || hasDietChange || hasTextChange;

        return `
            <div class="product-row ${changed ? 'changed' : ''}" data-id="${product.id}" data-category="${category}">
                <div class="row-info">
                    <div class="row-name" title="${product.nombre}">${product.nombre}</div>
                    ${product.descripcion ? `<div class="row-desc" title="${product.descripcion}">${product.descripcion}</div>` : ''}
                </div>
                
                <div class="row-diet-toggles">
                    <label class="diet-toggle veggie" title="Veggie">
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
        const origConfig = originalData.config || { popup: { title: '', body: '', enabled: false } };
        if (JSON.stringify(curConfig) !== JSON.stringify(origConfig)) {
            count++;
        }

        return count;
    }

    _getUIConfig() {
        return {
            popup: {
                title: this.configTitle.value,
                body: this.configBody.value,
                enabled: this.configEnabled.checked
            }
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

        // Edit Modal Actions
        document.getElementById('btnEditCancel').addEventListener('click', () => this.closeEditProductModal());
        document.getElementById('btnEditApply').addEventListener('click', () => this.applyProductEdit());

        // Popup Config Modal
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
            }
        });
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
                : (curData.config || { popup: { title: '', body: '', enabled: false } });
            
            const origConfig = origData.config || { popup: { title: '', body: '', enabled: false } };
            
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
