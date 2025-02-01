// Función para cargar los productos desde JSON
async function cargarProductos() {
    try {
        const response = await fetch('data/productos.json');
        const productos = await response.json();
        return productos;
    } catch (error) {
        console.error('Error al cargar los productos:', error);
        return {};
    }
}

// Modificar la función que muestra los productos para usar los íconos
function crearTarjetaProducto(producto) {
    const iconoVeggie = `
        <svg class="tag-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17,8C8,10 5.9,16.17 3.82,21.34L5.71,22L6.66,19.7C7.14,19.87 7.64,20 8,20C19,20 22,3 22,3C21,5 14,5.25 9,6.25C4,7.25 2,11.5 2,13.5C2,15.5 3.75,17.25 3.75,17.25C7,8 17,8 17,8Z"/>
        </svg>`;
        
    const iconoGlutenFree = `
        <svg class="tag-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z"/>
        </svg>`;

    return `
        <div class="product-card">
            <div class="product-header">
                <h3 class="product-name">${producto.nombre}</h3>
                <span class="product-price">$${producto.precio.toLocaleString('es-AR')}</span>
            </div>
            ${producto.descripcion ? `<p class="product-description">${producto.descripcion}</p>` : ''}
            <div class="product-tags">
                ${producto.esVegano ? `
                    <span class="tag">
                        ${iconoVeggie}
                        Veggie
                    </span>` : ''}
                ${producto.sinTacc ? `
                    <span class="tag">
                        ${iconoGlutenFree}
                        Gluten free
                    </span>` : ''}
            </div>
        </div>
    `;
}

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', async () => {
    const productos = await cargarProductos();
    const botones = document.querySelectorAll('.category-btn');
    const contenedor = document.getElementById('productsContainer');

    const categoriasInfo = {
        'todos': {
            titulo: 'Nuestro Menú Completo',
            descripcion: 'Descubre toda nuestra variedad de platos y bebidas cuidadosamente preparados'
        },
        'Desayunos & Meriendas': {
            titulo: 'Desayunos & Meriendas',
            descripcion: `
                <div class="category-important-info">
                    <p class="schedule-info">DISFRUTA NUESTROS DESAYUNOS DE 9 A 12HS & MERIENDAS DE 16 A 20HS</p>
                    <p class="subtitle">EN HONOR A ELLAS</p>
                    <p class="included-info">INCLUYE UNA INFUSION + VASITO DE SODA</p>
                    <p class="drinks-options">espresso | espresso jarrito | latte | té | lágrima | jugo de naranja mediano</p>
                    <div class="dietary-info">
                        <p><span class="tag-highlight">🤍 GLUTEN FREE</span> | Nuestra cocina no está certificada sin tacc |\  aclararlo a nuestro personal</p>
                        <p><span class="tag-highlight">🌿 PEDILO VEGGIE</span> | Aclararlo a nuestro personal</p>
                    </div>
                </div>`
        },
        'Adicionales': {
            titulo: 'Adicionales',
            descripcion: 'Complementá tu plato principal con nuestros sabrosos adicionales'
        },
        'Delicias': {
            titulo: 'Delicias',
            descripcion: 'Tentate con nuestras exquisitas opciones de panadería y pastelería'
        },
        'Postres & Tortas': {
            titulo: 'Postres & Tortas',
            descripcion: 'Dulces tentaciones elaboradas con los mejores ingredientes'
        },
        'Platitos & Picadas': {
            titulo: 'Platitos & Picadas',
            descripcion: 'Perfectos para compartir o disfrutar como entrada'
        },
        'Tostones': {
            titulo: 'Tostones',
            descripcion: 'Nuestras famosas tostadas con combinaciones únicas'
        },
        'Ensaladas': {
            titulo: 'Ensaladas',
            descripcion: 'Opciones frescas y saludables para cualquier momento del día'
        },
        'Carnes': {
            titulo: 'Almuerzos',
            descripcion: `
                <div class="category-important-info">
                    <p class="schedule-info">NUESTRA COCINA ESTA ABIERTA DE 12 A 16HS</p>
                    <div class="dietary-info">
                        <p><span class="tag-highlight">PEDILO VEGGIE</span> | Aclararlo a nuestro personal y cambia la proteína por tofu</p>
                    </div>
                </div>`
        },
        'Bebidas': {
            titulo: 'Bebidas',
            descripcion: 'Refrescantes opciones para acompañar tu comida'
        },
        'Tragos': {
            titulo: 'Tragos',
            descripcion: 'Cócteles clásicos y de autor para momentos especiales'
        },
        'Vinos': {
            titulo: 'Vinos',
            descripcion: 'Nuestra cuidada selección de vinos nacionales e importados'
        }
    };

    function mostrarProductos(categoria) {
        const contenedor = document.getElementById('productsContainer');
        
        if (categoria === 'todos') {
            // Mostrar todas las categorías con sus respectivos productos
            contenedor.innerHTML = Object.keys(productos)
                .map(cat => {
                    if (productos[cat].length === 0) return ''; // No mostrar categorías vacías
                    
                    const categoriaInfo = categoriasInfo[cat];
                    return `
                        <div class="category-section">
                            <div class="category-header">
                                <h2 class="category-title">${categoriaInfo.titulo}</h2>
                                <p class="category-description">${categoriaInfo.descripcion}</p>
                            </div>
                            <div class="products-grid">
                                ${productos[cat].map(producto => crearTarjetaProducto(producto)).join('')}
                            </div>
                        </div>
                    `;
                })
                .join('<div class="category-divider"></div>');
        } else {
            // Mostrar una sola categoría
            const productosAMostrar = productos[categoria] || [];
            const categoriaInfo = categoriasInfo[categoria];
            
            contenedor.innerHTML = `
                <div class="category-header">
                    <h2 class="category-title">${categoriaInfo.titulo}</h2>
                    <p class="category-description">${categoriaInfo.descripcion}</p>
                </div>
                <div class="products-grid">
                    ${productosAMostrar.map(producto => crearTarjetaProducto(producto)).join('')}
                </div>
            `;
        }
    }

    async function handleMessages(show = false) {
        const messagesForm = document.getElementById('messagesForm');
        const productsContainer = document.getElementById('productsContainer');
        
        if (show) {
            messagesForm.style.display = 'block';
            productsContainer.style.display = 'none';
        } else {
            messagesForm.style.display = 'none';
            productsContainer.style.display = 'grid';
        }
    }

    function getMessages() {
        // Obtener mensajes del localStorage
        const messages = localStorage.getItem('messages');
        return messages ? JSON.parse(messages) : [];
    }

    function saveMessage(message) {
        const messages = getMessages();
        messages.unshift(message); // Agregar nuevo mensaje al inicio
        localStorage.setItem('messages', JSON.stringify(messages));
    }

    function displayMessages(messages) {
        const messagesList = document.getElementById('messagesList');
        messagesList.innerHTML = messages.map(message => `
            <div class="message-card">
                <div class="message-header">
                    <span>${message.name}</span>
                    <span class="message-date">${new Date(message.date).toLocaleDateString()}</span>
                </div>
                <div class="message-content">${message.message}</div>
            </div>
        `).join('');
    }

    document.getElementById('messageForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const form = e.target;
        const formSuccess = document.getElementById('formSuccess');
        const formData = new FormData(form);

        const messageData = {
            name: formData.get('name'),
            message: formData.get('message'),
            date: new Date().toISOString()
        };

        try {
            // Enviar a Netlify Forms
            await fetch('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(formData).toString()
            });

            // Enviar a nuestro repositorio de respaldo
            await fetch('https://api.github.com/repos/[TU_USUARIO]/[TU_REPO]/contents/data/messages.json', {
                method: 'GET',
                headers: {
                    'Authorization': 'token [TU_TOKEN_DE_GITHUB]',
                    'Accept': 'application/vnd.github.v3+json'
                }
            }).then(async (response) => {
                const data = await response.json();
                let messages = [];
                
                if (data.content) {
                    // Decodificar contenido existente
                    const content = atob(data.content);
                    messages = JSON.parse(content);
                }

                // Agregar nuevo mensaje
                messages.push(messageData);

                // Actualizar archivo en GitHub
                await fetch('https://api.github.com/repos/[TU_USUARIO]/[TU_REPO]/contents/data/messages.json', {
                    method: 'PUT',
                    headers: {
                        'Authorization': 'token [TU_TOKEN_DE_GITHUB]',
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        message: 'Nuevo mensaje agregado',
                        content: btoa(JSON.stringify(messages, null, 2)),
                        sha: data.sha
                    })
                });
            });

            // Mostrar mensaje de éxito
            form.style.display = 'none';
            formSuccess.style.display = 'block';
            
            // Resetear formulario
            form.reset();
            
            // Después de 3 segundos, volver a la vista de productos
            setTimeout(() => {
                handleMessages(false);
                document.querySelector('[data-category="todos"]').click();
                form.style.display = 'block';
                formSuccess.style.display = 'none';
            }, 3000);

        } catch (error) {
            console.error('Error:', error);
            alert('Error al enviar el mensaje. Por favor intenta nuevamente.');
        }
    });

    botones.forEach(boton => {
        boton.addEventListener('click', (e) => {
            botones.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            const categoria = e.target.dataset.category;
            if (categoria === 'mensajes') {
                handleMessages(true);
            } else {
                handleMessages(false);
                mostrarProductos(categoria);
            }
        });
    });

    // Mostrar todos los productos al inicio
    mostrarProductos('todos');
}); 