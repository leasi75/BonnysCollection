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
function openProduct(id){let p=P.find(x=>x.id===id);if(!p)return;document.querySelector('#modalBody').innerHTML=`<div class="detail"><div class="gallery ${p.category==='Accesorios'?'accessoryGallery':''}">${p.images.map(i=>`<img src="${i}" alt="${esc(p.name)}">`).join('')}</div><div class="detailText"><small>${p.category}</small><h2>${esc(p.name)}</h2><p>${esc(p.description||'')}</p><p><b>Color:</b> ${esc(p.color||p.colors||'Por confirmar')}</p>${p.sizes?`<p><b>Tallas:</b> ${esc(p.sizes)}</p>`:''}${p.price?`<p class="detailPrice"><b>Precio:</b> $${esc(p.price)}</p>`:''}<p class="stock ${Number(p.stock)<=0?'out':''}"><b>${stockText(p)}</b></p><label>Talla</label><select><option>Selecciona al confirmar por WhatsApp</option></select><button ${Number(p.stock)<=0?'disabled':''} onclick="addCart('${p.id}');closeModal()">${Number(p.stock)<=0?'Producto agotado':'Agregar al pedido'}</button></div></div>`;document.querySelector('#modal').classList.remove('hidden')}
function closeModal(){document.querySelector('#modal').classList.add('hidden')}
function addCart(id){let p=P.find(x=>x.id===id);if(!p||Number(p.stock)<=0)return;if(!cart.some(x=>x.id===id))cart.push(p);updateCart()}
function removeCart(id){cart=cart.filter(x=>x.id!==id);updateCart()}
function updateCart(){document.querySelector('#count').textContent=cart.length;document.querySelector('#cartItems').innerHTML=cart.length?cart.map(p=>`<div class="ci"><img src="${p.images[0]}"><div><b>${esc(p.name)}</b><p>${esc(p.color||p.colors||'')}</p><button onclick="removeCart('${p.id}')">Quitar</button></div></div>`).join(''):'<p>Tu pedido está vacío.</p>'}
function toggleCart(){document.querySelector('#drawer').classList.toggle('open');document.querySelector('#shade').classList.toggle('open')}
document.querySelector('#cartBtn').onclick=toggleCart;
document.querySelector('#wa').onclick=()=>{if(!cart.length)return;let msg='Hola, me interesan estos productos de Bonny’s Collection:\n\n'+cart.map((p,i)=>`${i+1}. ${p.name} - ${p.color||p.colors||''}`).join('\n')+'\n\n¿Me pueden confirmar disponibilidad, tallas y precio?';window.open('https://wa.me/527221144931?text='+encodeURIComponent(msg),'_blank')};
// ADMIN
const adminModal=document.querySelector('#adminModal'),adminList=document.querySelector('#adminList'),productForm=document.querySelector('#productForm');
document.querySelector('#adminBtn').onclick=()=>{adminModal.classList.remove('hidden');drawAdmin()};
function closeAdmin(){adminModal.classList.add('hidden');productForm.classList.add('hidden')}
function drawAdmin(){adminList.innerHTML=P.map(p=>`<div class="adminRow"><img src="${p.images[0]}"><div class="adminInfo"><b>${esc(p.name)}</b><span>${p.category} · ${esc(p.color||p.colors||'')}</span><span class="${Number(p.stock)<=0?'red':''}">Stock: ${p.stock??0}${p.price?' · $'+esc(p.price):''}</span></div><div class="adminActions"><button onclick="editProduct('${p.id}')">Editar</button><button class="danger" onclick="deleteProduct('${p.id}')">Eliminar</button></div></div>`).join('')}
function newProduct(){showForm({id:'',name:'',category:'Trajes',images:[],color:'',description:'',stock:1,price:'',sizes:'',colors:''})}
function editProduct(id){const p=P.find(x=>x.id===id);if(p)showForm({...p})}
function showForm(p){productForm.classList.remove('hidden');productForm.innerHTML=`<h3>${p.id?'Editar producto':'Nuevo producto'}</h3><div class="formGrid"><label>Nombre<input id="fName" value="${esc(p.name)}"></label><label>Categoría<select id="fCat">${cats.slice(1).map(c=>`<option ${c===p.category?'selected':''}>${c}</option>`).join('')}</select></label><label>Color<input id="fColor" value="${esc(p.color||'')}"></label><label>Precio<input id="fPrice" type="number" min="0" step="0.01" value="${esc(p.price||'')}"></label><label>Stock<input id="fStock" type="number" min="0" value="${p.stock??0}"></label><label>Tallas<input id="fSizes" placeholder="Ej. 30, 32, 34" value="${esc(p.sizes||'')}"></label><label class="wide">Descripción<textarea id="fDesc">${esc(p.description||'')}</textarea></label><label class="wide">Agregar imágenes<input id="fImages" type="file" accept="image/*" multiple><small>Las imágenes se guardan en este navegador. Puedes seleccionar una o varias.</small></label></div><div class="previewImgs">${(p.images||[]).map(i=>`<img src="${i}">`).join('')}</div><div class="formButtons"><button onclick="cancelForm()">Cancelar</button><button class="primary" onclick="saveProduct('${p.id}')">Guardar producto</button></div>`;productForm.scrollIntoView({behavior:'smooth',block:'start'});productForm.dataset.oldImages=JSON.stringify(p.images||[])}
function cancelForm(){productForm.classList.add('hidden')}
function readFiles(files){return Promise.all([...files].map(f=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f)})))}
async function saveProduct(oldId){const name=document.querySelector('#fName').value.trim();if(!name)return alert('Escribe el nombre del producto.');const files=document.querySelector('#fImages').files;let images=JSON.parse(productForm.dataset.oldImages||'[]');if(files.length)images=await readFiles(files);if(!images.length)return alert('Agrega al menos una imagen.');const obj={id:oldId||('prod-'+Date.now()),name,category:document.querySelector('#fCat').value,images,color:document.querySelector('#fColor').value.trim(),description:document.querySelector('#fDesc').value.trim(),stock:Number(document.querySelector('#fStock').value||0),price:document.querySelector('#fPrice').value,sizes:document.querySelector('#fSizes').value.trim()};const ix=P.findIndex(x=>x.id===oldId);if(ix>=0)P[ix]=obj;else P.unshift(obj);save();productForm.classList.add('hidden')}
function deleteProduct(id){const p=P.find(x=>x.id===id);if(p&&confirm(`¿Eliminar ${p.name}?`)){P=P.filter(x=>x.id!==id);save()}}
drawChips();
render();
updateCart();
drawAdmin();
loadProducts();
