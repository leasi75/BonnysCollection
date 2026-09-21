async function adminSessionToken(secret) {
  const data = new TextEncoder().encode(`bonnys-admin-session:${secret}`);

  const hash = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hash))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const validCategories = [
      "Trajes",
      "Sacos",
      "Complementos",
      "Accesorios",
      "Telas"
    ];

    // --------------------------------------------------
    // SESIÓN DE ADMINISTRACIÓN
    // --------------------------------------------------
    const getCookie = (name) => {
      const cookie = request.headers.get("Cookie") || "";
      const match = cookie.match(
        new RegExp(`(?:^|;\\s*)${name}=([^;]*)`)
      );

      return match ? decodeURIComponent(match[1]) : null;
    };

    const hasAdminSession = async () => {
      if (!env.ADMIN_KEY) return false;

      const currentToken = getCookie("bonnys_admin");

      if (!currentToken) return false;

      const expectedToken = await adminSessionToken(env.ADMIN_KEY);

      return currentToken === expectedToken;
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
    // API ADMIN: Iniciar sesión
    // --------------------------------------------------
    if (
      url.pathname === "/api/admin/login" &&
      request.method === "POST"
    ) {
      try {
        const body = await request.json();
        const password = String(body.password || "");

        if (!env.ADMIN_KEY || password !== env.ADMIN_KEY) {
          return Response.json(
            {
              success: false,
              error: "Clave incorrecta"
            },
            { status: 401 }
          );
        }

        const token = await adminSessionToken(env.ADMIN_KEY);

        return new Response(
          JSON.stringify({
            success: true
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
              "Set-Cookie":
                `bonnys_admin=${token}; ` +
                "HttpOnly; Secure; SameSite=Strict; " +
                "Path=/; Max-Age=28800"
            }
          }
        );

      } catch {
        return Response.json(
          {
            success: false,
            error: "Solicitud inválida"
          },
          { status: 400 }
        );
      }
    }


    // --------------------------------------------------
    // API ADMIN: Comprobar sesión
    // --------------------------------------------------
    if (
      url.pathname === "/api/admin/session" &&
      request.method === "GET"
    ) {
      return Response.json(
        {
          success: true,
          authenticated: await hasAdminSession()
        },
        {
          headers: {
            "Cache-Control": "no-store"
          }
        }
      );
    }


    // --------------------------------------------------
    // API ADMIN: Cerrar sesión
    // --------------------------------------------------
    if (
      url.pathname === "/api/admin/logout" &&
      request.method === "POST"
    ) {
      return new Response(
        JSON.stringify({
          success: true
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Set-Cookie":
              "bonnys_admin=; HttpOnly; Secure; " +
              "SameSite=Strict; Path=/; Max-Age=0"
          }
        }
      );
    }


    // --------------------------------------------------
    // API: Obtener productos
    // --------------------------------------------------
    if (
      url.pathname === "/api/products" &&
      request.method === "GET"
    ) {
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
    // --------------------------------------------------
    if (
      url.pathname === "/api/inventory" &&
      request.method === "GET"
    ) {
      const productId = Number(
        url.searchParams.get("product_id")
      );

      if (
        !Number.isInteger(productId) ||
        productId <= 0
      ) {
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
            SELECT
              id,
              product_id,
              size,
              stock
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
    if (
      url.pathname === "/api/admin/products" &&
      request.method === "POST"
    ) {
      if (!(await hasAdminSession())) {
        return Response.json(
          {
            success: false,
            error: "No autorizado"
          },
          { status: 401 }
        );
      }

      try {
        const body = await request.json();

        const name = String(body.name || "").trim();
        const category =
          String(body.category || "").trim();
        const description =
          String(body.description || "").trim();
        const color =
          String(body.color || "").trim();

        const price = Number(body.price || 0);

        if (!name) {
          return Response.json(
            {
              success: false,
              error: "El nombre es obligatorio"
            },
            { status: 400 }
          );
        }

        if (!validCategories.includes(category)) {
          return Response.json(
            {
              success: false,
              error: "Categoría inválida"
            },
            { status: 400 }
          );
        }

        if (
          !Number.isFinite(price) ||
          price < 0
        ) {
          return Response.json(
            {
              success: false,
              error: "Precio inválido"
            },
            { status: 400 }
          );
        }

        const baseSlug =
          String(body.slug || name)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");

        const slug =
          `${baseSlug || "producto"}-${Date.now()}`;

        const result = await env.DB
          .prepare(`
            INSERT INTO products
            (
              slug,
              name,
              category,
              description,
              price,
              color,
              active
            )
            VALUES (?, ?, ?, ?, ?, ?, 1)
          `)
          .bind(
            slug,
            name,
            category,
            description,
            price,
            color
          )
          .run();

        return Response.json({
          success: true,
          id: result.meta.last_row_id,
          slug
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
    // API ADMIN: Editar producto
    // --------------------------------------------------
    if (
      url.pathname.startsWith("/api/admin/products/") &&
      request.method === "PUT"
    ) {
      if (!(await hasAdminSession())) {
        return Response.json(
          {
            success: false,
            error: "No autorizado"
          },
          { status: 401 }
        );
      }

      const id = Number(
        url.pathname.split("/").pop()
      );

      if (
        !Number.isInteger(id) ||
        id <= 0
      ) {
        return Response.json(
          {
            success: false,
            error: "ID inválido"
          },
          { status: 400 }
        );
      }

      try {
        const body = await request.json();

        const name =
          String(body.name || "").trim();

        const category =
          String(body.category || "").trim();

        const description =
          String(body.description || "").trim();

        const color =
          String(body.color || "").trim();

        const price =
          Number(body.price || 0);

        if (
          !name ||
          !validCategories.includes(category)
        ) {
          return Response.json(
            {
              success: false,
              error: "Datos inválidos"
            },
            { status: 400 }
          );
        }

        if (
          !Number.isFinite(price) ||
          price < 0
        ) {
          return Response.json(
            {
              success: false,
              error: "Precio inválido"
            },
            { status: 400 }
          );
        }

        const result = await env.DB
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
          .bind(
            name,
            category,
            description,
            price,
            color,
            id
          )
          .run();

        if (!result.meta.changes) {
          return Response.json(
            {
              success: false,
              error: "Producto no encontrado"
            },
            { status: 404 }
          );
        }

        return Response.json({
          success: true,
          id
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
    // API ADMIN: Desactivar producto
    // --------------------------------------------------
    if (
      url.pathname.startsWith("/api/admin/products/") &&
      request.method === "DELETE"
    ) {
      if (!(await hasAdminSession())) {
        return Response.json(
          {
            success: false,
            error: "No autorizado"
          },
          { status: 401 }
        );
      }

      const id = Number(
        url.pathname.split("/").pop()
      );

      if (
        !Number.isInteger(id) ||
        id <= 0
      ) {
        return Response.json(
          {
            success: false,
            error: "ID inválido"
          },
          { status: 400 }
        );
      }

      try {
        const result = await env.DB
          .prepare(`
            UPDATE products
            SET
              active = 0,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `)
          .bind(id)
          .run();

        if (!result.meta.changes) {
          return Response.json(
            {
              success: false,
              error: "Producto no encontrado"
            },
            { status: 404 }
          );
        }

        return Response.json({
          success: true,
          id
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
    // El resto conserva el sitio estático
    // --------------------------------------------------
    return env.ASSETS.fetch(request);
  }
};
