export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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
              id,
              name,
              category,
              description,
              price,
              image,
              image2,
              color,
              active,
              created_at,
              updated_at
            FROM products
            WHERE active = 1
            ORDER BY id DESC
          `)
          .all();

        return Response.json({
          success: true,
          products: results
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
    // Cualquier otra dirección conserva el sitio actual
    // --------------------------------------------------
    return env.ASSETS.fetch(request);
  }
};
