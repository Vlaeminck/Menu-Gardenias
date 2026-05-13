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
    leloir:   { label: 'Parque Leloir', file: 'data/productos-leloir.json' },
    castelar: { label: 'Castelar',      file: 'data/productos-castelar.json' },
    pinamar:  { label: 'Pinamar',       file: 'data/productos-pinamar.json' }
};

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
        this.btnChanges    = document.getElementById('btnChangesCount');
        this.changesBadge  = document.getElementById('changesCountBadge');

        this.init();
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
                    // Intentar leer de Firebase
                    const snapshot = await database.ref(`sucursales/${key}`).once('value');
                    data = snapshot.val();
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

        const term = searchTerm.toLowerCase().trim();
        let html = '';
        let anyResults = false;

        categories.forEach(cat => {
            const products = data[cat];
            if (!products || products.length === 0) return;

            // Filter by search
            const filtered = term
                ? products.filter(p =>
                    p.nombre.toLowerCase().includes(term) ||
                    (p.descripcion && p.descripcion.toLowerCase().includes(term))
                  )
                : products;

            if (filtered.length === 0) return;
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
        });

        if (!anyResults) {
            html = `<div class="no-results-admin"><p>No se encontraron productos con "${searchTerm}".</p></div>`;
        }

        this.contentEl.innerHTML = html;
        this.updateChangesUI();
    }

    renderProductRow(product, category) {
        const original = this.getOriginalPrice(product.id, category);
        const changed  = original !== null && original !== product.precio;

        return `
            <div class="product-row ${changed ? 'changed' : ''}" data-id="${product.id}" data-category="${category}">
                <div class="row-info">
                    <div class="row-name" title="${product.nombre}">${product.nombre}</div>
                    ${product.descripcion ? `<div class="row-desc" title="${product.descripcion}">${product.descripcion}</div>` : ''}
                </div>
                <div class="row-price">
                    <span class="price-original"${changed ? '' : ' style="display:none"'}>$${original !== null ? original.toLocaleString('es-AR') : ''}</span>
                    <div class="price-input-wrap">
                        <span class="price-prefix">$</span>
                        <input type="number" class="price-input ${changed ? 'modified' : ''}"
                               value="${product.precio}"
                               data-id="${product.id}"
                               data-category="${category}"
                               min="0" step="100"
                               aria-label="Precio de ${product.nombre}">
                    </div>
                </div>
            </div>`;
    }

    getOriginalPrice(productId, category) {
        const origCat = this.getOriginalData()[category];
        if (!origCat) return null;
        const origProduct = origCat.find(p => p.id === productId);
        return origProduct ? origProduct.precio : null;
    }

    /* ──────────────────────────────────────────────
       CHANGE TRACKING
    ────────────────────────────────────────────── */

    countChanges() {
        let count = 0;
        for (const branch of Object.keys(BRANCHES)) {
            const current  = this.branchData[branch] || {};
            const original = this.originalData[branch] || {};
            for (const cat of Object.keys(current)) {
                const curProds  = current[cat] || [];
                const origProds = original[cat] || [];
                curProds.forEach(p => {
                    const orig = origProds.find(op => op.id === p.id);
                    if (orig && orig.precio !== p.precio) count++;
                });
            }
        }
        return count;
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

        // Category toggle (accordion)
        this.contentEl.addEventListener('click', (e) => {
            const toggle = e.target.closest('.category-toggle');
            if (!toggle) return;

            const cat = toggle.dataset.cat;
            const section = toggle.closest('.admin-category');

            if (this.openCategories.has(cat)) {
                this.openCategories.delete(cat);
                section.classList.remove('open');
            } else {
                this.openCategories.add(cat);
                section.classList.add('open');
            }
        });

        // Price input change
        this.contentEl.addEventListener('input', (e) => {
            if (!e.target.classList.contains('price-input')) return;

            const id       = parseInt(e.target.dataset.id, 10);
            const category = e.target.dataset.category;
            const newPrice = parseInt(e.target.value, 10) || 0;

            // Update data
            const products = this.getCurrentData()[category];
            if (products) {
                const product = products.find(p => p.id === id);
                if (product) {
                    product.precio = newPrice;
                }
            }

            // Update row visual
            const row = e.target.closest('.product-row');
            const original = this.getOriginalPrice(id, category);
            const changed  = original !== null && original !== newPrice;

            row.classList.toggle('changed', changed);
            e.target.classList.toggle('modified', changed);

            const origSpan = row.querySelector('.price-original');
            if (origSpan) {
                origSpan.style.display = changed ? 'inline' : 'none';
                origSpan.textContent = `$${original !== null ? original.toLocaleString('es-AR') : ''}`;
            }

            this.updateChangesUI();
        });

        // Search
        this.searchInput.addEventListener('input', (e) => {
            this.render(e.target.value);
        });

        // Save directly to server
        this.btnSave.addEventListener('click', (e) => {
            if (e.shiftKey) {
                // Shift+click = download as fallback
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

        // Close modal on overlay click
        document.getElementById('bulkModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeBulkModal();
        });

        // Keyboard: Escape closes modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeBulkModal();
        });
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
                    // Guardar en Firebase
                    await database.ref(`sucursales/${branch}`).set(this.branchData[branch]);
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

    /**
     * Returns list of branch keys that have unsaved price changes.
     */
    _getChangedBranches() {
        const changed = [];
        for (const branch of Object.keys(BRANCHES)) {
            const current  = this.branchData[branch] || {};
            const original = this.originalData[branch] || {};
            let hasChanges = false;

            for (const cat of Object.keys(current)) {
                const curProds  = current[cat] || [];
                const origProds = original[cat] || [];
                for (const p of curProds) {
                    const orig = origProds.find(op => op.id === p.id);
                    if (orig && orig.precio !== p.precio) {
                        hasChanges = true;
                        break;
                    }
                }
                if (hasChanges) break;
            }

            if (hasChanges) changed.push(branch);
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
