export default {
  async fetch(request, env) {
    const url = new URL(request.url);
const isAdminRequest = () => {
  const auth = request.headers.get("Authorization");
  return auth === `Bearer ${env.ADMIN_KEY}`;
};
    // --------------------------------------------------
    // API: Comprobar Worker + D1
    // --------------------------------------------------
    if (url.pathname === "/api/health") {
      try {
        const result = await env.DB
          .prepare("SELECT 1 AS ok")
          .first();

        return Response.json({
          success: true,
          worker: "bonnyscollection",
          database: "connected",
          result
        });
      } catch (error) {
        return Response.json(
          {
            success: false,
            database: "error",
            error: error.message
          },
          { status: 500 }
        );
      }
    }

    // --------------------------------------------------
    // API: Obtener productos
    // --------------------------------------------------
   if (url.pathname === "/api/products" && request.method === "GET") {
  try {
    const { results } = await env.DB
      .prepare(`
        SELECT
          p.id,
          p.slug,
          p.name,
          p.category,
          p.description,
          p.price,
          p.color,
          p.active,
          p.created_at,
          p.updated_at,
          COALESCE(
            (
              SELECT json_group_array(image_url)
              FROM (
                SELECT image_url
                FROM product_images
                WHERE product_id = p.id
                ORDER BY sort_order, id
              )
            ),
            '[]'
          ) AS images
        FROM products p
        WHERE p.active = 1
        ORDER BY p.id ASC
      `)
      .all();

    const products = results.map(product => ({
      ...product,
      images: JSON.parse(product.images || "[]")
    }));

    return Response.json({
      success: true,
      products
    });

  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}

    // --------------------------------------------------
    // API: Inventario de un producto
    // Ejemplo: /api/inventory?product_id=1
    // --------------------------------------------------
    if (url.pathname === "/api/inventory" && request.method === "GET") {
      const productId = Number(url.searchParams.get("product_id"));

      if (!Number.isInteger(productId) || productId <= 0) {
        return Response.json(
          {
            success: false,
            error: "product_id inválido"
          },
          { status: 400 }
        );
      }

      try {
        const { results } = await env.DB
          .prepare(`
            SELECT id, product_id, size, stock
            FROM inventory
            WHERE product_id = ?
            ORDER BY size
          `)
          .bind(productId)
          .all();

        return Response.json({
          success: true,
          inventory: results
        });
      } catch (error) {
        return Response.json(
          {
            success: false,
            error: error.message
          },
          { status: 500 }
        );
      }
    }
// --------------------------------------------------
// API ADMIN: Crear producto
// --------------------------------------------------
if (url.pathname === "/api/admin/products" && request.method === "POST") {
  if (!isAdminRequest()) {
    return Response.json(
      { success: false, error: "No autorizado" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    const name = String(body.name || "").trim();
    const category = String(body.category || "").trim();
    const description = String(body.description || "").trim();
    const color = String(body.color || "").trim();
    const price = Number(body.price || 0);

    const validCategories = [
      "Trajes",
      "Sacos",
      "Complementos",
      "Accesorios",
      "Telas"
    ];

    if (!name) {
      return Response.json(
        { success: false, error: "El nombre es obligatorio" },
        { status: 400 }
      );
    }

    if (!validCategories.includes(category)) {
      return Response.json(
        { success: false, error: "Categoría inválida" },
        { status: 400 }
      );
    }

    const slug =
      String(body.slug || name)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") +
      "-" +
      Date.now();

    const result = await env.DB
      .prepare(`
        INSERT INTO products
        (slug, name, category, description, price, color, active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `)
      .bind(slug, name, category, description, price, color)
      .run();

    return Response.json({
      success: true,
      id: result.meta.last_row_id,
      slug
    });

  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}


// --------------------------------------------------
// API ADMIN: Editar producto
// --------------------------------------------------
if (url.pathname.startsWith("/api/admin/products/") &&
    request.method === "PUT") {

  if (!isAdminRequest()) {
    return Response.json(
      { success: false, error: "No autorizado" },
      { status: 401 }
    );
  }

  const id = Number(url.pathname.split("/").pop());

  if (!Number.isInteger(id) || id <= 0) {
    return Response.json(
      { success: false, error: "ID inválido" },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();

    const name = String(body.name || "").trim();
    const category = String(body.category || "").trim();
    const description = String(body.description || "").trim();
    const color = String(body.color || "").trim();
    const price = Number(body.price || 0);

    const validCategories = [
      "Trajes",
      "Sacos",
      "Complementos",
      "Accesorios",
      "Telas"
    ];

    if (!name || !validCategories.includes(category)) {
      return Response.json(
        { success: false, error: "Datos inválidos" },
        { status: 400 }
      );
    }

    await env.DB
      .prepare(`
        UPDATE products
        SET
          name = ?,
          category = ?,
          description = ?,
          price = ?,
          color = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(name, category, description, price, color, id)
      .run();

    return Response.json({
      success: true,
      id
    });

  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}


// --------------------------------------------------
// API ADMIN: Desactivar producto
// --------------------------------------------------
if (url.pathname.startsWith("/api/admin/products/") &&
    request.method === "DELETE") {

  if (!isAdminRequest()) {
    return Response.json(
      { success: false, error: "No autorizado" },
      { status: 401 }
    );
  }

  const id = Number(url.pathname.split("/").pop());

  if (!Number.isInteger(id) || id <= 0) {
    return Response.json(
      { success: false, error: "ID inválido" },
      { status: 400 }
    );
  }

  try {
    await env.DB
      .prepare(`
        UPDATE products
        SET
          active = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(id)
      .run();

    return Response.json({
      success: true,
      id
    });

  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
    // --------------------------------------------------
    // Cualquier otra dirección conserva el sitio actual
    // --------------------------------------------------
    return env.ASSETS.fetch(request);
  }
};
