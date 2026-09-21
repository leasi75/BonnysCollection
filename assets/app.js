let filter='Todos',cart=[];

const BASE=window.PRODUCTS||[];

let P=BASE.map(p=>({
  ...p,
  id:String(p.id),
  stock:p.stock??1,
  price:p.price??'',
  sizes:p.sizes||'',
  colors:p.colors||p.color||''
}));

const grid=document.querySelector('#grid'),
      chips=document.querySelector('#chips'),
      search=document.querySelector('#search');

const cats=['Todos','Trajes','Sacos','Complementos','Accesorios','Telas'];

async function loadProducts(){
  try{
    const response=await fetch('/api/products',{cache:'no-store'});

    if(!response.ok){
      throw new Error('No se pudo consultar el catálogo');
    }

    const data=await response.json();

    if(!data.success || !Array.isArray(data.products)){
      throw new Error('Respuesta de catálogo inválida');
    }

    P=data.products.map(p=>({
      ...p,

      // El frontend seguirá manejando el ID como texto
      id:String(p.id),

      // Conservamos también el slug de D1
      slug:p.slug||'',

      images:Array.isArray(p.images)?p.images:[],

      // Temporal hasta conectar inventory
      stock:p.stock??1,

      // Los precios 0 importados no se muestran
      price:Number(p.price)>0?p.price:'',

      sizes:p.sizes||'',
      colors:p.colors||p.color||''
    }));

    render();
    drawAdmin();

    console.log(`Bonny's Collection: ${P.length} productos cargados desde D1`);

  }catch(error){
    console.error('D1 no disponible. Usando catálogo de respaldo.',error);

    // products.js continúa funcionando como respaldo
    P=BASE.map(p=>({
      ...p,
      id:String(p.id),
      stock:p.stock??1,
      price:p.price??'',
      sizes:p.sizes||'',
      colors:p.colors||p.color||''
    }));

    render();
    drawAdmin();
  }
}
function save(){localStorage.setItem('bonnys_products_v2',JSON.stringify(P));render();drawAdmin()}

function drawChips(){chips.innerHTML=cats.map(c=>`<button class="${c===filter?'active':''}" onclick="setFilter('${c}')">${c}</button>`).join('')}
function setFilter(c){filter=c;drawChips();render()}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>setFilter(b.dataset.filter));
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function stockText(p){return Number(p.stock)>0?`Stock: ${p.stock}`:'Agotado'}
function render(){let q=search.value.toLowerCase();let a=P.filter(p=>(filter==='Todos'||p.category===filter)&&(p.name+' '+(p.color||'')+' '+(p.colors||'')).toLowerCase().includes(q));grid.innerHTML=a.map(p=>`<article class="card"><div onclick="openProduct('${p.id}')"><div class="photo ${p.category==='Accesorios'?'accessoryPhoto':''}" style="background-image:url('${p.images[0]}')"></div><div class="info"><span class="cat">${p.category.toUpperCase()}</span><h3>${esc(p.name)}</h3><p>${esc(p.color||p.colors||'')}</p><div class="stock ${Number(p.stock)<=0?'out':''}">${stockText(p)}</div>${p.price?`<div class="price">$${esc(p.price)}</div>`:''}</div></div><button class="add" ${Number(p.stock)<=0?'disabled':''} onclick="addCart('${p.id}')">${Number(p.stock)<=0?'Agotado':'Agregar al pedido'}</button></article>`).join('')||'<p>No encontramos productos.</p>'}
search.oninput=render;
async function openProduct(id){let p=P.find(x=>x.id===id);if(!p)return;try{
  const response=await fetch(`/api/inventory?product_id=${encodeURIComponent(id)}`,{cache:'no-store'});
  const data=await response.json();
  p.inventory=(response.ok&&data.success&&Array.isArray(data.inventory))?data.inventory:[];
}catch(error){
  console.error('Error consultando inventario del producto:',error);
  p.inventory=[];
}document.querySelector('#modalBody').innerHTML=`<div class="detail"><div class="gallery ${p.category==='Accesorios'?'accessoryGallery':''}">${p.images.map(i=>`<img src="${i}" alt="${esc(p.name)}">`).join('')}</div><div class="detailText"><small>${p.category}</small><h2>${esc(p.name)}</h2><p>${esc(p.description||'')}</p><p><b>Color:</b> ${esc(p.color||p.colors||'Por confirmar')}</p>${p.sizes?`<p><b>Tallas:</b> ${esc(p.sizes)}</p>`:''}${p.price?`<p class="detailPrice"><b>Precio:</b> $${esc(p.price)}</p>`:''}<p class="stock ${Number(p.stock)<=0?'out':''}"><b>${stockText(p)}</b></p><label>Talla</label><select id="productSize">${Array.isArray(p.inventory) && p.inventory.length ? p.inventory.filter(item=>Number(item.stock)>0).map(item=>`<option value="${esc(item.size)}">${esc(item.size)} — ${item.stock} disponible${Number(item.stock)===1?'':'s'}</option>`).join('') : '<option>Disponibilidad por confirmar</option>'}</select><button ${Number(p.stock)<=0?'disabled':''} onclick="addCart('${p.id}',document.querySelector('#productSize')?.value);closeModal()">${Number(p.stock)<=0?'Producto agotado':'Agregar al pedido'}</button></div></div>`;document.querySelector('#modal').classList.remove('hidden')}
function closeModal(){document.querySelector('#modal').classList.add('hidden')}
function addCart(id,size=''){
  let p=P.find(x=>x.id===id);
  if(!p||Number(p.stock)<=0)return;

  const selectedSize=String(size||'').trim();

  if(!cart.some(x=>x.id===id&&x.selectedSize===selectedSize)){
    cart.push({
      ...p,
      selectedSize:selectedSize
    });
  }

  updateCart();
}
function removeCart(id){cart=cart.filter(x=>x.id!==id);updateCart()}
function updateCart(){document.querySelector('#count').textContent=cart.length;document.querySelector('#cartItems').innerHTML=cart.length?cart.map(p=>`<div class="ci"><img src="${p.images[0]}"><div><b>${esc(p.name)}</b><p>${esc(p.color||p.colors||'')}${p.selectedSize?` · Talla: ${esc(p.selectedSize)}`:''}</p><button onclick="removeCart('${p.id}')">Quitar</button></div></div>`).join(''):'<p>Tu pedido está vacío.</p>'}
function toggleCart(){document.querySelector('#drawer').classList.toggle('open');document.querySelector('#shade').classList.toggle('open')}
document.querySelector('#cartBtn').onclick=toggleCart;
document.querySelector('#wa').onclick=()=>{if(!cart.length)return;let msg='Hola, me interesan estos productos de Bonny’s Collection:\n\n'+cart.map((p,i)=>`${i+1}. ${p.name} - ${p.color||p.colors||''}${p.selectedSize?` - Talla: ${p.selectedSize}`:''}`).join('\n')+'\n\n¿Me pueden confirmar disponibilidad, tallas y precio?';window.open('https://wa.me/527221144931?text='+encodeURIComponent(msg),'_blank')};
// ADMIN
const adminModal=document.querySelector('#adminModal'),adminList=document.querySelector('#adminList'),productForm=document.querySelector('#productForm');
// --------------------------------------------------
// ACCESO SEGURO AL ADMINISTRADOR
// --------------------------------------------------

async function checkAdminSession() {
  try {
    const response = await fetch('/api/admin/session', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store'
    });

    const data = await response.json();

    return data.success === true && data.authenticated === true;
  } catch (error) {
    console.error('Error comprobando sesión:', error);
    return false;
  }
}

async function adminLogin(password) {
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        password: password
      })
    });

    const data = await response.json();

    return {
      ok: response.ok && data.success === true,
      message: data.error || ''
    };

  } catch (error) {
    console.error('Error iniciando sesión:', error);

    return {
      ok: false,
      message: 'No fue posible conectar con el servidor.'
    };
  }
}

function openAdminPanel() {
  adminModal.classList.remove('hidden');
  drawAdmin();
}

document.querySelector('#adminBtn').onclick = async () => {

  // Primero comprobamos si ya existe una sesión
  const authenticated = await checkAdminSession();

  if (authenticated) {
    openAdminPanel();
    return;
  }

  // Si no existe sesión, solicitamos la contraseña
  const password = prompt('Ingresa la contraseña de administración:');

  if (password === null) {
    return;
  }

  if (!password.trim()) {
    alert('Escribe la contraseña de administración.');
    return;
  }

  const result = await adminLogin(password);

  if (!result.ok) {
    alert(result.message || 'Contraseña incorrecta.');
    return;
  }

  // Verificación adicional de que la cookie quedó activa
  const sessionCreated = await checkAdminSession();

  if (!sessionCreated) {
    alert('La sesión no pudo iniciarse correctamente.');
    return;
  }

  openAdminPanel();
};
function closeAdmin(){adminModal.classList.add('hidden');productForm.classList.add('hidden')}
function drawAdmin(){adminList.innerHTML=P.map(p=>`<div class="adminRow"><img src="${p.images[0]}"><div class="adminInfo"><b>${esc(p.name)}</b><span>${p.category} · ${esc(p.color||p.colors||'')}</span><span class="${Number(p.stock)<=0?'red':''}">Stock: ${p.stock??0}${p.price?' · $'+esc(p.price):''}</span></div><div class="adminActions"><button onclick="editProduct('${p.id}')">Editar</button><button class="danger" onclick="deleteProduct('${p.id}')">Eliminar</button></div></div>`).join('')}
function newProduct(){showForm({id:'',name:'',category:'Trajes',images:[],color:'',description:'',stock:1,price:'',sizes:'',colors:''})}
async function editProduct(id) {

  const p = P.find(x => x.id === id);

  if (!p) return;

  try {

    const response = await fetch(
      `/api/inventory?product_id=${encodeURIComponent(id)}`,
      {
        cache: 'no-store'
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.error || 'No fue posible consultar el inventario.'
      );
    }

    const inventory = Array.isArray(data.inventory)
      ? data.inventory
      : [];

    showForm({
      ...p,
      inventory
    });

  } catch (error) {

    console.error(
      'Error consultando inventario:',
      error
    );

    alert(
      'No fue posible cargar el inventario de este producto.'
    );
  }
}
function showForm(p){productForm.classList.remove('hidden');productForm.innerHTML=`<h3>${p.id?'Editar producto':'Nuevo producto'}</h3><div class="formGrid"><label>Nombre<input id="fName" value="${esc(p.name)}"></label><label>Categoría<select id="fCat">${cats.slice(1).map(c=>`<option ${c===p.category?'selected':''}>${c}</option>`).join('')}</select></label><label>Color<input id="fColor" value="${esc(p.color||'')}"></label><label>Precio<input id="fPrice" type="number" min="0" step="0.01" value="${esc(p.price||'')}"></label><label>Inventario por talla<input id="fSizes" placeholder="Ej. 30:2, 32:4, 34:1" value="${esc((p.inventory||[]).map(i=>`${i.size}:${i.stock}`).join(', '))}"></label><label class="wide">Descripción<textarea id="fDesc">${esc(p.description||'')}</textarea></label><label class="wide">Agregar imágenes<input id="fImages" type="file" accept="image/*" multiple><small>Las imágenes se guardan en este navegador. Puedes seleccionar una o varias.</small></label></div><div class="previewImgs">${(p.images||[]).map(i=>`<img src="${i}">`).join('')}</div><div class="formButtons"><button onclick="cancelForm()">Cancelar</button><button class="primary" onclick="saveProduct('${p.id}')">Guardar producto</button></div>`;productForm.scrollIntoView({behavior:'smooth',block:'start'});productForm.dataset.oldImages=JSON.stringify(p.images||[])}
function cancelForm(){productForm.classList.add('hidden')}
function readFiles(files){return Promise.all([...files].map(f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f)})))}
async function saveProduct(oldId) {
  const inventoryText = document.querySelector('#fSizes').value.trim();

  const inventory = inventoryText
    ? inventoryText.split(',').map(item => {
        const [size, stock] = item.split(':');

        return {
          size: String(size || '').trim(),
          stock: stock === undefined ? NaN : Number(String(stock).trim())
        };
      })
    : [];

  const inventoryValid = inventory.every(item =>
    item.size &&
    Number.isInteger(item.stock) &&
    item.stock >= 0
  );

  if (!inventoryValid) {
    alert(
      'Inventario inválido. Usa el formato talla:cantidad. Ejemplo: 30:2, 32:4, 34:1'
    );
    return;
  }
  const name = document.querySelector('#fName').value.trim();

  if (!name) {
    alert('Escribe el nombre del producto.');
    return;
  }

  const category = document.querySelector('#fCat').value;
  const color = document.querySelector('#fColor').value.trim();
  const description = document.querySelector('#fDesc').value.trim();
  const priceValue = document.querySelector('#fPrice').value;

  const productData = {
    name,
    category,
    color,
    description,
    price: priceValue === '' ? 0 : Number(priceValue)
  };

  try {

    const isEditing = Boolean(oldId);

    const url = isEditing
      ? `/api/admin/products/${encodeURIComponent(oldId)}`
      : '/api/admin/products';

    const response = await fetch(url, {
      method: isEditing ? 'PUT' : 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(productData)
    });

    const data = await response.json();

    if (response.status === 401) {
      alert('Tu sesión de administración terminó. Ingresa nuevamente.');
      closeAdmin();
      return;
    }

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'No fue posible guardar el producto.');
    }
    const productId = isEditing ? oldId : data.id;

    const inventoryResponse = await fetch(
      `/api/admin/inventory/${encodeURIComponent(productId)}`,
      {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inventory })
      }
    );

    const inventoryData = await inventoryResponse.json();

    if (!inventoryResponse.ok || !inventoryData.success) {
      throw new Error(
        inventoryData.error || 'No fue posible guardar el inventario.'
      );
    }
    productForm.classList.add('hidden');

    await loadProducts();

    alert(
      isEditing
        ? 'Producto actualizado correctamente.'
        : 'Producto creado correctamente.'
    );

  } catch (error) {

    console.error('Error guardando producto:', error);

    alert(
      error.message ||
      'Ocurrió un error al guardar el producto.'
    );
  }
}
async function deleteProduct(id) {

  const p = P.find(x => x.id === id);

  if (!p) return;

  const confirmed = confirm(
    `¿Eliminar ${p.name}?\n\nEl producto dejará de aparecer en el catálogo.`
  );

  if (!confirmed) return;

  try {

    const response = await fetch(
      `/api/admin/products/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        credentials: 'same-origin'
      }
    );

    const data = await response.json();

    if (response.status === 401) {
      alert('Tu sesión de administración terminó. Ingresa nuevamente.');
      closeAdmin();
      return;
    }

    if (!response.ok || !data.success) {
      throw new Error(
        data.error || 'No fue posible eliminar el producto.'
      );
    }

    await loadProducts();

    alert('Producto eliminado correctamente.');

  } catch (error) {

    console.error('Error eliminando producto:', error);

    alert(
      error.message ||
      'Ocurrió un error al eliminar el producto.'
    );
  }
}
drawChips();
render();
updateCart();
drawAdmin();
loadProducts();
